import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SurrealVectorDB } from '../vector-db.js';
// QdrantVectorDB removed in Phase 3 - only SurrealDB backend supported per requirement 6.1
import { VectorStore, BackendInfo, HealthStatus, PerformanceMetrics } from '../vector-store.js';

describe('Enhanced VectorStore Interface', () => {
  let surrealStore: VectorStore;

  beforeEach(async () => {
    // Create instances without initializing to test interface methods
    surrealStore = new SurrealVectorDB();
  });

  afterEach(async () => {
    await surrealStore.close();
  });

  describe('getBackendInfo()', () => {
    it('should return backend info for SurrealDB', () => {
      const info: BackendInfo = surrealStore.getBackendInfo();
      
      expect(info.type).toBe('surreal');
      expect(info.version).toBeDefined();
      expect(info.capabilities).toBeDefined();
      expect(info.capabilities.supportsBatchOperations).toBe(true);
      expect(info.capabilities.supportsFiltering).toBe(true);
      expect(info.capabilities.supportsMetadataSearch).toBe(true);
      expect(info.capabilities.maxEmbeddingDimension).toBeGreaterThan(0);
      expect(Array.isArray(info.capabilities.supportedDistanceMetrics)).toBe(true);
      expect(info.connectionStatus).toMatch(/^(connected|disconnected|error)$/);
      expect(info.metadata).toBeDefined();
    });

    // Qdrant tests removed - only SurrealDB supported per requirement 6.1
  });

  describe('getHealthStatus()', () => {
    it('should return health status for SurrealDB', async () => {
      const health: HealthStatus = await surrealStore.getHealthStatus();
      
      expect(health.status).toMatch(/^(healthy|degraded|unhealthy)$/);
      expect(health.lastChecked).toBeInstanceOf(Date);
      expect(typeof health.responseTime).toBe('number');
      expect(health.responseTime).toBeGreaterThanOrEqual(0);
      expect(health.details).toBeDefined();
    });

    it('should report unhealthy status when not initialized', async () => {
      const surrealHealth = await surrealStore.getHealthStatus();
      expect(surrealHealth.status).toBe('unhealthy');
    });
  });

  describe('getPerformanceMetrics()', () => {
    it('should return performance metrics for SurrealDB', async () => {
      const metrics: PerformanceMetrics = await surrealStore.getPerformanceMetrics();
      
      expect(metrics.operationCounts).toBeDefined();
      expect(typeof metrics.operationCounts).toBe('object');
      expect(metrics.averageResponseTimes).toBeDefined();
      expect(typeof metrics.averageResponseTimes).toBe('object');
      expect(metrics.errorRates).toBeDefined();
      expect(typeof metrics.errorRates).toBe('object');
      expect(metrics.cacheHitRates).toBeDefined();
      expect(typeof metrics.cacheHitRates).toBe('object');
      expect(typeof metrics.memoryUsage).toBe('number');
      expect(metrics.memoryUsage).toBeGreaterThanOrEqual(0);
    });

    // Qdrant tests removed - only SurrealDB supported per requirement 6.1
  });

  describe('Interface Compliance', () => {
    it('should maintain backward compatibility with existing methods', () => {
      // Verify all existing methods are still present
      expect(typeof surrealStore.initialize).toBe('function');
      expect(typeof surrealStore.verifyEmbeddingModel).toBe('function');
      expect(typeof surrealStore.storeCodeEmbedding).toBe('function');
      expect(typeof surrealStore.storeMultipleEmbeddings).toBe('function');
      expect(typeof surrealStore.findSimilarCode).toBe('function');
      expect(typeof surrealStore.findSimilarCodeByFile).toBe('function');
      expect(typeof surrealStore.findSimilarCodeByLanguage).toBe('function');
      expect(typeof surrealStore.updateCodeEmbedding).toBe('function');
      expect(typeof surrealStore.deleteCodeEmbedding).toBe('function');
      expect(typeof surrealStore.deleteCodeEmbeddingsByFile).toBe('function');
      expect(typeof surrealStore.getCollectionStats).toBe('function');
      expect(typeof surrealStore.close).toBe('function');
      
      // Verify new methods are present
      expect(typeof surrealStore.getBackendInfo).toBe('function');
      expect(typeof surrealStore.getHealthStatus).toBe('function');
      expect(typeof surrealStore.getPerformanceMetrics).toBe('function');
    });

    it('should implement all VectorStore interface methods', () => {
      // SurrealDB should implement the VectorStore interface methods
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
        expect(typeof (surrealStore as any)[method]).toBe('function');
      }
    });
  });
});