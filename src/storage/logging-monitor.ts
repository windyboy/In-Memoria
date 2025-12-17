/**
 * Comprehensive Logging and Monitoring System for Vector Backends
 * 
 * This module provides unified logging formats, enhanced performance monitoring,
 * diagnostic information collection, and integration with circuit breaker systems.
 * 
 * Requirements addressed: 4.2, 4.3, 4.5
 */

import { Logger } from '../utils/logger.js';
import { CircuitBreaker, CircuitBreakerError } from '../utils/circuit-breaker.js';
import { PerformanceMonitor, OperationMetrics } from './performance-monitor.js';
import { VectorStoreError, isVectorStoreError } from './vector-errors.js';
import { PerformanceMetrics, HealthStatus } from './vector-store.js';

/**
 * Standardized log entry format for all vector backend operations
 */
export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  operation: string;
  backend: string;
  duration?: number;
  success: boolean;
  errorCode?: string;
  errorCategory?: string;
  metadata: Record<string, unknown>;
  correlationId?: string;
}

/**
 * Diagnostic information without exposing backend internals
 */
export interface DiagnosticInfo {
  systemHealth: 'healthy' | 'degraded' | 'unhealthy';
  operationSummary: {
    totalOperations: number;
    successRate: number;
    averageResponseTime: number;
    errorRate: number;
  };
  performanceTrends: {
    responseTimetrend: 'improving' | 'stable' | 'degrading';
    errorRateTrend: 'improving' | 'stable' | 'degrading';
    memoryUsageTrend: 'improving' | 'stable' | 'degrading';
  };
  circuitBreakerStatus: {
    state: string;
    failures: number;
    successRate: number;
  };
  recommendations: string[];
}

/**
 * Enhanced logging configuration
 */
export interface LoggingConfig {
  enableStructuredLogging: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  enablePerformanceLogging: boolean;
  enableErrorAggregation: boolean;
  maxLogEntries: number;
  correlationIdEnabled: boolean;
}

/**
 * Monitoring configuration
 */
export interface MonitoringConfig {
  enableRealTimeMetrics: boolean;
  metricsRetentionPeriod: number; // in milliseconds
  healthCheckInterval: number; // in milliseconds
  performanceThresholds: {
    responseTimeWarning: number; // in milliseconds
    responseTimeError: number; // in milliseconds
    errorRateWarning: number; // percentage (0-1)
    errorRateError: number; // percentage (0-1)
    memoryUsageWarning: number; // in bytes
    memoryUsageError: number; // in bytes
  };
}

/**
 * Comprehensive logging and monitoring system
 */
export class LoggingMonitor {
  private logEntries: LogEntry[] = [];
  private performanceMonitor: PerformanceMonitor;
  private circuitBreaker?: CircuitBreaker;
  private correlationCounter = 0;
  
  constructor(
    private backendType: string,
    private loggingConfig: LoggingConfig,
    private monitoringConfig: MonitoringConfig,
    performanceMonitor?: PerformanceMonitor,
    circuitBreaker?: CircuitBreaker
  ) {
    this.performanceMonitor = performanceMonitor || new PerformanceMonitor(backendType);
    this.circuitBreaker = circuitBreaker;
    
    Logger.info(`Logging monitor initialized for ${backendType}`, {
      structuredLogging: this.loggingConfig.enableStructuredLogging,
      performanceLogging: this.loggingConfig.enablePerformanceLogging,
      realTimeMetrics: this.monitoringConfig.enableRealTimeMetrics
    });
  }

  /**
   * Generate a correlation ID for tracking related operations
   */
  generateCorrelationId(): string {
    if (!this.loggingConfig.correlationIdEnabled) {
      return '';
    }
    return `${this.backendType}-${Date.now()}-${++this.correlationCounter}`;
  }

