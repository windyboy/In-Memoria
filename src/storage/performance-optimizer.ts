/**
 * Performance Optimization Detection and Management
 * 
 * This module provides automatic detection of performance optimization opportunities
 * and transparent application of optimizations for vector backend operations.
 */

import { Logger } from '../utils/logger.js';
import { PerformanceMetrics } from './vector-store.js';

export interface OptimizationRule {
  name: string;
  description: string;
  condition: (metrics: PerformanceMetrics) => boolean;
  action: () => Promise<void> | void;
  priority: 'low' | 'medium' | 'high';
  enabled: boolean;
}

export interface OptimizationResult {
  ruleName: string;
  applied: boolean;
  error?: string;
  timestamp: Date;
  impact?: string;
}

export interface OptimizationConfig {
  enabled: boolean;
  autoApply: boolean;
  checkIntervalMs: number;
  maxOptimizationsPerInterval: number;
  cooldownMs: number;
}

/**
 * Performance optimizer that detects and applies optimizations automatically
 */
export class PerformanceOptimizer {
  private optimizationRules = new Map<string, OptimizationRule>();
  private optimizationHistory: OptimizationResult[] = [];
  private lastOptimizationTime = new Map<string, number>();
  private optimizationInterval?: NodeJS.Timeout;
  private isRunning = false;

  constructor(
    private config: OptimizationConfig = {
      enabled: true,
      autoApply: true,
      checkIntervalMs: 60000, // 1 minute
      maxOptimizationsPerInterval: 3,
      cooldownMs: 300000 // 5 minutes
    }
  ) {
    this.registerDefaultOptimizationRules();
    Logger.debug('Performance optimizer initialized', config);
  }

  /**
   * Register an optimization rule
   */
  registerOptimizationRule(rule: OptimizationRule): void {
    this.optimizationRules.set(rule.name, rule);
    Logger.debug(`Optimization rule registered: ${rule.name}`);
  }

  /**
   * Unregister an optimization rule
   */
  unregisterOptimizationRule(name: string): void {
    this.optimizationRules.delete(name);
    this.lastOptimizationTime.delete(name);
    Logger.debug(`Optimization rule unregistered: ${name}`);
  }

  /**
   * Start automatic optimization monitoring
   */
  startOptimization(getMetrics: () => Promise<PerformanceMetrics>): void {
    if (this.isRunning || !this.config.enabled) {
      return;
    }

    this.isRunning = true;
    this.optimizationInterval = setInterval(async () => {
      try {
        const metrics = await getMetrics();
        await this.checkAndApplyOptimizations(metrics);
      } catch (error) {
        Logger.warn('Error during optimization check:', error);
      }
    }, this.config.checkIntervalMs);

    Logger.info(`Performance optimization started (interval: ${this.config.checkIntervalMs}ms)`);
  }

  /**
   * Stop automatic optimization monitoring
   */
  stopOptimization(): void {
    if (this.optimizationInterval) {
      clearInterval(this.optimizationInterval);
      this.optimizationInterval = undefined;
    }
    this.isRunning = false;
    Logger.info('Performance optimization stopped');
  }

