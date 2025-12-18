import { EmbeddingConfig } from './vector-types.js';

export interface CodeMetadata {
  id: string;
  filePath: string;
  functionName?: string;
  className?: string;
  language: string;
  complexity: number;
  lineCount: number;
  lastModified: Date;
}

export interface SemanticSearchResult {
  id: string;
  code: string;
  metadata: CodeMetadata;
  similarity: number;
}

export interface BackendCapabilities {
  supportsBatchOperations: boolean;
  supportsFiltering: boolean;
  supportsMetadataSearch: boolean;
  maxEmbeddingDimension: number;
  supportedDistanceMetrics: string[];
}

export interface BackendInfo {
  type: string;
  version: string;
  capabilities: BackendCapabilities;
  connectionStatus: 'connected' | 'disconnected' | 'error';
  metadata: Record<string, unknown>;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastChecked: Date;
  responseTime: number;
  details: Record<string, unknown>;
}

export interface PerformanceMetrics {
  operationCounts: Record<string, number>;
  averageResponseTimes: Record<string, number>;
  errorRates: Record<string, number>;
  cacheHitRates: Record<string, number>;
  memoryUsage: number;
}

export interface VectorStore {
  // Existing methods remain unchanged for backward compatibility
  initialize(collectionName?: string): Promise<void>;
  verifyEmbeddingModel(): Promise<void>;
  storeCodeEmbedding(code: string, metadata: CodeMetadata): Promise<void>;
  storeMultipleEmbeddings(codeChunks: string[], metadataList: CodeMetadata[]): Promise<void>;
  findSimilarCode(query: string, limit?: number, filters?: Record<string, unknown>): Promise<SemanticSearchResult[]>;
  findSimilarCodeByFile(filePath: string, limit?: number): Promise<SemanticSearchResult[]>;
  findSimilarCodeByLanguage(query: string, language: string, limit?: number): Promise<SemanticSearchResult[]>;
  updateCodeEmbedding(id: string, code: string, metadata: CodeMetadata): Promise<void>;
  deleteCodeEmbedding(id: string): Promise<void>;
  deleteCodeEmbeddingsByFile(filePath: string): Promise<void>;
  getCollectionStats(): Promise<{ count: number; metadata: unknown }>;
  close(): Promise<void>;
  
  // New standardized methods
  getBackendInfo(): BackendInfo;
  getHealthStatus(): Promise<HealthStatus>;
  getPerformanceMetrics(): Promise<PerformanceMetrics>;
}

export { EmbeddingConfig };

// Export error handling types for use by implementations
export {
  VectorStoreError,
  ConnectionError,
  ValidationError,
  OperationError,
  ConfigurationError,
  ErrorTranslator,
  createErrorTranslator,
  normalizeError,
  isVectorStoreError,
  getErrorMessage
} from './vector-errors.js';

// Export backend configuration types for use by implementations
export {
  BackendConfig,
  ValidationResult,
  PerformanceConfig,
  SurrealBackendConfigAdapter,
  mergeWithDefaults,
  validateAndNormalizeConfig
} from './backend-unified.js';

// Export backend adapter types for use by implementations
export {
  BaseBackendAdapter,
  SurrealBackendAdapter,
  createBackendAdapter,
  createBackendAdapterFromEnv,
  EnhancedSurrealBackendAdapter,
  // QdrantBackendAdapter and EnhancedQdrantBackendAdapter removed in Phase 3 - only SurrealDB supported per requirement 6.1
  createEnhancedBackendAdapter,
  createEnhancedBackendAdapterFromEnv
} from './backend-adapters.js';

// Export performance monitoring types for use by implementations
// Export consolidated diagnostic types for use by implementations
export {
  PerformanceMonitor,
  createPerformanceMonitor,
  OperationMetrics,
  MemoryMetrics,
  HealthCheckConfig,
  HealthCheckResult
} from './diagnostics.js';

// PerformanceOptimizer and related exports removed in Phase 3 - performance optimization consolidated

// Export data integrity and consistency types for use by implementations
export {
  DataIntegrityValidator,
  SemanticRelationshipManager,
  DataValidationResult,
  DataFormatSpec,
  MigrationContext,
  MetadataValidationRules
} from './data-integrity.js';

// DataMigrationManager and related exports removed in Phase 3 - data migration functionality consolidated

export {
  DataConsistencyManager,
  ConsistencyCheckResult,
  ConsistencyIssue,
  ConsistencyRepairOptions,
  ConsistencyRepairResult,
  DataConsistencyUtils,
  createDataConsistencyManager
} from './data-consistency.js';

// Export consolidated logging and monitoring types for use by implementations
export {
  LoggingMonitor,
  createLoggingMonitor,
  LogEntry,
  DiagnosticInfo,
  LoggingConfig,
  MonitoringConfig
} from './diagnostics.js';

// MonitoringIntegration and related exports removed in Phase 3 - monitoring functionality consolidated
