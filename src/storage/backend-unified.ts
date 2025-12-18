/**
 * Unified Backend Configuration and Factory System
 * 
 * This module consolidates backend-config.ts, backend-factories.ts, 
 * backend-registry.ts, and vector-factory.ts into a single file
 * to meet code simplification metrics.
 * 
 * Only SurrealDB backend is supported per requirement 6.1.
 */

import { VectorStore } from './vector-store.js';
import { SurrealVectorDB } from './vector-db.js';
import { EmbeddingConfig } from './vector-types.js';
import { Logger } from '../utils/logger.js';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

/**
 * Validation result for configuration validation
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Performance configuration settings
 */
export interface PerformanceConfig {
  connectionTimeout: number;
  operationTimeout: number;
  maxRetries: number;
  batchSize: number;
  connectionPoolSize?: number;
}

/**
 * Unified backend configuration model (SurrealDB only)
 */
export interface BackendConfig {
  type: 'surreal';
  connectionParams: Record<string, unknown>;
  embeddingConfig: EmbeddingConfig;
  performanceSettings: PerformanceConfig;
}

/**
 * Backend information
 */
export interface BackendInfo {
  type: string;
  version: string;
  capabilities: {
    supportsBatchOperations: boolean;
    supportsFiltering: boolean;
    supportsMetadataSearch: boolean;
    maxEmbeddingDimension: number;
    supportedDistanceMetrics: string[];
  };
  connectionStatus: string;
  metadata: {
    description: string;
    persistent: boolean;
    requiresExternalService: boolean;
  };
}

// ============================================================================
// CONFIGURATION ADAPTER
// ============================================================================

/**
 * Configuration adapter for SurrealDB backend
 */
export class SurrealBackendConfigAdapter {
  validateConfig(config: BackendConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (config.type !== 'surreal') {
      errors.push(`Expected backend type 'surreal', got '${config.type}'`);
    }
    
    // Validate embedding configuration
    if (config.embeddingConfig.dimension !== undefined && config.embeddingConfig.dimension <= 0) {
      errors.push('Embedding dimension must be greater than 0');
    }
    
    // Validate performance configuration
    if (config.performanceSettings.connectionTimeout <= 0) {
      errors.push('Connection timeout must be greater than 0');
    }
    
    if (config.performanceSettings.operationTimeout <= 0) {
      errors.push('Operation timeout must be greater than 0');
    }
    
    if (config.performanceSettings.maxRetries < 0) {
      errors.push('Max retries must be non-negative');
    }
    
    if (config.performanceSettings.batchSize <= 0) {
      errors.push('Batch size must be greater than 0');
    }
    
    // SurrealDB-specific validation
    const params = config.connectionParams;
    
    if (params.path && typeof params.path !== 'string') {
      errors.push('SurrealDB path must be a string');
    }
    
    if (params.namespace && typeof params.namespace !== 'string') {
      errors.push('SurrealDB namespace must be a string');
    }
    
    if (params.database && typeof params.database !== 'string') {
      errors.push('SurrealDB database name must be a string');
    }
    
    return { valid: errors.length === 0, errors, warnings };
  }
  
  getDefaultConfig(): BackendConfig {
    return {
      type: 'surreal',
      connectionParams: {
        namespace: 'in-memoria',
        database: 'vectors',
        path: 'in-memoria-vectors.db'
      },
      embeddingConfig: {
        model: 'Xenova/all-MiniLM-L6-v2',
        dimension: 384,
        cacheSize: 1000,
        pooling: 'mean',
        normalize: true
      },
      performanceSettings: {
        connectionTimeout: 30000,
        operationTimeout: 30000,
        maxRetries: 3,
        batchSize: 50
      }
    };
  }
  
  mapEnvironmentVariables(): BackendConfig {
    const defaultConfig = this.getDefaultConfig();
    const connectionParams: Record<string, unknown> = { ...defaultConfig.connectionParams };
    const embeddingConfig: EmbeddingConfig = { ...defaultConfig.embeddingConfig };
    const performanceSettings = { ...defaultConfig.performanceSettings };
    
    // Map SurrealDB connection parameters
    if (process.env.SURREAL_PATH) {
      connectionParams.path = process.env.SURREAL_PATH;
    }
    
    if (process.env.SURREAL_NAMESPACE) {
      connectionParams.namespace = process.env.SURREAL_NAMESPACE;
    }
    
    if (process.env.SURREAL_DATABASE) {
      connectionParams.database = process.env.SURREAL_DATABASE;
    }
    
    // Map embedding configuration
    if (process.env.IN_MEMORIA_EMBEDDING_MODEL) {
      embeddingConfig.model = process.env.IN_MEMORIA_EMBEDDING_MODEL;
    }
    
    if (process.env.IN_MEMORIA_EMBEDDING_DIMENSION) {
      embeddingConfig.dimension = parseInt(process.env.IN_MEMORIA_EMBEDDING_DIMENSION, 10);
    }
    
    // Map performance settings
    if (process.env.IN_MEMORIA_BATCH_SIZE) {
      performanceSettings.batchSize = parseInt(process.env.IN_MEMORIA_BATCH_SIZE, 10);
    }
    
    return {
      type: 'surreal',
      connectionParams,
      embeddingConfig,
      performanceSettings
    };
  }
  
  sanitizeForLogging(config: BackendConfig): Record<string, unknown> {
    return {
      type: config.type,
      embeddingConfig: { ...config.embeddingConfig },
      performanceSettings: { ...config.performanceSettings },
      connectionParams: this.sanitizeConnectionParams(config.connectionParams)
    };
  }
  
