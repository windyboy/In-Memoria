/**
 * Factory for creating MockVectorDB backend instances
 * 
 * This factory demonstrates how new backends can be integrated into the
 * In-Memoria system through the registry pattern without modifying existing code.
 */

import { VectorStore, BackendInfo, BackendCapabilities } from './vector-store.js';
import { BackendConfig } from './backend-config.js';
import { BaseBackendFactory } from './backend-registry.js';
import { MockVectorDB, MockVectorDBConfig } from './mock-vector-db.js';
import { Logger } from '../utils/logger.js';

/**
 * Factory for creating MockVectorDB backend instances
 */
export class MockBackendFactory extends BaseBackendFactory {
  constructor() {
    super('mock');
  }
  
  create(config: BackendConfig): VectorStore {
    Logger.info(`🧪 Creating MockVectorDB backend with config type: ${config.type}`);
    
    // Extract mock-specific configuration from the backend config
    const mockConfig: MockVectorDBConfig = {
      simulateDelay: this.getBooleanParam(config.connectionParams, 'simulateDelay', false),
      operationDelay: this.getNumberParam(config.connectionParams, 'operationDelay', 10),
      simulateFailures: this.getBooleanParam(config.connectionParams, 'simulateFailures', false),
      failureRate: this.getNumberParam(config.connectionParams, 'failureRate', 0.1),
      maxDocuments: this.getNumberParam(config.connectionParams, 'maxDocuments', 10000),
      trackMetrics: this.getBooleanParam(config.connectionParams, 'trackMetrics', true),
      embeddingDimension: config.embeddingConfig.dimension || 384,
      capabilities: {
        supportsBatchOperations: this.getBooleanParam(config.connectionParams, 'supportsBatchOperations', true),
        supportsFiltering: this.getBooleanParam(config.connectionParams, 'supportsFiltering', true),
        supportsMetadataSearch: this.getBooleanParam(config.connectionParams, 'supportsMetadataSearch', true),
        maxEmbeddingDimension: this.getNumberParam(config.connectionParams, 'maxEmbeddingDimension', 4096),
        supportedDistanceMetrics: this.getArrayParam(config.connectionParams, 'supportedDistanceMetrics', ['cosine', 'euclidean', 'dot'])
      }
    };
    
    return new MockVectorDB(config.embeddingConfig, mockConfig);
  }
  
  getBackendInfo(): BackendInfo {
    return {
      type: 'mock',
      version: '1.0.0',
      capabilities: {
        supportsBatchOperations: true,
        supportsFiltering: true,
        supportsMetadataSearch: true,
        maxEmbeddingDimension: 4096,
        supportedDistanceMetrics: ['cosine', 'euclidean', 'dot']
      },
      connectionStatus: 'disconnected',
      metadata: {
        description: 'Mock vector database for testing extensibility',
        persistent: false,
        requiresExternalService: false,
        configurable: true,
        testingFeatures: {
          simulateDelay: 'Configurable operation delays',
          simulateFailures: 'Configurable failure simulation',
          trackMetrics: 'Detailed performance tracking',
          maxDocuments: 'Configurable document limits'
        }
      }
    };
  }
  
  // Helper methods to safely extract configuration parameters
  private getBooleanParam(params: Record<string, unknown>, key: string, defaultValue: boolean): boolean {
    const value = params[key];
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return defaultValue;
  }
  
  private getNumberParam(params: Record<string, unknown>, key: string, defaultValue: number): number {
    const value = params[key];
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? defaultValue : parsed;
    }
    return defaultValue;
  }
  
  private getArrayParam(params: Record<string, unknown>, key: string, defaultValue: string[]): string[] {
    const value = params[key];
    if (Array.isArray(value)) {
      return value.filter(item => typeof item === 'string');
    }
    if (typeof value === 'string') {
      return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }
    return defaultValue;
  }
}

/**
 * Register the mock backend factory with the global registry
 */
export function registerMockBackend(registry: any): void {
  const mockFactory = new MockBackendFactory();
  registry.register('mock', mockFactory);
  Logger.info('🧪 Registered MockVectorDB backend factory');
}

/**
 * Create a mock backend configuration for testing
 */
export function createMockBackendConfig(overrides: Partial<MockVectorDBConfig> = {}): BackendConfig {
  return {
    type: 'mock',
    connectionParams: {
      simulateDelay: overrides.simulateDelay ?? false,
      operationDelay: overrides.operationDelay ?? 10,
      simulateFailures: overrides.simulateFailures ?? false,
      failureRate: overrides.failureRate ?? 0.1,
      maxDocuments: overrides.maxDocuments ?? 10000,
      trackMetrics: overrides.trackMetrics ?? true,
      supportsBatchOperations: overrides.capabilities?.supportsBatchOperations ?? true,
      supportsFiltering: overrides.capabilities?.supportsFiltering ?? true,
      supportsMetadataSearch: overrides.capabilities?.supportsMetadataSearch ?? true,
      maxEmbeddingDimension: overrides.capabilities?.maxEmbeddingDimension ?? 4096,
      supportedDistanceMetrics: overrides.capabilities?.supportedDistanceMetrics ?? ['cosine', 'euclidean', 'dot']
    },
    embeddingConfig: {
      model: 'mock-model',
      dimension: overrides.embeddingDimension ?? 384,
      cacheSize: 1000,
      pooling: 'mean',
      normalize: true
    },
    performanceSettings: {
      connectionTimeout: 30000,
      operationTimeout: 30000,
      maxRetries: 3,
      batchSize: 100
    }
  };
}