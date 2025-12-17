/**
 * Backend Configuration Abstraction
 * 
 * This module provides a unified configuration system that abstracts
 * backend-specific configuration parameters and provides type-safe
 * configuration management across all vector backends.
 */

import { EmbeddingConfig } from './vector-types.js';

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
 * Unified backend configuration model
 * 
 * This interface provides a type-safe way to configure any vector backend
 * while hiding backend-specific implementation details.
 */
export interface BackendConfig {
  type: 'surreal' | 'qdrant' | string;
  connectionParams: Record<string, unknown>;
  embeddingConfig: EmbeddingConfig;
  performanceSettings: PerformanceConfig;
}

/**
 * Interface for backend-specific configuration adapters
 * 
 * Each backend implementation should provide an adapter that handles
 * the translation between the unified BackendConfig and backend-specific
 * configuration requirements.
 */
export interface BackendConfigAdapter {
  /**
   * Validate a backend configuration
   * @param config The configuration to validate
   * @returns Validation result with errors and warnings
   */
  validateConfig(config: BackendConfig): ValidationResult;
  
  /**
   * Get default configuration for this backend type
   * @returns Default configuration with sensible defaults
   */
  getDefaultConfig(): BackendConfig;
  
  /**
   * Map environment variables to backend configuration
   * @returns Configuration derived from environment variables
   */
  mapEnvironmentVariables(): BackendConfig;
  
  /**
   * Sanitize configuration for safe logging
   * Removes sensitive information like API keys, passwords, etc.
   * @param config The configuration to sanitize
   * @returns Sanitized configuration safe for logging
   */
  sanitizeForLogging(config: BackendConfig): Record<string, unknown>;
}

/**
 * Base implementation of BackendConfigAdapter with common functionality
 */
export abstract class BaseBackendConfigAdapter implements BackendConfigAdapter {
  abstract validateConfig(config: BackendConfig): ValidationResult;
  abstract getDefaultConfig(): BackendConfig;
  abstract mapEnvironmentVariables(): BackendConfig;
  
  /**
   * Common sanitization logic for all backends
   * Removes sensitive keys and provides safe logging output
   */
  sanitizeForLogging(config: BackendConfig): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {
      type: config.type,
      embeddingConfig: { ...config.embeddingConfig },
      performanceSettings: { ...config.performanceSettings },
      connectionParams: this.sanitizeConnectionParams(config.connectionParams)
    };
    
    return sanitized;
  }
  
  /**
   * Sanitize connection parameters by removing sensitive information
   */
  protected sanitizeConnectionParams(params: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = [
      'password', 'apikey', 'api_key', 'token', 'secret', 'auth', 
      'credential', 'key', 'pass', 'pwd', 'authorization'
    ];
    
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
  
  /**
   * Common validation logic for embedding configuration
   */
  protected validateEmbeddingConfig(embeddingConfig: EmbeddingConfig): string[] {
    const errors: string[] = [];
    
    if (embeddingConfig.dimension !== undefined && embeddingConfig.dimension <= 0) {
      errors.push('Embedding dimension must be greater than 0');
    }
    
    if (embeddingConfig.cacheSize !== undefined && embeddingConfig.cacheSize < 0) {
      errors.push('Embedding cache size must be non-negative');
    }
    
    if (embeddingConfig.pooling && !['mean', 'cls'].includes(embeddingConfig.pooling)) {
      errors.push('Embedding pooling must be either "mean" or "cls"');
    }
    
    return errors;
  }
  
  /**
   * Common validation logic for performance configuration
   */
  protected validatePerformanceConfig(performanceConfig: PerformanceConfig): string[] {
    const errors: string[] = [];
    
    if (performanceConfig.connectionTimeout <= 0) {
      errors.push('Connection timeout must be greater than 0');
    }
    
    if (performanceConfig.operationTimeout <= 0) {
      errors.push('Operation timeout must be greater than 0');
    }
    
    if (performanceConfig.maxRetries < 0) {
      errors.push('Max retries must be non-negative');
    }
    
    if (performanceConfig.batchSize <= 0) {
      errors.push('Batch size must be greater than 0');
    }
    
    if (performanceConfig.connectionPoolSize !== undefined && performanceConfig.connectionPoolSize <= 0) {
      errors.push('Connection pool size must be greater than 0');
    }
    
    return errors;
  }
  
  /**
   * Get default embedding configuration
   */
  protected getDefaultEmbeddingConfig(): EmbeddingConfig {
    return {
      model: 'Xenova/all-MiniLM-L6-v2',
      dimension: 384,
      cacheSize: 1000,
      pooling: 'mean',
      normalize: true
    };
  }
  
  /**
   * Get default performance configuration
   */
  protected getDefaultPerformanceConfig(): PerformanceConfig {
    return {
      connectionTimeout: 30000,
      operationTimeout: 30000,
      maxRetries: 3,
      batchSize: 50,
      connectionPoolSize: 10
    };
  }
}

