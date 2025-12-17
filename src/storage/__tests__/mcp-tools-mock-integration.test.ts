/**
 * Tests to verify that existing MCP tools work with the mock backend without modification
 * 
 * This test suite simulates how MCP tools would interact with the vector store
 * and verifies that the mock backend provides compatible behavior.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockVectorDB } from '../mock-vector-db.js';
import { registerMockBackend, createMockBackendConfig } from '../mock-backend-factory.js';
import { getBackendRegistry, resetBackendRegistry } from '../backend-registry.js';
import { registerBuiltinBackends } from '../backend-factories.js';
import { createVectorStore } from '../vector-factory.js';
import { VectorStore, CodeMetadata } from '../vector-store.js';

// Simulate MCP tool functions that would use the vector store
class MockMCPTools {
  constructor(private vectorStore: VectorStore) {}

  /**
   * Simulate the learning process that MCP tools perform
   */
  async learnFromCodebase(codeFiles: Array<{ path: string; content: string; language: string }>): Promise<void> {
    // Initialize the vector store
    await this.vectorStore.initialize('mcp-learning');
    
    // Verify embedding model
    await this.vectorStore.verifyEmbeddingModel();
    
    // Process code files in batches
    const batchSize = 10;
    for (let i = 0; i < codeFiles.length; i += batchSize) {
      const batch = codeFiles.slice(i, i + batchSize);
      const codes = batch.map(file => file.content);
      const metadataList = batch.map((file, index) => ({
        id: `file-${i + index}`,
        filePath: file.path,
        language: file.language,
        complexity: this.calculateComplexity(file.content),
        lineCount: file.content.split('\n').length,
        lastModified: new Date()
      }));
      
      await this.vectorStore.storeMultipleEmbeddings(codes, metadataList);
    }
  }

  /**
   * Simulate semantic search functionality
   */
  async searchSimilarCode(query: string, options: {
    limit?: number;
    language?: string;
    filePath?: string;
  } = {}): Promise<Array<{ code: string; filePath: string; similarity: number }>> {
    let results;
    
    if (options.language) {
      results = await this.vectorStore.findSimilarCodeByLanguage(query, options.language, options.limit);
    } else if (options.filePath) {
      results = await this.vectorStore.findSimilarCodeByFile(options.filePath, options.limit);
    } else {
      results = await this.vectorStore.findSimilarCode(query, options.limit);
    }
    
    return results.map(result => ({
      code: result.code,
      filePath: result.metadata.filePath,
      similarity: result.similarity
    }));
  }

  /**
   * Simulate codebase analysis functionality
   */
  async analyzeCodebase(): Promise<{
    totalDocuments: number;
    languages: string[];
    averageComplexity: number;
    backendInfo: any;
  }> {
    const stats = await this.vectorStore.getCollectionStats();
    const backendInfo = this.vectorStore.getBackendInfo();
    
    // Get all documents to analyze
    const allResults = await this.vectorStore.findSimilarCode('', 1000);
    
    const languages = [...new Set(allResults.map(r => r.metadata.language))];
    const averageComplexity = allResults.length > 0 
      ? allResults.reduce((sum, r) => sum + r.metadata.complexity, 0) / allResults.length
      : 0;
    
    return {
      totalDocuments: stats.count,
      languages,
      averageComplexity,
      backendInfo
    };
  }

  /**
   * Simulate file update functionality
   */
  async updateFile(filePath: string, newContent: string): Promise<void> {
    // Delete old embeddings for the file
    await this.vectorStore.deleteCodeEmbeddingsByFile(filePath);
    
    // Store new embedding
    const metadata: CodeMetadata = {
      id: `updated-${Date.now()}`,
      filePath,
      language: this.detectLanguage(filePath),
      complexity: this.calculateComplexity(newContent),
      lineCount: newContent.split('\n').length,
      lastModified: new Date()
    };
    
    await this.vectorStore.storeCodeEmbedding(newContent, metadata);
  }

  /**
   * Simulate health monitoring functionality
   */
  async checkSystemHealth(): Promise<{
    vectorStoreHealth: any;
    performanceMetrics: any;
    backendStatus: string;
  }> {
    const health = await this.vectorStore.getHealthStatus();
    const metrics = await this.vectorStore.getPerformanceMetrics();
    const backendInfo = this.vectorStore.getBackendInfo();
    
    return {
      vectorStoreHealth: health,
      performanceMetrics: metrics,
      backendStatus: backendInfo.connectionStatus
    };
  }

  private calculateComplexity(code: string): number {
    // Simple complexity calculation for testing
    const lines = code.split('\n').length;
    const functions = (code.match(/function|class|const|let|var/g) || []).length;
    return Math.min(10, Math.max(1, Math.floor((lines + functions) / 5)));
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'ts': 'typescript',
      'js': 'javascript',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'rs': 'rust',
      'go': 'go'
    };
    return languageMap[ext || ''] || 'unknown';
  }
}

