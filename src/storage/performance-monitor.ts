/**
 * Performance Monitoring System for Vector Backends
 * 
 * This module provides comprehensive performance monitoring, health checking,
 * and metrics collection for vector backend operations.
 */

import { Logger } from '../utils/logger.js';
import { PerformanceMetrics, HealthStatus } from './vector-store.js';

export interface OperationMetrics {
  count: number;
  totalTime: number;
  errors: number;
  lastExecuted?: Date;
  averageTime: number;
}

export interface MemoryMetrics {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

export interface ConnectionMetrics {
  activeConnections: number;
  totalConnections: number;
  failedConnections: number;
  connectionPoolSize?: number;
}

/**
 * Performance monitor that tracks operation metrics, memory usage, and health status
 */
export class PerformanceMonitor {
  private operationMetrics = new Map<string, OperationMetrics>();
  private startTimes = new Map<string, number>();
  private memorySnapshots: MemoryMetrics[] = [];
  private connectionMetrics: ConnectionMetrics = {
    activeConnections: 0,
    totalConnections: 0,
    failedConnections: 0
  };
  private healthCheckInterval?: NodeJS.Timeout;
  private lastHealthCheck?: Date;
  private currentHealthStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  
  constructor(
    private backendType: string,
    private enableAutoHealthCheck: boolean = true,
    private healthCheckIntervalMs: number = 30000 // 30 seconds
  ) {
    if (this.enableAutoHealthCheck) {
      this.startHealthMonitoring();
    }
    
    Logger.debug(`Performance monitor initialized for ${backendType}`);
  }

  /**
   * Start timing an operation
   */
  startOperation(operationName: string, operationId?: string): string {
    const id = operationId || `${operationName}-${Date.now()}-${Math.random()}`;
    this.startTimes.set(id, Date.now());
    
    // Initialize metrics if not exists
    if (!this.operationMetrics.has(operationName)) {
      this.operationMetrics.set(operationName, {
        count: 0,
        totalTime: 0,
        errors: 0,
        averageTime: 0
      });
    }
    
    return id;
  }

  /**
   * End timing an operation and record metrics
   */
  endOperation(operationId: string, operationName: string, success: boolean = true): void {
    const startTime = this.startTimes.get(operationId);
    if (!startTime) {
      Logger.warn(`No start time found for operation ${operationId}`);
      return;
    }
    
    const duration = Date.now() - startTime;
    this.startTimes.delete(operationId);
    
    const metrics = this.operationMetrics.get(operationName);
    if (metrics) {
      metrics.count++;
      metrics.totalTime += duration;
      metrics.lastExecuted = new Date();
      metrics.averageTime = metrics.totalTime / metrics.count;
      
      if (!success) {
        metrics.errors++;
      }
    }
    
    Logger.debug(`Operation ${operationName} completed in ${duration}ms (success: ${success})`);
  }

  /**
   * Record an operation error
   */
  recordError(operationName: string, error: Error): void {
    const metrics = this.operationMetrics.get(operationName);
    if (metrics) {
      metrics.errors++;
    } else {
      // Initialize metrics with error
      this.operationMetrics.set(operationName, {
        count: 0,
        totalTime: 0,
        errors: 1,
        averageTime: 0
      });
    }
    
    Logger.debug(`Error recorded for operation ${operationName}: ${error.message}`);
  }

  /**
   * Record connection metrics
   */
  recordConnection(success: boolean, poolSize?: number): void {
    this.connectionMetrics.totalConnections++;
    if (success) {
      this.connectionMetrics.activeConnections++;
    } else {
      this.connectionMetrics.failedConnections++;
    }
    
    if (poolSize !== undefined) {
      this.connectionMetrics.connectionPoolSize = poolSize;
    }
  }

  /**
   * Record connection closure
   */
  recordConnectionClosure(): void {
    if (this.connectionMetrics.activeConnections > 0) {
      this.connectionMetrics.activeConnections--;
    }
  }