/**
 * Configuration adapter for SurrealDB backend
 */
export class SurrealBackendConfigAdapter extends BaseBackendConfigAdapter {
  validateConfig(config: BackendConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Validate type
    if (config.type !== 'surreal') {
      errors.push(`Expected backend type 'surreal', got '${config.type}'`);
    }
    
    // Validate embedding configuration
    errors.push(...this.validateEmbeddingConfig(config.embeddingConfig));
    
    // Validate performance configuration
    errors.push(...this.validatePerformanceConfig(config.performanceSettings));
    
    // SurrealDB-specific validation
    const params = config.connectionParams;
    
    // SurrealDB typically uses file-based storage, so validate path if provided
    if (params.path && typeof params.path !== 'string') {
      errors.push('SurrealDB path must be a string');
    }
    
    if (params.namespace && typeof params.namespace !== 'string') {
      errors.push('SurrealDB namespace must be a string');
    }
    
    if (params.database && typeof params.database !== 'string') {
      errors.push('SurrealDB database name must be a string');
    }
    
    // Warn about unused connection pool for file-based SurrealDB
    if (config.performanceSettings.connectionPoolSize && !params.url) {
      warnings.push('Connection pool size is ignored for file-based SurrealDB');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  getDefaultConfig(): BackendConfig {
    return {
      type: 'surreal',
      connectionParams: {
        namespace: 'in-memoria',
        database: 'vectors',
        path: 'in-memoria-vectors.db'
      },
      embeddingConfig: this.getDefaultEmbeddingConfig(),
      performanceSettings: {
        ...this.getDefaultPerformanceConfig(),
        connectionPoolSize: undefined // Not applicable for file-based SurrealDB
      }
    };
  }
  
  mapEnvironmentVariables(): BackendConfig {
    const defaultConfig = this.getDefaultConfig();
    
    // Map SurrealDB-specific environment variables
    const connectionParams: Record<string, unknown> = { ...defaultConfig.connectionParams };
    
    if (process.env.SURREAL_PATH) {
      connectionParams.path = process.env.SURREAL_PATH;
    }
    
    if (process.env.SURREAL_URL) {
      connectionParams.url = process.env.SURREAL_URL;
    }
    
    if (process.env.SURREAL_NAMESPACE) {
      connectionParams.namespace = process.env.SURREAL_NAMESPACE;
    }
    
    if (process.env.SURREAL_DATABASE) {
      connectionParams.database = process.env.SURREAL_DATABASE;
    }
    
    if (process.env.SURREAL_USERNAME) {
      connectionParams.username = process.env.SURREAL_USERNAME;
    }
    
    if (process.env.SURREAL_PASSWORD) {
      connectionParams.password = process.env.SURREAL_PASSWORD;
    }
    
    // Map embedding configuration from environment
    const embeddingConfig = { ...defaultConfig.embeddingConfig };
    if (process.env.IN_MEMORIA_EMBEDDING_MODEL) {
      embeddingConfig.model = process.env.IN_MEMORIA_EMBEDDING_MODEL;
    }
    
    if (process.env.IN_MEMORIA_EMBEDDING_DIMENSION) {
      const dimension = parseInt(process.env.IN_MEMORIA_EMBEDDING_DIMENSION, 10);
      if (!isNaN(dimension)) {
        embeddingConfig.dimension = dimension;
      }
    }
    
    if (process.env.IN_MEMORIA_EMBEDDING_CACHE_SIZE) {
      const cacheSize = parseInt(process.env.IN_MEMORIA_EMBEDDING_CACHE_SIZE, 10);
      if (!isNaN(cacheSize)) {
        embeddingConfig.cacheSize = cacheSize;
      }
    }
    
    if (process.env.IN_MEMORIA_EMBEDDING_POOLING) {
      const pooling = process.env.IN_MEMORIA_EMBEDDING_POOLING.toLowerCase();
      if (['mean', 'cls'].includes(pooling)) {
        embeddingConfig.pooling = pooling as 'mean' | 'cls';
      }
    }
    
    if (process.env.IN_MEMORIA_EMBEDDING_NORMALIZE) {
      embeddingConfig.normalize = process.env.IN_MEMORIA_EMBEDDING_NORMALIZE === 'true';
    }
    
    // Map performance configuration from environment
    const performanceSettings = { ...defaultConfig.performanceSettings };
    if (process.env.IN_MEMORIA_CONNECTION_TIMEOUT) {
      const timeout = parseInt(process.env.IN_MEMORIA_CONNECTION_TIMEOUT, 10);
      if (!isNaN(timeout)) {
        performanceSettings.connectionTimeout = timeout;
      }
    }
    
    if (process.env.IN_MEMORIA_OPERATION_TIMEOUT) {
      const timeout = parseInt(process.env.IN_MEMORIA_OPERATION_TIMEOUT, 10);
      if (!isNaN(timeout)) {
        performanceSettings.operationTimeout = timeout;
      }
    }
    
    if (process.env.IN_MEMORIA_MAX_RETRIES) {
      const retries = parseInt(process.env.IN_MEMORIA_MAX_RETRIES, 10);
      if (!isNaN(retries)) {
        performanceSettings.maxRetries = retries;
      }
    }
    
    if (process.env.IN_MEMORIA_BATCH_SIZE) {
      const batchSize = parseInt(process.env.IN_MEMORIA_BATCH_SIZE, 10);
      if (!isNaN(batchSize)) {
        performanceSettings.batchSize = batchSize;
      }
    }
    
    return {
      type: 'surreal',
      connectionParams,
      embeddingConfig,
      performanceSettings
    };
  }
}

/**
 * Configuration adapter for Qdrant backend
 */
export class QdrantBackendConfigAdapter extends BaseBackendConfigAdapter {
  validateConfig(config: BackendConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Validate type
    if (config.type !== 'qdrant') {
      errors.push(`Expected backend type 'qdrant', got '${config.type}'`);
    }
    
    // Validate embedding configuration
    errors.push(...this.validateEmbeddingConfig(config.embeddingConfig));
    
    // Validate performance configuration
    errors.push(...this.validatePerformanceConfig(config.performanceSettings));
    
    // Qdrant-specific validation
    const params = config.connectionParams;
    
    // Qdrant requires a URL
    if (!params.url || typeof params.url !== 'string') {
      errors.push('Qdrant URL is required and must be a string');
    } else {
      try {
        new URL(params.url as string);
      } catch {
        errors.push('Qdrant URL must be a valid URL');
      }
    }
    
    // Validate collection name
    if (!params.collection || typeof params.collection !== 'string') {
      errors.push('Qdrant collection name is required and must be a string');
    }
    
    // Validate API key if provided
    if (params.apiKey && typeof params.apiKey !== 'string') {
      errors.push('Qdrant API key must be a string');
    }
    
    // Validate timeout settings
    if (params.timeout && (typeof params.timeout !== 'number' || params.timeout <= 0)) {
      errors.push('Qdrant timeout must be a positive number');
    }
    
    // Warn about potential issues
    if (!params.apiKey && params.url && (params.url as string).includes('cloud')) {
      warnings.push('Qdrant Cloud typically requires an API key');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  getDefaultConfig(): BackendConfig {
    return {
      type: 'qdrant',
      connectionParams: {
        url: 'http://localhost:6333',
        collection: 'in-memoria',
        timeout: 30000
      },
      embeddingConfig: this.getDefaultEmbeddingConfig(),
      performanceSettings: this.getDefaultPerformanceConfig()
    };
  }
  
  mapEnvironmentVariables(): BackendConfig {
    const defaultConfig = this.getDefaultConfig();
    
    // Map Qdrant-specific environment variables
    const connectionParams: Record<string, unknown> = { ...defaultConfig.connectionParams };
    
    if (process.env.QDRANT_URL) {
      connectionParams.url = process.env.QDRANT_URL;
    }
    
    if (process.env.QDRANT_API_KEY) {
      connectionParams.apiKey = process.env.QDRANT_API_KEY;
    }
    
    if (process.env.QDRANT_COLLECTION) {
      connectionParams.collection = process.env.QDRANT_COLLECTION;
    }
    
    if (process.env.QDRANT_TIMEOUT) {
      const timeout = parseInt(process.env.QDRANT_TIMEOUT, 10);
      if (!isNaN(timeout)) {
        connectionParams.timeout = timeout;
      }
    }
    
    // Map embedding configuration from environment
    const embeddingConfig = { ...defaultConfig.embeddingConfig };
    if (process.env.IN_MEMORIA_EMBEDDING_MODEL) {
      embeddingConfig.model = process.env.IN_MEMORIA_EMBEDDING_MODEL;
    }
    
    if (process.env.IN_MEMORIA_EMBEDDING_DIMENSION) {
      const dimension = parseInt(process.env.IN_MEMORIA_EMBEDDING_DIMENSION, 10);
      if (!isNaN(dimension)) {
        embeddingConfig.dimension = dimension;
      }
    }
    
    if (process.env.IN_MEMORIA_EMBEDDING_CACHE_SIZE) {
      const cacheSize = parseInt(process.env.IN_MEMORIA_EMBEDDING_CACHE_SIZE, 10);
      if (!isNaN(cacheSize)) {
        embeddingConfig.cacheSize = cacheSize;
      }
    }
    
    if (process.env.IN_MEMORIA_EMBEDDING_POOLING) {
      const pooling = process.env.IN_MEMORIA_EMBEDDING_POOLING.toLowerCase();
      if (['mean', 'cls'].includes(pooling)) {
        embeddingConfig.pooling = pooling as 'mean' | 'cls';
      }
    }
    
    if (process.env.IN_MEMORIA_EMBEDDING_NORMALIZE) {
      embeddingConfig.normalize = process.env.IN_MEMORIA_EMBEDDING_NORMALIZE === 'true';
    }
    
    // Map performance configuration from environment
    const performanceSettings = { ...defaultConfig.performanceSettings };
    if (process.env.IN_MEMORIA_CONNECTION_TIMEOUT) {
      const timeout = parseInt(process.env.IN_MEMORIA_CONNECTION_TIMEOUT, 10);
      if (!isNaN(timeout)) {
        performanceSettings.connectionTimeout = timeout;
      }
    }
    
    if (process.env.IN_MEMORIA_OPERATION_TIMEOUT) {
      const timeout = parseInt(process.env.IN_MEMORIA_OPERATION_TIMEOUT, 10);
      if (!isNaN(timeout)) {
        performanceSettings.operationTimeout = timeout;
      }
    }
    
    if (process.env.IN_MEMORIA_MAX_RETRIES) {
      const retries = parseInt(process.env.IN_MEMORIA_MAX_RETRIES, 10);
      if (!isNaN(retries)) {
        performanceSettings.maxRetries = retries;
      }
    }
    
    if (process.env.IN_MEMORIA_BATCH_SIZE) {
      const batchSize = parseInt(process.env.IN_MEMORIA_BATCH_SIZE, 10);
      if (!isNaN(batchSize)) {
        performanceSettings.batchSize = batchSize;
      }
    }
    
    if (process.env.IN_MEMORIA_CONNECTION_POOL_SIZE) {
      const poolSize = parseInt(process.env.IN_MEMORIA_CONNECTION_POOL_SIZE, 10);
      if (!isNaN(poolSize)) {
        performanceSettings.connectionPoolSize = poolSize;
      }
    }
    
    return {
      type: 'qdrant',
      connectionParams,
      embeddingConfig,
      performanceSettings
    };
  }
}

/**
 * Configuration adapter for Mock backend
 */
export class MockBackendConfigAdapter extends BaseBackendConfigAdapter {
  
  validateConfig(config: BackendConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Validate embedding configuration
    if (config.embeddingConfig) {
      if (config.embeddingConfig.dimension && config.embeddingConfig.dimension <= 0) {
        errors.push('Embedding dimension must be positive');
      }
      if (config.embeddingConfig.dimension && config.embeddingConfig.dimension > 4096) {
        warnings.push('Large embedding dimensions may impact performance');
      }
    }
    
    // Validate performance settings
    if (config.performanceSettings) {
      if (config.performanceSettings.connectionTimeout && config.performanceSettings.connectionTimeout <= 0) {
        errors.push('Connection timeout must be positive');
      }
      if (config.performanceSettings.operationTimeout && config.performanceSettings.operationTimeout <= 0) {
        errors.push('Operation timeout must be positive');
      }
      if (config.performanceSettings.maxRetries && config.performanceSettings.maxRetries < 0) {
        errors.push('Max retries cannot be negative');
      }
      if (config.performanceSettings.batchSize && config.performanceSettings.batchSize <= 0) {
        errors.push('Batch size must be positive');
      }
    }
    
    // Validate mock-specific connection parameters
    if (config.connectionParams) {
      const maxDocs = config.connectionParams.maxDocuments;
      if (typeof maxDocs === 'number' && maxDocs <= 0) {
        errors.push('Max documents must be positive');
      }
      const failureRate = config.connectionParams.failureRate;
      if (typeof failureRate === 'number' && (failureRate < 0 || failureRate > 1)) {
        errors.push('Failure rate must be between 0 and 1');
      }
      const operationDelay = config.connectionParams.operationDelay;
      if (typeof operationDelay === 'number' && operationDelay < 0) {
        errors.push('Operation delay cannot be negative');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  getDefaultConfig(): BackendConfig {
    return {
      type: 'mock',
      connectionParams: {
        simulateDelay: false,
        operationDelay: 10,
        simulateFailures: false,
        failureRate: 0.1,
        maxDocuments: 10000,
        trackMetrics: true,
        supportsBatchOperations: true,
        supportsFiltering: true,
        supportsMetadataSearch: true,
        maxEmbeddingDimension: 4096,
        supportedDistanceMetrics: ['cosine', 'euclidean', 'dot']
      },
      embeddingConfig: {
        model: 'mock-model',
        dimension: 384,
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
  
  mapEnvironmentVariables(): BackendConfig {
    const connectionParams: Record<string, unknown> = {};
    const embeddingConfig: Record<string, unknown> = {};
    const performanceSettings: Record<string, unknown> = {};
    
    // Mock-specific environment variables
    if (process.env.IN_MEMORIA_MOCK_SIMULATE_DELAY) {
      connectionParams.simulateDelay = process.env.IN_MEMORIA_MOCK_SIMULATE_DELAY === 'true';
    }
    if (process.env.IN_MEMORIA_MOCK_OPERATION_DELAY) {
      connectionParams.operationDelay = parseInt(process.env.IN_MEMORIA_MOCK_OPERATION_DELAY, 10);
    }
    if (process.env.IN_MEMORIA_MOCK_SIMULATE_FAILURES) {
      connectionParams.simulateFailures = process.env.IN_MEMORIA_MOCK_SIMULATE_FAILURES === 'true';
    }
    if (process.env.IN_MEMORIA_MOCK_FAILURE_RATE) {
      connectionParams.failureRate = parseFloat(process.env.IN_MEMORIA_MOCK_FAILURE_RATE);
    }
    if (process.env.IN_MEMORIA_MOCK_MAX_DOCUMENTS) {
      connectionParams.maxDocuments = parseInt(process.env.IN_MEMORIA_MOCK_MAX_DOCUMENTS, 10);
    }
    if (process.env.IN_MEMORIA_MOCK_TRACK_METRICS) {
      connectionParams.trackMetrics = process.env.IN_MEMORIA_MOCK_TRACK_METRICS === 'true';
    }
    
    // Standard embedding configuration
    if (process.env.IN_MEMORIA_EMBEDDING_MODEL) {
      embeddingConfig.model = process.env.IN_MEMORIA_EMBEDDING_MODEL;
    }
    if (process.env.IN_MEMORIA_EMBEDDING_DIMENSION) {
      embeddingConfig.dimension = parseInt(process.env.IN_MEMORIA_EMBEDDING_DIMENSION, 10);
    }
    if (process.env.IN_MEMORIA_EMBEDDING_CACHE_SIZE) {
      embeddingConfig.cacheSize = parseInt(process.env.IN_MEMORIA_EMBEDDING_CACHE_SIZE, 10);
    }
    if (process.env.IN_MEMORIA_EMBEDDING_POOLING) {
      embeddingConfig.pooling = process.env.IN_MEMORIA_EMBEDDING_POOLING;
    }
    if (process.env.IN_MEMORIA_EMBEDDING_NORMALIZE) {
      embeddingConfig.normalize = process.env.IN_MEMORIA_EMBEDDING_NORMALIZE === 'true';
    }
    
    // Standard performance settings
    if (process.env.IN_MEMORIA_CONNECTION_TIMEOUT) {
      performanceSettings.connectionTimeout = parseInt(process.env.IN_MEMORIA_CONNECTION_TIMEOUT, 10);
    }
    if (process.env.IN_MEMORIA_OPERATION_TIMEOUT) {
      performanceSettings.operationTimeout = parseInt(process.env.IN_MEMORIA_OPERATION_TIMEOUT, 10);
    }
    if (process.env.IN_MEMORIA_MAX_RETRIES) {
      performanceSettings.maxRetries = parseInt(process.env.IN_MEMORIA_MAX_RETRIES, 10);
    }
    if (process.env.IN_MEMORIA_BATCH_SIZE) {
      performanceSettings.batchSize = parseInt(process.env.IN_MEMORIA_BATCH_SIZE, 10);
    }
    
    return {
      type: 'mock',
      connectionParams,
      embeddingConfig,
      performanceSettings: performanceSettings as PerformanceConfig
    };
  }
  
  sanitizeForLogging(config: BackendConfig): Record<string, unknown> {
    const sanitized = JSON.parse(JSON.stringify(config));
    
    // Mock backend doesn't have sensitive information to sanitize,
    // but we follow the pattern for consistency
    if (sanitized.connectionParams) {
      // No sensitive fields to redact for mock backend
    }
    
    return sanitized;
  }
}

/**
 * Factory function to create appropriate configuration adapter for a backend type
 */
export function createBackendConfigAdapter(backendType: string): BackendConfigAdapter {
  switch (backendType.toLowerCase()) {
    case 'surreal':
    case 'surrealdb':
      return new SurrealBackendConfigAdapter();
    
    case 'qdrant':
      return new QdrantBackendConfigAdapter();
    
    case 'mock':
      return new MockBackendConfigAdapter();
    
    default:
      throw new Error(`Unsupported backend type: ${backendType}`);
  }
}

/**
 * Utility function to merge configuration with defaults
 */
export function mergeWithDefaults(
  config: Partial<BackendConfig>, 
  adapter: BackendConfigAdapter
): BackendConfig {
  const defaults = adapter.getDefaultConfig();
  
  return {
    type: config.type || defaults.type,
    connectionParams: { ...defaults.connectionParams, ...config.connectionParams },
    embeddingConfig: { ...defaults.embeddingConfig, ...config.embeddingConfig },
    performanceSettings: { ...defaults.performanceSettings, ...config.performanceSettings }
  };
}

/**
 * Utility function to validate and normalize configuration
 */
export function validateAndNormalizeConfig(
  config: Partial<BackendConfig>,
  backendType?: string
): { config: BackendConfig; validation: ValidationResult } {
  const type = backendType || config.type || 'surreal';
  const adapter = createBackendConfigAdapter(type);
  const normalizedConfig = mergeWithDefaults({ ...config, type }, adapter);
  const validation = adapter.validateConfig(normalizedConfig);
  
  return { config: normalizedConfig, validation };
}