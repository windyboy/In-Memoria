/**
 * Data Consistency and Integrity System
 * 
 * This module provides comprehensive data validation, normalization, and integrity
 * features for vector backend abstraction. It ensures consistent data formats,
 * preserves semantic relationships, and provides migration support between backends.
 */

import { CodeMetadata, SemanticSearchResult } from './vector-store.js';
import { EmbeddingConfig } from './vector-types.js';
import { Logger } from '../utils/logger.js';
import { ValidationError, OperationError } from './vector-errors.js';

/**
 * Data validation result interface
 */
export interface DataValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  normalizedData?: unknown;
}

/**
 * Metadata validation and normalization rules
 */
export interface MetadataValidationRules {
  requiredFields: string[];
  optionalFields: string[];
  fieldTypes: Record<string, 'string' | 'number' | 'boolean' | 'date' | 'object'>;
  fieldConstraints: Record<string, (value: unknown) => boolean>;
  defaultValues: Record<string, unknown>;
}

/**
 * Data format specification for consistent storage across backends
 */
export interface DataFormatSpec {
  version: string;
  embeddingDimension: number;
  metadataSchema: MetadataValidationRules;
  semanticRelationships: string[];
  checksumAlgorithm: 'sha256' | 'md5';
}

/**
 * Migration context for data transfer between backends
 */
export interface MigrationContext {
  sourceBackend: string;
  targetBackend: string;
  dataFormatVersion: string;
  preserveIds: boolean;
  batchSize: number;
  validateIntegrity: boolean;
}

/**
 * Data integrity validator that ensures consistent data formats across backends
 */
export class DataIntegrityValidator {
  private formatSpec: DataFormatSpec;
  private metadataRules: MetadataValidationRules;

  constructor(embeddingConfig: EmbeddingConfig) {
    this.formatSpec = this.createDataFormatSpec(embeddingConfig);
    this.metadataRules = this.createMetadataValidationRules();
    
    Logger.debug('Data integrity validator initialized', {
      version: this.formatSpec.version,
      embeddingDimension: this.formatSpec.embeddingDimension,
      checksumAlgorithm: this.formatSpec.checksumAlgorithm
    });
  }

  /**
   * Validate and normalize code metadata
   */
  validateCodeMetadata(metadata: CodeMetadata): DataValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const normalizedMetadata = { ...metadata };

