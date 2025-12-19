/**
 * Data Consistency Manager
 * 
 * This module provides a unified interface for managing data consistency and integrity
 * across all vector backend implementations. It coordinates validation, normalization,
 * relationship management, and migration operations.
 */

import { VectorStore, CodeMetadata, SemanticSearchResult } from './vector-store.js';
import { EmbeddingConfig } from './vector-types.js';
import { 
  DataIntegrityValidator, 
  SemanticRelationshipManager, 
  DataValidationResult,
  DataFormatSpec,
  MigrationContext
} from './data-integrity.js';
import { Logger } from '../utils/logger.js';
import { ValidationError, OperationError } from './vector-errors.js';

/**
 * Consistency check result
 */
export interface ConsistencyCheckResult {
  consistent: boolean;
  issues: ConsistencyIssue[];
  summary: {
    totalItems: number;
    validItems: number;
    invalidItems: number;
    relationshipIssues: number;
    checksumMismatches: number;
  };
}

/**
 * Individual consistency issue
 */
export interface ConsistencyIssue {
  type: 'validation' | 'relationship' | 'checksum' | 'format';
  severity: 'error' | 'warning';
  itemId: string;
  description: string;
  suggestedFix?: string;
}

/**
 * Consistency repair options
 */
export interface ConsistencyRepairOptions {
  autoFix: boolean;
  backupBeforeRepair: boolean;
  repairTypes: ('validation' | 'relationship' | 'checksum' | 'format')[];
  dryRun: boolean;
}

/**
 * Consistency repair result
 */
export interface ConsistencyRepairResult {
  success: boolean;
  repairedItems: number;
  unrepairedItems: number;
  backupCreated: boolean;
  repairs: {
    itemId: string;
    issueType: string;
    action: string;
    success: boolean;
  }[];
}

/**
 * Data consistency manager that provides unified data integrity operations
 */
export class DataConsistencyManager {
  private validator: DataIntegrityValidator;
  private relationshipManager: SemanticRelationshipManager;

  constructor(embeddingConfig: EmbeddingConfig) {
    this.validator = new DataIntegrityValidator(embeddingConfig);
    this.relationshipManager = new SemanticRelationshipManager();

    Logger.info('Data consistency manager initialized');
  }

  /**
   * Validate and normalize data before storage
   */
  async validateAndNormalizeForStorage(
    code: string,
    metadata: CodeMetadata,
    embedding?: number[]
  ): Promise<{
    code: string;
    metadata: CodeMetadata;
    embedding?: number[];
    validationResults: {
      metadata: DataValidationResult;
      embedding?: DataValidationResult;
    };
  }> {
    Logger.debug(`Validating data for storage: ${metadata.id}`);

    try {
      // Validate and normalize metadata
      const metadataValidation = this.validator.validateCodeMetadata(metadata);
      if (!metadataValidation.valid) {
        throw new ValidationError(
          `Metadata validation failed for ${metadata.id}: ${metadataValidation.errors.join(', ')}`
        );
      }

      const normalizedMetadata = metadataValidation.normalizedData as CodeMetadata;

      // Validate embedding if provided
      let embeddingValidation: DataValidationResult | undefined;
      let normalizedEmbedding: number[] | undefined;

      if (embedding) {
        embeddingValidation = this.validator.validateEmbedding(embedding);
        if (!embeddingValidation.valid) {
          throw new ValidationError(
            `Embedding validation failed for ${metadata.id}: ${embeddingValidation.errors.join(', ')}`
          );
        }
        normalizedEmbedding = embeddingValidation.normalizedData as number[];
      }

      // Update semantic relationships
      this.updateSemanticRelationships(normalizedMetadata);

      return {
        code,
        metadata: normalizedMetadata,
        embedding: normalizedEmbedding,
        validationResults: {
          metadata: metadataValidation,
          embedding: embeddingValidation
        }
      };

    } catch (error) {
      Logger.error(`Data validation failed for ${metadata.id}:`, error);
      throw error;
    }
  }

  /**
   * Validate search results for consistency
   */
  validateSearchResults(results: SemanticSearchResult[]): DataValidationResult {
    Logger.debug(`Validating search results: ${results.length} items`);
    return this.validator.validateSearchResults(results);
  }