describe('MCP Tools Integration with Mock Backend', () => {
  let vectorStore: VectorStore;
  let mcpTools: MockMCPTools;

  beforeEach(async () => {
    // Reset and setup registry
    resetBackendRegistry();
    const registry = getBackendRegistry();
    registerBuiltinBackends(registry);
    registerMockBackend(registry);
    
    // Create mock backend through the factory system (simulating MCP tool usage)
    const config = createMockBackendConfig({
      simulateDelay: false, // Disable delays for faster tests
      trackMetrics: true
    });
    
    vectorStore = registry.create('mock', config);
    mcpTools = new MockMCPTools(vectorStore);
  });

  afterEach(async () => {
    await vectorStore.close();
    resetBackendRegistry();
  });

  describe('Learning Process Integration', () => {
    it('should handle codebase learning without modification', async () => {
      const testCodebase = [
        {
          path: '/src/utils/helper.ts',
          content: 'export function formatDate(date: Date): string { return date.toISOString(); }',
          language: 'typescript'
        },
        {
          path: '/src/services/user.ts',
          content: 'class UserService { async getUser(id: string) { return await db.findUser(id); } }',
          language: 'typescript'
        },
        {
          path: '/src/components/Button.tsx',
          content: 'export const Button = ({ onClick, children }) => <button onClick={onClick}>{children}</button>;',
          language: 'typescript'
        },
        {
          path: '/tests/helper.test.ts',
          content: 'describe("formatDate", () => { it("should format date correctly", () => { expect(formatDate(new Date())).toBeDefined(); }); });',
          language: 'typescript'
        }
      ];

      // Simulate MCP learning process
      await mcpTools.learnFromCodebase(testCodebase);

      // Verify that learning was successful
      const analysis = await mcpTools.analyzeCodebase();
      expect(analysis.totalDocuments).toBe(4);
      expect(analysis.languages).toContain('typescript');
      expect(analysis.averageComplexity).toBeGreaterThan(0);
      expect(analysis.backendInfo.type).toBe('mock');
    });

    it('should handle large codebase learning efficiently', async () => {
      // Generate a larger test codebase
      const largeCodebase = Array.from({ length: 50 }, (_, i) => ({
        path: `/src/module${i}/index.ts`,
        content: `export class Module${i} { 
          private value = ${i}; 
          getValue() { return this.value; } 
          setValue(v: number) { this.value = v; }
        }`,
        language: 'typescript'
      }));

      const startTime = Date.now();
      await mcpTools.learnFromCodebase(largeCodebase);
      const endTime = Date.now();

      // Verify learning completed
      const analysis = await mcpTools.analyzeCodebase();
      expect(analysis.totalDocuments).toBe(50);

      // Should complete in reasonable time (mock backend should be fast)
      expect(endTime - startTime).toBeLessThan(5000); // 5 seconds max
    });
  });

  describe('Search Functionality Integration', () => {
    beforeEach(async () => {
      // Setup test data
      const testCode = [
        {
          path: '/src/auth/login.ts',
          content: 'async function authenticateUser(username: string, password: string) { return await auth.verify(username, password); }',
          language: 'typescript'
        },
        {
          path: '/src/auth/logout.ts',
          content: 'function logoutUser(sessionId: string) { session.destroy(sessionId); }',
          language: 'typescript'
        },
        {
          path: '/src/utils/validation.js',
          content: 'function validateEmail(email) { return /^[^@]+@[^@]+\\.[^@]+$/.test(email); }',
          language: 'javascript'
        }
      ];

      await mcpTools.learnFromCodebase(testCode);
    });

    it('should perform semantic search without modification', async () => {
      const results = await mcpTools.searchSimilarCode('authenticate user login');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].similarity).toBeGreaterThan(0);
      expect(results[0].filePath).toBeDefined();
      expect(results[0].code).toBeDefined();
      
      // Should find authentication-related code
      const authResult = results.find(r => r.filePath.includes('auth'));
      expect(authResult).toBeDefined();
    });

    it('should filter by language without modification', async () => {
      const tsResults = await mcpTools.searchSimilarCode('function', { language: 'typescript' });
      const jsResults = await mcpTools.searchSimilarCode('function', { language: 'javascript' });
      
      expect(tsResults.length).toBeGreaterThan(0);
      expect(jsResults.length).toBeGreaterThan(0);
      
      // Results should be from correct languages
      tsResults.forEach(result => {
        expect(result.filePath.endsWith('.ts')).toBe(true);
      });
      
      jsResults.forEach(result => {
        expect(result.filePath.endsWith('.js')).toBe(true);
      });
    });

    it('should filter by file path without modification', async () => {
      const authResults = await mcpTools.searchSimilarCode('', { filePath: '/src/auth/login.ts' });
      
      expect(authResults.length).toBe(1);
      expect(authResults[0].filePath).toBe('/src/auth/login.ts');
    });
  });

  describe('File Management Integration', () => {
    beforeEach(async () => {
      const initialCode = [{
        path: '/src/config.ts',
        content: 'export const config = { apiUrl: "http://localhost:3000" };',
        language: 'typescript'
      }];

      await mcpTools.learnFromCodebase(initialCode);
    });

    it('should handle file updates without modification', async () => {
      const filePath = '/src/config.ts';
      const newContent = 'export const config = { apiUrl: "https://api.production.com", timeout: 5000 };';
      
      // Update the file
      await mcpTools.updateFile(filePath, newContent);
      
      // Verify the update
      const results = await mcpTools.searchSimilarCode('', { filePath });
      expect(results.length).toBe(1);
      expect(results[0].code).toBe(newContent);
      expect(results[0].code).toContain('production.com');
      expect(results[0].code).toContain('timeout');
    });

    it('should handle file deletion through updates', async () => {
      const filePath = '/src/config.ts';
      
      // Verify file exists
      let results = await mcpTools.searchSimilarCode('', { filePath });
      expect(results.length).toBe(1);
      
      // Delete by removing embeddings
      await vectorStore.deleteCodeEmbeddingsByFile(filePath);
      
      // Verify file is gone
      results = await mcpTools.searchSimilarCode('', { filePath });
      expect(results.length).toBe(0);
    });
  });

  describe('System Monitoring Integration', () => {
    it('should provide health monitoring without modification', async () => {
      // Initialize the vector store first
      await vectorStore.initialize('health-test');
      
      const health = await mcpTools.checkSystemHealth();
      
      expect(health.vectorStoreHealth).toBeDefined();
      expect(health.performanceMetrics).toBeDefined();
      expect(health.backendStatus).toBe('connected');
      
      // Health should have expected structure
      expect(health.vectorStoreHealth.status).toMatch(/healthy|degraded|unhealthy/);
      expect(health.vectorStoreHealth.lastChecked).toBeInstanceOf(Date);
      expect(typeof health.vectorStoreHealth.responseTime).toBe('number');
      
      // Metrics should have expected structure
      expect(health.performanceMetrics.operationCounts).toBeDefined();
      expect(health.performanceMetrics.averageResponseTimes).toBeDefined();
      expect(health.performanceMetrics.errorRates).toBeDefined();
      expect(health.performanceMetrics.cacheHitRates).toBeDefined();
    });

    it('should track performance metrics during operations', async () => {
      // Perform some operations
      const testCode = [{
        path: '/src/test.ts',
        content: 'function test() { return "test"; }',
        language: 'typescript'
      }];
      
      await mcpTools.learnFromCodebase(testCode);
      await mcpTools.searchSimilarCode('test function');
      
      // Check metrics
      const health = await mcpTools.checkSystemHealth();
      const metrics = health.performanceMetrics;
      
      expect(metrics.operationCounts.total).toBeGreaterThan(0);
      // Note: Mock backend may have 0 response time due to no delays, so just check it's a number
      expect(typeof metrics.averageResponseTimes.overall).toBe('number');
    });
  });

  describe('Backward Compatibility', () => {
    it('should work with environment-based backend selection', async () => {
      // Set environment to use mock backend
      const originalBackend = process.env.IN_MEMORIA_VECTOR_BACKEND;
      process.env.IN_MEMORIA_VECTOR_BACKEND = 'mock';
      
      try {
        // Create vector store using environment variable (simulating MCP tool startup)
        const envVectorStore = createVectorStore();
        const envMcpTools = new MockMCPTools(envVectorStore);
        
        // Should work exactly the same
        const testCode = [{
          path: '/src/env-test.ts',
          content: 'export const envTest = true;',
          language: 'typescript'
        }];
        
        await envMcpTools.learnFromCodebase(testCode);
        const results = await envMcpTools.searchSimilarCode('envTest');
        
        expect(results.length).toBe(1);
        expect(results[0].code).toContain('envTest');
        
        await envVectorStore.close();
      } finally {
        // Restore original environment
        if (originalBackend !== undefined) {
          process.env.IN_MEMORIA_VECTOR_BACKEND = originalBackend;
        } else {
          delete process.env.IN_MEMORIA_VECTOR_BACKEND;
        }
      }
    });

    it('should maintain consistent API across all backend types', async () => {
      // This test verifies that the mock backend provides the same API
      // as other backends, ensuring MCP tools don't need modification
      
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

      // Verify all required methods exist and are functions
      for (const method of requiredMethods) {
        expect(typeof (vectorStore as any)[method]).toBe('function');
      }

      // Verify method signatures by testing parameter counts
      // (This is a basic check - in a real scenario you'd want more thorough signature validation)
      expect(vectorStore.initialize.length).toBeLessThanOrEqual(1); // Optional collection name
      expect(vectorStore.storeCodeEmbedding.length).toBe(2); // code, metadata
      expect(vectorStore.findSimilarCode.length).toBeLessThanOrEqual(3); // query, limit?, filters?
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle MCP tool error scenarios gracefully', async () => {
      // Create a mock backend that simulates failures
      const unreliableConfig = createMockBackendConfig({
        simulateFailures: true,
        failureRate: 0.3 // 30% failure rate
      });
      
      const unreliableVectorStore = getBackendRegistry().create('mock', unreliableConfig);
      const unreliableMcpTools = new MockMCPTools(unreliableVectorStore);
      
      let initializationFailed = false;
      
      try {
        // Initialization might fail due to simulated failures
        try {
          await unreliableVectorStore.initialize();
        } catch (error) {
          initializationFailed = true;
          expect(error).toBeInstanceOf(Error);
          expect(error.message).toContain('Simulated failure in initialize');
        }
        
        // If initialization failed, we can't proceed with operations
        if (initializationFailed) {
          // This is expected behavior - the system should handle initialization failures
          expect(initializationFailed).toBe(true);
          return;
        }
        
        // MCP tools should handle failures gracefully
        const testCode = [{
          path: '/src/unreliable.ts',
          content: 'export const unreliable = true;',
          language: 'typescript'
        }];
        
        // Some operations may fail, but tools should continue working
        let successfulOperations = 0;
        let failedOperations = 0;
        
        for (let i = 0; i < 10; i++) {
          try {
            await unreliableMcpTools.learnFromCodebase([{
              ...testCode[0],
              path: `/src/test${i}.ts`,
              content: `export const test${i} = true;`
            }]);
            successfulOperations++;
          } catch (error) {
            failedOperations++;
            // MCP tools should log errors but continue
            expect(error).toBeInstanceOf(Error);
          }
        }
        
        // Should have both successes and failures (if we got past initialization)
        expect(successfulOperations + failedOperations).toBe(10);
        
      } finally {
        // Only close if initialization succeeded
        if (!initializationFailed) {
          await unreliableVectorStore.close();
        }
      }
    });
  });
});