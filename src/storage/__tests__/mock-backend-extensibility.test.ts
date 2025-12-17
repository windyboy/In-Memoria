/**
 * Tests for MockVectorDB backend extensibility and integration
 * 
 * This test suite verifies that new backends can be integrated into the
 * In-Memoria system without modifying existing code, and that the abstraction
 * layer properly handles backend registration and runtime selection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  MockVectorDB, 
  MockVectorDBConfig 
} from '../mock-vector-db.js';
import { 
  MockBackendFactory, 
  registerMockBackend, 
  createMockBackendConfig 
} from '../mock-backend-factory.js';
import { 
  getBackendRegistry, 
  resetBackendRegistry,
  BackendRegistry 
} from '../backend-registry.js';
import { registerBuiltinBackends } from '../backend-factories.js';
import { createVectorStore, createEnhancedVectorStore, resetRegistryInitialization } from '../vector-factory.js';
import { CodeMetadata, VectorStore } from '../vector-store.js';
import { Logger } from '../../utils/logger.js';

describe('Mock Backend Extensibility', () => {
  let registry: BackendRegistry;
  let mockBackend: MockVectorDB;
  let testMetadata: CodeMetadata;

  beforeEach(() => {
    // Reset registry to clean state
    resetBackendRegistry();
    registry = getBackendRegistry();
    
    // Register built-in backends
    registerBuiltinBackends(registry);
    
    // Register mock backend
    registerMockBackend(registry);
    
    // Create test metadata
    testMetadata = {
      id: 'test-id-1',
      filePath: '/test/file.ts',
      language: 'typescript',
      complexity: 5,
      lineCount: 20,
      lastModified: new Date()
    };
    
    // Create mock backend instance
    mockBackend = new MockVectorDB();
  });

  afterEach(async () => {
    // Clean up
    if (mockBackend) {
      await mockBackend.close();
    }
    resetBackendRegistry();
  });

  describe('Backend Registration', () => {
    it('should register mock backend without modifying existing code', () => {
      const supportedTypes = registry.getSupportedTypes();
      
      // Should include built-in backends
      expect(supportedTypes).toContain('surreal');
      expect(supportedTypes).toContain('qdrant');
      
      // Should include mock backend
      expect(supportedTypes).toContain('mock');
      
      // Should support the mock backend
      expect(registry.isSupported('mock')).toBe(true);
    });

    it('should provide backend information for mock backend', () => {
      const backendInfo = registry.getBackendInfo('mock');
      
      expect(backendInfo.type).toBe('mock');
      expect(backendInfo.version).toBe('1.0.0');
      expect(backendInfo.capabilities.supportsBatchOperations).toBe(true);
      expect(backendInfo.capabilities.supportsFiltering).toBe(true);
      expect(backendInfo.capabilities.supportsMetadataSearch).toBe(true);
      expect(backendInfo.metadata.description).toContain('Mock vector database');
      expect(backendInfo.metadata.testingFeatures).toBeDefined();
    });

    it('should validate mock backend configuration', () => {
      const config = createMockBackendConfig();
      const validation = registry.validateConfig('mock', config);
      
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('Runtime Backend Selection', () => {
    it('should create mock backend through registry', () => {
      const config = createMockBackendConfig();
      const backend = registry.create('mock', config);
      
      expect(backend).toBeInstanceOf(MockVectorDB);
      
      const backendInfo = backend.getBackendInfo();
      expect(backendInfo.type).toBe('mock');
    });

    it('should create mock backend through factory function', () => {
      // Set environment to use mock backend
      const originalBackend = process.env.IN_MEMORIA_VECTOR_BACKEND;
      const originalEnableMock = process.env.IN_MEMORIA_ENABLE_MOCK_BACKEND;
      const originalNodeEnv = process.env.NODE_ENV;
      
      process.env.IN_MEMORIA_VECTOR_BACKEND = 'mock';
      process.env.IN_MEMORIA_ENABLE_MOCK_BACKEND = 'true';
      process.env.NODE_ENV = 'test';
      
      try {
        // Reset the registry to force re-initialization with new environment
        resetBackendRegistry();
        resetRegistryInitialization();
        
        const backend = createVectorStore();
        expect(backend).toBeInstanceOf(MockVectorDB);
        
        const backendInfo = backend.getBackendInfo();
        expect(backendInfo.type).toBe('mock');
      } finally {
        // Restore original environment
        if (originalBackend !== undefined) {
          process.env.IN_MEMORIA_VECTOR_BACKEND = originalBackend;
        } else {
          delete process.env.IN_MEMORIA_VECTOR_BACKEND;
        }
        if (originalEnableMock !== undefined) {
          process.env.IN_MEMORIA_ENABLE_MOCK_BACKEND = originalEnableMock;
        } else {
          delete process.env.IN_MEMORIA_ENABLE_MOCK_BACKEND;
        }
        if (originalNodeEnv !== undefined) {
          process.env.NODE_ENV = originalNodeEnv;
        } else {
          delete process.env.NODE_ENV;
        }
      }
    });

    it('should create enhanced mock backend with custom configuration', () => {
      const config = createMockBackendConfig({
        simulateDelay: true,
        operationDelay: 50,
        maxDocuments: 5000
      });
      
      const backend = createEnhancedVectorStore('mock', config);
      expect(backend).toBeInstanceOf(MockVectorDB);
      
      const mockBackend = backend as MockVectorDB;
      const mockConfig = mockBackend.getConfig();
      expect(mockConfig.simulateDelay).toBe(true);
      expect(mockConfig.operationDelay).toBe(50);
      expect(mockConfig.maxDocuments).toBe(5000);
    });
  });

  describe('Interface Compliance', () => {
    beforeEach(async () => {
      await mockBackend.initialize('test-collection');
    });

    it('should implement all VectorStore interface methods', () => {
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
        expect(typeof (mockBackend as any)[method]).toBe('function');
      }
    });

    it('should store and retrieve code embeddings', async () => {
      const code = 'function test() { return "hello"; }';
      
      // Store embedding
      await mockBackend.storeCodeEmbedding(code, testMetadata);
      
      // Verify storage
      const stats = await mockBackend.getCollectionStats();
      expect(stats.count).toBe(1);
      
      // Find similar code
      const results = await mockBackend.findSimilarCode('function test');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(testMetadata.id);
      expect(results[0].code).toBe(code);
      expect(results[0].similarity).toBeGreaterThan(0);
    });

    it('should handle batch operations', async () => {
      const codes = [
        'function test1() { return 1; }',
        'function test2() { return 2; }',
        'function test3() { return 3; }'
      ];
      
      const metadataList = codes.map((_, index) => ({
        ...testMetadata,
        id: `test-id-${index + 1}`,
        filePath: `/test/file${index + 1}.ts`
      }));
      
      // Store multiple embeddings
      await mockBackend.storeMultipleEmbeddings(codes, metadataList);
      
      // Verify storage
      const stats = await mockBackend.getCollectionStats();
      expect(stats.count).toBe(3);
      
      // Find all documents
      const results = await mockBackend.findSimilarCode('', 10);
      expect(results).toHaveLength(3);
    });

    it('should support filtering operations', async () => {
      const codes = [
        'function jsTest() { return "js"; }',
        'function tsTest() { return "ts"; }'
      ];
      
      const metadataList = [
        { ...testMetadata, id: 'js-1', language: 'javascript', filePath: '/test/file.js' },
        { ...testMetadata, id: 'ts-1', language: 'typescript', filePath: '/test/file.ts' }
      ];
      
      await mockBackend.storeMultipleEmbeddings(codes, metadataList);
      
      // Filter by language
      const jsResults = await mockBackend.findSimilarCodeByLanguage('function', 'javascript');
      expect(jsResults).toHaveLength(1);
      expect(jsResults[0].metadata.language).toBe('javascript');
      
      // Filter by file
      const fileResults = await mockBackend.findSimilarCodeByFile('/test/file.ts');
      expect(fileResults).toHaveLength(1);
      expect(fileResults[0].metadata.filePath).toBe('/test/file.ts');
    });

    it('should handle update and delete operations', async () => {
      const code = 'function original() { return "original"; }';
      await mockBackend.storeCodeEmbedding(code, testMetadata);
      
      // Update embedding
      const updatedCode = 'function updated() { return "updated"; }';
      const updatedMetadata = { ...testMetadata, complexity: 10 };
      await mockBackend.updateCodeEmbedding(testMetadata.id, updatedCode, updatedMetadata);
      
      // Verify update
      const results = await mockBackend.findSimilarCode('function updated');
      expect(results).toHaveLength(1);
      expect(results[0].code).toBe(updatedCode);
      expect(results[0].metadata.complexity).toBe(10);
      
      // Delete embedding
      await mockBackend.deleteCodeEmbedding(testMetadata.id);
      
      // Verify deletion
      const stats = await mockBackend.getCollectionStats();
      expect(stats.count).toBe(0);
    });
  });

  describe('Enhanced Features', () => {
    beforeEach(async () => {
      await mockBackend.initialize('test-collection');
    });

    it('should provide backend information', () => {
      const info = mockBackend.getBackendInfo();
      
      expect(info.type).toBe('mock');
      expect(info.version).toBe('1.0.0');
      expect(info.capabilities).toBeDefined();
      expect(info.connectionStatus).toBe('connected');
      expect(info.metadata.description).toContain('Mock vector database');
      expect(info.metadata.embeddingModel).toBeDefined();
      expect(info.metadata.documentCount).toBe(0);
    });

    it('should provide health status', async () => {
      const health = await mockBackend.getHealthStatus();
      
      expect(health.status).toMatch(/healthy|degraded|unhealthy/);
      expect(health.lastChecked).toBeInstanceOf(Date);
      expect(typeof health.responseTime).toBe('number');
      expect(health.details.initialized).toBe(true);
      expect(typeof health.details.documentCount).toBe('number');
      expect(typeof health.details.operationCount).toBe('number');
    });

    it('should provide performance metrics', async () => {
      // Perform some operations to generate metrics
      await mockBackend.storeCodeEmbedding('test code', testMetadata);
      await mockBackend.findSimilarCode('test');
      
      const metrics = await mockBackend.getPerformanceMetrics();
      
      expect(metrics.operationCounts).toBeDefined();
      expect(metrics.averageResponseTimes).toBeDefined();
      expect(metrics.errorRates).toBeDefined();
      expect(metrics.cacheHitRates).toBeDefined();
      expect(typeof metrics.memoryUsage).toBe('number');
      
      expect(metrics.operationCounts.total).toBeGreaterThan(0);
    });
  });

  describe('Optional Feature Extension Points', () => {
    it('should support configurable behavior without breaking existing functionality', async () => {
      // Create mock backend with custom configuration
      const customConfig: MockVectorDBConfig = {
        simulateDelay: true,
        operationDelay: 1, // Very short delay for testing
        simulateFailures: false,
        maxDocuments: 100,
        trackMetrics: true
      };
      
      const customMockBackend = new MockVectorDB(undefined, customConfig);
      await customMockBackend.initialize();
      
      // Test that basic functionality still works
      await customMockBackend.storeCodeEmbedding('test code', testMetadata);
      const results = await customMockBackend.findSimilarCode('test');
      expect(results).toHaveLength(1);
      
      // Test that custom configuration is applied
      const config = customMockBackend.getConfig();
      expect(config.simulateDelay).toBe(true);
      expect(config.operationDelay).toBe(1);
      expect(config.maxDocuments).toBe(100);
      
      await customMockBackend.close();
    });

    it('should support runtime configuration updates', async () => {
      await mockBackend.initialize();
      
      // Update configuration at runtime
      mockBackend.updateConfig({
        simulateFailures: true,
        failureRate: 0.0 // No failures for testing
      });
      
      // Verify configuration was updated
      const config = mockBackend.getConfig();
      expect(config.simulateFailures).toBe(true);
      expect(config.failureRate).toBe(0.0);
      
      // Test that functionality still works
      await mockBackend.storeCodeEmbedding('test code', testMetadata);
      const results = await mockBackend.findSimilarCode('test');
      expect(results).toHaveLength(1);
    });

    it('should support testing-specific features', async () => {
      await mockBackend.initialize();
      
      // Store some test data
      await mockBackend.storeCodeEmbedding('test code 1', testMetadata);
      await mockBackend.storeCodeEmbedding('test code 2', { ...testMetadata, id: 'test-2' });
      
      // Test testing-specific methods
      const allDocs = mockBackend.getAllDocuments();
      expect(allDocs).toHaveLength(2);
      
      // Clear documents
      mockBackend.clearDocuments();
      const stats = await mockBackend.getCollectionStats();
      expect(stats.count).toBe(0);
      
      // Reset metrics
      mockBackend.resetMetrics();
      const metrics = await mockBackend.getPerformanceMetrics();
      expect(metrics.operationCounts.total).toBe(0);
    });
  });

  describe('MCP Tools Compatibility', () => {
    let vectorStore: VectorStore;

    beforeEach(async () => {
      // Create mock backend through the factory system
      const config = createMockBackendConfig();
      vectorStore = registry.create('mock', config);
      await vectorStore.initialize('mcp-test');
    });

    afterEach(async () => {
      await vectorStore.close();
    });

    it('should work with existing MCP tools without modification', async () => {
      // Simulate MCP tool usage patterns
      
      // 1. Verify embedding model (common MCP operation)
      await vectorStore.verifyEmbeddingModel();
      
      // 2. Store code embeddings (learning process)
      const testCodes = [
        'function calculateSum(a, b) { return a + b; }',
        'class UserService { constructor() {} }',
        'const config = { api: "localhost" };'
      ];
      
      const metadataList = testCodes.map((code, index) => ({
        id: `mcp-test-${index}`,
        filePath: `/src/test${index}.js`,
        language: 'javascript',
        complexity: index + 1,
        lineCount: 1,
        lastModified: new Date()
      }));
      
      await vectorStore.storeMultipleEmbeddings(testCodes, metadataList);
      
      // 3. Search for similar code (common MCP query)
      const searchResults = await vectorStore.findSimilarCode('function calculate', 5);
      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults[0].similarity).toBeGreaterThan(0);
      
      // 4. Get collection statistics (MCP diagnostic)
      const stats = await vectorStore.getCollectionStats();
      expect(stats.count).toBe(3);
      expect(stats.metadata).toBeDefined();
      
      // 5. Get backend information (MCP system info)
      const backendInfo = vectorStore.getBackendInfo();
      expect(backendInfo.type).toBe('mock');
      expect(backendInfo.connectionStatus).toBe('connected');
      
      // 6. Health check (MCP monitoring)
      const health = await vectorStore.getHealthStatus();
      expect(health.status).toMatch(/healthy|degraded|unhealthy/);
      
      // All operations should work without any knowledge of the mock backend
    });

    it('should maintain consistent behavior across different backend types', async () => {
      // This test would ideally compare behavior with other backends,
      // but for now we verify that the mock backend provides consistent
      // responses that match the expected interface contracts
      
      const code = 'function testFunction() { return true; }';
      const metadata: CodeMetadata = {
        id: 'consistency-test',
        filePath: '/test/consistency.js',
        language: 'javascript',
        complexity: 2,
        lineCount: 1,
        lastModified: new Date()
      };
      
      // Store and retrieve
      await vectorStore.storeCodeEmbedding(code, metadata);
      const results = await vectorStore.findSimilarCode('function test');
      
      // Verify consistent response structure
      expect(results).toBeInstanceOf(Array);
      expect(results[0]).toHaveProperty('id');
      expect(results[0]).toHaveProperty('code');
      expect(results[0]).toHaveProperty('metadata');
      expect(results[0]).toHaveProperty('similarity');
      expect(typeof results[0].similarity).toBe('number');
      expect(results[0].similarity).toBeGreaterThanOrEqual(0);
      expect(results[0].similarity).toBeLessThanOrEqual(1);
      
      // Verify metadata structure
      expect(results[0].metadata).toHaveProperty('id');
      expect(results[0].metadata).toHaveProperty('filePath');
      expect(results[0].metadata).toHaveProperty('language');
      expect(results[0].metadata).toHaveProperty('complexity');
      expect(results[0].metadata).toHaveProperty('lineCount');
      expect(results[0].metadata).toHaveProperty('lastModified');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle initialization errors gracefully', async () => {
      const failingMockBackend = new MockVectorDB(undefined, {
        simulateFailures: true,
        failureRate: 1.0 // Always fail
      });
      
      // Should throw error during initialization
      await expect(failingMockBackend.initialize()).rejects.toThrow();
    });

    it('should handle operation failures gracefully', async () => {
      const unreliableMockBackend = new MockVectorDB(undefined, {
        simulateFailures: true,
        failureRate: 0.5 // 50% failure rate
      });
      
      // Initialize may fail, so retry until it succeeds
      let initialized = false;
      let attempts = 0;
      while (!initialized && attempts < 10) {
        try {
          await unreliableMockBackend.initialize();
          initialized = true;
        } catch (error) {
          attempts++;
        }
      }
      
      expect(initialized).toBe(true);
      
      // Some operations may fail, but the backend should remain functional
      let successCount = 0;
      let failureCount = 0;
      
      for (let i = 0; i < 10; i++) {
        try {
          await unreliableMockBackend.storeCodeEmbedding(`test code ${i}`, {
            ...testMetadata,
            id: `test-${i}`
          });
          successCount++;
        } catch (error) {
          failureCount++;
        }
      }
      
      // Should have both successes and failures
      expect(successCount).toBeGreaterThan(0);
      expect(failureCount).toBeGreaterThan(0);
      
      await unreliableMockBackend.close();
    });

    it('should handle document limits', async () => {
      const limitedMockBackend = new MockVectorDB(undefined, {
        maxDocuments: 2
      });
      
      await limitedMockBackend.initialize();
      
      // Store up to limit
      await limitedMockBackend.storeCodeEmbedding('code 1', { ...testMetadata, id: 'test-1' });
      await limitedMockBackend.storeCodeEmbedding('code 2', { ...testMetadata, id: 'test-2' });
      
      // Should reject additional documents
      await expect(
        limitedMockBackend.storeCodeEmbedding('code 3', { ...testMetadata, id: 'test-3' })
      ).rejects.toThrow('Maximum document limit reached');
      
      await limitedMockBackend.close();
    });
  });
});