  /**
   * Take a memory snapshot
   */
  takeMemorySnapshot(): MemoryMetrics {
    const memUsage = process.memoryUsage();
    const snapshot: MemoryMetrics = {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss
    };
    
    // Keep only last 100 snapshots
    this.memorySnapshots.push(snapshot);
    if (this.memorySnapshots.length > 100) {
      this.memorySnapshots.shift();
    }
    
    return snapshot;
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    const operationCounts: Record<string, number> = {};
    const averageResponseTimes: Record<string, number> = {};
    const errorRates: Record<string, number> = {};
    const cacheHitRates: Record<string, number> = {};

    for (const [operation, metrics] of this.operationMetrics.entries()) {
      operationCounts[operation] = metrics.count;
      averageResponseTimes[operation] = metrics.averageTime;
      errorRates[operation] = metrics.count > 0 ? metrics.errors / metrics.count : 0;
    }

    // Calculate cache hit rates (placeholder - would be implemented by specific backends)
    cacheHitRates.overall = 0.85; // Default estimate

    const currentMemory = this.takeMemorySnapshot();

    return {
      operationCounts,
      averageResponseTimes,
      errorRates,
      cacheHitRates,
      memoryUsage: currentMemory.heapUsed
    };
  }

  /**
   * Get detailed health status
   */
  async getHealthStatus(customHealthCheck?: () => Promise<Record<string, unknown>>): Promise<HealthStatus> {
    const startTime = Date.now();
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    const details: Record<string, unknown> = {};

    try {
      // Memory health check
      const memorySnapshot = this.takeMemorySnapshot();
      const memoryUsageMB = memorySnapshot.heapUsed / 1024 / 1024;
      details.memoryUsageMB = Math.round(memoryUsageMB);
      
      if (memoryUsageMB > 1000) { // > 1GB
        status = 'degraded';
        details.memoryWarning = 'High memory usage detected';
      }

      // Connection health check
      details.connections = {
        active: this.connectionMetrics.activeConnections,
        total: this.connectionMetrics.totalConnections,
        failed: this.connectionMetrics.failedConnections,
        poolSize: this.connectionMetrics.connectionPoolSize
      };

      const failureRate = this.connectionMetrics.totalConnections > 0 
        ? this.connectionMetrics.failedConnections / this.connectionMetrics.totalConnections 
        : 0;
      
      if (failureRate > 0.1) { // > 10% failure rate
        status = 'degraded';
        details.connectionWarning = `High connection failure rate: ${Math.round(failureRate * 100)}%`;
      }

      // Operation health check
      const recentErrors = Array.from(this.operationMetrics.values())
        .reduce((sum, metrics) => sum + metrics.errors, 0);
      
      if (recentErrors > 10) {
        status = 'degraded';
        details.operationWarning = `High error count: ${recentErrors}`;
      }

      // Custom health check
      if (customHealthCheck) {
        const customDetails = await customHealthCheck();
        Object.assign(details, customDetails);
      }

      // Performance health check
      const avgResponseTimes = Array.from(this.operationMetrics.values())
        .map(m => m.averageTime)
        .filter(t => t > 0);
      
      if (avgResponseTimes.length > 0) {
        const avgTime = avgResponseTimes.reduce((sum, time) => sum + time, 0) / avgResponseTimes.length;
        details.averageResponseTime = Math.round(avgTime);
        
        if (avgTime > 5000) { // > 5 seconds
          status = 'unhealthy';
          details.performanceWarning = 'Very slow response times detected';
        } else if (avgTime > 1000) { // > 1 second
          status = 'degraded';
          details.performanceWarning = 'Slow response times detected';
        }
      }

    } catch (error) {
      status = 'unhealthy';
      details.error = error instanceof Error ? error.message : String(error);
    }

    const responseTime = Date.now() - startTime;
    this.currentHealthStatus = status;
    this.lastHealthCheck = new Date();

    return {
      status,
      lastChecked: this.lastHealthCheck,
      responseTime,
      details
    };
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): {
    current: MemoryMetrics;
    average: MemoryMetrics;
    peak: MemoryMetrics;
    trend: 'increasing' | 'decreasing' | 'stable';
  } {
    const current = this.takeMemorySnapshot();
    
    if (this.memorySnapshots.length === 0) {
      return {
        current,
        average: current,
        peak: current,
        trend: 'stable'
      };
    }

    const snapshots = this.memorySnapshots;
    const average: MemoryMetrics = {
      heapUsed: snapshots.reduce((sum, s) => sum + s.heapUsed, 0) / snapshots.length,
      heapTotal: snapshots.reduce((sum, s) => sum + s.heapTotal, 0) / snapshots.length,
      external: snapshots.reduce((sum, s) => sum + s.external, 0) / snapshots.length,
      rss: snapshots.reduce((sum, s) => sum + s.rss, 0) / snapshots.length
    };

    const peak: MemoryMetrics = {
      heapUsed: Math.max(...snapshots.map(s => s.heapUsed)),
      heapTotal: Math.max(...snapshots.map(s => s.heapTotal)),
      external: Math.max(...snapshots.map(s => s.external)),
      rss: Math.max(...snapshots.map(s => s.rss))
    };

    // Calculate trend from last 10 snapshots
    const recentSnapshots = snapshots.slice(-10);
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    
    if (recentSnapshots.length >= 5) {
      const firstHalf = recentSnapshots.slice(0, Math.floor(recentSnapshots.length / 2));
      const secondHalf = recentSnapshots.slice(Math.floor(recentSnapshots.length / 2));
      
      const firstAvg = firstHalf.reduce((sum, s) => sum + s.heapUsed, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, s) => sum + s.heapUsed, 0) / secondHalf.length;
      
      const changePercent = (secondAvg - firstAvg) / firstAvg;
      
      if (changePercent > 0.1) {
        trend = 'increasing';
      } else if (changePercent < -0.1) {
        trend = 'decreasing';
      }
    }