  /**
   * Log an operation with standardized format
   */
  logOperation(
    operation: string,
    success: boolean,
    duration?: number,
    error?: Error,
    metadata: Record<string, unknown> = {},
    correlationId?: string
  ): void {
    const timestamp = new Date();
    const level = success ? 'info' : 'error';
    
    // Create sanitized metadata (remove sensitive information)
    const sanitizedMetadata = this.sanitizeMetadata(metadata);
    
    // Determine error information
    let errorCode: string | undefined;
    let errorCategory: string | undefined;
    
    if (error) {
      if (isVectorStoreError(error)) {
        errorCode = error.code;
        errorCategory = error.category;
      } else if (error instanceof CircuitBreakerError) {
        errorCode = 'CIRCUIT_BREAKER_ERROR';
        errorCategory = 'circuit';
      } else {
        errorCode = 'UNKNOWN_ERROR';
        errorCategory = 'unknown';
      }
    }

    const logEntry: LogEntry = {
      timestamp,
      level,
      operation,
      backend: this.backendType,
      duration,
      success,
      errorCode,
      errorCategory,
      metadata: sanitizedMetadata,
      correlationId
    };

    // Add to log entries (with rotation)
    this.addLogEntry(logEntry);

    // Log using appropriate format
    if (this.loggingConfig.enableStructuredLogging) {
      this.logStructured(logEntry);
    } else {
      this.logTraditional(logEntry, error);
    }

    // Update performance monitoring
    if (duration !== undefined) {
      if (success) {
        // Performance monitor handles success tracking
      } else {
        this.performanceMonitor.recordError(operation, error || new Error('Operation failed'));
      }
    }
  }

  /**
   * Log structured format for machine parsing
   */
  private logStructured(entry: LogEntry): void {
    const structuredLog = {
      '@timestamp': entry.timestamp.toISOString(),
      level: entry.level,
      backend: entry.backend,
      operation: entry.operation,
      success: entry.success,
      duration_ms: entry.duration,
      error_code: entry.errorCode,
      error_category: entry.errorCategory,
      correlation_id: entry.correlationId,
      metadata: entry.metadata
    };

    const logMessage = `[${entry.backend.toUpperCase()}] ${entry.operation}: ${entry.success ? 'SUCCESS' : 'FAILED'}`;
    
    switch (entry.level) {
      case 'debug':
        Logger.debug(logMessage, structuredLog);
        break;
      case 'info':
        Logger.info(logMessage, structuredLog);
        break;
      case 'warn':
        Logger.warn(logMessage, structuredLog);
        break;
      case 'error':
        Logger.error(logMessage, structuredLog);
        break;
    }
  }

  /**
   * Log traditional human-readable format
   */
  private logTraditional(entry: LogEntry, error?: Error): void {
    const prefix = `[${entry.backend.toUpperCase()}]`;
    const duration = entry.duration ? ` (${entry.duration}ms)` : '';
    const correlation = entry.correlationId ? ` [${entry.correlationId}]` : '';
    
    if (entry.success) {
      Logger.info(`${prefix} ${entry.operation} completed successfully${duration}${correlation}`);
      
      if (this.loggingConfig.enablePerformanceLogging && entry.duration) {
        if (entry.duration > this.monitoringConfig.performanceThresholds.responseTimeWarning) {
          Logger.warn(`${prefix} ${entry.operation} slow response time: ${entry.duration}ms${correlation}`);
        }
      }
    } else {
      const errorMsg = error ? `: ${error.message}` : '';
      Logger.error(`${prefix} ${entry.operation} failed${duration}${correlation}${errorMsg}`);
      
      if (error && this.loggingConfig.enableErrorAggregation) {
        this.aggregateError(entry.operation, error);
      }
    }
  }

  /**
   * Add log entry with rotation
   */
  private addLogEntry(entry: LogEntry): void {
    this.logEntries.push(entry);
    
    // Rotate logs if needed
    if (this.logEntries.length > this.loggingConfig.maxLogEntries) {
      this.logEntries = this.logEntries.slice(-this.loggingConfig.maxLogEntries);
    }
  }

  /**
   * Sanitize metadata to remove sensitive information
   */
  private sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = ['password', 'apiKey', 'token', 'secret', 'key', 'auth'];
    
