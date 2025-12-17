/**
 * Health Monitoring Service for Vector Backends
 * 
 * This module provides centralized health monitoring capabilities that can be used
 * across different vector backend implementations to ensure consistent health reporting.
 */

import { Logger } from '../utils/logger.js';
import { HealthStatus } from './vector-store.js';

export interface HealthCheckConfig {
  enabled: boolean;
  intervalMs: number;
  timeoutMs: number;
  retryAttempts: number;
  degradedThresholdMs: number;
  unhealthyThresholdMs: number;
}

export interface HealthCheckResult {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  details: Record<string, unknown>;
  error?: string;
}

export type HealthCheckFunction = () => Promise<HealthCheckResult>;

/**
 * Centralized health monitoring service
 */
export class HealthMonitorService {
  private healthChecks = new Map<string, HealthCheckFunction>();
  private lastResults = new Map<string, HealthCheckResult>();
  private monitoringInterval?: NodeJS.Timeout;
  private isMonitoring = false;

  constructor(
    private config: HealthCheckConfig = {
      enabled: true,
      intervalMs: 30000, // 30 seconds
      timeoutMs: 5000,   // 5 seconds
      retryAttempts: 3,
      degradedThresholdMs: 1000,  // 1 second
      unhealthyThresholdMs: 5000  // 5 seconds
    }
  ) {
    Logger.debug('Health monitor service initialized', config);
  }

  /**
   * Register a health check function
   */
  registerHealthCheck(name: string, healthCheckFn: HealthCheckFunction): void {
    this.healthChecks.set(name, healthCheckFn);
    Logger.debug(`Health check registered: ${name}`);
  }

  /**
   * Unregister a health check function
   */
  unregisterHealthCheck(name: string): void {
    this.healthChecks.delete(name);
    this.lastResults.delete(name);
    Logger.debug(`Health check unregistered: ${name}`);
  }

  /**
   * Start continuous health monitoring
   */
  startMonitoring(): void {
    if (this.isMonitoring || !this.config.enabled) {
      return;
    }

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(async () => {
      await this.runAllHealthChecks();
    }, this.config.intervalMs);

    Logger.info(`Health monitoring started (interval: ${this.config.intervalMs}ms)`);
  }

  /**
   * Stop continuous health monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    this.isMonitoring = false;
    Logger.info('Health monitoring stopped');
  }

  /**
   * Run all registered health checks
   */
  async runAllHealthChecks(): Promise<Map<string, HealthCheckResult>> {
    const results = new Map<string, HealthCheckResult>();

    for (const [name, healthCheckFn] of this.healthChecks.entries()) {
      try {
        const result = await this.runHealthCheckWithTimeout(name, healthCheckFn);
        results.set(name, result);
        this.lastResults.set(name, result);
      } catch (error) {
        const errorResult: HealthCheckResult = {
          name,
          status: 'unhealthy',
          responseTime: this.config.timeoutMs,
          details: {},
          error: error instanceof Error ? error.message : String(error)
        };
        results.set(name, errorResult);
        this.lastResults.set(name, errorResult);
      }
    }

    return results;
  }

  /**
   * Run a specific health check
   */
  async runHealthCheck(name: string): Promise<HealthCheckResult | null> {
    const healthCheckFn = this.healthChecks.get(name);
    if (!healthCheckFn) {
      Logger.warn(`Health check not found: ${name}`);
      return null;
    }

    try {
      const result = await this.runHealthCheckWithTimeout(name, healthCheckFn);
      this.lastResults.set(name, result);
      return result;
    } catch (error) {
      const errorResult: HealthCheckResult = {
        name,
        status: 'unhealthy',
        responseTime: this.config.timeoutMs,
        details: {},
        error: error instanceof Error ? error.message : String(error)
      };
      this.lastResults.set(name, errorResult);
      return errorResult;
    }
  }

  /**
   * Get the last health check results
   */
  getLastResults(): Map<string, HealthCheckResult> {
    return new Map(this.lastResults);
  }

