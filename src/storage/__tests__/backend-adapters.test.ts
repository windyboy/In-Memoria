/**
 * Tests for backend adapter implementations
 * Updated for Task 24: Only SurrealDB backend supported per requirement 6.1
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  BackendConfig,
  SurrealBackendConfigAdapter,
  createVectorStore
} from '../backend-unified.js';
import { VectorStore } from '../vector-store.js';

describe('Backend Adapters', () => {
  let surrealConfig: BackendConfig;
  let vectorStore: VectorStore;

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
  });

  afterEach(async () => {
    if (vectorStore) {
      await vectorStore.close();
    }
  });

  describe('SurrealDB Backend Configuration', () => {
    it('should create vector store with valid configuration', () => {
      vectorStore = createVectorStore(surrealConfig.embeddingConfig);
      expect(vectorStore).toBeDefined();
    });

    it('should validate configuration', () => {
      const adapter = new SurrealBackendConfigAdapter();
      const validation = adapter.validateConfig(surrealConfig);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should provide backend info', () => {
      const info = vectorStore.getBackendInfo();
      expect(info.type).toBe('surreal');
      expect(info.capabilities.supportsBatchOperations).toBe(true);
      expect(info.capabilities.supportsFiltering).toBe(true);
      expect(info.capabilities.supportsMetadataSearch).toBe(true);
    });

    it('should provide health status', async () => {
      // Initialize the vector store first
      await vectorStore.initialize('test-collection');
      
      const health = await vectorStore.getHealthStatus();
      expect(health.status).toMatch(/healthy|degraded|unhealthy/);
      expect(health.lastChecked).toBeInstanceOf(Date);
      expect(typeof health.responseTime).toBe('number');
    });

    it('should provide performance metrics', async () => {
      const metrics = await vectorStore.getPerformanceMetrics();
      expect(metrics.operationCounts).toBeDefined();
      expect(metrics.averageResponseTimes).toBeDefined();
      expect(metrics.errorRates).toBeDefined();
      expect(typeof metrics.memoryUsage).toBe('number');
    });
  });

  describe('Configuration Management', () => {
    it('should validate configuration correctly', () => {
      const adapter = new SurrealBackendConfigAdapter();
      
      // Valid configuration should pass
      const validation = adapter.validateConfig(surrealConfig);
      expect(validation.valid).toBe(true);
      
      // Invalid configuration should fail
      const invalidConfig = {
        ...surrealConfig,
        performanceSettings: {
          ...surrealConfig.performanceSettings,
          connectionTimeout: -1 // Invalid timeout
        }
      };
      
      const invalidValidation = adapter.validateConfig(invalidConfig);
      expect(invalidValidation.valid).toBe(false);
      expect(invalidValidation.errors.length).toBeGreaterThan(0);
    });

    it('should sanitize configuration for logging', () => {
      const adapter = new SurrealBackendConfigAdapter();
      const configWithSecrets = {
        ...surrealConfig,
        connectionParams: {
          ...surrealConfig.connectionParams,
          password: 'secret-password-123'
        }
      };

      const sanitized = adapter.sanitizeForLogging(configWithSecrets);
      expect((sanitized.connectionParams as any).password).toBe('[REDACTED]');
    });
  });
});