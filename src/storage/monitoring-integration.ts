/**
 * Monitoring Integration Module
 * 
 * This module provides comprehensive integration between logging, monitoring,
 * circuit breakers, and diagnostic systems for vector backends.
 * 
 * Requirements addressed: 4.2, 4.3, 4.5
 */

import { Logger } from '../utils/logger.js';
import { CircuitBreaker, createOpenAICircuitBreaker, createRustAnalyzerCircuitBreaker } from '../utils/circuit-breaker.js';
import { LoggingMonitor, createLoggingMonitor } from './logging-monitor.js';
import { PerformanceMonitor, createPerformanceMonitor } from './performance-monitor.js';
import { DiagnosticSystem, globalDiagnosticSystem, SystemDiagnosticReport } from './diagnostic-system.js';
import { VectorStore, BackendConfig } from './vector-store.js';
import { createEnhancedBackendAdapter } from './backend-adapters.js';
import { createBackendConfigAdapter } from './backend-config.js';

/**
 * Monitoring configuration for different backend types
 */
export interface MonitoringIntegrationConfig {
  enableCircuitBreaker: boolean;
  enableComprehensiveLogging: boolean;
  enablePerformanceMonitoring: boolean;
  enableDiagnosticSystem: boolean;
  circuitBreakerConfig?: {
    failureThreshold: number;
    recoveryTimeout: number;
    requestTimeout: number;
    monitoringWindow: number;
  };
  loggingConfig?: {
    enableStructuredLogging: boolean;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    enablePerformanceLogging: boolean;
    enableErrorAggregation: boolean;
    maxLogEntries: number;
    correlationIdEnabled: boolean;
  };
  monitoringConfig?: {
    enableRealTimeMetrics: boolean;
    metricsRetentionPeriod: number;
    healthCheckInterval: number;
    performanceThresholds: {
      responseTimeWarning: number;
      responseTimeError: number;
      errorRateWarning: number;
      errorRateError: number;
      memoryUsageWarning: number;
      memoryUsageError: number;
    };
  };
}

/**
 * Integrated monitoring system for vector backends
 */
export class MonitoringIntegration {
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private loggingMonitors = new Map<string, LoggingMonitor>();
  private performanceMonitors = new Map<string, PerformanceMonitor>();
  private vectorStores = new Map<string, VectorStore>();
  private diagnosticSystem: DiagnosticSystem;
  private config: MonitoringIntegrationConfig;

  constructor(config?: Partial<MonitoringIntegrationConfig>) {
    this.config = this.mergeWithDefaults(config);
    this.diagnosticSystem = globalDiagnosticSystem;
    
    Logger.info('Monitoring integration initialized', {
      circuitBreaker: this.config.enableCircuitBreaker,
      comprehensiveLogging: this.config.enableComprehensiveLogging,
      performanceMonitoring: this.config.enablePerformanceMonitoring,
      diagnosticSystem: this.config.enableDiagnosticSystem
    });
  }

