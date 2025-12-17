/**
 * Configuration management for In Memoria
 * Centralizes all configuration with proper defaults and validation
 */

import { join } from "path";
import { existsSync } from "fs";
import { Logger } from "../utils/logger.js";
import { 
  BackendConfig, 
  BackendConfigAdapter, 
  ValidationResult,
  createBackendConfigAdapter,
  validateAndNormalizeConfig
} from "../storage/backend-config.js";
import { getBackendRegistry } from "../storage/backend-registry.js";

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

  // Vector backend configuration (unified abstraction)
  vectorBackend: {
    type: string;
    config: BackendConfig;
  };
}

/**
 * Get default vector backend configuration
 */
function getDefaultVectorBackendConfig(): { type: string; config: BackendConfig } {
  const defaultType = "surreal";
  const adapter = createBackendConfigAdapter(defaultType);
  return {
    type: defaultType,
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
  private backendConfigAdapter: BackendConfigAdapter | null = null;

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
   * Get vector backend type
   */
  getVectorBackendType(): string {
    return this.config.vectorBackend.type;
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
    try {
      const adapter = createBackendConfigAdapter(backendType);
      return adapter.getDefaultConfig();
    } catch (error) {
      Logger.warn(`⚠️  Unknown backend type '${backendType}', using surreal defaults`);
      const adapter = createBackendConfigAdapter('surreal');
      return adapter.getDefaultConfig();
    }
  }

  /**
   * Set vector backend configuration with validation
   */
  setVectorBackendConfig(type: string, config?: Partial<BackendConfig>): ValidationResult {
    try {
      const adapter = createBackendConfigAdapter(type);
      const defaultConfig = adapter.getDefaultConfig();
      
      // Merge with defaults if partial config provided
      const fullConfig = config ? {
        ...defaultConfig,
        ...config,
        connectionParams: { ...defaultConfig.connectionParams, ...config.connectionParams },
        embeddingConfig: { ...defaultConfig.embeddingConfig, ...config.embeddingConfig },
        performanceSettings: { ...defaultConfig.performanceSettings, ...config.performanceSettings }
      } : defaultConfig;

      // Validate the configuration
      const validation = adapter.validateConfig(fullConfig);
      
      if (validation.valid) {
        this.config.vectorBackend = {
          type,
          config: fullConfig
        };
        this.backendConfigAdapter = adapter;
        
        Logger.info(`✅ Vector backend configuration updated: ${type}`);
        
        // Log warnings if any
        if (validation.warnings.length > 0) {
          validation.warnings.forEach(warning => {
            Logger.warn(`⚠️  Configuration warning: ${warning}`);
          });
        }
      } else {
        Logger.error(`❌ Invalid configuration for backend '${type}': ${validation.errors.join(', ')}`);
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

    // Validate that the backend type is supported
    const registry = getBackendRegistry();
    if (!registry.isSupported(this.config.vectorBackend.type)) {
      const supportedTypes = registry.getSupportedTypes();
      if (supportedTypes.length > 0) {
        errors.push(`Unsupported vector backend type '${this.config.vectorBackend.type}'. Supported types: ${supportedTypes.join(', ')}`);
      } else {
        warnings.push(`No vector backends are registered. Backend type '${this.config.vectorBackend.type}' may not be available.`);
      }
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
    try {
      this.backendConfigAdapter = createBackendConfigAdapter(this.config.vectorBackend.type);
    } catch (error) {
      Logger.warn(`⚠️  Failed to initialize backend adapter for '${this.config.vectorBackend.type}': ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.backendConfigAdapter = null;
    }
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
   * Load vector backend configuration from environment variables using configuration adapters
   */
  private loadVectorBackendFromEnvironment(): void {
    // Determine backend type from environment
    let backendType = this.config.vectorBackend.type; // Default from config
    
    if (process.env.IN_MEMORIA_VECTOR_BACKEND) {
      const envBackend = process.env.IN_MEMORIA_VECTOR_BACKEND.toLowerCase();
      // Validate that the backend type is known
      try {
        createBackendConfigAdapter(envBackend);
        backendType = envBackend;
      } catch (error) {
        Logger.warn(`⚠️  Unknown backend type '${envBackend}' in IN_MEMORIA_VECTOR_BACKEND, using default '${backendType}'`);
      }
    }

    try {
      // Use the appropriate adapter to map environment variables
      const adapter = createBackendConfigAdapter(backendType);
      const envConfig = adapter.mapEnvironmentVariables();
      
      // Validate the configuration from environment
      const validation = adapter.validateConfig(envConfig);
      
      if (validation.valid) {
        this.config.vectorBackend = {
          type: backendType,
          config: envConfig
        };
        
        Logger.info(`✅ Vector backend configuration loaded from environment: ${backendType}`);
        
        // Log any warnings
        if (validation.warnings.length > 0) {
          validation.warnings.forEach(warning => {
            Logger.warn(`⚠️  Configuration warning: ${warning}`);
          });
        }
      } else {
        Logger.error(`❌ Invalid environment configuration for backend '${backendType}': ${validation.errors.join(', ')}`);
        Logger.info(`📋 Using default configuration for backend '${backendType}'`);
        
        // Fall back to default configuration
        this.config.vectorBackend = {
          type: backendType,
          config: adapter.getDefaultConfig()
        };
      }
    } catch (error) {
      Logger.error(`❌ Failed to load backend configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Fall back to surreal default if all else fails
      const fallbackAdapter = createBackendConfigAdapter('surreal');
      this.config.vectorBackend = {
        type: 'surreal',
        config: fallbackAdapter.getDefaultConfig()
      };
      Logger.info(`📋 Using fallback configuration: surreal`);
    }
  }

  /**
   * Get environment-specific configuration hints with backend-specific details
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
      "Vector Backend Configuration:",
      "  IN_MEMORIA_VECTOR_BACKEND - Vector backend type (default: surreal)",
    ];

    // Add backend-specific configuration help
    const registry = getBackendRegistry();
    const supportedTypes = registry.getSupportedTypes();
    
    if (supportedTypes.length > 0) {
      help.push(`  Supported backends: ${supportedTypes.join(', ')}`);
      help.push("");
      
      // Add help for each supported backend
      for (const backendType of supportedTypes) {
        try {
          const adapter = createBackendConfigAdapter(backendType);
          const defaultConfig = adapter.getDefaultConfig();
          
          help.push(`${backendType.toUpperCase()} Backend Configuration:`);
          
          // Add backend-specific environment variables based on the adapter
          if (backendType === 'surreal') {
            help.push("  SURREAL_PATH - Database file path");
            help.push("  SURREAL_URL - SurrealDB server URL (for remote connections)");
            help.push("  SURREAL_NAMESPACE - Database namespace (default: in-memoria)");
            help.push("  SURREAL_DATABASE - Database name (default: vectors)");
            help.push("  SURREAL_USERNAME - Username for authentication");
            help.push("  SURREAL_PASSWORD - Password for authentication");
          } else if (backendType === 'qdrant') {
            help.push("  QDRANT_URL - Qdrant server URL (default: http://localhost:6333)");
            help.push("  QDRANT_API_KEY - API key for authentication");
            help.push("  QDRANT_COLLECTION - Collection name (default: in-memoria)");
            help.push("  QDRANT_TIMEOUT - Request timeout in ms");
          } else if (backendType === 'mock') {
            help.push("  IN_MEMORIA_MOCK_SIMULATE_DELAY - Simulate operation delays");
            help.push("  IN_MEMORIA_MOCK_OPERATION_DELAY - Delay in ms");
            help.push("  IN_MEMORIA_MOCK_SIMULATE_FAILURES - Simulate random failures");
            help.push("  IN_MEMORIA_MOCK_FAILURE_RATE - Failure rate (0.0-1.0)");
            help.push("  IN_MEMORIA_MOCK_MAX_DOCUMENTS - Maximum documents to store");
          }
          help.push("");
        } catch (error) {
          Logger.warn(`⚠️  Could not get configuration help for backend '${backendType}': ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    // Add common embedding configuration
    help.push("Embedding Configuration (applies to all backends):");
    help.push("  IN_MEMORIA_EMBEDDING_MODEL - Transformer.js model (default: Xenova/all-MiniLM-L6-v2)");
    help.push("  IN_MEMORIA_EMBEDDING_DIMENSION - Model output dimension (default: 384)");
    help.push("  IN_MEMORIA_EMBEDDING_CACHE_SIZE - Embedding cache size (default: 1000)");
    help.push("  IN_MEMORIA_EMBEDDING_POOLING - Pooling strategy: mean|cls (default: mean)");
    help.push("  IN_MEMORIA_EMBEDDING_NORMALIZE - Enable L2 normalization (default: true)");
    help.push("");
    
    // Add common performance configuration
    help.push("Performance Configuration (applies to all backends):");
    help.push("  IN_MEMORIA_CONNECTION_TIMEOUT - Connection timeout in ms (default: 30000)");
    help.push("  IN_MEMORIA_OPERATION_TIMEOUT - Operation timeout in ms (default: 30000)");
    help.push("  IN_MEMORIA_MAX_RETRIES - Maximum retry attempts (default: 3)");
    help.push("  IN_MEMORIA_CONNECTION_POOL_SIZE - Connection pool size (where applicable)");
    help.push("");
    
    help.push("Note: Database is always created within the analyzed project directory");

    return help;
  }

  /**
   * Get configuration help for a specific backend type
   */
  getBackendConfigurationHelp(backendType: string): string[] {
    try {
      const adapter = createBackendConfigAdapter(backendType);
      const defaultConfig = adapter.getDefaultConfig();
      const sanitizedConfig = adapter.sanitizeForLogging(defaultConfig);
      
      return [
        `Configuration for ${backendType.toUpperCase()} backend:`,
        "",
        "Default Configuration:",
        JSON.stringify(sanitizedConfig, null, 2),
        "",
        "Environment Variables:",
        ...this.getBackendSpecificEnvVars(backendType)
      ];
    } catch (error) {
      return [
        `Unknown backend type: ${backendType}`,
        "",
        "Supported backends:",
        ...getBackendRegistry().getSupportedTypes().map(type => `  - ${type}`)
      ];
    }
  }

  /**
   * Get backend-specific environment variables
   */
  private getBackendSpecificEnvVars(backendType: string): string[] {
    const commonVars = [
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

    switch (backendType.toLowerCase()) {
      case 'surreal':
        return [
          "  SURREAL_PATH - Database file path",
          "  SURREAL_URL - Server URL",
          "  SURREAL_NAMESPACE - Namespace",
          "  SURREAL_DATABASE - Database name",
          "  SURREAL_USERNAME - Username",
          "  SURREAL_PASSWORD - Password",
          ...commonVars
        ];
      
      case 'qdrant':
        return [
          "  QDRANT_URL - Server URL",
          "  QDRANT_API_KEY - API key",
          "  QDRANT_COLLECTION - Collection name",
          "  QDRANT_TIMEOUT - Request timeout",
          "  IN_MEMORIA_CONNECTION_POOL_SIZE - Connection pool size",
          ...commonVars
        ];
      
      case 'mock':
        return [
          "  IN_MEMORIA_MOCK_SIMULATE_DELAY - Simulate delays",
          "  IN_MEMORIA_MOCK_OPERATION_DELAY - Delay amount",
          "  IN_MEMORIA_MOCK_SIMULATE_FAILURES - Simulate failures",
          "  IN_MEMORIA_MOCK_FAILURE_RATE - Failure rate",
          "  IN_MEMORIA_MOCK_MAX_DOCUMENTS - Max documents",
          ...commonVars
        ];
      
      default:
        return commonVars;
    }
  }
}

// Export singleton instance
export const config = ConfigManager.getInstance();
