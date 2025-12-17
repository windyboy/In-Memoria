import { VectorStore, BackendInfo } from './vector-store.js';
import { 
  BackendConfig, 
  BackendConfigAdapter, 
  ValidationResult,
  createBackendConfigAdapter
} from './backend-config.js';
import { Logger } from '../utils/logger.js';
import { CircuitBreaker } from '../utils/circuit-breaker.js';

/**
 * Factory interface for creating backend instances
 */
export interface BackendFactory {
  /**
   * Create a new backend instance with the given configuration
   */
  create(config: BackendConfig): VectorStore;
  
  /**
   * Validate a backend configuration
   */
  validateConfig(config: BackendConfig): ValidationResult;
  
  /**
   * Get default configuration for this backend type
   */
  getDefaultConfig(): BackendConfig;
  
  /**
   * Get the configuration adapter for this backend
   */
  getConfigAdapter(): BackendConfigAdapter;
  
  /**
   * Get information about this backend type
   */
  getBackendInfo(): BackendInfo;
}

/**
 * Registry interface for managing backend implementations
 */
export interface BackendRegistry {
  /**
   * Register a backend factory for a specific type
   */
  register(type: string, factory: BackendFactory): void;
  
  /**
   * Create a backend instance of the specified type
   */
  create(type: string, config: BackendConfig): VectorStore;
  
  /**
   * Get all supported backend types
   */
  getSupportedTypes(): string[];
  
  /**
   * Get backend information for a specific type
   */
  getBackendInfo(type: string): BackendInfo;
  
  /**
   * Check if a backend type is supported
   */
  isSupported(type: string): boolean;
  
  /**
   * Validate configuration for a specific backend type
   */
  validateConfig(type: string, config: BackendConfig): ValidationResult;
}

/**
 * Default implementation of the backend registry
 */
export class DefaultBackendRegistry implements BackendRegistry {
  private factories = new Map<string, BackendFactory>();
  
  register(type: string, factory: BackendFactory): void {
    const normalizedType = type.toLowerCase();
    this.factories.set(normalizedType, factory);
    Logger.info(`🔧 Registered backend factory: ${normalizedType}`);
  }
  
  create(type: string, config: BackendConfig): VectorStore {
    const normalizedType = type.toLowerCase();
    const factory = this.factories.get(normalizedType);
    
    if (!factory) {
      throw new Error(`Unsupported backend type: ${type}. Supported types: ${this.getSupportedTypes().join(', ')}`);
    }
    
    // Validate configuration before creating
    const validation = factory.validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid configuration for backend ${type}: ${validation.errors.join(', ')}`);
    }
    
    Logger.info(`🔧 Creating backend instance: ${normalizedType}`);
    return factory.create(config);
  }
  
  getSupportedTypes(): string[] {
    return Array.from(this.factories.keys());
  }
  
  getBackendInfo(type: string): BackendInfo {
    const normalizedType = type.toLowerCase();
    const factory = this.factories.get(normalizedType);
    
    if (!factory) {
      throw new Error(`Unsupported backend type: ${type}`);
    }
    
    return factory.getBackendInfo();
  }
  
  isSupported(type: string): boolean {
    return this.factories.has(type.toLowerCase());
  }
  
  validateConfig(type: string, config: BackendConfig): ValidationResult {
    const normalizedType = type.toLowerCase();
    const factory = this.factories.get(normalizedType);
    
    if (!factory) {
      return {
        valid: false,
        errors: [`Unsupported backend type: ${type}`],
        warnings: []
      };
    }
    
    return factory.validateConfig(config);
  }
}

/**
 * Enhanced factory function that integrates with circuit breaker
 */
export interface EnhancedBackendFactory extends BackendFactory {
  /**
   * Create a backend instance with circuit breaker integration
   */
  createWithCircuitBreaker(config: BackendConfig, circuitBreaker?: CircuitBreaker): VectorStore;
}

/**
 * Base implementation of backend factory with common functionality
 */
export abstract class BaseBackendFactory implements EnhancedBackendFactory {
  protected configAdapter: BackendConfigAdapter;
  
  constructor(protected backendType: string) {
    this.configAdapter = createBackendConfigAdapter(backendType);
  }
  
  abstract create(config: BackendConfig): VectorStore;
  
  createWithCircuitBreaker(config: BackendConfig, circuitBreaker?: CircuitBreaker): VectorStore {
    const backend = this.create(config);
    
    if (circuitBreaker) {
      // Wrap the backend with circuit breaker functionality
      return this.wrapWithCircuitBreaker(backend, circuitBreaker);
    }
    
    return backend;
  }
  
  validateConfig(config: BackendConfig): ValidationResult {
    return this.configAdapter.validateConfig(config);
  }
  
  getDefaultConfig(): BackendConfig {
    return this.configAdapter.getDefaultConfig();
  }
  
  getConfigAdapter(): BackendConfigAdapter {
    return this.configAdapter;
  }
  
  abstract getBackendInfo(): BackendInfo;
  
  /**
   * Wrap a backend instance with circuit breaker functionality
   */
  protected wrapWithCircuitBreaker(backend: VectorStore, circuitBreaker: CircuitBreaker): VectorStore {
    const self = this;
    
    // Create a proxy that wraps all async methods with circuit breaker
    return new Proxy(backend, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        
        // Only wrap async methods that could fail
        if (typeof value === 'function' && self.isAsyncMethod(prop as string)) {
          return async (...args: any[]) => {
            return circuitBreaker.execute(() => value.apply(target, args));
          };
        }
        
        return value;
      }
    });
  }
  
  private isAsyncMethod(methodName: string): boolean {
    const asyncMethods = [
      'initialize',
      'verifyEmbeddingModel',
      'storeCodeEmbedding',
      'storeMultipleEmbeddings',
      'findSimilarCode',
      'findSimilarCodeByFile',
      'findSimilarCodeByLanguage',
      'updateCodeEmbedding',
      'deleteCodeEmbedding',
      'deleteCodeEmbeddingsByFile',
      'getCollectionStats',
      'close',
      'getHealthStatus',
      'getPerformanceMetrics'
    ];
    
    return asyncMethods.includes(methodName);
  }
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
    globalRegistry = new DefaultBackendRegistry();
  }
  return globalRegistry;
}

/**
 * Set a custom backend registry (useful for testing)
 */
export function setBackendRegistry(registry: BackendRegistry): void {
  globalRegistry = registry;
}

/**
 * Reset the global registry (useful for testing)
 */
export function resetBackendRegistry(): void {
  globalRegistry = null;
}