  /**
   * Check and apply optimizations based on current metrics
   */
  async checkAndApplyOptimizations(metrics: PerformanceMetrics): Promise<OptimizationResult[]> {
    const results: OptimizationResult[] = [];
    const now = Date.now();
    let optimizationsApplied = 0;

    // Sort rules by priority (high -> medium -> low)
    const sortedRules = Array.from(this.optimizationRules.values())
      .filter(rule => rule.enabled)
      .sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      });

    for (const rule of sortedRules) {
      // Check cooldown period
      const lastOptimization = this.lastOptimizationTime.get(rule.name) || 0;
      if (now - lastOptimization < this.config.cooldownMs) {
        continue;
      }

      // Check if optimization limit reached
      if (optimizationsApplied >= this.config.maxOptimizationsPerInterval) {
        break;
      }

      // Check if rule condition is met
      if (!rule.condition(metrics)) {
        continue;
      }

      const result: OptimizationResult = {
        ruleName: rule.name,
        applied: false,
        timestamp: new Date()
      };

      try {
        if (this.config.autoApply) {
          Logger.info(`Applying optimization: ${rule.name} - ${rule.description}`);
          await rule.action();
          result.applied = true;
          result.impact = 'Optimization applied successfully';
          this.lastOptimizationTime.set(rule.name, now);
          optimizationsApplied++;
        } else {
          Logger.info(`Optimization opportunity detected: ${rule.name} - ${rule.description}`);
          result.impact = 'Optimization detected but not auto-applied';
        }
      } catch (error) {
        result.error = error instanceof Error ? error.message : String(error);
        Logger.warn(`Failed to apply optimization ${rule.name}:`, result.error);
      }

      results.push(result);
      this.optimizationHistory.push(result);
    }

    // Keep only last 100 optimization results
    if (this.optimizationHistory.length > 100) {
      this.optimizationHistory = this.optimizationHistory.slice(-100);
    }

    return results;
  }

  /**
   * Get optimization history
   */
  getOptimizationHistory(): OptimizationResult[] {
    return [...this.optimizationHistory];
  }

  /**
   * Get available optimization rules
   */
  getOptimizationRules(): Map<string, OptimizationRule> {
    return new Map(this.optimizationRules);
  }

  /**
   * Enable or disable a specific optimization rule
   */
  setRuleEnabled(ruleName: string, enabled: boolean): void {
    const rule = this.optimizationRules.get(ruleName);
    if (rule) {
      rule.enabled = enabled;
      Logger.debug(`Optimization rule ${ruleName} ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<OptimizationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    Logger.debug('Performance optimizer configuration updated', this.config);
  }

  /**
   * Register default optimization rules
   */
  private registerDefaultOptimizationRules(): void {
    // High memory usage optimization
    this.registerOptimizationRule({
      name: 'high-memory-usage',
      description: 'Trigger garbage collection when memory usage is high',
      condition: (metrics) => metrics.memoryUsage > 500 * 1024 * 1024, // > 500MB
      action: () => {
        if (global.gc) {
          global.gc();
          Logger.info('Garbage collection triggered due to high memory usage');
        }
      },
      priority: 'high',
      enabled: true
    });

    // High error rate optimization
    this.registerOptimizationRule({
      name: 'high-error-rate',
      description: 'Log warning when error rates are high',
      condition: (metrics) => {
        const errorRates = Object.values(metrics.errorRates);
        return errorRates.some(rate => rate > 0.1); // > 10% error rate
      },
      action: () => {
        Logger.warn('High error rate detected - consider investigating backend health');
      },
      priority: 'medium',
      enabled: true
    });

    // Slow response time optimization
    this.registerOptimizationRule({
      name: 'slow-response-times',
      description: 'Log warning when response times are slow',
      condition: (metrics) => {
        const responseTimes = Object.values(metrics.averageResponseTimes);
        return responseTimes.some(time => time > 5000); // > 5 seconds
      },
      action: () => {
        Logger.warn('Slow response times detected - consider optimizing queries or scaling resources');
      },
      priority: 'medium',
      enabled: true
    });

    // Low cache hit rate optimization
    this.registerOptimizationRule({
      name: 'low-cache-hit-rate',
      description: 'Log suggestion when cache hit rates are low',
      condition: (metrics) => {
        const cacheHitRates = Object.values(metrics.cacheHitRates);
        return cacheHitRates.some(rate => rate < 0.5); // < 50% hit rate
      },
      action: () => {
        Logger.info('Low cache hit rate detected - consider increasing cache size or reviewing cache strategy');
      },
      priority: 'low',
      enabled: true
    });

    // Memory leak detection
    this.registerOptimizationRule({
      name: 'memory-leak-detection',
      description: 'Detect potential memory leaks',
      condition: (metrics) => {
        // This is a simplified check - in practice, you'd track memory growth over time
        return metrics.memoryUsage > 1024 * 1024 * 1024; // > 1GB
      },
      action: () => {
        Logger.warn('Potential memory leak detected - memory usage is very high');
      },
      priority: 'high',
      enabled: true
    });

    // Connection pool optimization
    this.registerOptimizationRule({
      name: 'connection-pool-optimization',
      description: 'Suggest connection pool adjustments',
      condition: (metrics) => {
        // Check if we have connection-related metrics
        const hasConnectionMetrics = Object.keys(metrics.operationCounts).some(key => 
          key.includes('connection') || key.includes('pool')
        );
        return hasConnectionMetrics && Object.values(metrics.errorRates).some(rate => rate > 0.05);
      },
      action: () => {
        Logger.info('Consider adjusting connection pool settings to reduce connection errors');
      },
      priority: 'medium',
      enabled: true
    });
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.stopOptimization();
    this.optimizationRules.clear();
    this.optimizationHistory.length = 0;
    this.lastOptimizationTime.clear();
    Logger.debug('Performance optimizer disposed');
  }
}

/**
 * Create a performance optimizer with custom rules
 */
export function createPerformanceOptimizer(
  config?: Partial<OptimizationConfig>,
  customRules?: OptimizationRule[]
): PerformanceOptimizer {
  const defaultConfig: OptimizationConfig = {
    enabled: true,
    autoApply: true,
    checkIntervalMs: 60000,
    maxOptimizationsPerInterval: 3,
    cooldownMs: 300000
  };
  
  const mergedConfig = config ? { ...defaultConfig, ...config } : defaultConfig;
  const optimizer = new PerformanceOptimizer(mergedConfig);
  
  if (customRules) {
    for (const rule of customRules) {
      optimizer.registerOptimizationRule(rule);
    }
  }
  
  return optimizer;
}

/**
 * Global performance optimizer instance
 */
export const globalPerformanceOptimizer = new PerformanceOptimizer();