/**
 * Tests for Performance Monitoring System
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PerformanceMonitor, createPerformanceMonitor } from '../performance-monitor.js';
import { HealthMonitorService, createVectorBackendHealthCheck } from '../health-monitor.js';
import { PerformanceOptimizer, createPerformanceOptimizer } from '../performance-optimizer.js';
import { PerformanceMetrics } from '../vector-store.js';

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = createPerformanceMonitor('test-backend');
  });

  afterEach(() => {
    monitor.dispose();
  });

  it('should track operation metrics correctly', async () => {
    const operationId = monitor.startOperation('testOperation');
    
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 10));
    
    monitor.endOperation(operationId, 'testOperation', true);
    
    const metrics = monitor.getPerformanceMetrics();
    expect(metrics.operationCounts.testOperation).toBe(1);
    expect(metrics.averageResponseTimes.testOperation).toBeGreaterThan(0);
    expect(metrics.errorRates.testOperation).toBe(0);
  });

  it('should track operation errors correctly', async () => {
    const operationId = monitor.startOperation('testOperation');
    monitor.endOperation(operationId, 'testOperation', false);
    
    const metrics = monitor.getPerformanceMetrics();
    expect(metrics.operationCounts.testOperation).toBe(1);
    expect(metrics.errorRates.testOperation).toBe(1); // 100% error rate
  });

  it('should track memory usage', () => {
    const memoryStats = monitor.getMemoryStats();
    expect(memoryStats.current).toBeDefined();
    expect(memoryStats.current.heapUsed).toBeGreaterThan(0);
    expect(memoryStats.trend).toMatch(/increasing|decreasing|stable/);
  });

  it('should provide health status', async () => {
    const healthStatus = await monitor.getHealthStatus();
    expect(healthStatus.status).toMatch(/healthy|degraded|unhealthy/);
    expect(healthStatus.lastChecked).toBeInstanceOf(Date);
    expect(healthStatus.responseTime).toBeGreaterThanOrEqual(0);
  });

  it('should record connection metrics', () => {
    monitor.recordConnection(true, 5);
    monitor.recordConnection(false);
    
    const metrics = monitor.getPerformanceMetrics();
    // Connection metrics would be reflected in the overall metrics
    expect(metrics).toBeDefined();
  });
});

describe('HealthMonitorService', () => {
  let healthMonitor: HealthMonitorService;

  beforeEach(() => {
    healthMonitor = new HealthMonitorService({
      enabled: true,
      intervalMs: 1000,
      timeoutMs: 500,
      retryAttempts: 2,
      degradedThresholdMs: 100,
      unhealthyThresholdMs: 300
    });
  });

  afterEach(() => {
    healthMonitor.dispose();
  });

  it('should register and run health checks', async () => {
    const mockHealthCheck = vi.fn().mockResolvedValue({
      name: 'test-check',
      status: 'healthy' as const,
      responseTime: 50,
      details: { test: true }
    });

    healthMonitor.registerHealthCheck('test-check', mockHealthCheck);
    
    const result = await healthMonitor.runHealthCheck('test-check');
    expect(result).toBeDefined();
    expect(result?.status).toBe('healthy');
    expect(mockHealthCheck).toHaveBeenCalled();
  });

  it('should handle health check failures', async () => {
    const mockHealthCheck = vi.fn().mockRejectedValue(new Error('Health check failed'));

    healthMonitor.registerHealthCheck('failing-check', mockHealthCheck);
    
    const result = await healthMonitor.runHealthCheck('failing-check');
    expect(result).toBeDefined();
    expect(result?.status).toBe('unhealthy');
    expect(result?.error).toBe('Health check failed');
  });

  it('should provide overall health status', async () => {
    const healthyCheck = vi.fn().mockResolvedValue({
      name: 'healthy-check',
      status: 'healthy' as const,
      responseTime: 50,
      details: {}
    });

    const degradedCheck = vi.fn().mockResolvedValue({
      name: 'degraded-check',
      status: 'degraded' as const,
      responseTime: 150,
      details: {}
    });

    healthMonitor.registerHealthCheck('healthy-check', healthyCheck);
    healthMonitor.registerHealthCheck('degraded-check', degradedCheck);
    
    await healthMonitor.runAllHealthChecks();
    
    const overallStatus = healthMonitor.getOverallHealthStatus();
    expect(overallStatus.status).toBe('degraded'); // Should be degraded due to one degraded check
    expect(overallStatus.details.totalChecks).toBe(2);
  });

  it('should create vector backend health check', async () => {
    const mockTestConnection = vi.fn().mockResolvedValue(undefined);
    const mockGetDetails = vi.fn().mockResolvedValue({ version: '1.0.0' });

    const healthCheckFn = createVectorBackendHealthCheck(
      'test-backend',
      mockTestConnection,
      mockGetDetails
    );

    const result = await healthCheckFn();
    expect(result.name).toBe('test-backend');
    expect(result.status).toBe('healthy');
    expect(result.details.connection).toBe('successful');
    expect(result.details.version).toBe('1.0.0');
  });
});

describe('PerformanceOptimizer', () => {
  let optimizer: PerformanceOptimizer;

  beforeEach(() => {
    optimizer = createPerformanceOptimizer({
      enabled: true,
      autoApply: true,
      checkIntervalMs: 1000,
      maxOptimizationsPerInterval: 2,
      cooldownMs: 100
    });
  });

  afterEach(() => {
    optimizer.dispose();
  });

  it('should register and apply optimization rules', async () => {
    let ruleApplied = false;
    
    optimizer.registerOptimizationRule({
      name: 'test-rule',
      description: 'Test optimization rule',
      condition: (metrics) => metrics.memoryUsage > 100,
      action: () => { ruleApplied = true; },
      priority: 'high',
      enabled: true
    });

    const mockMetrics: PerformanceMetrics = {
      operationCounts: {},
      averageResponseTimes: {},
      errorRates: {},
      cacheHitRates: {},
      memoryUsage: 200 // Triggers the rule
    };

    const results = await optimizer.checkAndApplyOptimizations(mockMetrics);
    expect(results).toHaveLength(1);
    expect(results[0].ruleName).toBe('test-rule');
    expect(results[0].applied).toBe(true);
    expect(ruleApplied).toBe(true);
  });

  it('should respect cooldown periods', async () => {
    let applicationCount = 0;
    
    optimizer.registerOptimizationRule({
      name: 'cooldown-test',
      description: 'Test cooldown rule',
      condition: () => true, // Always triggers
      action: () => { applicationCount++; },
      priority: 'medium',
      enabled: true
    });

    const mockMetrics: PerformanceMetrics = {
      operationCounts: {},
      averageResponseTimes: {},
      errorRates: {},
      cacheHitRates: {},
      memoryUsage: 100
    };

    // First application
    await optimizer.checkAndApplyOptimizations(mockMetrics);
    expect(applicationCount).toBe(1);

    // Second application (should be blocked by cooldown)
    await optimizer.checkAndApplyOptimizations(mockMetrics);
    expect(applicationCount).toBe(1); // Still 1, not 2

    // Wait for cooldown to expire
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Third application (should work after cooldown)
    await optimizer.checkAndApplyOptimizations(mockMetrics);
    expect(applicationCount).toBe(2);
  });

  it('should prioritize high priority rules', async () => {
    const applicationOrder: string[] = [];
    
    optimizer.registerOptimizationRule({
      name: 'low-priority',
      description: 'Low priority rule',
      condition: () => true,
      action: () => { applicationOrder.push('low'); },
      priority: 'low',
      enabled: true
    });

    optimizer.registerOptimizationRule({
      name: 'high-priority',
      description: 'High priority rule',
      condition: () => true,
      action: () => { applicationOrder.push('high'); },
      priority: 'high',
      enabled: true
    });

    const mockMetrics: PerformanceMetrics = {
      operationCounts: {},
      averageResponseTimes: {},
      errorRates: {},
      cacheHitRates: {},
      memoryUsage: 100
    };

    await optimizer.checkAndApplyOptimizations(mockMetrics);
    expect(applicationOrder[0]).toBe('high'); // High priority should be applied first
  });

  it('should track optimization history', async () => {
    optimizer.registerOptimizationRule({
      name: 'history-test',
      description: 'Test history tracking',
      condition: () => true,
      action: () => {},
      priority: 'medium',
      enabled: true
    });

    const mockMetrics: PerformanceMetrics = {
      operationCounts: {},
      averageResponseTimes: {},
      errorRates: {},
      cacheHitRates: {},
      memoryUsage: 100
    };

    await optimizer.checkAndApplyOptimizations(mockMetrics);
    
    const history = optimizer.getOptimizationHistory();
    expect(history).toHaveLength(1);
    expect(history[0].ruleName).toBe('history-test');
    expect(history[0].applied).toBe(true);
  });
});

describe('Integration Tests', () => {
  it('should integrate performance monitor with health monitor', async () => {
    const performanceMonitor = createPerformanceMonitor('integration-test');
    const healthMonitor = new HealthMonitorService();

    // Register a health check that uses performance monitor
    const healthCheckFn = async () => {
      const metrics = performanceMonitor.getPerformanceMetrics();
      return {
        name: 'performance-health',
        status: (metrics.memoryUsage > 1000000000 ? 'unhealthy' : 'healthy') as 'healthy' | 'degraded' | 'unhealthy',
        responseTime: 10,
        details: { memoryUsage: metrics.memoryUsage }
      };
    };

    healthMonitor.registerHealthCheck('performance-health', healthCheckFn);
    
    const result = await healthMonitor.runHealthCheck('performance-health');
    expect(result).toBeDefined();
    expect(result?.name).toBe('performance-health');

    performanceMonitor.dispose();
    healthMonitor.dispose();
  });

  it('should integrate performance optimizer with performance monitor', async () => {
    const performanceMonitor = createPerformanceMonitor('optimizer-integration');
    const optimizer = createPerformanceOptimizer();

    let optimizationTriggered = false;

    optimizer.registerOptimizationRule({
      name: 'integration-rule',
      description: 'Integration test rule',
      condition: (metrics) => Object.keys(metrics.operationCounts).length > 0,
      action: () => { optimizationTriggered = true; },
      priority: 'medium',
      enabled: true
    });

    // Perform some operations to generate metrics
    const opId = performanceMonitor.startOperation('test-op');
    performanceMonitor.endOperation(opId, 'test-op', true);

    const metrics = performanceMonitor.getPerformanceMetrics();
    await optimizer.checkAndApplyOptimizations(metrics);

    expect(optimizationTriggered).toBe(true);

    performanceMonitor.dispose();
    optimizer.dispose();
  });
});