  /**
   * Get overall system health status
   */
  getOverallHealthStatus(): HealthStatus {
    const results = Array.from(this.lastResults.values());
    
    if (results.length === 0) {
      return {
        status: 'healthy',
        lastChecked: new Date(),
        responseTime: 0,
        details: { message: 'No health checks registered' }
      };
    }

    // Determine overall status
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let totalResponseTime = 0;
    const details: Record<string, unknown> = {};

    for (const result of results) {
      totalResponseTime += result.responseTime;
      details[result.name] = {
        status: result.status,
        responseTime: result.responseTime,
        error: result.error
      };

      // Escalate overall status based on individual results
      if (result.status === 'unhealthy') {
        overallStatus = 'unhealthy';
      } else if (result.status === 'degraded' && overallStatus === 'healthy') {
        overallStatus = 'degraded';
      }
    }

    const averageResponseTime = totalResponseTime / results.length;

    return {
      status: overallStatus,
      lastChecked: new Date(),
      responseTime: averageResponseTime,
      details: {
        ...details,
        totalChecks: results.length,
        healthyChecks: results.filter(r => r.status === 'healthy').length,
        degradedChecks: results.filter(r => r.status === 'degraded').length,
        unhealthyChecks: results.filter(r => r.status === 'unhealthy').length
      }
    };
  }

  /**
   * Run health check with timeout and retry logic
   */
  private async runHealthCheckWithTimeout(
    name: string, 
    healthCheckFn: HealthCheckFunction
  ): Promise<HealthCheckResult> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const result = await Promise.race([
          healthCheckFn(),
          this.createTimeoutPromise(name)
        ]);

        // Adjust status based on response time thresholds
        if (result.responseTime > this.config.unhealthyThresholdMs) {
          result.status = 'unhealthy';
          result.details.performanceWarning = `Response time ${result.responseTime}ms exceeds unhealthy threshold ${this.config.unhealthyThresholdMs}ms`;
        } else if (result.responseTime > this.config.degradedThresholdMs) {
          result.status = 'degraded';
          result.details.performanceWarning = `Response time ${result.responseTime}ms exceeds degraded threshold ${this.config.degradedThresholdMs}ms`;
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        Logger.warn(`Health check ${name} failed (attempt ${attempt}/${this.config.retryAttempts}):`, lastError.message);
        
        if (attempt < this.config.retryAttempts) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
      }
    }

    // All attempts failed
    throw lastError || new Error(`Health check ${name} failed after ${this.config.retryAttempts} attempts`);
  }

  /**
   * Create a timeout promise for health checks
   */
  private createTimeoutPromise(name: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Health check ${name} timed out after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);
    });
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<HealthCheckConfig>): void {
    this.config = { ...this.config, ...newConfig };
    Logger.debug('Health monitor configuration updated', this.config);

    // Restart monitoring if interval changed
    if (this.isMonitoring && newConfig.intervalMs) {
      this.stopMonitoring();
      this.startMonitoring();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): HealthCheckConfig {
    return { ...this.config };
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.stopMonitoring();
    this.healthChecks.clear();
    this.lastResults.clear();
    Logger.debug('Health monitor service disposed');
  }
}

/**
 * Create a standard health check function for vector backends
 */
export function createVectorBackendHealthCheck(
  backendName: string,
  testConnection: () => Promise<void>,
  getAdditionalDetails?: () => Promise<Record<string, unknown>>
): HealthCheckFunction {
  return async (): Promise<HealthCheckResult> => {
    const startTime = Date.now();
    const details: Record<string, unknown> = {};

    try {
      // Test basic connectivity
      await testConnection();
      details.connection = 'successful';

      // Get additional details if provided
      if (getAdditionalDetails) {
        const additionalDetails = await getAdditionalDetails();
        Object.assign(details, additionalDetails);
      }

      const responseTime = Date.now() - startTime;

      return {
        name: backendName,
        status: 'healthy',
        responseTime,
        details
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        name: backendName,
        status: 'unhealthy',
        responseTime,
        details,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  };
}

/**
 * Global health monitor instance
 */
export const globalHealthMonitor = new HealthMonitorService();