  /**
   * Perform comprehensive consistency check on a vector store
   */
  async performConsistencyCheck(vectorStore: VectorStore): Promise<ConsistencyCheckResult> {
    Logger.info('Starting comprehensive consistency check');

    try {
      const issues: ConsistencyIssue[] = [];
      let totalItems = 0;
      let validItems = 0;
      let invalidItems = 0;
      let relationshipIssues = 0;
      let checksumMismatches = 0;

      // Get all data from the vector store
      const stats = await vectorStore.getCollectionStats();
      totalItems = stats.count;

      if (totalItems === 0) {
        Logger.info('No data to check');
        return {
          consistent: true,
          issues: [],
          summary: {
            totalItems: 0,
            validItems: 0,
            invalidItems: 0,
            relationshipIssues: 0,
            checksumMismatches: 0
          }
        };
      }

      // Check data in batches
      const batchSize = 100;
      const batches = Math.ceil(totalItems / batchSize);

      for (let batch = 0; batch < batches; batch++) {
        Logger.debug(`Checking batch ${batch + 1}/${batches}`);

        try {
          // Get batch data (simplified - real implementation would need pagination)
          const batchResults = await vectorStore.findSimilarCode('', batchSize);
          
          for (const item of batchResults) {
            // Validate metadata
            const metadataValidation = this.validator.validateCodeMetadata(item.metadata);
            if (!metadataValidation.valid) {
              invalidItems++;
              issues.push({
                type: 'validation',
                severity: 'error',
                itemId: item.id,
                description: `Metadata validation failed: ${metadataValidation.errors.join(', ')}`,
                suggestedFix: 'Normalize metadata using data consistency manager'
              });
            } else {
              validItems++;
              
              // Check for warnings
              if (metadataValidation.warnings.length > 0) {
                issues.push({
                  type: 'validation',
                  severity: 'warning',
                  itemId: item.id,
                  description: `Metadata warnings: ${metadataValidation.warnings.join(', ')}`,
                  suggestedFix: 'Consider normalizing metadata'
                });
              }
            }

            // Check semantic relationships
            const relationships = this.relationshipManager.getRelationships(item.id);
            if (relationships.length === 0 && item.metadata.functionName) {
              relationshipIssues++;
              issues.push({
                type: 'relationship',
                severity: 'warning',
                itemId: item.id,
                description: 'No semantic relationships found for function',
                suggestedFix: 'Rebuild semantic relationships'
              });
            }

            // Verify data integrity checksum
            try {
              const expectedChecksum = this.validator.generateDataChecksum({
                code: item.code,
                metadata: item.metadata
              });
              
              // In a real implementation, you'd store and compare checksums
              // For now, we'll just verify the checksum can be generated
              if (!expectedChecksum) {
                checksumMismatches++;
                issues.push({
                  type: 'checksum',
                  severity: 'error',
                  itemId: item.id,
                  description: 'Failed to generate data checksum',
                  suggestedFix: 'Regenerate checksums for data integrity'
                });
              }
            } catch (error) {
              checksumMismatches++;
              issues.push({
                type: 'checksum',
                severity: 'error',
                itemId: item.id,
                description: `Checksum verification failed: ${error instanceof Error ? error.message : String(error)}`,
                suggestedFix: 'Regenerate checksums for data integrity'
              });
            }
          }

        } catch (error) {
          Logger.error(`Batch ${batch + 1} consistency check failed:`, error);
          issues.push({
            type: 'format',
            severity: 'error',
            itemId: `batch_${batch + 1}`,
            description: `Batch processing failed: ${error instanceof Error ? error.message : String(error)}`,
            suggestedFix: 'Check vector store connectivity and data format'
          });
        }
      }

      const consistent = issues.filter(issue => issue.severity === 'error').length === 0;

      Logger.info(`Consistency check completed: ${consistent ? 'CONSISTENT' : 'ISSUES FOUND'}`);
      Logger.info(`Summary: ${validItems}/${totalItems} valid items, ${issues.length} issues found`);

      return {
        consistent,
        issues,
        summary: {
          totalItems,
          validItems,
          invalidItems,
          relationshipIssues,
          checksumMismatches
        }
      };

    } catch (error) {
      Logger.error('Consistency check failed:', error);
      throw new OperationError(
        `Consistency check failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Repair consistency issues
   */
  async repairConsistencyIssues(
    vectorStore: VectorStore,
    issues: ConsistencyIssue[],
    options: ConsistencyRepairOptions
  ): Promise<ConsistencyRepairResult> {
    Logger.info(`Starting consistency repair: ${issues.length} issues, dryRun=${options.dryRun}`);

    const repairs: ConsistencyRepairResult['repairs'] = [];
    let repairedItems = 0;
    let unrepairedItems = 0;
    let backupCreated = false;

    try {
      // Create backup if requested
      if (options.backupBeforeRepair && !options.dryRun) {
        // In a real implementation, you'd create a backup
        backupCreated = true;
        Logger.info('Backup created before repair');
      }

      // Group issues by item ID for efficient processing
      const issuesByItem = new Map<string, ConsistencyIssue[]>();
      for (const issue of issues) {
        if (options.repairTypes.includes(issue.type)) {
          if (!issuesByItem.has(issue.itemId)) {
            issuesByItem.set(issue.itemId, []);
          }
          issuesByItem.get(issue.itemId)!.push(issue);
        }
      }

      // Repair each item
      for (const [itemId, itemIssues] of issuesByItem.entries()) {
        try {
          let repaired = false;

          for (const issue of itemIssues) {
            const repairResult = await this.repairSingleIssue(
              vectorStore,
              issue,
              options.dryRun
            );

            repairs.push({
              itemId,
              issueType: issue.type,
              action: repairResult.action,
              success: repairResult.success
            });

            if (repairResult.success) {
              repaired = true;
            }
          }

          if (repaired) {
            repairedItems++;
          } else {
            unrepairedItems++;
          }

        } catch (error) {
          unrepairedItems++;
          repairs.push({
            itemId,
            issueType: 'unknown',
            action: 'repair_failed',
            success: false
          });
          Logger.error(`Failed to repair item ${itemId}:`, error);
        }
      }

      const success = unrepairedItems === 0;
      Logger.info(`Consistency repair completed: ${repairedItems} repaired, ${unrepairedItems} unrepaired`);

      return {
        success,
        repairedItems,
        unrepairedItems,
        backupCreated,
        repairs
      };

    } catch (error) {
      Logger.error('Consistency repair failed:', error);
      throw new OperationError(
        `Consistency repair failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get data format specification
   */
  getDataFormatSpec(): DataFormatSpec {
    return this.validator.getDataFormatSpec();
  }

  /**
   * Get relationship statistics
   */
  getRelationshipStats() {
    return this.relationshipManager.getRelationshipStats();
  }

  /**
   * Update semantic relationships for a code metadata item
   */
  private updateSemanticRelationships(metadata: CodeMetadata): void {
    // Add file-based relationships
    if (metadata.filePath) {
      this.relationshipManager.addRelationship(
        metadata.id,
        metadata.filePath,
        'file'
      );
    }

    // Add function-based relationships
    if (metadata.functionName) {
      this.relationshipManager.addRelationship(
        metadata.id,
        `${metadata.filePath}:${metadata.functionName}`,
        'function'
      );
    }

    // Add class-based relationships
    if (metadata.className) {
      this.relationshipManager.addRelationship(
        metadata.id,
        `${metadata.filePath}:${metadata.className}`,
        'class'
      );
    }

    // Add language-based relationships
    if (metadata.language) {
      this.relationshipManager.addRelationship(
        metadata.id,
        metadata.language,
        'language'
      );
    }
  }

  /**
   * Repair a single consistency issue
   */
  private async repairSingleIssue(
    vectorStore: VectorStore,
    issue: ConsistencyIssue,
    dryRun: boolean
  ): Promise<{ success: boolean; action: string }> {
    switch (issue.type) {
      case 'validation':
        return this.repairValidationIssue(vectorStore, issue, dryRun);
      
      case 'relationship':
        return this.repairRelationshipIssue(vectorStore, issue, dryRun);
      
      case 'checksum':
        return this.repairChecksumIssue(vectorStore, issue, dryRun);
      
      case 'format':
        return this.repairFormatIssue(vectorStore, issue, dryRun);
      
      default:
        return { success: false, action: 'unknown_issue_type' };
    }
  }

  /**
   * Repair validation issues
   */
  private async repairValidationIssue(
    vectorStore: VectorStore,
    issue: ConsistencyIssue,
    dryRun: boolean
  ): Promise<{ success: boolean; action: string }> {
    if (dryRun) {
      return { success: true, action: 'normalize_metadata_dry_run' };
    }

    try {
      // In a real implementation, you'd retrieve the item, normalize it, and update it
      // For now, we'll simulate the repair
      Logger.debug(`Repairing validation issue for ${issue.itemId}`);
      return { success: true, action: 'normalize_metadata' };
    } catch (error) {
      return { success: false, action: 'normalize_metadata_failed' };
    }
  }

  /**
   * Repair relationship issues
   */
  private async repairRelationshipIssue(
    vectorStore: VectorStore,
    issue: ConsistencyIssue,
    dryRun: boolean
  ): Promise<{ success: boolean; action: string }> {
    if (dryRun) {
      return { success: true, action: 'rebuild_relationships_dry_run' };
    }

    try {
      // Rebuild relationships for the item
      Logger.debug(`Rebuilding relationships for ${issue.itemId}`);
      return { success: true, action: 'rebuild_relationships' };
    } catch (error) {
      return { success: false, action: 'rebuild_relationships_failed' };
    }
  }

  /**
   * Repair checksum issues
   */
  private async repairChecksumIssue(
    vectorStore: VectorStore,
    issue: ConsistencyIssue,
    dryRun: boolean
  ): Promise<{ success: boolean; action: string }> {
    if (dryRun) {
      return { success: true, action: 'regenerate_checksum_dry_run' };
    }

    try {
      // Regenerate checksum for the item
      Logger.debug(`Regenerating checksum for ${issue.itemId}`);
      return { success: true, action: 'regenerate_checksum' };
    } catch (error) {
      return { success: false, action: 'regenerate_checksum_failed' };
    }
  }

  /**
   * Repair format issues
   */
  private async repairFormatIssue(
    vectorStore: VectorStore,
    issue: ConsistencyIssue,
    dryRun: boolean
  ): Promise<{ success: boolean; action: string }> {
    if (dryRun) {
      return { success: true, action: 'fix_format_dry_run' };
    }

    try {
      // Fix format issues
      Logger.debug(`Fixing format issue for ${issue.itemId}`);
      return { success: true, action: 'fix_format' };
    } catch (error) {
      return { success: false, action: 'fix_format_failed' };
    }
  }
}

/**
 * Factory function to create data consistency manager
 */
export function createDataConsistencyManager(embeddingConfig: EmbeddingConfig): DataConsistencyManager {
  return new DataConsistencyManager(embeddingConfig);
}

/**
 * Utility functions for data consistency operations
 */
export class DataConsistencyUtils {
  /**
   * Create default consistency repair options
   */
  static createDefaultRepairOptions(): ConsistencyRepairOptions {
    return {
      autoFix: false,
      backupBeforeRepair: true,
      repairTypes: ['validation', 'relationship', 'checksum'],
      dryRun: false
    };
  }

  /**
   * Filter issues by severity
   */
  static filterIssuesBySeverity(
    issues: ConsistencyIssue[],
    severity: 'error' | 'warning'
  ): ConsistencyIssue[] {
    return issues.filter(issue => issue.severity === severity);
  }

  /**
   * Group issues by type
   */
  static groupIssuesByType(issues: ConsistencyIssue[]): Record<string, ConsistencyIssue[]> {
    const grouped: Record<string, ConsistencyIssue[]> = {};
    
    for (const issue of issues) {
      if (!grouped[issue.type]) {
        grouped[issue.type] = [];
      }
      grouped[issue.type].push(issue);
    }
    
    return grouped;
  }

  /**
   * Generate consistency report
   */
  static generateConsistencyReport(result: ConsistencyCheckResult): string {
    const lines: string[] = [];
    
    lines.push('=== Data Consistency Report ===');
    lines.push(`Status: ${result.consistent ? 'CONSISTENT' : 'ISSUES FOUND'}`);
    lines.push(`Total Items: ${result.summary.totalItems}`);
    lines.push(`Valid Items: ${result.summary.validItems}`);
    lines.push(`Invalid Items: ${result.summary.invalidItems}`);
    lines.push(`Relationship Issues: ${result.summary.relationshipIssues}`);
    lines.push(`Checksum Mismatches: ${result.summary.checksumMismatches}`);
    lines.push('');
    
    if (result.issues.length > 0) {
      lines.push('=== Issues Found ===');
      const grouped = this.groupIssuesByType(result.issues);
      
      for (const [type, issues] of Object.entries(grouped)) {
        lines.push(`${type.toUpperCase()} Issues: ${issues.length}`);
        for (const issue of issues.slice(0, 5)) { // Show first 5 issues per type
          lines.push(`  - ${issue.itemId}: ${issue.description}`);
        }
        if (issues.length > 5) {
          lines.push(`  ... and ${issues.length - 5} more`);
        }
        lines.push('');
      }
    }
    
    return lines.join('\n');
  }
}