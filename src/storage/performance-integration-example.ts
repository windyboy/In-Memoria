/**
 * Performance Monitoring Integration Example
 * 
 * This example demonstrates how to integrate the performance monitoring system
 * with vector backend implementations.
 */

import { Logger } from '../utils/logger.js';
import { 
  createEnhancedBackendAdapter,
  createPerformanceMonitor,
  createVectorBackendHealthCheck,
  globalHealthMonitor,
  globalPerformanceOptimizer,
  BackendConfig
} from './vector-store.js';

/**
 * Example of setting up comprehensive performance monitoring for a vector backend
 */
export async function setupPerformanceMonitoringExample(): Promise<void> {
  Logger.info('🚀 Setting up performance monitoring example...');

  // 1. Create a backend configuration
  const config: BackendConfig = {
    type: 'surreal',
    connectionParams: {},
    embeddingConfig: {
      model: 'Xenova/all-MiniLM-L6-v2',
      dimension: 384
    },
    performanceSettings: {
      connectionTimeout: 5000,
      operationTimeout: 30000,
      maxRetries: 3,
      batchSize: 100
    }
  };

  // 2. Create an enhanced backend adapter with built-in performance monitoring
  const vectorStore = createEnhancedBackendAdapter(config);

  // 3. Set up additional performance monitoring
  const performanceMonitor = createPerformanceMonitor('example-backend', {
    enableAutoHealthCheck: true,
    healthCheckIntervalMs: 30000
  });

  // 4. Register health checks with the global health monitor
  const healthCheckFn = createVectorBackendHealthCheck(
    'example-vector-backend',
    async () => {
      // Test basic connectivity
      await vectorStore.getCollectionStats();
    },
    async () => {
      // Get additional health details
      const backendInfo = vectorStore.getBackendInfo();
      const performanceMetrics = await vectorStore.getPerformanceMetrics();
      
      return {
        backendType: backendInfo.type,
        connectionStatus: backendInfo.connectionStatus,
        memoryUsage: `${Math.round(performanceMetrics.memoryUsage / 1024 / 1024)}MB`,
        operationCount: Object.values(performanceMetrics.operationCounts).reduce((sum, count) => sum + count, 0)
      };
    }
  );

  globalHealthMonitor.registerHealthCheck('example-vector-backend', healthCheckFn);

  // 5. Start monitoring services
  globalHealthMonitor.startMonitoring();
  globalPerformanceOptimizer.startOptimization(async () => {
    return await vectorStore.getPerformanceMetrics();
  });

  // 6. Demonstrate usage with performance tracking
  try {
    Logger.info('📊 Initializing vector store...');
    await vectorStore.initialize('performance-example');

    Logger.info('🔍 Verifying embedding model...');
    await vectorStore.verifyEmbeddingModel();

    // Simulate some operations
    Logger.info('💾 Storing sample embeddings...');
    for (let i = 0; i < 5; i++) {
      await vectorStore.storeCodeEmbedding(
        `function example${i}() { return ${i}; }`,
        {
          id: `example-${i}`,
          filePath: `example${i}.js`,
          language: 'javascript',
          complexity: 1,
          lineCount: 1,
          lastModified: new Date()
        }
      );
    }

    Logger.info('🔎 Performing similarity searches...');
    const results = await vectorStore.findSimilarCode('function example', 3);
    Logger.info(`Found ${results.length} similar code snippets`);

    // 7. Get and display performance metrics
    Logger.info('📈 Performance Metrics:');
    const metrics = await vectorStore.getPerformanceMetrics();
    console.log('Operation Counts:', metrics.operationCounts);
    console.log('Average Response Times:', metrics.averageResponseTimes);
    console.log('Error Rates:', metrics.errorRates);
    console.log('Memory Usage:', `${Math.round(metrics.memoryUsage / 1024 / 1024)}MB`);

    // 8. Get and display health status
    Logger.info('🏥 Health Status:');
    const healthStatus = await vectorStore.getHealthStatus();
    console.log('Status:', healthStatus.status);
    console.log('Response Time:', `${healthStatus.responseTime}ms`);
    console.log('Details:', healthStatus.details);

    // 9. Get overall system health
    Logger.info('🌐 Overall System Health:');
    const overallHealth = globalHealthMonitor.getOverallHealthStatus();
    console.log('Overall Status:', overallHealth.status);
    console.log('Total Checks:', overallHealth.details.totalChecks);
    console.log('Healthy Checks:', overallHealth.details.healthyChecks);

    // 10. Check for optimization opportunities
    Logger.info('⚡ Optimization Check:');
    const optimizationResults = await globalPerformanceOptimizer.checkAndApplyOptimizations(metrics);
    if (optimizationResults.length > 0) {
      console.log('Optimizations Applied:', optimizationResults.map(r => r.ruleName));
    } else {
      console.log('No optimizations needed at this time');
    }

  } catch (error) {
    Logger.error('❌ Error during performance monitoring example:', error);
  } finally {
    // 11. Cleanup
    Logger.info('🧹 Cleaning up...');
    await vectorStore.close();
    performanceMonitor.dispose();
    globalHealthMonitor.stopMonitoring();
    globalPerformanceOptimizer.stopOptimization();
  }

  Logger.info('✅ Performance monitoring example completed');
}

