import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initializeDIContainer, disposeDIContainer, getCurrentContainer, isContainerInitialized } from '../bootstrap.js';
import { ServiceKeys } from '../container/service-keys.js';

describe('DI Container Bootstrap', () => {
  const testProjectPath = '/tmp/test-project';

  beforeEach(async () => {
    // Clean up any existing container
    await disposeDIContainer();
  });

  afterEach(async () => {
    // Clean up after each test
    await disposeDIContainer();
  });

  it('should initialize DI container with project path', async () => {
    expect(isContainerInitialized()).toBe(false);
    
    const container = await initializeDIContainer({ projectPath: testProjectPath });
    
    expect(isContainerInitialized()).toBe(true);
    expect(container).toBeDefined();
    expect(container.analysisService).toBeDefined();
    expect(container.learningService).toBeDefined();
    expect(container.searchService).toBeDefined();
    expect(container.diagnosticService).toBeDefined();
  });

  it('should provide access to current container', async () => {
    await initializeDIContainer({ projectPath: testProjectPath });
    
    const currentContainer = getCurrentContainer();
    expect(currentContainer).toBeDefined();
    expect(currentContainer.initialized).toBe(true);
  });

  it('should throw when accessing container before initialization', () => {
    expect(() => getCurrentContainer()).toThrow('DI Container not initialized');
  });

  it('should register infrastructure services', async () => {
    await initializeDIContainer({ projectPath: testProjectPath });
    
    const container = getCurrentContainer();
    
    // Check that infrastructure services are registered
    expect(container.has(ServiceKeys.DATABASE)).toBe(true);
    expect(container.has(ServiceKeys.VECTOR_STORE)).toBe(true);
    expect(container.has(ServiceKeys.SEMANTIC_ENGINE)).toBe(true);
    expect(container.has(ServiceKeys.PATTERN_ENGINE)).toBe(true);
    // SEARCH_ENGINE removed in Phase 3 - legacy module deleted
  });

  it('should register utility services', async () => {
    await initializeDIContainer({ projectPath: testProjectPath });
    
    const container = getCurrentContainer();
    
    // Check that utility services are registered
    expect(container.has(ServiceKeys.LOGGER)).toBe(true);
    expect(container.has(ServiceKeys.PATH_VALIDATOR)).toBe(true);
    expect(container.has(ServiceKeys.CIRCUIT_BREAKER)).toBe(true);
  });

  it('should dispose container and clean up resources', async () => {
    await initializeDIContainer({ projectPath: testProjectPath });
    expect(isContainerInitialized()).toBe(true);
    
    await disposeDIContainer();
    expect(isContainerInitialized()).toBe(false);
  });

  it('should handle multiple initialization calls', async () => {
    const container1 = await initializeDIContainer({ projectPath: testProjectPath });
    const container2 = await initializeDIContainer({ projectPath: '/tmp/other-project' });
    
    // Second initialization should dispose the first container
    expect(container2).toBeDefined();
    expect(isContainerInitialized()).toBe(true);
  });

  it('should provide correct project path in container config', async () => {
    await initializeDIContainer({ projectPath: testProjectPath });
    
    const container = getCurrentContainer();
    const config = container.getConfig();
    
    expect(config.projectPath).toBe(testProjectPath);
    expect(config.enableCircuitBreaker).toBe(true);
  });

  it('should provide access to all implemented services', async () => {
    const container = await initializeDIContainer({ projectPath: testProjectPath });
    
    // AnalysisService is now implemented and should work correctly
    const result = await container.analysisService.analyzeCodebase(testProjectPath);
    expect(result).toBeDefined();
    expect(result.projectPath).toBe(testProjectPath);
    
    // LearningService is now implemented and should work correctly
    const learningResult = await container.learningService.learnFromCodebase(testProjectPath);
    expect(learningResult).toBeDefined();
    expect(learningResult.success).toBeDefined();
    
    // SearchService is now implemented and should work correctly
    const searchResults = await container.searchService.searchText('test');
    expect(searchResults).toBeDefined();
    expect(Array.isArray(searchResults)).toBe(true);
    
    // DiagnosticService is now implemented and should work correctly
    const healthStatus = await container.diagnosticService.getHealthStatus();
    expect(healthStatus).toBeDefined();
    expect(healthStatus.status).toMatch(/healthy|degraded|unhealthy/);
  });
});