  private sanitizeConnectionParams(params: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = ['password', 'apikey', 'api_key', 'token', 'secret', 'auth'];
    
    for (const [key, value] of Object.entries(params)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
}
// ============================================================================
// FACTORY AND REGISTRY
// ============================================================================

/**
 * Factory for creating SurrealDB backend instances
 */
export class SurrealBackendFactory {
  private configAdapter = new SurrealBackendConfigAdapter();
  
  create(config: BackendConfig): VectorStore {
    Logger.info(`🔧 Creating SurrealDB backend with config type: ${config.type}`);
    return new SurrealVectorDB(undefined, config.embeddingConfig);
  }
  
  validateConfig(config: BackendConfig): ValidationResult {
    return this.configAdapter.validateConfig(config);
  }
  
  getDefaultConfig(): BackendConfig {
    return this.configAdapter.getDefaultConfig();
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
 * Simplified registry for single backend (SurrealDB only)
 */
export class BackendRegistry {
  private factory = new SurrealBackendFactory();
  
  create(type: string, config: BackendConfig): VectorStore {
    if (type.toLowerCase() !== 'surreal') {
      throw new Error(`Only SurrealDB backend is supported. Requested: ${type}`);
    }
    
    const validation = this.factory.validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }
    
    return this.factory.create(config);
  }
  
  getSupportedTypes(): string[] {
    return ['surreal'];
  }
  
  getBackendInfo(type: string): BackendInfo {
    if (type.toLowerCase() !== 'surreal') {
      throw new Error(`Only SurrealDB backend is supported. Requested: ${type}`);
    }
    return this.factory.getBackendInfo();
  }
  
  isSupported(type: string): boolean {
    return type.toLowerCase() === 'surreal';
  }
  
  validateConfig(type: string, config: BackendConfig): ValidationResult {
    if (type.toLowerCase() !== 'surreal') {
      return {
        valid: false,
        errors: [`Only SurrealDB backend is supported. Requested: ${type}`],
        warnings: []
      };
    }
    return this.factory.validateConfig(config);
  }
}

// ============================================================================
// UNIFIED VECTOR STORE FACTORY
// ============================================================================

/**
 * Create a vector store using single SurrealDB backend (consolidated per requirement 6.1).
 * Multi-backend support has been removed to simplify the architecture.
 */
export function createVectorStore(embeddingConfig?: EmbeddingConfig): VectorStore {
  const defaultEmbeddingConfig: EmbeddingConfig = {
    model: 'Xenova/all-MiniLM-L6-v2',
    dimension: 384,
    cacheSize: 1000,
    pooling: 'mean',
    normalize: true
  };
  
  const resolvedEmbedding = embeddingConfig || defaultEmbeddingConfig;

  Logger.info(`🔧 Creating vector store with single SurrealDB backend (consolidated)`);
  Logger.info(`   Model: ${resolvedEmbedding.model}`);
  Logger.info(`   Dimension: ${resolvedEmbedding.dimension}`);

  try {
    return new SurrealVectorDB(undefined, resolvedEmbedding);
  } catch (error) {
    Logger.error(`Failed to create SurrealDB vector store: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Get information about the single available backend
 */
export function getAvailableBackends(): string[] {
  return ['surreal'];
}

/**
 * Get detailed information about the SurrealDB backend
 */
export function getBackendInfo(backendType: string = 'surreal') {
  if (backendType !== 'surreal') {
    throw new Error(`Only SurrealDB backend is supported. Requested: ${backendType}`);
  }
  
  return {
    type: 'surreal',
    version: '1.0.0',
    capabilities: {
      supportsBatchOperations: true,
      supportsFiltering: true,
      supportsMetadataSearch: true,
      maxEmbeddingDimension: 2048,
      supportedDistanceMetrics: ['cosine', 'euclidean']
    },
    connectionStatus: 'disconnected',
    metadata: {
      description: 'Local SurrealKV vector database',
      persistent: true,
      requiresExternalService: false
    }
  };
}

/**
 * Global registry instance
 */
let globalRegistry: BackendRegistry | null = null;

/**
 * Get the global backend registry instance
 */
export function getBackendRegistry(): BackendRegistry {
  if (!globalRegistry) {
    globalRegistry = new BackendRegistry();
  }
  return globalRegistry;
}

/**
 * Utility function to merge configuration with defaults
 */
export function mergeWithDefaults(
  config: Partial<BackendConfig>, 
  adapter: SurrealBackendConfigAdapter
): BackendConfig {
  const defaults = adapter.getDefaultConfig();
  
  return {
    type: 'surreal',
    connectionParams: { ...defaults.connectionParams, ...config.connectionParams },
    embeddingConfig: { ...defaults.embeddingConfig, ...config.embeddingConfig },
    performanceSettings: { ...defaults.performanceSettings, ...config.performanceSettings }
  };
}

/**
 * Utility function to validate and normalize configuration
 */
export function validateAndNormalizeConfig(
  config: Partial<BackendConfig>
): { config: BackendConfig; validation: ValidationResult } {
  const adapter = new SurrealBackendConfigAdapter();
  const normalizedConfig = mergeWithDefaults({ ...config, type: 'surreal' }, adapter);
  const validation = adapter.validateConfig(normalizedConfig);
  
  return { config: normalizedConfig, validation };
}

// Backward compatibility exports
export { createVectorStore as createEnhancedVectorStore };
export function resetRegistryInitialization(): void {
  // No-op: Single backend implementation doesn't need registry reset
}
export function resetBackendRegistry(): void {
  globalRegistry = null;
}