    for (const [key, value] of Object.entries(metadata)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveKeys.some(sensitive => lowerKey.includes(sensitive));
      
      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > 1000) {
        sanitized[key] = `[TRUNCATED: ${value.length} chars]`;
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  /**
   * Aggregate error information for analysis
   */
  private aggregateError(operation: string, error: Error): void {
    // This would typically store error patterns for analysis
    // For now, we'll just log the aggregation
    Logger.debug(`Error aggregated for ${operation}:`, {
      errorType: error.constructor.name,
      errorMessage: error.message,
      backend: this.backendType
    });
  }

  /**
   * Get comprehensive diagnostic information
   */
  getDiagnosticInfo(): DiagnosticInfo {
    const metrics = this.performanceMonitor.getPerformanceMetrics();
    const recentEntries = this.getRecentLogEntries(100);
    
    // Calculate operation summary
    const totalOperations = recentEntries.length;
    const successfulOperations = recentEntries.filter(e => e.success).length;
    const successRate = totalOperations > 0 ? successfulOperations / totalOperations : 1;
    const errorRate = 1 - successRate;
    
    const durations = recentEntries
      .filter(e => e.duration !== undefined)
      .map(e => e.duration!);
    const averageResponseTime = durations.length > 0 
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length 
      : 0;

    // Determine system health
    let systemHealth: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (errorRate > this.monitoringConfig.performanceThresholds.errorRateError) {
      systemHealth = 'unhealthy';
    } else if (errorRate > this.monitoringConfig.performanceThresholds.errorRateWarning ||
               averageResponseTime > this.monitoringConfig.performanceThresholds.responseTimeWarning) {
      systemHealth = 'degraded';
    }

    // Calculate trends
    const performanceTrends = this.calculatePerformanceTrends(recentEntries);
    
    // Get circuit breaker status
    const circuitBreakerStatus = this.circuitBreaker ? {
      state: this.circuitBreaker.getStats().state,
      failures: this.circuitBreaker.getStats().failures,
      successRate: this.circuitBreaker.getStats().totalRequests > 0 
        ? this.circuitBreaker.getStats().successes / this.circuitBreaker.getStats().totalRequests 
        : 1
    } : {
      state: 'N/A',
      failures: 0,
      successRate: 1
    };

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      systemHealth, 
      errorRate, 
      averageResponseTime, 
      performanceTrends
    );

    return {
      systemHealth,
      operationSummary: {
        totalOperations,
        successRate,
        averageResponseTime,
        errorRate
      },
      performanceTrends,
      circuitBreakerStatus,
      recommendations
    };
  }

  /**
   * Calculate performance trends from recent log entries
   */
  private calculatePerformanceTrends(entries: LogEntry[]): DiagnosticInfo['performanceTrends'] {
    if (entries.length < 10) {
      return {
        responseTimetrend: 'stable',
        errorRateTrend: 'stable',
        memoryUsageTrend: 'stable'
      };
    }

    // Split entries into two halves for trend analysis
    const midpoint = Math.floor(entries.length / 2);
    const firstHalf = entries.slice(0, midpoint);
    const secondHalf = entries.slice(midpoint);

    // Response time trend
    const firstHalfAvgTime = this.calculateAverageResponseTime(firstHalf);
    const secondHalfAvgTime = this.calculateAverageResponseTime(secondHalf);
    const responseTimeChange = secondHalfAvgTime - firstHalfAvgTime;
    
    let responseTimetrend: 'improving' | 'stable' | 'degrading' = 'stable';
    if (responseTimeChange > firstHalfAvgTime * 0.1) {
      responseTimetrend = 'degrading';
    } else if (responseTimeChange < -firstHalfAvgTime * 0.1) {
      responseTimetrend = 'improving';
    }

    // Error rate trend
    const firstHalfErrorRate = this.calculateErrorRate(firstHalf);
    const secondHalfErrorRate = this.calculateErrorRate(secondHalf);
    const errorRateChange = secondHalfErrorRate - firstHalfErrorRate;
    
    let errorRateTrend: 'improving' | 'stable' | 'degrading' = 'stable';
    if (errorRateChange > 0.05) { // 5% increase
      errorRateTrend = 'degrading';
    } else if (errorRateChange < -0.05) { // 5% decrease
      errorRateTrend = 'improving';
    }

    // Memory usage trend (from performance monitor)
    const memoryStats = this.performanceMonitor.getMemoryStats();
    let memoryUsageTrend: 'improving' | 'stable' | 'degrading' = memoryStats.trend === 'increasing' 
      ? 'degrading' 
      : memoryStats.trend === 'decreasing' 
        ? 'improving' 
        : 'stable';

    return {
      responseTimetrend,
      errorRateTrend,
      memoryUsageTrend
    };
  }

