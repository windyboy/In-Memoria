/**
 * Tests for backend adapter implementations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  SurrealBackendAdapter, 
  QdrantBackendAdapter, 
  createBackendAdapter,
  createBackendAdapterFromEnv,
  BackendConfig,
  VectorStoreError,
  ConnectionError,
  ValidationError,
  OperationError,
  ConfigurationError
} from '../vector-store.js';
import { Logger } from '../../utils/logger.js';

describe('Backend Adapters', () => {
  let surrealConfig: BackendConfig;
  let qdrantConfig: BackendConfig;

  beforeEach(() => {
    surrealConfig = {
      type: 'surreal',
      connectionParams: {
        namespace: 'test',
        database: 'test-vectors',
        path: 'test-vectors.db'
      },
      embeddingConfig: {
        model: 'Xenova/all-MiniLM-L6-v2',
        dimension: 384,
        cacheSize: 100,
        pooling: 'mean',
        normalize: true
      },
      performanceSettings: {
        connectionTimeout: 30000,
        operationTimeout: 30000,
        maxRetries: 3,
        batchSize: 50
      }
    };

    qdrantConfig = {
      type: 'qdrant',
      connectionParams: {
        url: 'http://localhost:6333',
        collection: 'test-memoria',
        apiKey: undefined
      },
      embeddingConfig: {
        model: 'Xenova/all-MiniLM-L6-v2',
        dimension: 384,
        cacheSize: 100,
        pooling: 'mean',
        normalize: true
      },
      performanceSettings: {
        connectionTimeout: 30000,
        operationTimeout: 30000,
        maxRetries: 3,
        batchSize: 50,
        connectionPoolSize: 10
      }
    };
  });

  afterEach(async () => {
    // Clean up any test resources
  });

  describe('SurrealBackendAdapter', () => {
    it('should create adapter with valid configuration', () => {
      const adapter = new SurrealBackendAdapter(surrealConfig);
      expect(adapter).toBeDefined();
      
      const backendInfo = adapter.getBackendInfo();
      expect(backendInfo.type).toBe('surreal');
      expect(backendInfo.metadata.adapterVersion).toBe('1.0.0');
      expect(backendInfo.metadata.errorHandling).toBe('standardized');
    });

    it('should throw ConfigurationError for invalid configuration', () => {
      const invalidConfig = {
        ...surrealConfig,
        embeddingConfig: {
          ...surrealConfig.embeddingConfig,
          dimension: -1 // Invalid dimension
        }
      };

      expect(() => new SurrealBackendAdapter(invalidConfig)).toThrow();
    });

    it('should provide enhanced backend info', () => {
      const adapter = new SurrealBackendAdapter(surrealConfig);
      const info = adapter.getBackendInfo();
      
      expect(info.type).toBe('surreal');
      expect(info.capabilities.supportsBatchOperations).toBe(true);
      expect(info.capabilities.supportsFiltering).toBe(true);
      expect(info.capabilities.supportsMetadataSearch).toBe(true);
      expect(info.capabilities.maxEmbeddingDimension).toBe(2048);
      expect(info.capabilities.supportedDistanceMetrics).toContain('cosine');
      expect(info.metadata.adapterVersion).toBe('1.0.0');
      expect(info.metadata.configurationSource).toBe('adapter');
      expect(info.metadata.errorHandling).toBe('standardized');
    });

    it('should provide enhanced health status', async () => {
      const adapter = new SurrealBackendAdapter(surrealConfig);
      const health = await adapter.getHealthStatus();
      
      expect(health.status).toMatch(/healthy|degraded|unhealthy/);
      expect(health.lastChecked).toBeInstanceOf(Date);
      expect(typeof health.responseTime).toBe('number');
      expect(health.details.adapter).toBe('surreal-backend-adapter');
      expect(typeof health.details.configValid).toBe('boolean');
    });

    it('should provide enhanced performance metrics', async () => {
      const adapter = new SurrealBackendAdapter(surrealConfig);
      const metrics = await adapter.getPerformanceMetrics();
      
      expect(metrics.operationCounts).toBeDefined();
      expect(metrics.averageResponseTimes).toBeDefined();
      expect(metrics.errorRates).toBeDefined();
      expect(metrics.cacheHitRates).toBeDefined();
      expect(typeof metrics.memoryUsage).toBe('number');
      expect(metrics.operationCounts.adapterOperations).toBeDefined();
    });
  });

  describe('QdrantBackendAdapter', () => {
    it('should create adapter with valid configuration', () => {
      const adapter = new QdrantBackendAdapter(qdrantConfig);
      expect(adapter).toBeDefined();
      
      const backendInfo = adapter.getBackendInfo();
      expect(backendInfo.type).toBe('qdrant');
      expect(backendInfo.metadata.adapterVersion).toBe('1.0.0');
      expect(backendInfo.metadata.errorHandling).toBe('standardized');
    });

    it('should throw ConfigurationError for invalid configuration', () => {
      const invalidConfig = {
        ...qdrantConfig,
        connectionParams: {
          ...qdrantConfig.connectionParams,
          url: 'invalid-url' // Invalid URL
        }
      };

      expect(() => new QdrantBackendAdapter(invalidConfig)).toThrow();
    });

    it('should provide enhanced backend info', () => {
      const adapter = new QdrantBackendAdapter(qdrantConfig);
      const info = adapter.getBackendInfo();
      
      expect(info.type).toBe('qdrant');
      expect(info.capabilities.supportsBatchOperations).toBe(true);
      expect(info.capabilities.supportsFiltering).toBe(true);
      expect(info.capabilities.supportsMetadataSearch).toBe(true);
      expect(info.capabilities.maxEmbeddingDimension).toBe(65536);
      expect(info.capabilities.supportedDistanceMetrics).toContain('cosine');
      expect(info.metadata.adapterVersion).toBe('1.0.0');
      expect(info.metadata.configurationSource).toBe('adapter');
      expect(info.metadata.errorHandling).toBe('standardized');
    });

    it('should provide enhanced health status', async () => {
      const adapter = new QdrantBackendAdapter(qdrantConfig);
      const health = await adapter.getHealthStatus();
      
      expect(health.status).toMatch(/healthy|degraded|unhealthy/);
      expect(health.lastChecked).toBeInstanceOf(Date);
      expect(typeof health.responseTime).toBe('number');
      expect(health.details.adapter).toBe('qdrant-backend-adapter');
      expect(typeof health.details.configValid).toBe('boolean');
    });

    it('should provide enhanced performance metrics', async () => {
      const adapter = new QdrantBackendAdapter(qdrantConfig);
      const metrics = await adapter.getPerformanceMetrics();
      
      expect(metrics.operationCounts).toBeDefined();
      expect(metrics.averageResponseTimes).toBeDefined();
      expect(metrics.errorRates).toBeDefined();
      expect(metrics.cacheHitRates).toBeDefined();
      expect(typeof metrics.memoryUsage).toBe('number');
      expect(metrics.operationCounts.adapterOperations).toBeDefined();
    });
  });

  describe('Factory Functions', () => {
    it('should create SurrealBackendAdapter via factory', () => {
      const adapter = createBackendAdapter(surrealConfig);
      expect(adapter).toBeInstanceOf(SurrealBackendAdapter);
    });

    it('should create QdrantBackendAdapter via factory', () => {
      const adapter = createBackendAdapter(qdrantConfig);
      expect(adapter).toBeInstanceOf(QdrantBackendAdapter);
    });

    it('should throw error for unsupported backend type', () => {
      const invalidConfig = {
        ...surrealConfig,
        type: 'unsupported'
      };

      expect(() => createBackendAdapter(invalidConfig as any)).toThrow('Unsupported backend type: unsupported');
    });

    it('should create adapter from environment variables', () => {
      // Set environment variables for testing
      const originalBackend = process.env.IN_MEMORIA_VECTOR_BACKEND;
      process.env.IN_MEMORIA_VECTOR_BACKEND = 'surreal';

      try {
        const adapter = createBackendAdapterFromEnv();
        expect(adapter).toBeInstanceOf(SurrealBackendAdapter);
      } finally {
        // Restore original environment
        if (originalBackend !== undefined) {
          process.env.IN_MEMORIA_VECTOR_BACKEND = originalBackend;
        } else {
          delete process.env.IN_MEMORIA_VECTOR_BACKEND;
        }
      }
    });
  });

  describe('Error Handling', () => {
    it('should wrap and translate errors consistently', async () => {
      const adapter = new SurrealBackendAdapter(surrealConfig);
      
      // Test error handling by calling a method that will fail
      try {
        await adapter.storeCodeEmbedding('test code', {
          id: 'test-id',
          filePath: '/test/path',
          language: 'typescript',
          complexity: 1,
          lineCount: 10,
          lastModified: new Date()
        });
        // This should fail because we haven't initialized the adapter
        expect.fail('Expected operation to throw an error');
      } catch (error) {
        expect(error).toBeInstanceOf(VectorStoreError);
        if (error instanceof VectorStoreError) {
          expect(error.code).toBeDefined();
          expect(error.category).toBeDefined();
          expect(typeof error.retryable).toBe('boolean');
        }
      }
    });

    it('should provide consistent error structure across backends', async () => {
      const surrealAdapter = new SurrealBackendAdapter(surrealConfig);
      const qdrantAdapter = new QdrantBackendAdapter(qdrantConfig);
      
      const testOperation = async (adapter: any) => {
        try {
          await adapter.storeCodeEmbedding('test', {
            id: 'test',
            filePath: '/test',
            language: 'typescript',
            complexity: 1,
            lineCount: 1,
            lastModified: new Date()
          });
          return null;
        } catch (error) {
          return error;
        }
      };

      const surrealError = await testOperation(surrealAdapter);
      const qdrantError = await testOperation(qdrantAdapter);

      // Both should produce VectorStoreError instances
      expect(surrealError).toBeInstanceOf(VectorStoreError);
      expect(qdrantError).toBeInstanceOf(VectorStoreError);

      // Both should have the same error structure
      if (surrealError instanceof VectorStoreError && qdrantError instanceof VectorStoreError) {
        expect(typeof surrealError.code).toBe('string');
        expect(typeof qdrantError.code).toBe('string');
        expect(typeof surrealError.category).toBe('string');
        expect(typeof qdrantError.category).toBe('string');
        expect(typeof surrealError.retryable).toBe('boolean');
        expect(typeof qdrantError.retryable).toBe('boolean');
      }
    });
  });

  describe('Configuration Management', () => {
    it('should validate configuration on construction', () => {
      // Valid configuration should work
      expect(() => new SurrealBackendAdapter(surrealConfig)).not.toThrow();
      expect(() => new QdrantBackendAdapter(qdrantConfig)).not.toThrow();

      // Invalid configuration should throw
      const invalidSurrealConfig = {
        ...surrealConfig,
        performanceSettings: {
          ...surrealConfig.performanceSettings,
          connectionTimeout: -1 // Invalid timeout
        }
      };

      expect(() => new SurrealBackendAdapter(invalidSurrealConfig)).toThrow();
    });

    it('should sanitize configuration for logging', () => {
      const configWithSecrets = {
        ...qdrantConfig,
        connectionParams: {
          ...qdrantConfig.connectionParams,
          apiKey: 'secret-api-key-12345'
        }
      };

      const adapter = new QdrantBackendAdapter(configWithSecrets);
      const info = adapter.getBackendInfo();
      
      // The API key should not be exposed in the backend info
      expect(JSON.stringify(info)).not.toContain('secret-api-key-12345');
    });
  });

  describe('Interface Compliance', () => {
    it('should implement all VectorStore interface methods', () => {
      const surrealAdapter = new SurrealBackendAdapter(surrealConfig);
      const qdrantAdapter = new QdrantBackendAdapter(qdrantConfig);

      const requiredMethods = [
        'initialize',
        'verifyEmbeddingModel',
        'storeCodeEmbedding',
        'storeMultipleEmbeddings',
        'findSimilarCode',
        'findSimilarCodeByFile',
        'findSimilarCodeByLanguage',
        'updateCodeEmbedding',
        'deleteCodeEmbedding',
        'deleteCodeEmbeddingsByFile',
        'getCollectionStats',
        'close',
        'getBackendInfo',
        'getHealthStatus',
        'getPerformanceMetrics'
      ];

      for (const method of requiredMethods) {
        expect(typeof (surrealAdapter as any)[method]).toBe('function');
        expect(typeof (qdrantAdapter as any)[method]).toBe('function');
      }
    });

    it('should maintain consistent method signatures across adapters', () => {
      const surrealAdapter = new SurrealBackendAdapter(surrealConfig);
      const qdrantAdapter = new QdrantBackendAdapter(qdrantConfig);

      // Check that key methods have the same signature
      expect(surrealAdapter.initialize.length).toBe(qdrantAdapter.initialize.length);
      expect(surrealAdapter.storeCodeEmbedding.length).toBe(qdrantAdapter.storeCodeEmbedding.length);
      expect(surrealAdapter.findSimilarCode.length).toBe(qdrantAdapter.findSimilarCode.length);
    });
  });
});