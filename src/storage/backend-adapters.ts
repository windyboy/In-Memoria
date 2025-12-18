/**
 * Backend Adapter Implementations
 * 
 * This module provides adapter implementations that wrap existing vector backend
 * implementations (SurrealVectorDB, QdrantVectorDB) with standardized error handling,
 * configuration management, and consistent interfaces.
 */

import { 
  VectorStore, 
  CodeMetadata, 
  SemanticSearchResult, 
  BackendInfo, 
  HealthStatus, 
  PerformanceMetrics,
  BackendConfig,
  ValidationResult,
  VectorStoreError,
  ErrorTranslator,
  createErrorTranslator,
  normalizeError
} from './vector-store.js';
import { SurrealBackendConfigAdapter } from './backend-unified.js';
import { SurrealVectorDB } from './vector-db.js';
import { EmbeddingConfig } from './vector-types.js';
import { Logger } from '../utils/logger.js';
import { PerformanceMonitor, createPerformanceMonitor, LoggingMonitor, createLoggingMonitor } from './diagnostics.js';
import { CircuitBreaker } from '../utils/circuit-breaker.js';

/**
 * Base adapter class that provides common functionality for all backend adapters
 */
export abstract class BaseBackendAdapter implements VectorStore {
  protected errorTranslator: ErrorTranslator;
  protected configAdapter: SurrealBackendConfigAdapter;
  protected config: BackendConfig;
  protected performanceMonitor: PerformanceMonitor;
  protected loggingMonitor: LoggingMonitor;
  protected circuitBreaker?: CircuitBreaker;
  
  constructor(
    protected backendType: string,
    config: BackendConfig,
    circuitBreaker?: CircuitBreaker
  ) {
    this.errorTranslator = createErrorTranslator(backendType);
    this.configAdapter = new SurrealBackendConfigAdapter();
    this.config = config;
    this.circuitBreaker = circuitBreaker;
    
    // Initialize performance monitoring
    this.performanceMonitor = createPerformanceMonitor(backendType, {
      enableAutoHealthCheck: true,
      healthCheckIntervalMs: 30000 // 30 seconds
    });
    
    // Initialize comprehensive logging and monitoring
    this.loggingMonitor = createLoggingMonitor(backendType, {
      performanceMonitor: this.performanceMonitor,
      circuitBreaker: this.circuitBreaker
    });
    
    // Validate configuration on construction
    const validation = this.configAdapter.validateConfig(config);
    if (!validation.valid) {
      const errorMessage = `Invalid ${backendType} configuration: ${validation.errors.join(', ')}`;
      throw normalizeError(new Error(errorMessage), backendType);
    }
    
    // Log warnings if any
    if (validation.warnings.length > 0) {
      Logger.warn(`${backendType} configuration warnings:`, validation.warnings);
    }
    
    Logger.debug(`${backendType} adapter initialized with config:`, 
      this.configAdapter.sanitizeForLogging(config));
  }
  
