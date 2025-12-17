import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DIContainer } from '../container/container.js';
import { ServiceKeys } from '../container/service-keys.js';

describe('DIContainer', () => {
  let container: DIContainer;
  const testConfig = { projectPath: '/tmp/test' };

  beforeEach(() => {
    container = new DIContainer(testConfig);
  });

  afterEach(async () => {
    if (container && !container.disposed) {
      await container.dispose();
    }
  });

  it('should create container with configuration', () => {
    expect(container).toBeDefined();
    expect(container.getConfig()).toEqual(testConfig);
    expect(container.initialized).toBe(false);
    expect(container.disposed).toBe(false);
  });

  it('should register and retrieve singleton services', () => {
    const mockService = { name: 'test-service' };
    
    container.register(ServiceKeys.LOGGER, mockService);
    
    expect(container.has(ServiceKeys.LOGGER)).toBe(true);
    const retrieved = container.getSync(ServiceKeys.LOGGER);
    expect(retrieved).toBe(mockService);
  });

  it('should register and create services via factory', async () => {
    let factoryCalled = false;
    const mockService = { name: 'factory-service' };
    
    container.registerFactory(ServiceKeys.LOGGER, () => {
      factoryCalled = true;
      return mockService;
    });
    
    expect(container.has(ServiceKeys.LOGGER)).toBe(true);
    expect(factoryCalled).toBe(false);
    
    const retrieved = await container.get(ServiceKeys.LOGGER);
    expect(factoryCalled).toBe(true);
    expect(retrieved).toBe(mockService);
    
    // Second call should return cached instance
    factoryCalled = false;
    const retrieved2 = await container.get(ServiceKeys.LOGGER);
    expect(factoryCalled).toBe(false);
    expect(retrieved2).toBe(mockService);
  });

  it('should handle async factory functions', async () => {
    const mockService = { name: 'async-service' };
    
    container.registerFactory(ServiceKeys.LOGGER, async () => {
      await new Promise(resolve => setTimeout(resolve, 1));
      return mockService;
    });
    
    const retrieved = await container.get(ServiceKeys.LOGGER);
    expect(retrieved).toBe(mockService);
  });

  it('should throw for unregistered services', async () => {
    await expect(container.get(ServiceKeys.LOGGER))
      .rejects.toThrow('Service not registered: logger');
    
    expect(() => container.getSync(ServiceKeys.LOGGER))
      .toThrow('Service not registered: logger');
  });

  it('should throw when using getSync with async factory', () => {
    container.registerFactory(ServiceKeys.LOGGER, async () => {
      return { name: 'async-service' };
    });
    
    expect(() => container.getSync(ServiceKeys.LOGGER))
      .toThrow('requires async initialization');
  });

  it('should mark as initialized', () => {
    expect(container.initialized).toBe(false);
    container.markInitialized();
    expect(container.initialized).toBe(true);
  });

  it('should dispose and clean up services', async () => {
    let disposeCalled = false;
    let closeCalled = false;
    let cleanupCalled = false;
    
    const serviceWithDispose = {
      dispose: async () => { disposeCalled = true; }
    };
    const serviceWithClose = {
      close: async () => { closeCalled = true; }
    };
    const serviceWithCleanup = {
      cleanup: async () => { cleanupCalled = true; }
    };
    
    container.register(ServiceKeys.LOGGER, serviceWithDispose as any);
    container.register(ServiceKeys.PATH_VALIDATOR, serviceWithClose as any);
    container.register(ServiceKeys.CIRCUIT_BREAKER, serviceWithCleanup as any);
    
    await container.dispose();
    
    expect(disposeCalled).toBe(true);
    expect(closeCalled).toBe(true);
    expect(cleanupCalled).toBe(true);
    expect(container.disposed).toBe(true);
  });

  it('should prevent operations on disposed container', async () => {
    await container.dispose();
    
    expect(() => container.register(ServiceKeys.LOGGER, {} as any))
      .toThrow('Cannot register services on disposed container');
    
    expect(() => container.registerFactory(ServiceKeys.LOGGER, () => ({})))
      .toThrow('Cannot register factories on disposed container');
    
    await expect(container.get(ServiceKeys.LOGGER))
      .rejects.toThrow('Cannot get services from disposed container');
    
    expect(() => container.getSync(ServiceKeys.LOGGER))
      .toThrow('Cannot get services from disposed container');
  });

  it('should list registered service keys', () => {
    container.register(ServiceKeys.LOGGER, {} as any);
    container.registerFactory(ServiceKeys.PATH_VALIDATOR, () => ({}));
    
    const keys = container.getRegisteredKeys();
    expect(keys).toContain('logger');
    expect(keys).toContain('pathValidator');
    expect(keys).toHaveLength(2);
  });
});