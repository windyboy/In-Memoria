import { DIContainer, DIContainerConfig, Container } from './container/container.js';
import { ServiceKeys } from './container/service-keys.js';
import { SQLiteDatabase } from '../storage/sqlite-db.js';
import { VectorStore } from '../storage/vector-store.js';
import { createVectorStore } from '../storage/backend-unified.js';
import { SemanticEngine } from '../utils/semantic-engine.js';
import { PatternEngine } from '../utils/pattern-engine.js';
import { Logger } from '../utils/logger.js';
import { PathValidator } from '../utils/path-validator.js';
import { createRustAnalyzerCircuitBreaker } from '../utils/circuit-breaker.js';
import { config } from '../utils/config.js';

// Global container instance for singleton behavior
let globalContainer: DIContainer | null = null;

/**
 * Initialize the DI Container with default services
 * This is the single entry point for the entire system
 */
export async function initializeDIContainer(options: { projectPath: string }): Promise<Container> {
  // Dispose existing container if it exists
  if (globalContainer) {
    await globalContainer.dispose();
  }

  // Create new container with configuration
  const containerConfig: DIContainerConfig = {
    projectPath: options.projectPath,
    enableCircuitBreaker: true,
  };

  globalContainer = new DIContainer(containerConfig);

  // Register infrastructure services first
  registerInfrastructureServices(globalContainer, options.projectPath);

  // Register engine services (to be wrapped by service layer)
  registerEngineServices(globalContainer);
  
  // Register service layer
  registerServiceLayer(globalContainer);

  // Register utility services
  registerUtilityServices(globalContainer);

  // Pre-initialize all four core services for synchronous access
  await globalContainer.get(ServiceKeys.ANALYSIS_SERVICE);
  await globalContainer.get(ServiceKeys.LEARNING_SERVICE);
  await globalContainer.get(ServiceKeys.SEARCH_SERVICE);
  await globalContainer.get(ServiceKeys.DIAGNOSTIC_SERVICE);

  // Mark container as initialized
  globalContainer.markInitialized();

  // Return the container interface with the four core services
  // Note: The actual service implementations will be created in subsequent tasks
  return await createContainerInterface(globalContainer);
}

/**
 * Get the current DI container instance
 * Throws if container is not initialized
 */
export function getCurrentContainer(): DIContainer {
  if (!globalContainer || !globalContainer.initialized) {
    throw new Error('DI Container not initialized. Call initializeDIContainer() first.');
  }
  return globalContainer;
}

/**
 * Dispose of the current container and clean up resources
 */
export async function disposeDIContainer(): Promise<void> {
  if (globalContainer) {
    await globalContainer.dispose();
    globalContainer = null;
  }
}

/**
 * Register infrastructure services (database, vector store)
 */
function registerInfrastructureServices(container: DIContainer, projectPath: string): void {
  // Register SQLite database
  container.registerFactory(ServiceKeys.DATABASE, () => {
    const dbPath = config.getDatabasePath(projectPath);
    return new SQLiteDatabase(dbPath);
  });

  // Register vector store
  container.registerFactory(ServiceKeys.VECTOR_STORE, async () => {
    const embeddingConfig = config.getEmbeddingConfig();
    const vectorStore = createVectorStore(embeddingConfig);
    
    // Verify embedding model
    await vectorStore.verifyEmbeddingModel();
    
    return vectorStore;
  });
}

/**
 * Register engine services (semantic, pattern, search engines)
 */
function registerEngineServices(container: DIContainer): void {
  // Register semantic engine
  container.registerFactory(ServiceKeys.SEMANTIC_ENGINE, async () => {
    const database = await container.get(ServiceKeys.DATABASE);
    const vectorStore = await container.get(ServiceKeys.VECTOR_STORE);
    return new SemanticEngine();
  });

  // Register pattern engine
  container.registerFactory(ServiceKeys.PATTERN_ENGINE, async () => {
    const database = await container.get(ServiceKeys.DATABASE);
    return new PatternEngine(database);
  });
}

/**
 * Register service layer (Phase 1 services)
 */