  /**
   * Wrap backend operations with standardized error handling, performance monitoring, and comprehensive logging
   */
  protected async wrapOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    metadata: Record<string, unknown> = {}
  ): Promise<T> {
    const correlationId = this.loggingMonitor.generateCorrelationId();
    const operationId = this.performanceMonitor.startOperation(operationName);
    const startTime = Date.now();
    
    try {
      Logger.debug(`${this.backendType} adapter: Starting ${operationName}`, { correlationId });
      
      // Execute operation with circuit breaker if available
      let result: T;
      if (this.circuitBreaker) {
        result = await this.circuitBreaker.execute(operation);
      } else {
        result = await operation();
      }
      
      const duration = Date.now() - startTime;
      
      // Log successful operation
      this.loggingMonitor.logOperation(
        operationName,
        true,
        duration,
        undefined,
        { ...metadata, resultType: typeof result },
        correlationId
      );
      
      this.performanceMonitor.endOperation(operationId, operationName, true);
      Logger.debug(`${this.backendType} adapter: Completed ${operationName}`, { 
        duration, 
        correlationId 
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const normalizedError = this.errorTranslator.translate(error as Error);
      
      // Log failed operation
      this.loggingMonitor.logOperation(
        operationName,
        false,
        duration,
        normalizedError,
        { ...metadata, errorType: normalizedError.constructor.name },
        correlationId
      );
      
      this.performanceMonitor.endOperation(operationId, operationName, false);
      this.performanceMonitor.recordError(operationName, normalizedError);
      
      Logger.error(`${this.backendType} adapter: ${operationName} failed:`, {
        error: normalizedError.toLogSafeObject(),
        duration,
        correlationId,
        metadata
      });
      
      throw normalizedError;
    }
  }
  
  /**
   * Wrap synchronous operations with error handling, performance monitoring, and comprehensive logging
   */
  protected wrapSync<T>(
    operation: () => T,
    operationName: string,
    metadata: Record<string, unknown> = {}
  ): T {
    const correlationId = this.loggingMonitor.generateCorrelationId();
    const operationId = this.performanceMonitor.startOperation(operationName);
    const startTime = Date.now();
    
    try {
      Logger.debug(`${this.backendType} adapter: Starting ${operationName}`, { correlationId });
      const result = operation();
      const duration = Date.now() - startTime;
      
      // Log successful operation
      this.loggingMonitor.logOperation(
        operationName,
        true,
        duration,
        undefined,
        { ...metadata, resultType: typeof result },
        correlationId
      );
      
      this.performanceMonitor.endOperation(operationId, operationName, true);
      Logger.debug(`${this.backendType} adapter: Completed ${operationName}`, { 
        duration, 
        correlationId 
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const normalizedError = this.errorTranslator.translate(error as Error);
      
      // Log failed operation
      this.loggingMonitor.logOperation(
        operationName,
        false,
        duration,
        normalizedError,
        { ...metadata, errorType: normalizedError.constructor.name },
        correlationId
      );
      
      this.performanceMonitor.endOperation(operationId, operationName, false);
      this.performanceMonitor.recordError(operationName, normalizedError);
      
      Logger.error(`${this.backendType} adapter: ${operationName} failed:`, {
        error: normalizedError.toLogSafeObject(),
        duration,
        correlationId,
        metadata
      });
      
      throw normalizedError;
    }
  }
  
  /**
   * Get performance metrics from the monitor
   */
  protected getAdapterPerformanceMetrics(): PerformanceMetrics {
    return this.performanceMonitor.getPerformanceMetrics();
  }

  /**
   * Get health status from the monitor with custom backend checks
   */
  protected async getAdapterHealthStatus(customHealthCheck?: () => Promise<Record<string, unknown>>): Promise<HealthStatus> {
    return this.performanceMonitor.getHealthStatus();
  }

  /**
   * Get comprehensive diagnostic information
   */
  getDiagnosticInfo() {
    return this.loggingMonitor.getDiagnosticInfo();
  }

  /**
   * Get enhanced performance metrics with logging data
   */
  getEnhancedPerformanceMetrics() {
    return this.performanceMonitor.getPerformanceMetrics();
  }

  /**
   * Register this adapter with the global diagnostic system
   */
  protected registerWithDiagnosticSystem(vectorStore: VectorStore): void {
    // Diagnostic system registration removed - consolidated into diagnostics.ts
    Logger.info(`${this.backendType} adapter diagnostic registration skipped (consolidated)`);
  }

  /**
   * Unregister this adapter from the global diagnostic system
   */
  protected unregisterFromDiagnosticSystem(): void {
    // Diagnostic system unregistration removed - consolidated into diagnostics.ts
    Logger.info(`${this.backendType} adapter diagnostic unregistration skipped (consolidated)`);
  }

  /**
   * Cleanup adapter resources
   */
  protected dispose(): void {
    this.unregisterFromDiagnosticSystem();
    this.loggingMonitor.dispose();
    this.performanceMonitor.dispose();
    Logger.debug(`${this.backendType} adapter disposed`);
  }

  // Abstract methods that must be implemented by concrete adapters
  abstract initialize(collectionName?: string): Promise<void>;
  abstract verifyEmbeddingModel(): Promise<void>;
  abstract storeCodeEmbedding(code: string, metadata: CodeMetadata): Promise<void>;
  abstract storeMultipleEmbeddings(codeChunks: string[], metadataList: CodeMetadata[]): Promise<void>;
  abstract findSimilarCode(query: string, limit?: number, filters?: Record<string, unknown>): Promise<SemanticSearchResult[]>;
  abstract findSimilarCodeByFile(filePath: string, limit?: number): Promise<SemanticSearchResult[]>;
  abstract findSimilarCodeByLanguage(query: string, language: string, limit?: number): Promise<SemanticSearchResult[]>;
  abstract updateCodeEmbedding(id: string, code: string, metadata: CodeMetadata): Promise<void>;
  abstract deleteCodeEmbedding(id: string): Promise<void>;
  abstract deleteCodeEmbeddingsByFile(filePath: string): Promise<void>;
  abstract getCollectionStats(): Promise<{ count: number; metadata: unknown }>;
  abstract close(): Promise<void>;
  abstract getBackendInfo(): BackendInfo;
  abstract getHealthStatus(): Promise<HealthStatus>;
  abstract getPerformanceMetrics(): Promise<PerformanceMetrics>;
}

/**
 * Adapter for SurrealDB backend that wraps SurrealVectorDB with standardized interfaces
 */
export class SurrealBackendAdapter extends BaseBackendAdapter {
  private backend: SurrealVectorDB;
  
  constructor(config: BackendConfig, circuitBreaker?: CircuitBreaker) {
    super('surreal', config, circuitBreaker);
    
    // Create SurrealVectorDB instance with configuration
    const embeddingConfig = config.embeddingConfig;
    this.backend = new SurrealVectorDB(undefined, embeddingConfig);
    
    // Record successful connection
    // this.performanceMonitor.recordConnection(true); // Method removed in consolidation
    
    // Register with diagnostic system
    this.registerWithDiagnosticSystem(this);
    
    Logger.info('SurrealDB backend adapter created');
  }
  
  async initialize(collectionName?: string): Promise<void> {
    return this.wrapOperation(async () => {
      await this.backend.initialize(collectionName);
    }, 'initialize');
  }
  
  async verifyEmbeddingModel(): Promise<void> {
    return this.wrapOperation(async () => {
      await this.backend.verifyEmbeddingModel();
    }, 'verifyEmbeddingModel');
  }
  
  async storeCodeEmbedding(code: string, metadata: CodeMetadata): Promise<void> {
    return this.wrapOperation(async () => {
      await this.backend.storeCodeEmbedding(code, metadata);
    }, 'storeCodeEmbedding');
  }
  
  async storeMultipleEmbeddings(codeChunks: string[], metadataList: CodeMetadata[]): Promise<void> {
    return this.wrapOperation(async () => {
      await this.backend.storeMultipleEmbeddings(codeChunks, metadataList);
    }, 'storeMultipleEmbeddings');
  }
  
  async findSimilarCode(
    query: string, 
    limit?: number, 
    filters?: Record<string, unknown>
  ): Promise<SemanticSearchResult[]> {
    return this.wrapOperation(async () => {
      return await this.backend.findSimilarCode(query, limit, filters);
    }, 'findSimilarCode');
  }
  
  async findSimilarCodeByFile(filePath: string, limit?: number): Promise<SemanticSearchResult[]> {
    return this.wrapOperation(async () => {
      return await this.backend.findSimilarCodeByFile(filePath, limit);
    }, 'findSimilarCodeByFile');
  }
  
  async findSimilarCodeByLanguage(
    query: string, 
    language: string, 
    limit?: number
  ): Promise<SemanticSearchResult[]> {
    return this.wrapOperation(async () => {
      return await this.backend.findSimilarCodeByLanguage(query, language, limit);
    }, 'findSimilarCodeByLanguage');
  }
  
  async updateCodeEmbedding(id: string, code: string, metadata: CodeMetadata): Promise<void> {
    return this.wrapOperation(async () => {
      await this.backend.updateCodeEmbedding(id, code, metadata);
    }, 'updateCodeEmbedding');
  }
  
  async deleteCodeEmbedding(id: string): Promise<void> {
    return this.wrapOperation(async () => {
      await this.backend.deleteCodeEmbedding(id);
    }, 'deleteCodeEmbedding');
  }
  
  async deleteCodeEmbeddingsByFile(filePath: string): Promise<void> {
    return this.wrapOperation(async () => {
      await this.backend.deleteCodeEmbeddingsByFile(filePath);
    }, 'deleteCodeEmbeddingsByFile');
  }
  
  async getCollectionStats(): Promise<{ count: number; metadata: unknown }> {
    return this.wrapOperation(async () => {
      return await this.backend.getCollectionStats();
    }, 'getCollectionStats');
  }
  
  async close(): Promise<void> {
    return this.wrapOperation(async () => {
      await this.backend.close();
    }, 'close');
  }
  
  getBackendInfo(): BackendInfo {
    return this.wrapSync(() => {
      const info = this.backend.getBackendInfo();
      // Enhance with adapter-specific information
      return {
        ...info,
        metadata: {
          ...info.metadata,
          adapterVersion: '1.0.0',
          configurationSource: 'adapter',
          errorHandling: 'standardized'
        }
      };
    }, 'getBackendInfo');
  }
  
  async getHealthStatus(): Promise<HealthStatus> {
    return this.getAdapterHealthStatus(async () => {
      const backendStatus = await this.backend.getHealthStatus();
      return {
        backend: backendStatus.status,
        backendDetails: backendStatus.details,
        adapter: 'surreal-backend-adapter',
        configValid: this.configAdapter.validateConfig(this.config).valid,
        backendResponseTime: backendStatus.responseTime
      };
    });
  }
  
  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    return this.wrapOperation(async () => {
      const metrics = await this.backend.getPerformanceMetrics();
      // Enhance with adapter-specific metrics
      return {
        ...metrics,
        operationCounts: {
          ...metrics.operationCounts,
          adapterOperations: 0 // Would be tracked in real implementation
        }
      };
    }, 'getPerformanceMetrics');
  }
}

// QdrantBackendAdapter removed in Phase 3 - only SurrealDB backend supported per requirement 6.1

/**
 * Factory function to create appropriate backend adapter
 */
export function createBackendAdapter(config: BackendConfig, circuitBreaker?: CircuitBreaker): VectorStore {
  switch (config.type.toLowerCase()) {
    case 'surreal':
    case 'surrealdb':
      return new SurrealBackendAdapter(config, circuitBreaker);
    
    default:
      throw new Error(`Unsupported backend type: ${config.type}. Only SurrealDB is supported in Phase 3 per requirement 6.1`);
  }
}

/**
 * Utility function to create backend adapter from environment variables
 */
export function createBackendAdapterFromEnv(backendType?: string): VectorStore {
  const type = backendType || process.env.IN_MEMORIA_VECTOR_BACKEND || 'surreal';
  const configAdapter = new SurrealBackendConfigAdapter();
  const config = configAdapter.mapEnvironmentVariables();
  
  return createBackendAdapter(config);
}

/**
 * Enhanced SurrealBackendAdapter with performance monitoring
 */
export class EnhancedSurrealBackendAdapter extends BaseBackendAdapter {
  private backend: SurrealVectorDB;
  
  constructor(config: BackendConfig, circuitBreaker?: CircuitBreaker) {
    super('surreal', config, circuitBreaker);
    
    // Create SurrealVectorDB instance with configuration
    const embeddingConfig = config.embeddingConfig;
    this.backend = new SurrealVectorDB(undefined, embeddingConfig);
    
    // Record successful connection
    // this.performanceMonitor.recordConnection(true); // Method removed in consolidation
    
    // Register with diagnostic system
    this.registerWithDiagnosticSystem(this);
    
    Logger.info('Enhanced SurrealDB backend adapter created');
  }
  
  async initialize(collectionName?: string): Promise<void> {
    return this.wrapOperation(async () => {
      await this.backend.initialize(collectionName);
    }, 'initialize');
  }
  
  async verifyEmbeddingModel(): Promise<void> {
    return this.wrapOperation(async () => {
      await this.backend.verifyEmbeddingModel();
    }, 'verifyEmbeddingModel');
  }
  
  async storeCodeEmbedding(code: string, metadata: CodeMetadata): Promise<void> {
    return this.wrapOperation(async () => {
      await this.backend.storeCodeEmbedding(code, metadata);
    }, 'storeCodeEmbedding');
  }
  
  async storeMultipleEmbeddings(codeChunks: string[], metadataList: CodeMetadata[]): Promise<void> {
    return this.wrapOperation(async () => {
      await this.backend.storeMultipleEmbeddings(codeChunks, metadataList);
    }, 'storeMultipleEmbeddings');
  }
  
  async findSimilarCode(
    query: string, 
    limit?: number, 
    filters?: Record<string, unknown>
  ): Promise<SemanticSearchResult[]> {
    return this.wrapOperation(async () => {
      return await this.backend.findSimilarCode(query, limit, filters);
    }, 'findSimilarCode');
  }
  
  async findSimilarCodeByFile(filePath: string, limit?: number): Promise<SemanticSearchResult[]> {
    return this.wrapOperation(async () => {
      return await this.backend.findSimilarCodeByFile(filePath, limit);
    }, 'findSimilarCodeByFile');
  }
  
  async findSimilarCodeByLanguage(
    query: string, 
    language: string, 
    limit?: number
  ): Promise<SemanticSearchResult[]> {
    return this.wrapOperation(async () => {
      return await this.backend.findSimilarCodeByLanguage(query, language, limit);
    }, 'findSimilarCodeByLanguage');
  }
  
  async updateCodeEmbedding(id: string, code: string, metadata: CodeMetadata): Promise<void> {
    return this.wrapOperation(async () => {
      await this.backend.updateCodeEmbedding(id, code, metadata);
    }, 'updateCodeEmbedding');
  }
  
  async deleteCodeEmbedding(id: string): Promise<void> {
    return this.wrapOperation(async () => {
      await this.backend.deleteCodeEmbedding(id);
    }, 'deleteCodeEmbedding');
  }
  
  async deleteCodeEmbeddingsByFile(filePath: string): Promise<void> {
    return this.wrapOperation(async () => {
      await this.backend.deleteCodeEmbeddingsByFile(filePath);
    }, 'deleteCodeEmbeddingsByFile');
  }
  
  async getCollectionStats(): Promise<{ count: number; metadata: unknown }> {
    return this.wrapOperation(async () => {
      return await this.backend.getCollectionStats();
    }, 'getCollectionStats');
  }
  
  async close(): Promise<void> {
    return this.wrapOperation(async () => {
      await this.backend.close();
      // this.performanceMonitor.recordConnectionClosure(); // Method removed in consolidation
      this.dispose();
    }, 'close');
  }
  
  getBackendInfo(): BackendInfo {
    return this.wrapSync(() => {
      const info = this.backend.getBackendInfo();
      // Enhance with adapter-specific information
      return {
        ...info,
        metadata: {
          ...info.metadata,
          adapterVersion: '1.0.0',
          configurationSource: 'adapter',
          errorHandling: 'standardized',
          performanceMonitoring: 'enabled'
        }
      };
    }, 'getBackendInfo');
  }
  
  async getHealthStatus(): Promise<HealthStatus> {
    return this.getAdapterHealthStatus(async () => {
      const backendStatus = await this.backend.getHealthStatus();
      return {
        backend: backendStatus.status,
        backendDetails: backendStatus.details,
        adapter: 'enhanced-surreal-backend-adapter',
        configValid: this.configAdapter.validateConfig(this.config).valid,
        backendResponseTime: backendStatus.responseTime
      };
    });
  }
  
  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    const adapterMetrics = this.getAdapterPerformanceMetrics();
    const backendMetrics = await this.backend.getPerformanceMetrics();
    
    // Merge adapter and backend metrics
    return {
      operationCounts: {
        ...backendMetrics.operationCounts,
        ...adapterMetrics.operationCounts
      },
      averageResponseTimes: {
        ...backendMetrics.averageResponseTimes,
        ...adapterMetrics.averageResponseTimes
      },
      errorRates: {
        ...backendMetrics.errorRates,
        ...adapterMetrics.errorRates
      },
      cacheHitRates: {
        ...backendMetrics.cacheHitRates,
        ...adapterMetrics.cacheHitRates
      },
      memoryUsage: Math.max(backendMetrics.memoryUsage, adapterMetrics.memoryUsage)
    };
  }
}

// EnhancedQdrantBackendAdapter removed in Phase 3 - only SurrealDB backend supported per requirement 6.1

/**
 * Enhanced factory function to create appropriate backend adapter with performance monitoring
 */
export function createEnhancedBackendAdapter(config: BackendConfig, circuitBreaker?: CircuitBreaker): VectorStore {
  switch (config.type.toLowerCase()) {
    case 'surreal':
    case 'surrealdb':
      return new EnhancedSurrealBackendAdapter(config, circuitBreaker);
    
    default:
      throw new Error(`Unsupported backend type: ${config.type}. Only SurrealDB is supported in Phase 3 per requirement 6.1`);
  }
}

/**
 * Enhanced utility function to create backend adapter from environment variables with performance monitoring
 */
export function createEnhancedBackendAdapterFromEnv(backendType?: string): VectorStore {
  const type = backendType || process.env.IN_MEMORIA_VECTOR_BACKEND || 'surreal';
  const configAdapter = new SurrealBackendConfigAdapter();
  const config = configAdapter.mapEnvironmentVariables();
  
  return createEnhancedBackendAdapter(config);
}
