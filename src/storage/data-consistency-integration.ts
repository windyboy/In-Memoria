/**
 * Data Consistency Integration Example
 * 
 * This module demonstrates how to integrate the data consistency and integrity
 * features with existing vector backend implementations.
 */

import { VectorStore, CodeMetadata, BackendConfig } from './vector-store.js';
import { EmbeddingConfig } from './vector-types.js';
import { 
  DataConsistencyManager,
  ConsistencyCheckResult,
  ConsistencyRepairOptions,
  createDataConsistencyManager
} from './data-consistency.js';
import { 
  MigrationSummary
} from './data-migration.js';
import { 
  MigrationContext
} from './data-integrity.js';
import { createBackendAdapter } from './backend-adapters.js';
import { createBackendConfigAdapter } from './backend-config.js';
import { Logger } from '../utils/logger.js';

/**
 * Enhanced vector store wrapper that includes data consistency features
 */
export class ConsistencyAwareVectorStore implements VectorStore {
  private backend: VectorStore;
  private consistencyManager: DataConsistencyManager;

  constructor(backend: VectorStore, embeddingConfig: EmbeddingConfig) {
    this.backend = backend;
    this.consistencyManager = createDataConsistencyManager(embeddingConfig);
    
    Logger.info('Consistency-aware vector store initialized');
  }

  async initialize(collectionName?: string): Promise<void> {
    return this.backend.initialize(collectionName);
  }

  async verifyEmbeddingModel(): Promise<void> {
    return this.backend.verifyEmbeddingModel();
  }

  async storeCodeEmbedding(code: string, metadata: CodeMetadata): Promise<void> {
    // Validate and normalize data before storage
    const validated = await this.consistencyManager.validateAndNormalizeForStorage(
      code,
      metadata
    );

    // Store using normalized data
    return this.backend.storeCodeEmbedding(
      validated.code,
      validated.metadata
    );
  }

  async storeMultipleEmbeddings(codeChunks: string[], metadataList: CodeMetadata[]): Promise<void> {
    // Validate and normalize all items before batch storage
    const validatedItems = [];
    
    for (let i = 0; i < codeChunks.length; i++) {
      const validated = await this.consistencyManager.validateAndNormalizeForStorage(
        codeChunks[i],
        metadataList[i]
      );
      validatedItems.push(validated);
    }

    // Extract normalized data for batch storage
    const normalizedCodes = validatedItems.map(item => item.code);
    const normalizedMetadata = validatedItems.map(item => item.metadata);

    return this.backend.storeMultipleEmbeddings(normalizedCodes, normalizedMetadata);
  }

  async findSimilarCode(query: string, limit?: number, filters?: Record<string, unknown>) {
    const results = await this.backend.findSimilarCode(query, limit, filters);
    
    // Validate search results for consistency
    const validation = this.consistencyManager.validateSearchResults(results);
    if (!validation.valid) {
      Logger.warn('Search results validation failed:', validation.errors);
    }
    
    return results;
  }

  async findSimilarCodeByFile(filePath: string, limit?: number) {
    return this.backend.findSimilarCodeByFile(filePath, limit);
  }

  async findSimilarCodeByLanguage(query: string, language: string, limit?: number) {
    return this.backend.findSimilarCodeByLanguage(query, language, limit);
  }

  async updateCodeEmbedding(id: string, code: string, metadata: CodeMetadata): Promise<void> {
    // Validate and normalize data before update
    const validated = await this.consistencyManager.validateAndNormalizeForStorage(
      code,
      metadata
    );

    return this.backend.updateCodeEmbedding(id, validated.code, validated.metadata);
  }

  async deleteCodeEmbedding(id: string): Promise<void> {
    return this.backend.deleteCodeEmbedding(id);
  }

  async deleteCodeEmbeddingsByFile(filePath: string): Promise<void> {
    return this.backend.deleteCodeEmbeddingsByFile(filePath);
  }

  async getCollectionStats() {
    return this.backend.getCollectionStats();
  }

  async close(): Promise<void> {
    return this.backend.close();
  }

  getBackendInfo() {
    const info = this.backend.getBackendInfo();
    return {
      ...info,
      metadata: {
        ...info.metadata,
        consistencyFeatures: 'enabled',
        dataValidation: 'active',
        relationshipTracking: 'active'
      }
    };
  }

  async getHealthStatus() {
    const backendHealth = await this.backend.getHealthStatus();
    
    // Add consistency-specific health checks
    return {
      ...backendHealth,
      details: {
        ...backendHealth.details,
        consistencyManager: 'active',
        dataFormatVersion: this.consistencyManager.getDataFormatSpec().version,
        relationshipStats: this.consistencyManager.getRelationshipStats()
      }
    };
  }