  /**
   * Calculate average response time from log entries
   */
  private calculateAverageResponseTime(entries: LogEntry[]): number {
    const durations = entries
      .filter(e => e.duration !== undefined)
      .map(e => e.duration!);
    
    return durations.length > 0 
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length 
      : 0;
  }

  /**
   * Calculate error rate from log entries
   */
  private calculateErrorRate(entries: LogEntry[]): number {
    if (entries.length === 0) return 0;
    const errors = entries.filter(e => !e.success).length;
    return errors / entries.length;
  }

  /**
   * Generate actionable recommendations based on system state
   */
  private generateRecommendations(
    systemHealth: 'healthy' | 'degraded' | 'unhealthy',
    errorRate: number,
    averageResponseTime: number,
    trends: DiagnosticInfo['performanceTrends']
  ): string[] {
    const recommendations: string[] = [];

    // Health-based recommendations
    if (systemHealth === 'unhealthy') {
      recommendations.push('System is unhealthy - immediate attention required');
      recommendations.push('Check error logs for recurring issues');
      recommendations.push('Consider scaling resources or switching backends');
    } else if (systemHealth === 'degraded') {
      recommendations.push('System performance is degraded - monitor closely');
    }

    // Error rate recommendations
    if (errorRate > this.monitoringConfig.performanceThresholds.errorRateError) {
      recommendations.push('High error rate detected - investigate error patterns');
      recommendations.push('Check network connectivity and backend availability');
    } else if (errorRate > this.monitoringConfig.performanceThresholds.errorRateWarning) {
      recommendations.push('Elevated error rate - monitor for patterns');
    }

    // Response time recommendations
    if (averageResponseTime > this.monitoringConfig.performanceThresholds.responseTimeError) {
      recommendations.push('Very slow response times - check backend performance');
      recommendations.push('Consider optimizing queries or increasing resources');
    } else if (averageResponseTime > this.monitoringConfig.performanceThresholds.responseTimeWarning) {
      recommendations.push('Slow response times detected - monitor performance');
    }

    // Trend-based recommendations
    if (trends.responseTimetrend === 'degrading') {
      recommendations.push('Response times are getting worse - investigate performance bottlenecks');
    }
    if (trends.errorRateTrend === 'degrading') {
      recommendations.push('Error rates are increasing - check for system issues');
    }
    if (trends.memoryUsageTrend === 'degrading') {
      recommendations.push('Memory usage is increasing - monitor for memory leaks');
    }

    // Circuit breaker recommendations
    if (this.circuitBreaker) {
      const stats = this.circuitBreaker.getStats();
      if (stats.state === 'OPEN') {
        recommendations.push('Circuit breaker is open - backend may be unavailable');
      } else if (stats.state === 'HALF_OPEN') {
        recommendations.push('Circuit breaker is testing recovery - monitor closely');
      }
    }

    // Default recommendation if system is healthy
    if (recommendations.length === 0) {
      recommendations.push('System is operating normally');
    }

    return recommendations;
  }

  /**
   * Get recent log entries
   */
  getRecentLogEntries(limit?: number): LogEntry[] {
    const entries = [...this.logEntries];
    return limit ? entries.slice(-limit) : entries;
  }

  /**
   * Get log entries by operation
   */
  getLogEntriesByOperation(operation: string, limit?: number): LogEntry[] {
    const filtered = this.logEntries.filter(e => e.operation === operation);
    return limit ? filtered.slice(-limit) : filtered;
  }

  /**
   * Get error log entries
   */
  getErrorLogEntries(limit?: number): LogEntry[] {
    const errors = this.logEntries.filter(e => !e.success);
    return limit ? errors.slice(-limit) : errors;
  }

  /**
   * Clear log entries (useful for testing or memory management)
   */
  clearLogEntries(): void {
    this.logEntries = [];
    Logger.debug(`Log entries cleared for ${this.backendType}`);
  }

