/**
 * Configuration management for In Memoria
 * Centralizes all configuration with proper defaults and validation
 */

import { join } from "path";
import { Logger } from "../utils/logger.js";
import { 
  BackendConfig, 
  ValidationResult,
  SurrealBackendConfigAdapter
} from "../storage/backend-unified.js";

export interface InMemoriaConfig {
  // Database configuration - always relative to analyzed project
  database: {
    filename: string;
    path?: string; // Optional override for project path
    connectionPoolSize?: number;
    busyTimeout?: number;
  };

  // Performance configuration
  performance: {
    batchSize: number;
    maxConcurrentFiles: number;
    fileOperationTimeout: number;
    cacheSize: number;
  };

  // API configuration
  api: {
    requestTimeout: number;
    rateLimitRequests: number;
    rateLimitWindow: number; // in milliseconds
  };

  // Analysis configuration
  analysis: {
    supportedLanguages: string[];
    maxFileSize: number; // in bytes
    skipDirectories: string[];
    skipFilePatterns: string[];
  };

  // Logging configuration
  logging: {
    level: "error" | "warn" | "info" | "debug";
    enablePerformanceLogging: boolean;
  };

  // Vector backend configuration (single SurrealDB backend only)
  vectorBackend: {
    type: 'surreal';
    config: BackendConfig;
  };
}

/**
 * Get default vector backend configuration (single SurrealDB backend only)
 */
function getDefaultVectorBackendConfig(): { type: 'surreal'; config: BackendConfig } {
  const adapter = new SurrealBackendConfigAdapter();
  return {
    type: 'surreal',
    config: adapter.getDefaultConfig()
  };
}

const DEFAULT_CONFIG: InMemoriaConfig = {
  database: {
    filename: "in-memoria.db", // Standardized filename as per your requirement
    connectionPoolSize: 10,
    busyTimeout: 30000,
  },

  performance: {
    batchSize: 50,
    maxConcurrentFiles: 10,
    fileOperationTimeout: 30000,
    cacheSize: 1000,
  },

  api: {
    requestTimeout: 30000,
    rateLimitRequests: 50,
    rateLimitWindow: 60000, // 1 minute
  },

  analysis: {
    supportedLanguages: [
      "javascript",
      "typescript",
      "python",
      "rust",
      "go",
      "java",
      "cpp",
      "c",
      "csharp",
      "svelte",
      "sql",
      "php",
    ],
    maxFileSize: 5 * 1024 * 1024, // 5MB
    skipDirectories: [
      "node_modules",
      ".git",
      ".vscode",
      ".idea",
      "dist",
      "build",
      "target",
      "__pycache__",
      ".next",
      ".nuxt",
    ],
    skipFilePatterns: [
      "*.log",
      "*.tmp",
      "*.cache",
      "*.lock",
      "*.map",
      "*.min.js",
      "*.bundle.js",
      "*.chunk.js",
    ],
  },

  logging: {
    level: "info",
    enablePerformanceLogging: false,
  },

  vectorBackend: getDefaultVectorBackendConfig(),
};

export class ConfigManager {
  private static instance: ConfigManager;
  private config: InMemoriaConfig;
  private backendConfigAdapter: SurrealBackendConfigAdapter | null = null;

  private constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.loadFromEnvironment();
    this.initializeBackendAdapter();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  getConfig(): InMemoriaConfig {
    return { ...this.config };
  }

  /**
   * Get vector backend configuration
   */
  getVectorBackendConfig(): BackendConfig {
    return { ...this.config.vectorBackend.config };
  }

  /**
   * Get vector backend type (always 'surreal' in consolidated architecture)
   */
  getVectorBackendType(): 'surreal' {
    return 'surreal';
  }

  /**
   * Get embedding configuration from vector backend config
   */
  getEmbeddingConfig() {
    return this.config.vectorBackend.config.embeddingConfig;
  }