  async getPerformanceMetrics() {
    return this.backend.getPerformanceMetrics();
  }

  /**
   * Perform comprehensive consistency check
   */
  async performConsistencyCheck(): Promise<ConsistencyCheckResult> {
    Logger.info('Performing consistency check on vector store');
    return this.consistencyManager.performConsistencyCheck(this.backend);
  }

  /**
   * Repair consistency issues
   */
  async repairConsistencyIssues(
    result: ConsistencyCheckResult,
    options?: Partial<ConsistencyRepairOptions>
  ) {
    const repairOptions: ConsistencyRepairOptions = {
      autoFix: false,
      backupBeforeRepair: true,
      repairTypes: ['validation', 'relationship', 'checksum'],
      dryRun: false,
      ...options
    };

    Logger.info('Repairing consistency issues');
    return this.consistencyManager.repairConsistencyIssues(
      this.backend,
      result.issues,
      repairOptions
    );
  }

  /**
   * Migrate data to another backend with consistency checks
   */
  async migrateToBackend(
    targetBackend: VectorStore,
    context: Partial<MigrationContext> = {}
  ): Promise<MigrationSummary> {
    const migrationContext = {
      sourceBackend: this.getBackendInfo().type,
      targetBackend: targetBackend.getBackendInfo().type,
      dataFormatVersion: '1.0.0',
      preserveIds: true,
      batchSize: 100,
      validateIntegrity: true,
      ...context
    };

    Logger.info(`Migrating data from ${migrationContext.sourceBackend} to ${migrationContext.targetBackend}`);
    
    return this.consistencyManager.migrateWithConsistencyChecks(
      this.backend,
      targetBackend,
      migrationContext
    );
  }
}

/**
 * Factory function to create consistency-aware vector store
 */
export function createConsistencyAwareVectorStore(
  backendConfig: BackendConfig,
  embeddingConfig: EmbeddingConfig
): ConsistencyAwareVectorStore {
  const backend = createBackendAdapter(backendConfig);
  return new ConsistencyAwareVectorStore(backend, embeddingConfig);
}

/**
 * Utility function to create consistency-aware vector store from environment
 */
export function createConsistencyAwareVectorStoreFromEnv(
  backendType?: string,
  embeddingConfig?: EmbeddingConfig
): ConsistencyAwareVectorStore {
  const type = backendType || process.env.IN_MEMORIA_VECTOR_BACKEND || 'surreal';
  const configAdapter = createBackendConfigAdapter(type);
  const backendConfig = configAdapter.mapEnvironmentVariables();
  
  const defaultEmbeddingConfig: EmbeddingConfig = {
    model: 'Xenova/all-MiniLM-L6-v2',
    dimension: 384,
    cacheSize: 1000,
    pooling: 'mean',
    normalize: true
  };

  const finalEmbeddingConfig = { ...defaultEmbeddingConfig, ...embeddingConfig };
  
  return createConsistencyAwareVectorStore(backendConfig, finalEmbeddingConfig);
}

/**
 * Example usage and integration patterns
 */
export class DataConsistencyExamples {
  /**
   * Example: Basic data validation and storage
   */
  static async basicValidationExample() {
    Logger.info('=== Basic Data Validation Example ===');
    
    const vectorStore = createConsistencyAwareVectorStoreFromEnv();
    await vectorStore.initialize();

    try {
      // This will automatically validate and normalize the metadata
      await vectorStore.storeCodeEmbedding(
        'function calculateSum(a, b) { return a + b; }',
        {
          id: 'calc-sum-1',
          filePath: '/src/utils/math.js',
          language: 'JavaScript', // Will be normalized to 'javascript'
          functionName: 'calculateSum',
          complexity: 2,
          lineCount: 1,
          lastModified: new Date()
        }
      );

      Logger.info('Data stored successfully with validation');
    } catch (error) {
      Logger.error('Validation failed:', error);
    } finally {
      await vectorStore.close();
    }
  }