function registerServiceLayer(container: DIContainer): void {
  // Register AnalysisService (implemented in Phase 1)
  container.registerFactory(ServiceKeys.ANALYSIS_SERVICE, async () => {
    const { AnalysisService } = await import('./services/AnalysisService.js');
    const semanticEngine = await container.get(ServiceKeys.SEMANTIC_ENGINE);
    const patternEngine = await container.get(ServiceKeys.PATTERN_ENGINE);
    const database = await container.get(ServiceKeys.DATABASE);
    return new AnalysisService(semanticEngine, patternEngine, database);
  });
  
  // Register LearningService (implemented in Phase 1) - now uses single SurrealDB backend internally
  container.registerFactory(ServiceKeys.LEARNING_SERVICE, async () => {
    const { LearningServiceImpl } = await import('./services/LearningService.js');
    const semanticEngine = await container.get(ServiceKeys.SEMANTIC_ENGINE);
    const patternEngine = await container.get(ServiceKeys.PATTERN_ENGINE);
    const database = await container.get(ServiceKeys.DATABASE);
    return new LearningServiceImpl(semanticEngine, patternEngine, database);
  });
  
  // Register SearchService (implemented in task 4)
  container.registerFactory(ServiceKeys.SEARCH_SERVICE, async () => {
    const { SearchServiceImpl } = await import('./services/SearchService.js');
    const vectorStore = await container.get(ServiceKeys.VECTOR_STORE);
    
    // Create a real SearchEngine that uses the vector store
    const searchEngine = {
      search: async (query: any) => {
        try {
          const results = await vectorStore.findSimilarCode(query.query, query.limit || 20, query.filters);
          return {
            results: results.map((result: any) => ({
              id: result.id,
              content: result.code || result.content || '',
              metadata: result.metadata || {},
              score: result.score || 0,
              filePath: result.filePath || result.metadata?.filePath || '',
              language: result.language || result.metadata?.language || 'unknown'
            })),
            totalFound: results.length,
            searchType: query.type || 'semantic'
          };
        } catch (error) {
          Logger.warn(`Search engine error: ${error instanceof Error ? error.message : String(error)}`);
          return { results: [], totalFound: 0, searchType: query.type || 'semantic' };
        }
      }
    };
    return new SearchServiceImpl(searchEngine as any);
  });
  
  // Register DiagnosticService (implemented in task 5)
  container.registerFactory(ServiceKeys.DIAGNOSTIC_SERVICE, async () => {
    const { DiagnosticServiceImpl } = await import('./services/DiagnosticService.js');
    const database = await container.get(ServiceKeys.DATABASE);
    const vectorStore = await container.get(ServiceKeys.VECTOR_STORE);
    return new DiagnosticServiceImpl(database, vectorStore);
  });
}

/**
 * Register utility services (logger, path validator, circuit breaker)
 */
function registerUtilityServices(container: DIContainer): void {
  // Register logger (singleton instance)
  container.register(ServiceKeys.LOGGER, Logger);

  // Register path validator (singleton instance)
  container.register(ServiceKeys.PATH_VALIDATOR, PathValidator);

  // Register circuit breaker
  container.registerFactory(ServiceKeys.CIRCUIT_BREAKER, () => {
    return createRustAnalyzerCircuitBreaker();
  });
}

/**
 * Create the container interface that exposes the four core services
 * Note: This is a placeholder implementation. The actual services will be implemented in subsequent tasks.
 */
async function createContainerInterface(container: DIContainer): Promise<Container> {
  // Import the placeholder service classes dynamically
  const { AnalysisServiceImpl } = await import('./services/AnalysisService.js');
  const { LearningServiceImpl } = await import('./services/LearningService.js');
  const { SearchServiceImpl } = await import('./services/SearchService.js');
  const { DiagnosticServiceImpl } = await import('./services/DiagnosticService.js');

  return {
    get analysisService() {
      // Return pre-initialized AnalysisService instance
      return container.getSync(ServiceKeys.ANALYSIS_SERVICE);
    },
    get learningService() {
      // Return pre-initialized LearningService instance
      return container.getSync(ServiceKeys.LEARNING_SERVICE);
    },
    get searchService() {
      // Return pre-initialized SearchService instance
      return container.getSync(ServiceKeys.SEARCH_SERVICE);
    },
    get diagnosticService() {
      // Return pre-initialized DiagnosticService instance
      return container.getSync(ServiceKeys.DIAGNOSTIC_SERVICE);
    },
  };
}

/**
 * Check if the DI container is initialized
 */
export function isContainerInitialized(): boolean {
  return globalContainer !== null && globalContainer.initialized;
}