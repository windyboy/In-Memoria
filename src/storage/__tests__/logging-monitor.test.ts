/**
 * Tests for comprehensive logging and monitoring system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LoggingMonitor, createLoggingMonitor } from '../logging-monitor.js';
import { PerformanceMonitor } from '../performance-monitor.js';
import { CircuitBreaker } from '../../utils/circuit-breaker.js';
import { OperationError } from '../vector-errors.js';

describe('LoggingMonitor', () => {
  let loggingMonitor: LoggingMonitor;
  let performanceMonitor: PerformanceMonitor;
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    performanceMonitor = new PerformanceMonitor('test-backend');
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTimeout: 5000,
      requestTimeout: 1000,
      monitoringWindow: 60000
    });

    loggingMonitor = createLoggingMonitor('test-backend', {
      performanceMonitor,
      circuitBreaker,
      loggingConfig: {
        enableStructuredLogging: false,
        logLevel: 'debug',
        enablePerformanceLogging: true,
        enableErrorAggregation: true,
        maxLogEntries: 100,
        correlationIdEnabled: true
      }
    });
  });

  afterEach(() => {
    loggingMonitor.dispose();
    performanceMonitor.dispose();
  });

  describe('Basic Logging', () => {
    it('should log successful operations', () => {
      const correlationId = loggingMonitor.generateCorrelationId();
      
      loggingMonitor.logOperation(
        'testOperation',
        true,
        150,
        undefined,
        { testData: 'value' },
        correlationId
      );

      const entries = loggingMonitor.getRecentLogEntries(1);
      expect(entries).toHaveLength(1);
      expect(entries[0].operation).toBe('testOperation');
      expect(entries[0].success).toBe(true);
      expect(entries[0].duration).toBe(150);
      expect(entries[0].correlationId).toBe(correlationId);
    });

    it('should log failed operations with error details', () => {
      const error = new OperationError('Test error');
      
      loggingMonitor.logOperation(
        'testOperation',
        false,
        250,
        error,
        { testData: 'value' }
      );

      const entries = loggingMonitor.getErrorLogEntries(1);
      expect(entries).toHaveLength(1);
      expect(entries[0].operation).toBe('testOperation');
      expect(entries[0].success).toBe(false);
      expect(entries[0].errorCode).toBe('VECTOR_OPERATION_ERROR');
      expect(entries[0].errorCategory).toBe('operation');
    });

    it('should generate correlation IDs when enabled', () => {
      const correlationId1 = loggingMonitor.generateCorrelationId();
      const correlationId2 = loggingMonitor.generateCorrelationId();
      
      expect(correlationId1).toBeTruthy();
      expect(correlationId2).toBeTruthy();
      expect(correlationId1).not.toBe(correlationId2);
      expect(correlationId1).toContain('test-backend');
    });

    it('should sanitize sensitive metadata', () => {
      loggingMonitor.logOperation(
        'testOperation',
        true,
        100,
        undefined,
        { 
          apiKey: 'secret123',
          password: 'password123',
          normalData: 'value',
          token: 'token123'
        }
      );

      const entries = loggingMonitor.getRecentLogEntries(1);
      expect(entries[0].metadata.apiKey).toBe('[REDACTED]');
      expect(entries[0].metadata.password).toBe('[REDACTED]');
      expect(entries[0].metadata.token).toBe('[REDACTED]');
      expect(entries[0].metadata.normalData).toBe('value');
    });
  });

  describe('Diagnostic Information', () => {
    it('should generate diagnostic information', () => {
      // Log some operations
      loggingMonitor.logOperation('op1', true, 100);
      loggingMonitor.logOperation('op2', true, 200);
      loggingMonitor.logOperation('op3', false, 300, new Error('Test error'));

      const diagnostics = loggingMonitor.getDiagnosticInfo();
      
      expect(diagnostics.operationSummary.totalOperations).toBe(3);
      expect(diagnostics.operationSummary.successRate).toBeCloseTo(2/3);
      expect(diagnostics.operationSummary.errorRate).toBeCloseTo(1/3);
      expect(diagnostics.operationSummary.averageResponseTime).toBeCloseTo(200);
      expect(diagnostics.systemHealth).toBe('unhealthy'); // Due to high error rate (33% > 15%)
    });

    it('should provide recommendations based on system state', () => {
      // Log many errors to trigger recommendations
      for (let i = 0; i < 10; i++) {
        loggingMonitor.logOperation('failingOp', false, 100, new Error('Test error'));
      }

      const diagnostics = loggingMonitor.getDiagnosticInfo();
      expect(diagnostics.recommendations).toContain('System is unhealthy - immediate attention required');
    });

    it('should track performance trends', () => {
      // Log operations with increasing response times
      for (let i = 0; i < 20; i++) {
        loggingMonitor.logOperation('slowingOp', true, 100 + i * 50);
      }

      const diagnostics = loggingMonitor.getDiagnosticInfo();
      expect(diagnostics.performanceTrends.responseTimetrend).toBe('degrading');
    });
  });

  describe('Log Entry Management', () => {
    it('should rotate log entries when limit is exceeded', () => {
      const monitor = createLoggingMonitor('test', {
        loggingConfig: { maxLogEntries: 5 }
      });

      // Add more entries than the limit
      for (let i = 0; i < 10; i++) {
        monitor.logOperation(`op${i}`, true, 100);
      }

      const entries = monitor.getRecentLogEntries();
      expect(entries).toHaveLength(5);
      expect(entries[0].operation).toBe('op5'); // Should start from op5
      expect(entries[4].operation).toBe('op9'); // Should end with op9

      monitor.dispose();
    });

    it('should filter log entries by operation', () => {
      loggingMonitor.logOperation('op1', true, 100);
      loggingMonitor.logOperation('op2', true, 100);
      loggingMonitor.logOperation('op1', false, 100, new Error('Test'));
      loggingMonitor.logOperation('op3', true, 100);

      const op1Entries = loggingMonitor.getLogEntriesByOperation('op1');
      expect(op1Entries).toHaveLength(2);
      expect(op1Entries.every(e => e.operation === 'op1')).toBe(true);
    });

    it('should clear log entries', () => {
      loggingMonitor.logOperation('op1', true, 100);
      loggingMonitor.logOperation('op2', true, 100);
      
      expect(loggingMonitor.getRecentLogEntries()).toHaveLength(2);
      
      loggingMonitor.clearLogEntries();
      expect(loggingMonitor.getRecentLogEntries()).toHaveLength(0);
    });
  });

  describe('Enhanced Performance Metrics', () => {
    it('should provide enhanced performance metrics with logging data', () => {
      loggingMonitor.logOperation('op1', true, 100);
      loggingMonitor.logOperation('op2', false, 200, new Error('Test'));
      loggingMonitor.logOperation('op3', true, 150);

      const metrics = loggingMonitor.getEnhancedPerformanceMetrics();
      
      expect(metrics.loggingStats.totalLogEntries).toBe(3);
      expect(metrics.loggingStats.errorLogEntries).toBe(1);
      expect(metrics.loggingStats.recentErrorRate).toBeCloseTo(1/3);
      expect(metrics.loggingStats.averageOperationTime).toBeCloseTo(150);
    });
  });

  describe('Integration with Circuit Breaker', () => {
    it('should include circuit breaker status in diagnostics', async () => {
      // Trigger circuit breaker failures by executing failing operations
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Test failure');
          });
        } catch (error) {
          // Expected to fail
        }
      }

      const diagnostics = loggingMonitor.getDiagnosticInfo();
      expect(diagnostics.circuitBreakerStatus.failures).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing performance monitor gracefully', () => {
      const monitor = new LoggingMonitor(
        'test',
        {
          enableStructuredLogging: false,
          logLevel: 'info',
          enablePerformanceLogging: true,
          enableErrorAggregation: true,
          maxLogEntries: 100,
          correlationIdEnabled: true
        },
        {
          enableRealTimeMetrics: true,
          metricsRetentionPeriod: 24 * 60 * 60 * 1000,
          healthCheckInterval: 30000,
          performanceThresholds: {
            responseTimeWarning: 1000,
            responseTimeError: 5000,
            errorRateWarning: 0.05,
            errorRateError: 0.15,
            memoryUsageWarning: 500 * 1024 * 1024,
            memoryUsageError: 1024 * 1024 * 1024
          }
        }
      );

      expect(() => {
        monitor.logOperation('test', true, 100);
      }).not.toThrow();

      monitor.dispose();
    });
  });
});

describe('createLoggingMonitor', () => {
  it('should create logging monitor with default configuration', () => {
    const monitor = createLoggingMonitor('test-backend');
    
    expect(monitor).toBeInstanceOf(LoggingMonitor);
    
    monitor.dispose();
  });

  it('should create logging monitor with custom configuration', () => {
    const monitor = createLoggingMonitor('test-backend', {
      loggingConfig: {
        enableStructuredLogging: true,
        logLevel: 'error',
        maxLogEntries: 50
      },
      monitoringConfig: {
        healthCheckInterval: 60000
      }
    });
    
    expect(monitor).toBeInstanceOf(LoggingMonitor);
    
    monitor.dispose();
  });
});