/**
 * Tests for Performance Monitoring System
 * Updated for Task 24: Consolidated performance monitoring into diagnostics.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PerformanceMonitor, createPerformanceMonitor } from '../diagnostics.js';
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
    const memorySnapshot = monitor.takeMemorySnapshot();
    expect(memorySnapshot.heapUsed).toBeGreaterThan(0);
    expect(memorySnapshot.heapTotal).toBeGreaterThan(0);
  });

  it('should provide health status', async () => {
    const healthStatus = await monitor.getHealthStatus();
    expect(healthStatus.status).toMatch(/healthy|degraded|unhealthy/);
    expect(healthStatus.lastChecked).toBeInstanceOf(Date);
    expect(healthStatus.responseTime).toBeGreaterThanOrEqual(0);
  });

  it('should provide performance metrics', () => {
    const metrics = monitor.getPerformanceMetrics();
    expect(metrics).toBeDefined();
    expect(metrics.operationCounts).toBeDefined();
    expect(metrics.averageResponseTimes).toBeDefined();
    expect(metrics.errorRates).toBeDefined();
    expect(typeof metrics.memoryUsage).toBe('number');
  });
});

// HealthMonitorService and PerformanceOptimizer removed in Task 24 consolidation
// All functionality consolidated into diagnostics.ts