    return { current, average, peak, trend };
  }

  /**
   * Start automatic health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.getHealthStatus();
        Logger.debug(`Health check completed for ${this.backendType}: ${this.currentHealthStatus}`);
      } catch (error) {
        Logger.warn(`Health check failed for ${this.backendType}:`, error);
      }
    }, this.healthCheckIntervalMs);
  }

  /**
   * Stop automatic health monitoring
   */
  stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.operationMetrics.clear();
    this.startTimes.clear();
    this.memorySnapshots.length = 0;
    this.connectionMetrics = {
      activeConnections: 0,
      totalConnections: 0,
      failedConnections: 0
    };
    Logger.debug(`Performance metrics reset for ${this.backendType}`);
  }

  /**
   * Get operation statistics
   */
  getOperationStats(): Map<string, OperationMetrics> {
    return new Map(this.operationMetrics);
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.stopHealthMonitoring();
    this.reset();
    Logger.debug(`Performance monitor disposed for ${this.backendType}`);
  }
}

/**
 * Decorator function to automatically monitor method performance
 */
export function monitorPerformance(monitor: PerformanceMonitor, operationName: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const operationId = monitor.startOperation(operationName);
      try {
        const result = await originalMethod.apply(this, args);
        monitor.endOperation(operationId, operationName, true);
        return result;
      } catch (error) {
        monitor.endOperation(operationId, operationName, false);
        monitor.recordError(operationName, error as Error);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Create a performance monitor instance for a backend
 */
export function createPerformanceMonitor(
  backendType: string,
  options?: {
    enableAutoHealthCheck?: boolean;
    healthCheckIntervalMs?: number;
  }
): PerformanceMonitor {
  return new PerformanceMonitor(
    backendType,
    options?.enableAutoHealthCheck,
    options?.healthCheckIntervalMs
  );
}