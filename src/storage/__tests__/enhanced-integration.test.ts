/**
 * Integration tests for enhanced vector store abstraction
 * Verifies that MCP tools and CLI components work with the enhanced backend system
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CodeCartographerMCP } from '../../mcp/server.js';
// LearningService import removed - use new LearningService through DI Container

import { createVectorStore } from '../backend-unified.js';
import { VectorStore } from '../vector-store.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync } from 'fs';

const isWindows = process.platform === 'win32';

describe('Enhanced Integration Tests', () => {
  let testProjectPath: string;
  let vectorStore: VectorStore;

  beforeEach(async () => {
    // Create temporary test project
    testProjectPath = join(tmpdir(), `in-memoria-test-${Date.now()}`);
    mkdirSync(testProjectPath, { recursive: true });

    // Create test files
    writeFileSync(
      join(testProjectPath, 'test.ts'),
      'export function testFunction() { return "test"; }'
    );
    writeFileSync(
      join(testProjectPath, 'utils.ts'),
      'export class TestUtils { static format(data: any) { return JSON.stringify(data); } }'
    );

    // Create SurrealDB vector store for testing
    vectorStore = createVectorStore();
  });

  afterEach(async () => {
    // Clean up
    if (vectorStore) {
      await vectorStore.close();
    }
    
    try {
      rmSync(testProjectPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('MCP Server Integration', () => {
    it('should initialize MCP server with SurrealDB vector store', async () => {
      const mcpServer = new CodeCartographerMCP();
      
      // Initialize for testing (without starting transport)
      await mcpServer.initializeForTesting();
      
      // Verify server initialized successfully
      const tools = mcpServer.getAllTools();
      expect(tools.length).toBeGreaterThan(0);
      
      await mcpServer.stop();
    });

    it('should provide backend diagnostics through MCP tools', async () => {
      const mcpServer = new CodeCartographerMCP();
      await mcpServer.initializeForTesting();
      
      // Test basic tool availability
      const tools = mcpServer.getAllTools();
      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain('get_project_blueprint');
      
      await mcpServer.stop();
    });
  });

  describe('Learning Service Integration', () => {
    it('should maintain performance characteristics with SurrealDB backend', async () => {
      const startTime = Date.now();
      
      // Use new LearningService through DI Container
      const { initializeDIContainer } = await import('../../core/bootstrap.js');
      const container = await initializeDIContainer({ projectPath: testProjectPath });
      const result = await container.learningService.learnFromCodebase(testProjectPath, {
        force: true
      });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Verify learning succeeded
      expect(result.success).toBe(true);
      expect(result.conceptsLearned).toBeGreaterThanOrEqual(0);
      
      // Should complete in reasonable time
      expect(duration).toBeLessThan(30000); // 30 seconds max
    });

  });

  describe('Backward Compatibility', () => {
    it('should maintain compatibility with existing workflows', async () => {
      // Create vector store using current method
      const testVectorStore = createVectorStore();
      
      // Should work as expected
      await testVectorStore.initialize('test-collection');
      
      const backendInfo = testVectorStore.getBackendInfo();
      expect(backendInfo.type).toBe('surreal');
      
      // Should support all required methods
      const healthStatus = await testVectorStore.getHealthStatus();
      expect(healthStatus.status).toMatch(/healthy|degraded|unhealthy/);
      
      const metrics = await testVectorStore.getPerformanceMetrics();
      expect(metrics.operationCounts).toBeDefined();
      
      await testVectorStore.close();
    });
  });

  describe('Performance Monitoring', () => {
    it('should track performance metrics across operations', async () => {
      await vectorStore.initialize('performance-test');
      
      // Perform various operations
      await vectorStore.storeCodeEmbedding('test code', {
        id: 'test-1',
        filePath: '/test.ts',
        language: 'typescript',
        complexity: 1,
        lineCount: 1,
        lastModified: new Date()
      });
      
      await vectorStore.findSimilarCode('test');
      await vectorStore.getCollectionStats();
      
      // Check performance metrics
      const metrics = await vectorStore.getPerformanceMetrics();
      
      expect(metrics.operationCounts.total).toBeGreaterThan(0);
      expect(typeof metrics.averageResponseTimes.overall).toBe('number');
      expect(typeof metrics.memoryUsage).toBe('number');
      expect(typeof metrics.errorRates.overall).toBe('number');
    });

    const maybeIt = isWindows ? it.skip : it;

    maybeIt('should maintain performance characteristics under load', async () => {
      await vectorStore.initialize('load-test');
      
      const startTime = Date.now();
      
      // Perform batch operations
      const codes = Array.from({ length: 50 }, (_, i) => `function test${i}() { return ${i}; }`);
      const metadataList = codes.map((_, i) => ({
        id: `load-test-${i}`,
        filePath: `/test${i}.ts`,
        language: 'typescript',
        complexity: 1,
        lineCount: 1,
        lastModified: new Date()
      }));
      
      await vectorStore.storeMultipleEmbeddings(codes, metadataList);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete batch operations efficiently (increased timeout for Windows)
      expect(duration).toBeLessThan(15000); // 15 seconds max for batch operations
      
      // Verify data was stored (count may vary due to deduplication)
      const stats = await vectorStore.getCollectionStats();
      expect(stats.count).toBeGreaterThan(0);
      
      // Performance metrics should reflect the operations
      const metrics = await vectorStore.getPerformanceMetrics();
      expect(metrics.operationCounts.total).toBeGreaterThanOrEqual(50);
    });
  });
});