  /**
   * Get performance metrics enhanced with logging data
   */
  getEnhancedPerformanceMetrics(): PerformanceMetrics & { 
    loggingStats: {
      totalLogEntries: number;
      errorLogEntries: number;
      recentErrorRate: number;
      averageOperationTime: number;
    }
  } {
    const baseMetrics = this.performanceMonitor.getPerformanceMetrics();
    const recentEntries = this.getRecentLogEntries(100);
    
    const errorEntries = recentEntries.filter(e => !e.success);
    const recentErrorRate = recentEntries.length > 0 ? errorEntries.length / recentEntries.length : 0;
    const averageOperationTime = this.calculateAverageResponseTime(recentEntries);

    return {
      ...baseMetrics,
      loggingStats: {
        totalLogEntries: this.logEntries.length,
        errorLogEntries: errorEntries.length,
        recentErrorRate,
        averageOperationTime
      }
    };
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.clearLogEntries();
    this.performanceMonitor.dispose();
    Logger.debug(`Logging monitor disposed for ${this.backendType}`);
  }
}

/**
 * Factory function to create logging monitor with default configuration
 */
export function createLoggingMonitor(
  backendType: string,
  options?: {
    loggingConfig?: Partial<LoggingConfig>;
    monitoringConfig?: Partial<MonitoringConfig>;
    performanceMonitor?: PerformanceMonitor;
    circuitBreaker?: CircuitBreaker;
  }
): LoggingMonitor {
  const defaultLoggingConfig: LoggingConfig = {
    enableStructuredLogging: process.env.NODE_ENV === 'production',
    logLevel: (process.env.LOG_LEVEL as any) || 'info',
    enablePerformanceLogging: true,
    enableErrorAggregation: true,
    maxLogEntries: 1000,
    correlationIdEnabled: true
  };

  const defaultMonitoringConfig: MonitoringConfig = {
    enableRealTimeMetrics: true,
    metricsRetentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
    healthCheckInterval: 30000, // 30 seconds
    performanceThresholds: {
      responseTimeWarning: 1000, // 1 second
      responseTimeError: 5000, // 5 seconds
      errorRateWarning: 0.05, // 5%
      errorRateError: 0.15, // 15%
      memoryUsageWarning: 500 * 1024 * 1024, // 500MB
      memoryUsageError: 1024 * 1024 * 1024 // 1GB
    }
  };

  const loggingConfig = { ...defaultLoggingConfig, ...options?.loggingConfig };
  const monitoringConfig = { ...defaultMonitoringConfig, ...options?.monitoringConfig };

  return new LoggingMonitor(
    backendType,
    loggingConfig,
    monitoringConfig,
    options?.performanceMonitor,
    options?.circuitBreaker
  );
}

/**
 * Global logging monitors registry for centralized management
 */
class LoggingMonitorRegistry {
  private monitors = new Map<string, LoggingMonitor>();

  register(backendType: string, monitor: LoggingMonitor): void {
    this.monitors.set(backendType, monitor);
    Logger.debug(`Logging monitor registered for ${backendType}`);
  }

  get(backendType: string): LoggingMonitor | undefined {
    return this.monitors.get(backendType);
  }

  getAll(): Map<string, LoggingMonitor> {
    return new Map(this.monitors);
  }

  dispose(backendType: string): void {
    const monitor = this.monitors.get(backendType);
    if (monitor) {
      monitor.dispose();
      this.monitors.delete(backendType);
      Logger.debug(`Logging monitor disposed for ${backendType}`);
    }
  }

  disposeAll(): void {
    for (const [backendType, monitor] of this.monitors) {
      monitor.dispose();
    }
    this.monitors.clear();
    Logger.debug('All logging monitors disposed');
  }

  /**
   * Get aggregated diagnostic information across all backends
   */
  getAggregatedDiagnostics(): Record<string, DiagnosticInfo> {
    const diagnostics: Record<string, DiagnosticInfo> = {};
    
    for (const [backendType, monitor] of this.monitors) {
      diagnostics[backendType] = monitor.getDiagnosticInfo();
    }
    
    return diagnostics;
  }
}

/**
 * Global registry instance
 */
export const globalLoggingMonitorRegistry = new LoggingMonitorRegistry();