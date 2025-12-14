import { SemanticEngine } from "./engines/semantic-engine.js";
import { PatternEngine } from "./engines/pattern-engine.js";
import { SQLiteDatabase } from "./storage/sqlite-db.js";
import { Logger } from "./utils/logger.js";
import { PathValidator } from "./utils/path-validator.js";
import { config } from "./config/config.js";
import { VectorStore } from "./storage/vector-store.js";
import { createVectorStore } from "./storage/vector-factory.js";

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
    LOGGER: "logger",
    PATH_VALIDATOR: "pathValidator",
    CIRCUIT_BREAKER: "circuitBreaker",
} as const;

/**
 * Initialize the DI container with default services
 */
export function initializeDIContainer(projectPath?: string): DIContainer {
    const container = DIContainer.getInstance();

    // Register core services
    container.registerFactory(ServiceKeys.DATABASE, () => {
        const dbPath = projectPath
            ? config.getDatabasePath(projectPath)
            : ":memory:";
        return new SQLiteDatabase(dbPath);
    });

    container.registerFactory(ServiceKeys.SEMANTIC_ENGINE, () => {
        const database = container.get<SQLiteDatabase>(ServiceKeys.DATABASE);
        const vectorStore = container.get<VectorStore>(
            ServiceKeys.VECTOR_STORE,
        );
        return new SemanticEngine(database, vectorStore);
    });

    container.registerFactory(ServiceKeys.PATTERN_ENGINE, () => {
        const database = container.get<SQLiteDatabase>(ServiceKeys.DATABASE);
        return new PatternEngine(database);
    });

    container.registerFactory(ServiceKeys.VECTOR_STORE, () =>
        createVectorStore(),
    );

    container.register(ServiceKeys.LOGGER, Logger);

    container.register(ServiceKeys.PATH_VALIDATOR, PathValidator);

    container.registerFactory(ServiceKeys.CIRCUIT_BREAKER, () => {
        // Import dynamically to avoid circular dependencies
        const circuitBreakerModule = require("./utils/circuit-breaker.js");
        return circuitBreakerModule.createRustAnalyzerCircuitBreaker();
    });

    return container;
}

// Import here to avoid circular dependencies
