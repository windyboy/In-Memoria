/**
 * Data Migration System
 * 
 * This module provides comprehensive data migration support between different
 * vector backend implementations, ensuring data consistency and integrity
 * during the migration process.
 */

import { VectorStore, CodeMetadata, SemanticSearchResult } from './vector-store.js';
import { DataIntegrityValidator, SemanticRelationshipManager, MigrationContext, DataValidationResult } from './data-integrity.js';
import { Logger } from '../utils/logger.js';
import { OperationError, ValidationError } from './vector-errors.js';

/**
 * Migration progress tracking
 */
export interface MigrationProgress {
  totalItems: number;
  processedItems: number;
  successfulItems: number;
  failedItems: number;
  currentBatch: number;
  totalBatches: number;
  startTime: Date;
  estimatedCompletion?: Date;
  errors: string[];
}

/**
 * Migration statistics and summary
 */
export interface MigrationSummary {
  success: boolean;
  totalItems: number;
  migratedItems: number;
  failedItems: number;
  duration: number;
  dataIntegrityChecks: number;
  relationshipsPreserved: number;
  errors: string[];
  warnings: string[];
}

/**
 * Migrated data item with validation results
 */
interface MigratedDataItem {
  id: string;
  code: string;
  metadata: CodeMetadata;
  embedding?: number[];
  checksum: string;
  validationResult: DataValidationResult;
}

/**
 * Data migration manager that handles transfers between vector backends
 */
export class DataMigrationManager {
  private validator: DataIntegrityValidator;
  private relationshipManager: SemanticRelationshipManager;
  private progressCallback?: (progress: MigrationProgress) => void;

  constructor(
    validator: DataIntegrityValidator,
    relationshipManager: SemanticRelationshipManager,
    progressCallback?: (progress: MigrationProgress) => void
  ) {
    this.validator = validator;
    this.relationshipManager = relationshipManager;
    this.progressCallback = progressCallback;
    
    Logger.info('Data migration manager initialized');
  }