  /**
   * Merge user config with defaults
   */
  private mergeWithDefaults(config?: Partial<MonitoringIntegrationConfig>): MonitoringIntegrationConfig {
    return {
      enableCircuitBreaker: config?.enableCircuitBreaker ?? true,
      enableComprehensiveLogging: config?.enableComprehensiveLogging ?? true,
      enablePerformanceMonitoring: config?.enablePerformanceMonitoring ?? true,
      enableDiagnosticSystem: config?.enableDiagnosticSystem ?? true,
      circuitBreakerConfig: {
        failureThreshold: 5,
        recoveryTimeout: 30000,
        requestTimeout: 30000,
        monitoringWindow: 300000,
        ...config?.circuitBreakerConfig
      },
      loggingConfig: {
        enableStructuredLogging: process.env.NODE_ENV === 'production',
        logLevel: (process.env.LOG_LEVEL as any) || 'info',
        enablePerformanceLogging: true,
        enableErrorAggregation: true,
        maxLogEntries: 1000,
        correlationIdEnabled: true,
        ...config?.loggingConfig
      },
      monitoringConfig: {
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
        },
        ...config?.monitoringConfig
      }
    };
  }

  /**
   * Create a fully monitored vector store with all integrations
   */
  async createMonitoredVectorStore(
    backendType: string,
    backendConfig?: BackendConfig
  ): Promise<VectorStore> {
    Logger.info(`Creating monitored vector store for ${backendType}`);

    // Create or get backend configuration
    let config = backendConfig;
    if (!config) {
      const configAdapter = createBackendConfigAdapter(backendType);
      config = configAdapter.mapEnvironmentVariables();
    }

    // Create circuit breaker if enabled
    let circuitBreaker: CircuitBreaker | undefined;
    if (this.config.enableCircuitBreaker) {
      circuitBreaker = this.createCircuitBreaker(backendType);
      this.circuitBreakers.set(backendType, circuitBreaker);
    }

    // Create performance monitor if enabled
    let performanceMonitor: PerformanceMonitor | undefined;
    if (this.config.enablePerformanceMonitoring) {
      performanceMonitor = createPerformanceMonitor(backendType, {
        enableAutoHealthCheck: true,
        healthCheckIntervalMs: this.config.monitoringConfig!.healthCheckInterval
      });
      this.performanceMonitors.set(backendType, performanceMonitor);
    }

    // Create logging monitor if enabled
    let loggingMonitor: LoggingMonitor | undefined;
    if (this.config.enableComprehensiveLogging) {
      loggingMonitor = createLoggingMonitor(backendType, {
        loggingConfig: this.config.loggingConfig,
        monitoringConfig: this.config.monitoringConfig,
        performanceMonitor,
        circuitBreaker
      });
      this.loggingMonitors.set(backendType, loggingMonitor);
    }

    // Create the vector store with enhanced adapter
    const vectorStore = createEnhancedBackendAdapter(config, circuitBreaker);
    this.vectorStores.set(backendType, vectorStore);

    // Register with diagnostic system if enabled
    if (this.config.enableDiagnosticSystem && loggingMonitor) {
      this.diagnosticSystem.registerBackend(
        backendType,
        vectorStore,
        loggingMonitor,
        circuitBreaker
      );
    }

    Logger.info(`Monitored vector store created for ${backendType}`, {
      hasCircuitBreaker: !!circuitBreaker,
      hasPerformanceMonitor: !!performanceMonitor,
      hasLoggingMonitor: !!loggingMonitor,
      registeredWithDiagnostics: this.config.enableDiagnosticSystem
    });

    return vectorStore;
  }

  /**
   * Create appropriate circuit breaker for backend type
   */
  private createCircuitBreaker(backendType: string): CircuitBreaker {
    const config = this.config.circuitBreakerConfig!;
    
    // Use predefined circuit breakers for known types, or create custom one
    switch (backendType.toLowerCase()) {
      case 'openai':
        return createOpenAICircuitBreaker();
      case 'rust':
      case 'analyzer':
        return createRustAnalyzerCircuitBreaker();
      default:
        return new CircuitBreaker({
          failureThreshold: config.failureThreshold,
          recoveryTimeout: config.recoveryTimeout,
          requestTimeout: config.requestTimeout,
          monitoringWindow: config.monitoringWindow
        });
    }
  }

  /**
   * Get comprehensive system diagnostic report
   */
  async getSystemDiagnosticReport(): Promise<SystemDiagnosticReport> {
    if (!this.config.enableDiagnosticSystem) {
      throw new Error('Diagnostic system is not enabled');
    }
    
    return await this.diagnosticSystem.generateDiagnosticReport();
  }

  /**
   * Get health summary for all monitored backends
   */
  async getHealthSummary() {
    if (!this.config.enableDiagnosticSystem) {
      throw new Error('Diagnostic system is not enabled');
    }
    
    return await this.diagnosticSystem.getHealthSummary();
  }

  /**
   * Get performance metrics for a specific backend
   */
  getPerformanceMetrics(backendType: string) {
    const performanceMonitor = this.performanceMonitors.get(backendType);
    if (!performanceMonitor) {
      throw new Error(`No performance monitor found for backend: ${backendType}`);
    }
    
    return performanceMonitor.getPerformanceMetrics();
  }

  /**
   * Get logging monitor for a specific backend
   */
  getLoggingMonitor(backendType: string): LoggingMonitor | undefined {
    return this.loggingMonitors.get(backendType);
  }

  /**
   * Get circuit breaker for a specific backend
   */
  getCircuitBreaker(backendType: string): CircuitBreaker | undefined {
    return this.circuitBreakers.get(backendType);
  }

  /**
   * Get diagnostic information for a specific backend
   */
  getBackendDiagnostics(backendType: string) {
    const loggingMonitor = this.loggingMonitors.get(backendType);
    if (!loggingMonitor) {
      throw new Error(`No logging monitor found for backend: ${backendType}`);
    }
    
    return loggingMonitor.getDiagnosticInfo();
  }

  /**
   * Reset circuit breaker for a specific backend
   */
  resetCircuitBreaker(backendType: string): boolean {
    const circuitBreaker = this.circuitBreakers.get(backendType);
    if (circuitBreaker) {
      circuitBreaker.reset();
      Logger.info(`Circuit breaker reset for ${backendType}`);
      return true;
    }
    return false;
  }

  /**
   * Clear logs for a specific backend
   */
  clearLogs(backendType: string): boolean {
    const loggingMonitor = this.loggingMonitors.get(backendType);
    if (loggingMonitor) {
      loggingMonitor.clearLogEntries();
      Logger.info(`Logs cleared for ${backendType}`);
      return true;
    }
    return false;
  }

  /**
   * Get recent error logs for a specific backend
   */
  getRecentErrors(backendType: string, limit: number = 50) {
    const loggingMonitor = this.loggingMonitors.get(backendType);
    if (!loggingMonitor) {
      throw new Error(`No logging monitor found for backend: ${backendType}`);
    }
    
    return loggingMonitor.getErrorLogEntries(limit);
  }

  /**
   * Get operation logs for a specific backend and operation
   */
  getOperationLogs(backendType: string, operation: string, limit: number = 50) {
    const loggingMonitor = this.loggingMonitors.get(backendType);
    if (!loggingMonitor) {
      throw new Error(`No logging monitor found for backend: ${backendType}`);
    }
    
    return loggingMonitor.getLogEntriesByOperation(operation, limit);
  }

  /**
   * Acknowledge an alert in the diagnostic system
   */
  acknowledgeAlert(alertId: string): boolean {
    if (!this.config.enableDiagnosticSystem) {
      return false;
    }
    
    return this.diagnosticSystem.acknowledgeAlert(alertId);
  }

  /**
   * Get alert history from the diagnostic system
   */
  getAlertHistory(limit?: number) {
    if (!this.config.enableDiagnosticSystem) {
      return [];
    }
    
    return this.diagnosticSystem.getAlertHistory(limit);
  }

  /**
   * Remove a backend from monitoring
   */
  removeBackend(backendType: string): void {
    // Stop and remove circuit breaker
    const circuitBreaker = this.circuitBreakers.get(backendType);
    if (circuitBreaker) {
      circuitBreaker.reset();
      this.circuitBreakers.delete(backendType);
    }

    // Dispose and remove logging monitor
    const loggingMonitor = this.loggingMonitors.get(backendType);
    if (loggingMonitor) {
      loggingMonitor.dispose();
      this.loggingMonitors.delete(backendType);
    }

    // Dispose and remove performance monitor
    const performanceMonitor = this.performanceMonitors.get(backendType);
    if (performanceMonitor) {
      performanceMonitor.dispose();
      this.performanceMonitors.delete(backendType);
    }

    // Remove from diagnostic system
    if (this.config.enableDiagnosticSystem) {
      this.diagnosticSystem.unregisterBackend(backendType);
    }

    // Remove vector store reference
    this.vectorStores.delete(backendType);

    Logger.info(`Backend ${backendType} removed from monitoring`);
  }

  /**
   * Get list of monitored backends
   */
  getMonitoredBackends(): string[] {
    return Array.from(this.vectorStores.keys());
  }

  /**
   * Get monitoring statistics
   */
  getMonitoringStats() {
    return {
      totalBackends: this.vectorStores.size,
      circuitBreakersActive: this.circuitBreakers.size,
      loggingMonitorsActive: this.loggingMonitors.size,
      performanceMonitorsActive: this.performanceMonitors.size,
      diagnosticSystemEnabled: this.config.enableDiagnosticSystem,
      config: {
        circuitBreakerEnabled: this.config.enableCircuitBreaker,
        comprehensiveLoggingEnabled: this.config.enableComprehensiveLogging,
        performanceMonitoringEnabled: this.config.enablePerformanceMonitoring
      }
    };
  }

  /**
   * Update monitoring configuration
   */
  updateConfig(newConfig: Partial<MonitoringIntegrationConfig>): void {
    this.config = this.mergeWithDefaults(newConfig);
    Logger.info('Monitoring configuration updated', this.config);
  }

  /**
   * Dispose of all monitoring resources
   */
  dispose(): void {
    // Dispose all logging monitors
    for (const [backendType, loggingMonitor] of this.loggingMonitors) {
      loggingMonitor.dispose();
    }
    this.loggingMonitors.clear();

    // Dispose all performance monitors
    for (const [backendType, performanceMonitor] of this.performanceMonitors) {
      performanceMonitor.dispose();
    }
    this.performanceMonitors.clear();

    // Reset all circuit breakers
    for (const [backendType, circuitBreaker] of this.circuitBreakers) {
      circuitBreaker.reset();
    }
    this.circuitBreakers.clear();

    // Clear vector store references
    this.vectorStores.clear();

    // Dispose diagnostic system
    if (this.config.enableDiagnosticSystem) {
      this.diagnosticSystem.dispose();
    }

    Logger.info('Monitoring integration disposed');
  }
}

/**
 * Global monitoring integration instance
 */
export const globalMonitoringIntegration = new MonitoringIntegration();

/**
 * Convenience function to create a monitored vector store with default configuration
 */
export async function createMonitoredVectorStore(
  backendType: string,
  config?: BackendConfig
): Promise<VectorStore> {
  return await globalMonitoringIntegration.createMonitoredVectorStore(backendType, config);
}

/**
 * Convenience function to get system health summary
 */
export async function getSystemHealthSummary() {
  return await globalMonitoringIntegration.getHealthSummary();
}

/**
 * Convenience function to get comprehensive diagnostic report
 */
export async function getSystemDiagnosticReport(): Promise<SystemDiagnosticReport> {
  return await globalMonitoringIntegration.getSystemDiagnosticReport();
}