/**
 * Type-safe service keys for the DI Container
 * Provides compile-time type safety for service resolution
 */

// Service key type for type-safe service resolution
export interface ServiceKey<T> {
  readonly key: string;
  readonly type: T;
}

// Create a type-safe service key
function createServiceKey<T>(key: string): ServiceKey<T> {
  return { key, type: undefined as any };
}

// Core service keys for the four main services
export const ServiceKeys = {
  // Core services (Phase 1)
  ANALYSIS_SERVICE: createServiceKey<import('../services/AnalysisService.js').AnalysisService>('analysisService'),
  LEARNING_SERVICE: createServiceKey<import('../services/LearningService.js').LearningService>('learningService'),
  SEARCH_SERVICE: createServiceKey<import('../services/SearchService.js').SearchService>('searchService'),
  DIAGNOSTIC_SERVICE: createServiceKey<import('../services/DiagnosticService.js').DiagnosticService>('diagnosticService'),
  
  // Infrastructure dependencies
  DATABASE: createServiceKey<import('../../storage/sqlite-db.js').SQLiteDatabase>('database'),
  VECTOR_STORE: createServiceKey<import('../../storage/vector-store.js').VectorStore>('vectorStore'),
  
  // Engines (to be wrapped by services)
  SEMANTIC_ENGINE: createServiceKey<import('../../utils/semantic-engine.js').SemanticEngine>('semanticEngine'),
  PATTERN_ENGINE: createServiceKey<import('../../utils/pattern-engine.js').PatternEngine>('patternEngine'),
  // SEARCH_ENGINE removed - legacy module deleted in Phase 3
  
  // Utilities
  LOGGER: createServiceKey<typeof import('../../utils/logger.js').Logger>('logger'),
  PATH_VALIDATOR: createServiceKey<typeof import('../../utils/path-validator.js').PathValidator>('pathValidator'),
  CIRCUIT_BREAKER: createServiceKey<import('../../utils/circuit-breaker.js').CircuitBreaker>('circuitBreaker'),
} as const;

// Type helper to extract service type from service key
export type ServiceType<T extends ServiceKey<any>> = T['type'];

// Union type of all valid service keys
export type ValidServiceKey = typeof ServiceKeys[keyof typeof ServiceKeys];