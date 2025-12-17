import { VectorStore, BackendInfo, BackendCapabilities } from './vector-store.js';
import { BackendConfig } from './backend-config.js';
import { BaseBackendFactory } from './backend-registry.js';
import { SurrealBackendAdapter } from './backend-adapters.js';
import { QdrantBackendAdapter } from './backend-adapters.js';
import { Logger } from '../utils/logger.js';

/**
 * Factory for creating SurrealDB backend instances
 */
export class SurrealBackendFactory extends BaseBackendFactory {
  constructor() {
    super('surreal');
  }
  
  create(config: BackendConfig): VectorStore {
    Logger.info(`🔧 Creating SurrealDB backend with config type: ${config.type}`);
    return new SurrealBackendAdapter(config);
  }
  
  getBackendInfo(): BackendInfo {
    return {
      type: 'surreal',
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
        description: 'Local SurrealKV vector database',
        persistent: true,
        requiresExternalService: false
      }
    };
  }
}

/**
 * Factory for creating Qdrant backend instances
 */
export class QdrantBackendFactory extends BaseBackendFactory {
  constructor() {
    super('qdrant');
  }
  
  create(config: BackendConfig): VectorStore {
    Logger.info(`🔧 Creating Qdrant backend with config type: ${config.type}`);
    return new QdrantBackendAdapter(config);
  }
  
  getBackendInfo(): BackendInfo {
    return {
      type: 'qdrant',
      version: '1.0.0',
      capabilities: {
        supportsBatchOperations: true,
        supportsFiltering: true,
        supportsMetadataSearch: true,
        maxEmbeddingDimension: 65536,
        supportedDistanceMetrics: ['cosine', 'euclidean', 'dot', 'manhattan']
      },
      connectionStatus: 'disconnected',
      metadata: {
        description: 'Qdrant vector database',
        persistent: true,
        requiresExternalService: true,
        scalable: true
      }
    };
  }
}

/**
 * Initialize and register all built-in backend factories
 */
export function registerBuiltinBackends(registry: any): void {
  // Register SurrealDB factory
  const surrealFactory = new SurrealBackendFactory();
  registry.register('surreal', surrealFactory);
  registry.register('surrealdb', surrealFactory); // Alias
  
  // Register Qdrant factory
  const qdrantFactory = new QdrantBackendFactory();
  registry.register('qdrant', qdrantFactory);
  
  Logger.info('🔧 Registered built-in backend factories: surreal, qdrant');
}