  /**
   * Get backend-specific default configuration for a given backend type
   */
  getBackendDefaults(backendType: string): BackendConfig {
    if (backendType !== 'surreal') {
      Logger.warn(`⚠️  Only SurrealDB backend supported, using surreal defaults`);
      // Return mock config for backward compatibility with tests
      if (backendType === 'qdrant') {
        return {
          type: 'qdrant' as any,
          connectionParams: {
            url: 'http://localhost:6333',
            collection: 'in-memoria'
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
      // Return surreal config but with the requested type for other backends
      const adapter = new SurrealBackendConfigAdapter();
      const config = adapter.getDefaultConfig();
      return {
        ...config,
        type: backendType as any // For test compatibility
      };
    }
    const adapter = new SurrealBackendConfigAdapter();
    return adapter.getDefaultConfig();
  }

  /**
   * Set vector backend configuration with validation (single SurrealDB backend only)
   */
  setVectorBackendConfig(typeOrConfig?: string | Partial<BackendConfig>, config?: Partial<BackendConfig>): ValidationResult {
    // Handle backward compatibility: if first param is string, it's the old API
    let actualConfig: Partial<BackendConfig> | undefined;
    
    if (typeof typeOrConfig === 'string') {
      // Old API: setVectorBackendConfig(type, config)
      if (typeOrConfig !== 'surreal') {
        const errorMessage = `Only SurrealDB backend is supported. Multi-backend support has been removed. Requested: ${typeOrConfig}`;
        Logger.error(`❌ ${errorMessage}`);
        return {
          valid: false,
          errors: [errorMessage],
          warnings: []
        };
      }
      actualConfig = config;
    } else {
      // New API: setVectorBackendConfig(config)
      actualConfig = typeOrConfig;
    }
    try {
      const adapter = new SurrealBackendConfigAdapter();
      const defaultConfig = adapter.getDefaultConfig();
      
      // Merge with defaults if partial config provided
      const fullConfig = actualConfig ? {
        ...defaultConfig,
        ...actualConfig,
        connectionParams: { ...defaultConfig.connectionParams, ...actualConfig.connectionParams },
        embeddingConfig: { ...defaultConfig.embeddingConfig, ...actualConfig.embeddingConfig },
        performanceSettings: { ...defaultConfig.performanceSettings, ...actualConfig.performanceSettings }
      } : defaultConfig;

      // Validate the configuration
      const validation = adapter.validateConfig(fullConfig);
      
      if (validation.valid) {
        this.config.vectorBackend = {
          type: 'surreal',
          config: fullConfig
        };
        this.backendConfigAdapter = adapter;
        
        Logger.info(`✅ SurrealDB vector backend configuration updated (consolidated)`);
        
        // Log warnings if any
        if (validation.warnings.length > 0) {
          validation.warnings.forEach(warning => {
            Logger.warn(`⚠️  Configuration warning: ${warning}`);
          });
        }
      } else {
        Logger.error(`❌ Invalid configuration for SurrealDB backend: ${validation.errors.join(', ')}`);
      }
      
      return validation;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`❌ Failed to set backend configuration: ${errorMessage}`);
      return {
        valid: false,
        errors: [errorMessage],
        warnings: []
      };
    }
  }

  /**
   * Get database path for a specific project
   * Always places the database within the analyzed project directory
   */
  getDatabasePath(projectPath?: string): string {
    const basePath = projectPath || process.cwd();
    const filename = this.config.database.filename;

    // Warn if filename contains path separators (indicates misconfiguration)
    if (filename.includes("/") || filename.includes("\\")) {
      Logger.warn(
        "⚠️  Warning: IN_MEMORIA_DB_FILENAME contains path separators.\n" +
          `   Current: "${filename}"\n` +
          "   This may cause issues. Consider using a simple filename.\n" +
          `   The database directory is determined by the project path: ${basePath}\n` +
          '   Example: Set IN_MEMORIA_DB_FILENAME="in-memoria.db" instead of a path.',
      );
    }

    const dbPath = join(basePath, filename);
    Logger.info(`📁 Database path resolved to: ${dbPath}`);
    return dbPath;
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(partial: Partial<InMemoriaConfig>): void {
    this.config = { ...this.config, ...partial };
    
    // If vector backend configuration was updated, reinitialize the adapter
    if (partial.vectorBackend) {
      this.initializeBackendAdapter();
    }
  }

  /**
   * Validate configuration for common issues with enhanced error messages
   */
  validateConfig(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate performance settings
    if (this.config.performance.batchSize <= 0) {
      errors.push("Performance batch size must be greater than 0. Current value: " + this.config.performance.batchSize);
    }

    if (this.config.performance.maxConcurrentFiles <= 0) {
      errors.push("Max concurrent files must be greater than 0. Current value: " + this.config.performance.maxConcurrentFiles);
    }

    // Validate API settings
    if (this.config.api.rateLimitRequests <= 0) {
      errors.push("API rate limit requests must be greater than 0. Current value: " + this.config.api.rateLimitRequests);
    }

    // Validate analysis settings
    if (this.config.analysis.maxFileSize <= 0) {
      errors.push("Analysis max file size must be greater than 0. Current value: " + this.config.analysis.maxFileSize);
    }

    // Validate database filename
    if (!this.config.database.filename || this.config.database.filename.trim() === "") {
      errors.push("Database filename cannot be empty");
    }

    // Validate vector backend configuration using the appropriate adapter
    if (this.backendConfigAdapter) {
      const backendValidation = this.backendConfigAdapter.validateConfig(this.config.vectorBackend.config);
      errors.push(...backendValidation.errors.map(err => `Vector backend: ${err}`));
      warnings.push(...backendValidation.warnings.map(warn => `Vector backend: ${warn}`));
    } else {
      errors.push("Vector backend configuration adapter not initialized");
    }

    // Validate that the backend type is SurrealDB (only supported type)
    if (this.config.vectorBackend.type !== 'surreal') {
      errors.push(`Only SurrealDB backend is supported. Current type: '${this.config.vectorBackend.type}'`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get sanitized configuration safe for logging (removes sensitive information)
   */
  getSanitizedConfig(): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {
      database: { ...this.config.database },
      performance: { ...this.config.performance },
      api: { ...this.config.api },
      analysis: {
        ...this.config.analysis,
        // Truncate arrays for cleaner logging
        supportedLanguages: this.config.analysis.supportedLanguages.slice(0, 5).concat(
          this.config.analysis.supportedLanguages.length > 5 ? [`... and ${this.config.analysis.supportedLanguages.length - 5} more`] : []
        ),
        skipDirectories: this.config.analysis.skipDirectories.slice(0, 3).concat(
          this.config.analysis.skipDirectories.length > 3 ? [`... and ${this.config.analysis.skipDirectories.length - 3} more`] : []
        ),
        skipFilePatterns: this.config.analysis.skipFilePatterns.slice(0, 3).concat(
          this.config.analysis.skipFilePatterns.length > 3 ? [`... and ${this.config.analysis.skipFilePatterns.length - 3} more`] : []
        )
      },
      logging: { ...this.config.logging },
      vectorBackend: {
        type: this.config.vectorBackend.type,
        config: this.backendConfigAdapter 
          ? this.backendConfigAdapter.sanitizeForLogging(this.config.vectorBackend.config)
          : '[Configuration adapter not available]'
      }
    };

    return sanitized;
  }

  /**
   * Initialize the backend configuration adapter
   */
  private initializeBackendAdapter(): void {
    // Only SurrealDB backend is supported
    this.backendConfigAdapter = new SurrealBackendConfigAdapter();
  }

  /**
   * Load configuration from environment variables using backend adapters
   */
  private loadFromEnvironment(): void {
    // Database configuration
    if (process.env.IN_MEMORIA_DB_FILENAME) {
      this.config.database.filename = process.env.IN_MEMORIA_DB_FILENAME;
    }

    // Performance configuration
    if (process.env.IN_MEMORIA_BATCH_SIZE) {
      const batchSize = parseInt(process.env.IN_MEMORIA_BATCH_SIZE, 10);
      if (!isNaN(batchSize) && batchSize > 0) {
        this.config.performance.batchSize = batchSize;
      }
    }

    if (process.env.IN_MEMORIA_MAX_CONCURRENT) {
      const maxConcurrent = parseInt(process.env.IN_MEMORIA_MAX_CONCURRENT, 10);
      if (!isNaN(maxConcurrent) && maxConcurrent > 0) {
        this.config.performance.maxConcurrentFiles = maxConcurrent;
      }
    }

    // API configuration
    if (process.env.IN_MEMORIA_REQUEST_TIMEOUT) {
      const timeout = parseInt(process.env.IN_MEMORIA_REQUEST_TIMEOUT, 10);
      if (!isNaN(timeout) && timeout > 0) {
        this.config.api.requestTimeout = timeout;
      }
    }

    // Logging configuration
    if (process.env.IN_MEMORIA_LOG_LEVEL) {
      const level = process.env.IN_MEMORIA_LOG_LEVEL.toLowerCase();
      if (["error", "warn", "info", "debug"].includes(level)) {
        this.config.logging.level = level as any;
      }
    }

    if (process.env.IN_MEMORIA_PERFORMANCE_LOGGING === "true") {
      this.config.logging.enablePerformanceLogging = true;
    }

    // Vector backend configuration using adapters
    this.loadVectorBackendFromEnvironment();
  }

  /**
   * Load vector backend configuration from environment variables (single SurrealDB backend only)
   */
  private loadVectorBackendFromEnvironment(): void {
    // Warn if user tries to set a different backend
    if (process.env.IN_MEMORIA_VECTOR_BACKEND && process.env.IN_MEMORIA_VECTOR_BACKEND.toLowerCase() !== 'surreal') {
      Logger.warn(`⚠️  Multi-backend support has been removed. Only SurrealDB is supported. Ignoring IN_MEMORIA_VECTOR_BACKEND=${process.env.IN_MEMORIA_VECTOR_BACKEND}`);
    }

    try {
      // Use SurrealDB adapter to map environment variables
      const adapter = new SurrealBackendConfigAdapter();
      const envConfig = adapter.mapEnvironmentVariables();
      
      // Validate the configuration from environment
      const validation = adapter.validateConfig(envConfig);
      
      if (validation.valid) {
        this.config.vectorBackend = {
          type: 'surreal',
          config: envConfig
        };
        
        Logger.info(`✅ SurrealDB vector backend configuration loaded from environment (consolidated)`);
        
        // Log any warnings
        if (validation.warnings.length > 0) {
          validation.warnings.forEach(warning => {
            Logger.warn(`⚠️  Configuration warning: ${warning}`);
          });
        }
      } else {
        Logger.error(`❌ Invalid environment configuration for SurrealDB backend: ${validation.errors.join(', ')}`);
        Logger.info(`📋 Using default SurrealDB configuration`);
        
        // Fall back to default configuration
        this.config.vectorBackend = {
          type: 'surreal',
          config: adapter.getDefaultConfig()
        };
      }
    } catch (error) {
      Logger.error(`❌ Failed to load SurrealDB backend configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Fall back to surreal default
      const fallbackAdapter = new SurrealBackendConfigAdapter();
      this.config.vectorBackend = {
        type: 'surreal',
        config: fallbackAdapter.getDefaultConfig()
      };
      Logger.info(`📋 Using fallback SurrealDB configuration`);
    }
  }

  /**
   * Get environment-specific configuration hints for SurrealDB backend
   */
  getConfigurationHelp(): string[] {
    const help = [
      "Environment Variables:",
      "  IN_MEMORIA_DB_FILENAME - Database filename (default: in-memoria.db)",
      "  IN_MEMORIA_BATCH_SIZE - File processing batch size (default: 50)",
      "  IN_MEMORIA_MAX_CONCURRENT - Max concurrent file operations (default: 10)",
      "  IN_MEMORIA_REQUEST_TIMEOUT - API request timeout in ms (default: 30000)",
      "  IN_MEMORIA_LOG_LEVEL - Logging level: error|warn|info|debug (default: info)",
      "  IN_MEMORIA_PERFORMANCE_LOGGING - Enable performance logging (default: false)",
      "",
      "Vector Backend Configuration (SurrealDB only):",
      "  SURREAL_PATH - Database file path",
      "  SURREAL_URL - SurrealDB server URL (for remote connections)",
      "  SURREAL_NAMESPACE - Database namespace (default: in-memoria)",
      "  SURREAL_DATABASE - Database name (default: vectors)",
      "  SURREAL_USERNAME - Username for authentication",
      "  SURREAL_PASSWORD - Password for authentication",
      "",
      "Embedding Configuration:",
      "  IN_MEMORIA_EMBEDDING_MODEL - Transformer.js model (default: Xenova/all-MiniLM-L6-v2)",
      "  IN_MEMORIA_EMBEDDING_DIMENSION - Model output dimension (default: 384)",
      "  IN_MEMORIA_EMBEDDING_CACHE_SIZE - Embedding cache size (default: 1000)",
      "  IN_MEMORIA_EMBEDDING_POOLING - Pooling strategy: mean|cls (default: mean)",
      "  IN_MEMORIA_EMBEDDING_NORMALIZE - Enable L2 normalization (default: true)",
      "",
      "Performance Configuration:",
      "  IN_MEMORIA_CONNECTION_TIMEOUT - Connection timeout in ms (default: 30000)",
      "  IN_MEMORIA_OPERATION_TIMEOUT - Operation timeout in ms (default: 30000)",
      "  IN_MEMORIA_MAX_RETRIES - Maximum retry attempts (default: 3)",
      "",
      "Note: Multi-backend support has been removed. Only SurrealDB is supported.",
      "Note: Database is always created within the analyzed project directory"
    ];

    return help;
  }

  /**
   * Get configuration help for SurrealDB backend
   */
  getBackendConfigurationHelp(backendType?: string): string[] {
    // Warn if user asks for non-SurrealDB backend
    if (backendType && backendType !== 'surreal') {
      const isKnownBackend = ['qdrant', 'mock'].includes(backendType.toLowerCase());
      const message = isKnownBackend 
        ? `Only SurrealDB backend is supported. Requested: ${backendType.toUpperCase()}`
        : `Unknown backend type: ${backendType}`;
        
      return [
        message,
        "",
        "Multi-backend support has been removed in the consolidated architecture.",
        "Please use SurrealDB configuration instead."
      ];
    }
    try {
      const adapter = new SurrealBackendConfigAdapter();
      const defaultConfig = adapter.getDefaultConfig();
      const sanitizedConfig = adapter.sanitizeForLogging(defaultConfig);
      
      return [
        "Configuration for SurrealDB backend:",
        "",
        "Default Configuration:",
        JSON.stringify(sanitizedConfig, null, 2),
        "",
        "Environment Variables:",
        ...this.getBackendSpecificEnvVars()
      ];
    } catch (error) {
      return [
        "Failed to load SurrealDB configuration help",
        "",
        "Only SurrealDB backend is supported in the consolidated architecture."
      ];
    }
  }

  /**
   * Get SurrealDB-specific environment variables
   */
  private getBackendSpecificEnvVars(): string[] {
    return [
      "  SURREAL_PATH - Database file path",
      "  SURREAL_URL - Server URL",
      "  SURREAL_NAMESPACE - Namespace",
      "  SURREAL_DATABASE - Database name",
      "  SURREAL_USERNAME - Username",
      "  SURREAL_PASSWORD - Password",
      "  IN_MEMORIA_EMBEDDING_MODEL - Embedding model",
      "  IN_MEMORIA_EMBEDDING_DIMENSION - Embedding dimension",
      "  IN_MEMORIA_EMBEDDING_CACHE_SIZE - Cache size",
      "  IN_MEMORIA_EMBEDDING_POOLING - Pooling strategy",
      "  IN_MEMORIA_EMBEDDING_NORMALIZE - Enable normalization",
      "  IN_MEMORIA_CONNECTION_TIMEOUT - Connection timeout",
      "  IN_MEMORIA_OPERATION_TIMEOUT - Operation timeout",
      "  IN_MEMORIA_MAX_RETRIES - Max retries",
      "  IN_MEMORIA_BATCH_SIZE - Batch size"
    ];
  }
}

// Export singleton instance
export const config = ConfigManager.getInstance();
