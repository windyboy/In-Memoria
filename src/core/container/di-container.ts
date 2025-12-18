import { SemanticEngine } from "../../utils/semantic-engine.js";
import { PatternEngine } from "../../utils/pattern-engine.js";
import { SQLiteDatabase } from "../../storage/sqlite-db.js";
import { Logger } from "../../utils/logger.js";
import { PathValidator } from "../../utils/path-validator.js";
import { config } from "../../utils/config.js";
import { VectorStore } from "../../storage/vector-store.js";
import { 
  createVectorStore, 
  createEnhancedVectorStore
} from "../../storage/backend-unified.js";
import { getBackendRegistry } from "../../storage/backend-unified.js";
import { CircuitBreaker, createRustAnalyzerCircuitBreaker } from "../../utils/circuit-breaker.js";
import { BackendConfig } from "../../storage/backend-unified.js";

/**
 * Dependency Injection Container
 * Provides centralized service management and dependency resolution
 */
export class DIContainer {
    private static instance: DIContainer;
    private services = new Map<string, any>();
    private factories = new Map<string, () => any>();

    private constructor() {}

    static getInstance(): DIContainer {
        if (!DIContainer.instance) {
            DIContainer.instance = new DIContainer();
        }
        return DIContainer.instance;
    }

    /**
     * Register a singleton service
     */
    register<T>(key: string, service: T): void {
        this.services.set(key, service);
    }

    /**
     * Register a factory function for lazy initialization
     */
    registerFactory<T>(key: string, factory: () => T): void {
        this.factories.set(key, factory);
    }

    /**
     * Get a service, creating it if needed
     */
    get<T>(key: string): T {
        if (this.services.has(key)) {
            return this.services.get(key) as T;
        }

        if (this.factories.has(key)) {
            const service = this.factories.get(key)!();
            this.services.set(key, service);
            return service as T;
        }

        throw new Error(`Service not registered: ${key}`);
    }

    /**
     * Check if a service is registered
     */
    has(key: string): boolean {
        return this.services.has(key) || this.factories.has(key);
    }

    /**
     * Clear all services (useful for testing)
     */
    clear(): void {
        this.services.clear();
        this.factories.clear();
    }
}

/**
 * Service Keys for type safety
 */
export const ServiceKeys = {
    DATABASE: "database",
    SEMANTIC_ENGINE: "semanticEngine",
    PATTERN_ENGINE: "patternEngine",
    VECTOR_STORE: "vectorStore",
    BACKEND_REGISTRY: "backendRegistry",
    VECTOR_CIRCUIT_BREAKER: "vectorCircuitBreaker",
    LOGGER: "logger",
    PATH_VALIDATOR: "pathValidator",
    CIRCUIT_BREAKER: "circuitBreaker",
} as const;

/**
 * Configuration options for DI container initialization
 */
export interface DIContainerConfig {
  projectPath?: string;
  vectorBackendType?: string;
  vectorBackendConfig?: Partial<BackendConfig>;
  enableCircuitBreaker?: boolean;
}

/**
 * Initialize the DI container with default services
 */
export function initializeDIContainer(options: DIContainerConfig = {}): DIContainer {
    const container = DIContainer.getInstance();
    const { 
      projectPath, 
      vectorBackendType, 
      vectorBackendConfig, 
      enableCircuitBreaker = true 
    } = options;

    // Register core services
    container.registerFactory(ServiceKeys.DATABASE, () => {
        const dbPath = projectPath
            ? config.getDatabasePath(projectPath)
            : ":memory:";
        return new SQLiteDatabase(dbPath);
    });

    // Register backend registry
    container.registerFactory(ServiceKeys.BACKEND_REGISTRY, () => {
        return getBackendRegistry();
    });

    // Register vector circuit breaker
    container.registerFactory(ServiceKeys.VECTOR_CIRCUIT_BREAKER, () => {
        return createRustAnalyzerCircuitBreaker();
    });

    // Register vector store with enhanced configuration and circuit breaker support
    container.registerFactory(ServiceKeys.VECTOR_STORE, () => {
        if (vectorBackendType && vectorBackendConfig) {
            // Use enhanced creation with specific backend type and config
            Logger.info(`🔧 Creating vector store via DI container: ${vectorBackendType}`);
            const vectorStore = createVectorStore(vectorBackendConfig.embeddingConfig);
            
            // Log backend information for diagnostics
            const backendInfo = vectorStore.getBackendInfo();
            Logger.info(`   Backend: ${backendInfo.type} v${backendInfo.version}`);
            Logger.info(`   Status: ${backendInfo.connectionStatus}`);
            
            return vectorStore;
        } else {
            // Use legacy creation method for backward compatibility
            Logger.info(`🔧 Creating vector store via DI container: legacy mode`);
            const vectorStore = createVectorStore(undefined);
            
            // Log backend information for diagnostics
            const backendInfo = vectorStore.getBackendInfo();
            Logger.info(`   Backend: ${backendInfo.type} v${backendInfo.version}`);
            Logger.info(`   Status: ${backendInfo.connectionStatus}`);
            
            return vectorStore;
        }
    });

    container.registerFactory(ServiceKeys.SEMANTIC_ENGINE, () => {
        const database = container.get<SQLiteDatabase>(ServiceKeys.DATABASE);
        const vectorStore = container.get<VectorStore>(ServiceKeys.VECTOR_STORE);
        return new SemanticEngine();
    });

    container.registerFactory(ServiceKeys.PATTERN_ENGINE, () => {
        const database = container.get<SQLiteDatabase>(ServiceKeys.DATABASE);
        return new PatternEngine(database);
    });

    container.register(ServiceKeys.LOGGER, Logger);

    container.register(ServiceKeys.PATH_VALIDATOR, PathValidator);

    container.registerFactory(ServiceKeys.CIRCUIT_BREAKER, () => {
        // Import dynamically to avoid circular dependencies
        const circuitBreakerModule = require("../../utils/circuit-breaker.js");
        return circuitBreakerModule.createRustAnalyzerCircuitBreaker();
    });

    return container;
}

/**
 * Enhanced initialization with backend-specific configuration
 */
export function initializeEnhancedDIContainer(
  projectPath: string,
  backendType: string,
  backendConfig: Partial<BackendConfig>
): DIContainer {
  return initializeDIContainer({
    projectPath,
    vectorBackendType: backendType,
    vectorBackendConfig: backendConfig,
    enableCircuitBreaker: true
  });
}

/**
 * Get or create a vector store with specific configuration
 */
export function getOrCreateVectorStore(
  container: DIContainer,
  backendType?: string,
  config?: Partial<BackendConfig>
): VectorStore {
  if (backendType && config) {
    // Create a new instance with specific configuration
    return createVectorStore(config.embeddingConfig);
  }
  
  // Use the registered factory
  return container.get<VectorStore>(ServiceKeys.VECTOR_STORE);
}

// Import here to avoid circular dependencies