/**
 * Example of custom performance optimization rules
 */
export function setupCustomOptimizationRules(): void {
  Logger.info('🔧 Setting up custom optimization rules...');

  // Custom rule for embedding cache optimization
  globalPerformanceOptimizer.registerOptimizationRule({
    name: 'embedding-cache-optimization',
    description: 'Optimize embedding cache when hit rate is low',
    condition: (metrics) => {
      const embeddingCacheHitRate = metrics.cacheHitRates.embeddingCache || 0;
      return embeddingCacheHitRate < 0.6; // < 60% hit rate
    },
    action: () => {
      Logger.info('💡 Suggestion: Consider increasing embedding cache size or reviewing cache eviction policy');
    },
    priority: 'medium',
    enabled: true
  });

  // Custom rule for batch operation optimization
  globalPerformanceOptimizer.registerOptimizationRule({
    name: 'batch-operation-optimization',
    description: 'Suggest batch operations when many individual operations are detected',
    condition: (metrics) => {
      const storeOperations = metrics.operationCounts.storeCodeEmbedding || 0;
      const batchOperations = metrics.operationCounts.storeMultipleEmbeddings || 0;
      return storeOperations > 10 && batchOperations === 0;
    },
    action: () => {
      Logger.info('💡 Suggestion: Consider using batch operations (storeMultipleEmbeddings) for better performance');
    },
    priority: 'low',
    enabled: true
  });

  // Custom rule for connection pool optimization
  globalPerformanceOptimizer.registerOptimizationRule({
    name: 'connection-pool-optimization',
    description: 'Optimize connection pool settings',
    condition: (metrics) => {
      const avgResponseTime = Object.values(metrics.averageResponseTimes).reduce((sum, time) => sum + time, 0) / 
                             Object.values(metrics.averageResponseTimes).length;
      return avgResponseTime > 2000; // > 2 seconds average
    },
    action: () => {
      Logger.info('💡 Suggestion: Consider optimizing connection pool settings or scaling backend resources');
    },
    priority: 'high',
    enabled: true
  });

  Logger.info('✅ Custom optimization rules configured');
}

/**
 * Run the complete performance monitoring example
 */
export async function runPerformanceMonitoringExample(): Promise<void> {
  try {
    setupCustomOptimizationRules();
    await setupPerformanceMonitoringExample();
  } catch (error) {
    Logger.error('Failed to run performance monitoring example:', error);
  }
}

// Note: Functions are already exported above, no need to re-export