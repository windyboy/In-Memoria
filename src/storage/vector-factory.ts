import { ConfigManager } from "../config/config.js";
import { VectorStore } from "./vector-store.js";
import { EmbeddingConfig } from "./vector-types.js";
import { Logger } from "../utils/logger.js";
import { CircuitBreaker, createRustAnalyzerCircuitBreaker } from "../utils/circuit-breaker.js";
import { 
  getBackendRegistry, 
  BackendRegistry,
  EnhancedBackendFactory 
} from "./backend-registry.js";
import { registerBuiltinBackends } from "./backend-factories.js";
import { registerMockBackend } from "./mock-backend-factory.js";
import { 
  BackendConfig, 
  createBackendConfigAdapter,
  validateAndNormalizeConfig 
} from "./backend-config.js";

// Lazy initialization flag
let registryInitialized = false;

/**
 * Reset the registry initialization (for testing)
 */
export function resetRegistryInitialization(): void {
  registryInitialized = false;
}

/**
 * Initialize the backend registry with built-in backends
 */
function initializeRegistry(): void {
  if (registryInitialized) {
    return;
  }
  
  const registry = getBackendRegistry();
  registerBuiltinBackends(registry);
  
  // Register mock backend for testing (only in test environment)
  if (process.env.NODE_ENV === 'test' || process.env.IN_MEMORIA_ENABLE_MOCK_BACKEND === 'true') {
    registerMockBackend(registry);
  }
  
  registryInitialized = true;
}

/**
 * Create backend configuration using ConfigManager's backend abstraction
 */
function createBackendConfig(
  backendType: string,
  embeddingConfig: EmbeddingConfig
): BackendConfig {
  const configManager = ConfigManager.getInstance();
  
  // Get the backend configuration from ConfigManager (which uses adapters)
  const currentBackendConfig = configManager.getVectorBackendConfig();
  
  // If the requested backend type matches the current config, use it
  if (configManager.getVectorBackendType() === backendType) {
    // Override embedding config if provided
    return {
      ...currentBackendConfig,
      embeddingConfig: embeddingConfig || currentBackendConfig.embeddingConfig
    };
  }
  
  // Otherwise, create a new configuration for the requested backend type
  try {
    const adapter = createBackendConfigAdapter(backendType);
    const envConfig = adapter.mapEnvironmentVariables();
    
    // Override embedding config if provided
    if (embeddingConfig) {
      envConfig.embeddingConfig = embeddingConfig;
    }
    
    // Validate the configuration
    const validation = adapter.validateConfig(envConfig);
    if (!validation.valid) {
      Logger.warn(`⚠️  Invalid environment configuration for ${backendType}: ${validation.errors.join(', ')}`);
      Logger.info(`📋 Using default configuration for ${backendType}`);
      
      // Fall back to defaults with custom embedding config
      const defaultConfig = adapter.getDefaultConfig();
      if (embeddingConfig) {
        defaultConfig.embeddingConfig = embeddingConfig;
      }
      return defaultConfig;
    }
    
    // Log warnings if any
    if (validation.warnings.length > 0) {
      validation.warnings.forEach(warning => {
        Logger.warn(`⚠️  Configuration warning: ${warning}`);
      });
    }
    
    return envConfig;
  } catch (error) {
    Logger.error(`❌ Failed to create configuration for backend '${backendType}': ${error instanceof Error ? error.message : 'Unknown error'}`);
    
    // Fall back to surreal defaults
    const fallbackAdapter = createBackendConfigAdapter('surreal');
    const fallbackConfig = fallbackAdapter.getDefaultConfig();
    if (embeddingConfig) {
      fallbackConfig.embeddingConfig = embeddingConfig;
    }
    return fallbackConfig;
  }
}

/**
 * Create a vector store based on configuration/environment using the registry system.
 * Uses ConfigManager's backend abstraction for configuration management.
 */
export function createVectorStore(
    embeddingConfig?: EmbeddingConfig,
    circuitBreaker?: CircuitBreaker
): VectorStore {
    // Initialize registry on first use
    initializeRegistry();
    
    const configManager = ConfigManager.getInstance();
    const registry = getBackendRegistry();

    // Determine backend type - prefer environment variable, then ConfigManager
    const backendEnv = process.env.IN_MEMORIA_VECTOR_BACKEND?.toLowerCase();
    const backend = backendEnv || configManager.getVectorBackendType();

    const resolvedEmbedding = embeddingConfig || configManager.getEmbeddingConfig();

    Logger.info(`🔧 Creating vector store with backend: ${backend}`);
    Logger.info(`   Model: ${resolvedEmbedding.model}`);
    Logger.info(`   Dimension: ${resolvedEmbedding.dimension}`);

    // Check if backend is supported
    if (!registry.isSupported(backend)) {
      const supportedTypes = registry.getSupportedTypes();
      throw new Error(`Unsupported backend type: ${backend}. Supported types: ${supportedTypes.join(', ')}`);
    }

    // Create backend configuration using ConfigManager's abstraction
    const backendConfig = createBackendConfig(backend, resolvedEmbedding);
    
    // Log backend-specific details using sanitized configuration
    const configAdapter = createBackendConfigAdapter(backend);
    const sanitizedConfig = configAdapter.sanitizeForLogging(backendConfig);
    
    Logger.info(`   Backend configuration:`, sanitizedConfig.connectionParams);

    // Create the backend instance using the registry
    try {
      // Use circuit breaker if provided, otherwise create a default one
      const effectiveCircuitBreaker = circuitBreaker || createRustAnalyzerCircuitBreaker();
      
      // Try to get enhanced factory for circuit breaker support
      const factory = (registry as any).factories?.get(backend.toLowerCase());
      if (factory && typeof factory.createWithCircuitBreaker === 'function') {
        return (factory as EnhancedBackendFactory).createWithCircuitBreaker(backendConfig, effectiveCircuitBreaker);
      }
      
      // Fallback to regular creation
      return registry.create(backend, backendConfig);
    } catch (error) {
      Logger.error(`Failed to create vector store: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
}

/**
 * Create a vector store with enhanced configuration validation and circuit breaker
 */
export function createEnhancedVectorStore(
  backendType: string,
  config: Partial<BackendConfig>,
  circuitBreaker?: CircuitBreaker
): VectorStore {
  initializeRegistry();
  
  const registry = getBackendRegistry();
  
  // Validate and normalize configuration
  const { config: normalizedConfig, validation } = validateAndNormalizeConfig(config, backendType);
  
  if (!validation.valid) {
    throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
  }
  
  // Log warnings if any
  if (validation.warnings.length > 0) {
    validation.warnings.forEach(warning => Logger.warn(`Configuration warning: ${warning}`));
  }
  
  Logger.info(`🔧 Creating enhanced vector store: ${backendType}`);
  
  // Create with circuit breaker support
  const effectiveCircuitBreaker = circuitBreaker || createRustAnalyzerCircuitBreaker();
  
  const factory = (registry as any).factories?.get(backendType.toLowerCase());
  if (factory && typeof factory.createWithCircuitBreaker === 'function') {
    return (factory as EnhancedBackendFactory).createWithCircuitBreaker(normalizedConfig, effectiveCircuitBreaker);
  }
  
  return registry.create(backendType, normalizedConfig);
}

/**
 * Get information about available backends
 */
export function getAvailableBackends(): string[] {
  initializeRegistry();
  return getBackendRegistry().getSupportedTypes();
}

/**
 * Get detailed information about a specific backend
 */
export function getBackendInfo(backendType: string) {
  initializeRegistry();
  return getBackendRegistry().getBackendInfo(backendType);
}