  /**
   * Example: Consistency check and repair
   */
  static async consistencyCheckExample() {
    Logger.info('=== Consistency Check Example ===');
    
    const vectorStore = createConsistencyAwareVectorStoreFromEnv();
    await vectorStore.initialize();

    try {
      // Perform consistency check
      const checkResult = await vectorStore.performConsistencyCheck();
      
      Logger.info(`Consistency check completed: ${checkResult.consistent ? 'PASS' : 'ISSUES FOUND'}`);
      Logger.info(`Total items: ${checkResult.summary.totalItems}`);
      Logger.info(`Valid items: ${checkResult.summary.validItems}`);
      Logger.info(`Issues found: ${checkResult.issues.length}`);

      // Repair issues if found
      if (!checkResult.consistent) {
        const repairResult = await vectorStore.repairConsistencyIssues(checkResult, {
          dryRun: true, // Preview repairs without applying them
          autoFix: false
        });

        Logger.info(`Repair preview: ${repairResult.repairedItems} items would be repaired`);
      }
    } catch (error) {
      Logger.error('Consistency check failed:', error);
    } finally {
      await vectorStore.close();
    }
  }

  /**
   * Example: Data migration between backends
   */
  static async migrationExample() {
    Logger.info('=== Data Migration Example ===');
    
    // Create source and target vector stores
    const sourceConfig = {
      type: 'surreal' as const,
      connectionParams: { path: 'source.db' },
      embeddingConfig: { dimension: 384 },
      performanceSettings: {
        connectionTimeout: 30000,
        operationTimeout: 30000,
        maxRetries: 3,
        batchSize: 50
      }
    };

    const targetConfig = {
      type: 'qdrant' as const,
      connectionParams: { 
        url: 'http://localhost:6333',
        collection: 'migrated-data'
      },
      embeddingConfig: { dimension: 384 },
      performanceSettings: {
        connectionTimeout: 30000,
        operationTimeout: 30000,
        maxRetries: 3,
        batchSize: 50
      }
    };

    const embeddingConfig = {
      model: 'Xenova/all-MiniLM-L6-v2',
      dimension: 384,
      cacheSize: 1000,
      pooling: 'mean' as const,
      normalize: true
    };

    const sourceStore = createConsistencyAwareVectorStore(sourceConfig, embeddingConfig);
    const targetStore = createConsistencyAwareVectorStore(targetConfig, embeddingConfig);

    try {
      await sourceStore.initialize();
      await targetStore.initialize();

      // Perform migration with consistency checks
      const migrationResult = await sourceStore.migrateToBackend(targetStore, {
        batchSize: 50,
        validateIntegrity: true,
        preserveIds: true
      });

      Logger.info(`Migration completed: ${migrationResult.success ? 'SUCCESS' : 'FAILED'}`);
      Logger.info(`Items migrated: ${migrationResult.migratedItems}/${migrationResult.totalItems}`);
      Logger.info(`Duration: ${migrationResult.duration}ms`);
      Logger.info(`Relationships preserved: ${migrationResult.relationshipsPreserved}`);

      if (migrationResult.errors.length > 0) {
        Logger.warn('Migration errors:', migrationResult.errors.slice(0, 5));
      }

    } catch (error) {
      Logger.error('Migration failed:', error);
    } finally {
      await sourceStore.close();
      await targetStore.close();
    }
  }

  /**
   * Example: Batch validation and storage
   */
  static async batchValidationExample() {
    Logger.info('=== Batch Validation Example ===');
    
    const vectorStore = createConsistencyAwareVectorStoreFromEnv();
    await vectorStore.initialize();

    const codeChunks = [
      'function add(a, b) { return a + b; }',
      'function subtract(a, b) { return a - b; }',
      'function multiply(a, b) { return a * b; }'
    ];

    const metadataList = [
      {
        id: 'math-add',
        filePath: '/src/math.js',
        language: 'javascript',
        functionName: 'add',
        complexity: 1,
        lineCount: 1,
        lastModified: new Date()
      },
      {
        id: 'math-subtract',
        filePath: '/src/math.js',
        language: 'javascript',
        functionName: 'subtract',
        complexity: 1,
        lineCount: 1,
        lastModified: new Date()
      },
      {
        id: 'math-multiply',
        filePath: '/src/math.js',
        language: 'javascript',
        functionName: 'multiply',
        complexity: 1,
        lineCount: 1,
        lastModified: new Date()
      }
    ];

    try {
      // This will validate and normalize all items before batch storage
      await vectorStore.storeMultipleEmbeddings(codeChunks, metadataList);
      Logger.info('Batch storage completed with validation');

      // Verify the data was stored correctly
      const results = await vectorStore.findSimilarCode('function', 10);
      Logger.info(`Found ${results.length} similar code items`);

    } catch (error) {
      Logger.error('Batch validation failed:', error);
    } finally {
      await vectorStore.close();
    }
  }
}