    try {
      // Validate required fields
      for (const field of this.metadataRules.requiredFields) {
        if (!(field in metadata) || metadata[field as keyof CodeMetadata] === undefined) {
          errors.push(`Required field '${field}' is missing`);
        }
      }

      // Validate field types
      for (const [field, expectedType] of Object.entries(this.metadataRules.fieldTypes)) {
        if (field in metadata) {
          const value = metadata[field as keyof CodeMetadata];
          if (!this.validateFieldType(value, expectedType)) {
            errors.push(`Field '${field}' has invalid type. Expected ${expectedType}, got ${typeof value}`);
          }
        }
      }

      // Apply field constraints
      for (const [field, constraint] of Object.entries(this.metadataRules.fieldConstraints)) {
        if (field in metadata) {
          const value = metadata[field as keyof CodeMetadata];
          if (!constraint(value)) {
            errors.push(`Field '${field}' violates constraint`);
          }
        }
      }

      // Normalize and apply defaults
      this.normalizeMetadata(normalizedMetadata, warnings);

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        normalizedData: normalizedMetadata
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Metadata validation failed: ${error instanceof Error ? error.message : String(error)}`],
        warnings
      };
    }
  }

  /**
   * Validate embedding vector format and dimensions
   */
  validateEmbedding(embedding: number[]): DataValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check if embedding exists
      if (!embedding || !Array.isArray(embedding)) {
        errors.push('Embedding must be a non-empty array');
        return { valid: false, errors, warnings };
      }

      // Check dimension consistency
      if (embedding.length !== this.formatSpec.embeddingDimension) {
        errors.push(
          `Embedding dimension mismatch. Expected ${this.formatSpec.embeddingDimension}, got ${embedding.length}`
        );
      }

      // Validate numeric values
      for (let i = 0; i < embedding.length; i++) {
        const value = embedding[i];
        if (typeof value !== 'number') {
          errors.push(`Embedding value at index ${i} is not a number: ${typeof value}`);
        } else if (!isFinite(value)) {
          errors.push(`Embedding value at index ${i} is not finite: ${value}`);
        } else if (isNaN(value)) {
          errors.push(`Embedding value at index ${i} is NaN`);
        }
      }

      // Check for suspicious patterns
      const uniqueValues = new Set(embedding);
      if (uniqueValues.size === 1) {
        warnings.push('Embedding contains only identical values, which may indicate a problem');
      }

      const zeroCount = embedding.filter(v => v === 0).length;
      if (zeroCount > embedding.length * 0.9) {
        warnings.push('Embedding is mostly zeros, which may indicate poor quality');
      }

      // Validate magnitude (should not be zero vector)
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      if (magnitude === 0) {
        errors.push('Embedding is a zero vector');
      } else if (magnitude < 1e-10) {
        warnings.push('Embedding has very small magnitude, which may cause precision issues');
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        normalizedData: embedding
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Embedding validation failed: ${error instanceof Error ? error.message : String(error)}`],
        warnings
      };
    }
  }

  /**
   * Validate semantic search results for consistency
   */
  validateSearchResults(results: SemanticSearchResult[]): DataValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      if (!Array.isArray(results)) {
        errors.push('Search results must be an array');
        return { valid: false, errors, warnings };
      }

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        
        // Validate required fields
        if (!result.id || typeof result.id !== 'string') {
          errors.push(`Result ${i}: id must be a non-empty string`);
        }
        
        if (!result.code || typeof result.code !== 'string') {
          errors.push(`Result ${i}: code must be a non-empty string`);
        }
        
        if (!result.metadata) {
          errors.push(`Result ${i}: metadata is required`);
        } else {
          // Validate metadata
          const metadataValidation = this.validateCodeMetadata(result.metadata);
          if (!metadataValidation.valid) {
            errors.push(`Result ${i}: ${metadataValidation.errors.join(', ')}`);
          }
        }
        
        // Validate similarity score
        if (typeof result.similarity !== 'number') {
          errors.push(`Result ${i}: similarity must be a number`);
        } else if (result.similarity < 0 || result.similarity > 1) {
          warnings.push(`Result ${i}: similarity score ${result.similarity} is outside normal range [0,1]`);
        }
      }

      // Check for duplicate IDs
      const ids = results.map(r => r.id).filter(id => id);
      const uniqueIds = new Set(ids);
      if (ids.length !== uniqueIds.size) {
        warnings.push('Search results contain duplicate IDs');
      }

      // Check similarity ordering
      for (let i = 1; i < results.length; i++) {
        if (results[i].similarity > results[i-1].similarity) {
          warnings.push('Search results may not be properly sorted by similarity');
          break;
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        normalizedData: results
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Search results validation failed: ${error instanceof Error ? error.message : String(error)}`],
        warnings
      };
    }
  }

  /**
   * Generate data checksum for integrity verification
   */
  generateDataChecksum(data: unknown): string {
    try {
      const serialized = JSON.stringify(data, Object.keys(data as object).sort());
      return this.computeChecksum(serialized);
    } catch (error) {
      throw new OperationError(
        `Failed to generate data checksum: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Verify data integrity using checksum
   */
  verifyDataIntegrity(data: unknown, expectedChecksum: string): boolean {
    try {
      const actualChecksum = this.generateDataChecksum(data);
      return actualChecksum === expectedChecksum;
    } catch (error) {
      Logger.warn('Data integrity verification failed:', error);
      return false;
    }
  }

  /**
   * Get current data format specification
   */
  getDataFormatSpec(): DataFormatSpec {
    return { ...this.formatSpec };
  }

  /**
   * Create data format specification based on embedding configuration
   */
  private createDataFormatSpec(embeddingConfig: EmbeddingConfig): DataFormatSpec {
    return {
      version: '1.0.0',
      embeddingDimension: embeddingConfig.dimension || 384,
      metadataSchema: this.createMetadataValidationRules(),
      semanticRelationships: [
        'filePath',
        'functionName', 
        'className',
        'language',
        'complexity',
        'lineCount'
      ],
      checksumAlgorithm: 'sha256'
    };
  }

  /**
   * Create metadata validation rules
   */
  private createMetadataValidationRules(): MetadataValidationRules {
    return {
      requiredFields: ['id', 'filePath', 'language', 'lastModified'],
      optionalFields: ['functionName', 'className', 'complexity', 'lineCount'],
      fieldTypes: {
        id: 'string',
        filePath: 'string',
        functionName: 'string',
        className: 'string',
        language: 'string',
        complexity: 'number',
        lineCount: 'number',
        lastModified: 'date'
      },
      fieldConstraints: {
        id: (value) => typeof value === 'string' && value.length > 0,
        filePath: (value) => typeof value === 'string' && value.length > 0,
        language: (value) => typeof value === 'string' && value.length > 0,
        complexity: (value) => typeof value === 'number' && value >= 0,
        lineCount: (value) => typeof value === 'number' && value > 0,
        lastModified: (value) => value instanceof Date && !isNaN(value.getTime())
      },
      defaultValues: {
        complexity: 1,
        lineCount: 1
      }
    };
  }

  /**
   * Validate field type
   */
  private validateFieldType(value: unknown, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && isFinite(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'date':
        return value instanceof Date && !isNaN(value.getTime());
      case 'object':
        return typeof value === 'object' && value !== null;
      default:
        return false;
    }
  }

  /**
   * Normalize metadata by applying defaults and corrections
   */
  private normalizeMetadata(metadata: CodeMetadata, warnings: string[]): void {
    // Apply default values for missing optional fields
    for (const [field, defaultValue] of Object.entries(this.metadataRules.defaultValues)) {
      if (!(field in metadata) || metadata[field as keyof CodeMetadata] === undefined) {
        (metadata as any)[field] = defaultValue;
        warnings.push(`Applied default value for field '${field}': ${defaultValue}`);
      }
    }

    // Normalize file paths
    if (metadata.filePath) {
      const normalizedPath = metadata.filePath.replace(/\\/g, '/');
      if (normalizedPath !== metadata.filePath) {
        metadata.filePath = normalizedPath;
        warnings.push('Normalized file path separators to forward slashes');
      }
    }

    // Ensure lastModified is a Date object
    if (metadata.lastModified && !(metadata.lastModified instanceof Date)) {
      try {
        metadata.lastModified = new Date(metadata.lastModified);
        warnings.push('Converted lastModified to Date object');
      } catch (error) {
        // Will be caught by validation
      }
    }

    // Normalize language to lowercase
    if (metadata.language) {
      const normalizedLanguage = metadata.language.toLowerCase();
      if (normalizedLanguage !== metadata.language) {
        metadata.language = normalizedLanguage;
        warnings.push('Normalized language to lowercase');
      }
    }
  }

  /**
   * Compute checksum using specified algorithm
   */
  private computeChecksum(data: string): string {
    // Simple hash implementation for demonstration
    // In production, use crypto module for proper hashing
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

/**
 * Semantic relationship manager for preserving relationships across backends
 */
export class SemanticRelationshipManager {
  private relationships: Map<string, Set<string>> = new Map();
  private reverseRelationships: Map<string, Set<string>> = new Map();

  /**
   * Add a semantic relationship between two code entities
   */
  addRelationship(sourceId: string, targetId: string, relationshipType: string): void {
    const key = `${relationshipType}:${sourceId}`;
    
    if (!this.relationships.has(key)) {
      this.relationships.set(key, new Set());
    }
    this.relationships.get(key)!.add(targetId);

    // Maintain reverse index
    const reverseKey = `${relationshipType}:${targetId}`;
    if (!this.reverseRelationships.has(reverseKey)) {
      this.reverseRelationships.set(reverseKey, new Set());
    }
    this.reverseRelationships.get(reverseKey)!.add(sourceId);

    Logger.debug(`Added semantic relationship: ${sourceId} -> ${targetId} (${relationshipType})`);
  }

  /**
   * Get all relationships for a code entity
   */
  getRelationships(entityId: string, relationshipType?: string): string[] {
    if (relationshipType) {
      const key = `${relationshipType}:${entityId}`;
      return Array.from(this.relationships.get(key) || []);
    }

    // Get all relationships regardless of type
    const allRelationships: string[] = [];
    for (const [key, targets] of this.relationships.entries()) {
      if (key.endsWith(`:${entityId}`)) {
        allRelationships.push(...Array.from(targets));
      }
    }
    return allRelationships;
  }

  /**
   * Remove all relationships for a code entity
   */
  removeEntityRelationships(entityId: string): void {
    // Remove forward relationships
    const keysToRemove: string[] = [];
    for (const key of this.relationships.keys()) {
      if (key.endsWith(`:${entityId}`)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => this.relationships.delete(key));

    // Remove reverse relationships
    const reverseKeysToRemove: string[] = [];
    for (const key of this.reverseRelationships.keys()) {
      if (key.endsWith(`:${entityId}`)) {
        reverseKeysToRemove.push(key);
      }
    }
    reverseKeysToRemove.forEach(key => this.reverseRelationships.delete(key));

    // Remove entity from other relationships
    for (const targets of this.relationships.values()) {
      targets.delete(entityId);
    }
    for (const sources of this.reverseRelationships.values()) {
      sources.delete(entityId);
    }

    Logger.debug(`Removed all relationships for entity: ${entityId}`);
  }

  /**
   * Export relationships for migration
   */
  exportRelationships(): Record<string, string[]> {
    const exported: Record<string, string[]> = {};
    for (const [key, targets] of this.relationships.entries()) {
      exported[key] = Array.from(targets);
    }
    return exported;
  }

  /**
   * Import relationships from migration
   */
  importRelationships(relationships: Record<string, string[]>): void {
    this.relationships.clear();
    this.reverseRelationships.clear();

    for (const [key, targets] of Object.entries(relationships)) {
      this.relationships.set(key, new Set(targets));
      
      // Rebuild reverse index
      const [relationshipType, sourceId] = key.split(':', 2);
      for (const targetId of targets) {
        const reverseKey = `${relationshipType}:${targetId}`;
        if (!this.reverseRelationships.has(reverseKey)) {
          this.reverseRelationships.set(reverseKey, new Set());
        }
        this.reverseRelationships.get(reverseKey)!.add(sourceId);
      }
    }

    Logger.info(`Imported ${Object.keys(relationships).length} semantic relationships`);
  }

  /**
   * Get relationship statistics
   */
  getRelationshipStats(): { totalRelationships: number; uniqueEntities: number; relationshipTypes: string[] } {
    const uniqueEntities = new Set<string>();
    const relationshipTypes = new Set<string>();

    let totalRelationships = 0;
    for (const [key, targets] of this.relationships.entries()) {
      const [relationshipType, sourceId] = key.split(':', 2);
      relationshipTypes.add(relationshipType);
      uniqueEntities.add(sourceId);
      
      for (const targetId of targets) {
        uniqueEntities.add(targetId);
        totalRelationships++;
      }
    }

    return {
      totalRelationships,
      uniqueEntities: uniqueEntities.size,
      relationshipTypes: Array.from(relationshipTypes)
    };
  }
}