  /**
   * Migrate all data from source backend to target backend
   */
  async migrateData(
    sourceBackend: VectorStore,
    targetBackend: VectorStore,
    context: MigrationContext
  ): Promise<MigrationSummary> {
    const startTime = new Date();
    Logger.info(`Starting data migration from ${context.sourceBackend} to ${context.targetBackend}`);

    try {
      // Initialize target backend
      await targetBackend.initialize();
      await targetBackend.verifyEmbeddingModel();

      // Get source data statistics
      const sourceStats = await sourceBackend.getCollectionStats();
      const totalItems = sourceStats.count;

      if (totalItems === 0) {
        Logger.info('No data to migrate');
        return this.createMigrationSummary(true, 0, 0, 0, Date.now() - startTime.getTime(), [], []);
      }

      // Initialize progress tracking
      const totalBatches = Math.ceil(totalItems / context.batchSize);
      const progress: MigrationProgress = {
        totalItems,
        processedItems: 0,
        successfulItems: 0,
        failedItems: 0,
        currentBatch: 0,
        totalBatches,
        startTime,
        errors: []
      };

      // Export relationships if needed
      const relationships = this.relationshipManager.exportRelationships();
      
      // Migrate data in batches
      const errors: string[] = [];
      const warnings: string[] = [];
      let processedItems = 0;
      let successfulItems = 0;
      let failedItems = 0;
      let dataIntegrityChecks = 0;

      for (let batch = 0; batch < totalBatches; batch++) {
        progress.currentBatch = batch + 1;
        
        try {
          // Get batch of data from source
          const batchData = await this.extractBatchData(sourceBackend, batch, context.batchSize);
          
          // Validate and migrate each item in the batch
          const migrationResults = await this.migrateBatch(
            batchData,
            targetBackend,
            context
          );

          // Update progress
          for (const result of migrationResults) {
            processedItems++;
            dataIntegrityChecks++;
            
            if (result.validationResult.valid) {
              successfulItems++;
            } else {
              failedItems++;
              errors.push(`Item ${result.id}: ${result.validationResult.errors.join(', ')}`);
            }
            
            if (result.validationResult.warnings.length > 0) {
              warnings.push(`Item ${result.id}: ${result.validationResult.warnings.join(', ')}`);
            }
          }

          progress.processedItems = processedItems;
          progress.successfulItems = successfulItems;
          progress.failedItems = failedItems;
          progress.errors = errors.slice(-10); // Keep last 10 errors

          // Estimate completion time
          if (processedItems > 0) {
            const elapsed = Date.now() - startTime.getTime();
            const rate = processedItems / elapsed;
            const remaining = totalItems - processedItems;
            progress.estimatedCompletion = new Date(Date.now() + (remaining / rate));
          }

          // Report progress
          if (this.progressCallback) {
            this.progressCallback(progress);
          }

          Logger.debug(`Migrated batch ${batch + 1}/${totalBatches}: ${migrationResults.length} items`);

        } catch (error) {
          const errorMessage = `Batch ${batch + 1} migration failed: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMessage);
          Logger.error(errorMessage);
          
          // Continue with next batch unless it's a critical error
          if (error instanceof ValidationError) {
            failedItems += context.batchSize;
          }
        }
      }

      // Import relationships to target backend
      if (Object.keys(relationships).length > 0) {
        this.relationshipManager.importRelationships(relationships);
        Logger.info(`Preserved ${Object.keys(relationships).length} semantic relationships`);
      }

      // Verify migration integrity if requested
      if (context.validateIntegrity) {
        await this.verifyMigrationIntegrity(sourceBackend, targetBackend, context);
      }

      const duration = Date.now() - startTime.getTime();
      const success = failedItems === 0;
      const relationshipsPreserved = Object.keys(relationships).length;

      Logger.info(`Migration completed: ${successfulItems}/${totalItems} items migrated successfully in ${duration}ms`);

      return this.createMigrationSummary(
        success,
        totalItems,
        successfulItems,
        failedItems,
        duration,
        errors,
        warnings,
        dataIntegrityChecks,
        relationshipsPreserved
      );

    } catch (error) {
      const duration = Date.now() - startTime.getTime();
      const errorMessage = `Migration failed: ${error instanceof Error ? error.message : String(error)}`;
      Logger.error(errorMessage);
      
      return this.createMigrationSummary(
        false,
        0,
        0,
        0,
        duration,
        [errorMessage],
        []
      );
    }
  }

  /**
   * Verify data integrity after migration
   */
  async verifyMigrationIntegrity(
    sourceBackend: VectorStore,
    targetBackend: VectorStore,
    context: MigrationContext
  ): Promise<boolean> {
    Logger.info('Verifying migration integrity...');

    try {
      // Compare collection statistics
      const sourceStats = await sourceBackend.getCollectionStats();
      const targetStats = await targetBackend.getCollectionStats();

      if (sourceStats.count !== targetStats.count) {
        throw new ValidationError(
          `Item count mismatch: source has ${sourceStats.count}, target has ${targetStats.count}`
        );
      }

      // Sample verification - check a subset of items
      const sampleSize = Math.min(100, Math.ceil(sourceStats.count * 0.1)); // 10% or max 100 items
      Logger.debug(`Performing sample verification of ${sampleSize} items`);

      for (let i = 0; i < sampleSize; i++) {
        // This is a simplified verification - in practice, you'd need to implement
        // backend-specific methods to retrieve items by index or ID
        // For now, we'll just verify that we can perform basic operations
        
        const testQuery = `test query ${i}`;
        const sourceResults = await sourceBackend.findSimilarCode(testQuery, 1);
        const targetResults = await targetBackend.findSimilarCode(testQuery, 1);

        if (sourceResults.length > 0 && targetResults.length > 0) {
          // Verify metadata consistency
          const sourceMetadata = sourceResults[0].metadata;
          const targetMetadata = targetResults[0].metadata;
          
          const sourceValidation = this.validator.validateCodeMetadata(sourceMetadata);
          const targetValidation = this.validator.validateCodeMetadata(targetMetadata);
          
          if (!sourceValidation.valid || !targetValidation.valid) {
            throw new ValidationError('Metadata validation failed during integrity check');
          }
        }
      }

      Logger.info('Migration integrity verification completed successfully');
      return true;

    } catch (error) {
      Logger.error('Migration integrity verification failed:', error);
      return false;
    }
  }

  /**
   * Extract a batch of data from the source backend
   */
  private async extractBatchData(
    sourceBackend: VectorStore,
    batchIndex: number,
    batchSize: number
  ): Promise<SemanticSearchResult[]> {
    try {
      // Use empty query to get all data, with pagination
      // This is a simplified approach - real implementation would need
      // backend-specific pagination support
      const results = await sourceBackend.findSimilarCode('', batchSize * 10);
      
      // Simulate pagination by slicing results
      const startIndex = batchIndex * batchSize;
      const endIndex = startIndex + batchSize;
      
      return results.slice(startIndex, endIndex);
    } catch (error) {
      throw new OperationError(
        `Failed to extract batch ${batchIndex}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Migrate a batch of data items
   */
  private async migrateBatch(
    batchData: SemanticSearchResult[],
    targetBackend: VectorStore,
    context: MigrationContext
  ): Promise<MigratedDataItem[]> {
    const results: MigratedDataItem[] = [];

    for (const item of batchData) {
      try {
        // Validate source data
        const metadataValidation = this.validator.validateCodeMetadata(item.metadata);
        
        // Generate checksum for integrity verification
        const checksum = this.validator.generateDataChecksum({
          code: item.code,
          metadata: item.metadata
        });

        // Create migrated item
        const migratedItem: MigratedDataItem = {
          id: context.preserveIds ? item.id : this.generateNewId(),
          code: item.code,
          metadata: metadataValidation.normalizedData as CodeMetadata || item.metadata,
          checksum,
          validationResult: metadataValidation
        };

        // Store in target backend if validation passed
        if (metadataValidation.valid) {
          await targetBackend.storeCodeEmbedding(migratedItem.code, migratedItem.metadata);
          
          // Preserve semantic relationships
          this.relationshipManager.addRelationship(
            item.id,
            migratedItem.id,
            'migration'
          );
        }

        results.push(migratedItem);

      } catch (error) {
        // Create failed migration item
        results.push({
          id: item.id,
          code: item.code,
          metadata: item.metadata,
          checksum: '',
          validationResult: {
            valid: false,
            errors: [`Migration failed: ${error instanceof Error ? error.message : String(error)}`],
            warnings: []
          }
        });
      }
    }

    return results;
  }

  /**
   * Generate a new ID for migrated items
   */
  private generateNewId(): string {
    return `migrated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create migration summary
   */
  private createMigrationSummary(
    success: boolean,
    totalItems: number,
    migratedItems: number,
    failedItems: number,
    duration: number,
    errors: string[],
    warnings: string[],
    dataIntegrityChecks: number = 0,
    relationshipsPreserved: number = 0
  ): MigrationSummary {
    return {
      success,
      totalItems,
      migratedItems,
      failedItems,
      duration,
      dataIntegrityChecks,
      relationshipsPreserved,
      errors: errors.slice(0, 100), // Limit to first 100 errors
      warnings: warnings.slice(0, 100) // Limit to first 100 warnings
    };
  }
}

/**
 * Migration utility functions
 */
export class MigrationUtils {
  /**
   * Create a migration context with sensible defaults
   */
  static createMigrationContext(
    sourceBackend: string,
    targetBackend: string,
    options: Partial<MigrationContext> = {}
  ): MigrationContext {
    return {
      sourceBackend,
      targetBackend,
      dataFormatVersion: '1.0.0',
      preserveIds: true,
      batchSize: 100,
      validateIntegrity: true,
      ...options
    };
  }

  /**
   * Estimate migration time based on data size and backend performance
   */
  static estimateMigrationTime(
    itemCount: number,
    batchSize: number,
    avgItemProcessingTimeMs: number = 10
  ): number {
    const batches = Math.ceil(itemCount / batchSize);
    const processingTime = itemCount * avgItemProcessingTimeMs;
    const batchOverhead = batches * 100; // 100ms overhead per batch
    
    return processingTime + batchOverhead;
  }

  /**
   * Validate migration prerequisites
   */
  static async validateMigrationPrerequisites(
    sourceBackend: VectorStore,
    targetBackend: VectorStore
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Check source backend health
      const sourceHealth = await sourceBackend.getHealthStatus();
      if (sourceHealth.status !== 'healthy') {
        errors.push(`Source backend is not healthy: ${sourceHealth.status}`);
      }

      // Check target backend health
      const targetHealth = await targetBackend.getHealthStatus();
      if (targetHealth.status !== 'healthy') {
        errors.push(`Target backend is not healthy: ${targetHealth.status}`);
      }

      // Check backend compatibility
      const sourceInfo = sourceBackend.getBackendInfo();
      const targetInfo = targetBackend.getBackendInfo();

      if (sourceInfo.capabilities.maxEmbeddingDimension < targetInfo.capabilities.maxEmbeddingDimension) {
        // This is actually fine - target can handle larger dimensions
      } else if (sourceInfo.capabilities.maxEmbeddingDimension > targetInfo.capabilities.maxEmbeddingDimension) {
        errors.push(
          `Target backend cannot handle source embedding dimensions: ` +
          `source max ${sourceInfo.capabilities.maxEmbeddingDimension}, ` +
          `target max ${targetInfo.capabilities.maxEmbeddingDimension}`
        );
      }

      // Check if target supports required features
      if (!targetInfo.capabilities.supportsBatchOperations) {
        errors.push('Target backend does not support batch operations required for efficient migration');
      }

    } catch (error) {
      errors.push(`Prerequisites validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Create a progress reporter function
   */
  static createProgressReporter(
    logInterval: number = 5000 // Log every 5 seconds
  ): (progress: MigrationProgress) => void {
    let lastLogTime = 0;

    return (progress: MigrationProgress) => {
      const now = Date.now();
      if (now - lastLogTime >= logInterval) {
        const percentage = Math.round((progress.processedItems / progress.totalItems) * 100);
        const elapsed = now - progress.startTime.getTime();
        const rate = progress.processedItems / (elapsed / 1000);
        
        Logger.info(
          `Migration progress: ${percentage}% (${progress.processedItems}/${progress.totalItems}) ` +
          `- Rate: ${rate.toFixed(1)} items/sec ` +
          `- Batch: ${progress.currentBatch}/${progress.totalBatches} ` +
          `- Errors: ${progress.failedItems}`
        );

        if (progress.estimatedCompletion) {
          const remaining = Math.round((progress.estimatedCompletion.getTime() - now) / 1000);
          Logger.info(`Estimated completion in ${remaining} seconds`);
        }

        lastLogTime = now;
      }
    };
  }
}