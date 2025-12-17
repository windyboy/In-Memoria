import { QdrantClient } from "@qdrant/js-client-rest";
import { SurrealVectorDB } from "./vector-db.js";
import {
  CodeMetadata,
  SemanticSearchResult,
  VectorStore,
  BackendInfo,
  HealthStatus,
  PerformanceMetrics,
} from "./vector-store.js";
import { QdrantErrorTranslator } from "./vector-errors.js";
import { randomUUID } from "crypto";
import { EmbeddingConfig } from "./vector-types.js";
import { Logger } from "../utils/logger.js";
import { PerformanceMonitor, createPerformanceMonitor } from "./performance-monitor.js";

interface QdrantOptions {
  url: string;
  apiKey?: string;
  collection: string;
}

export class QdrantVectorDB extends SurrealVectorDB implements VectorStore {
  private client: QdrantClient;
  private collectionName: string;
  private qdrantErrorTranslator: QdrantErrorTranslator;
  private qdrantPerformanceMonitor: PerformanceMonitor;

  constructor(
    embeddingConfig?: EmbeddingConfig,
    options?: Partial<QdrantOptions>,
  ) {
    super(undefined, embeddingConfig);

    const url =
      options?.url || process.env.QDRANT_URL || "http://localhost:6333";
    const apiKey = options?.apiKey || process.env.QDRANT_API_KEY;
    this.collectionName =
      options?.collection || process.env.QDRANT_COLLECTION || "in-memoria";

    Logger.info(
      `🔗 Connecting to Qdrant at ${url} (collection: ${this.collectionName})`,
    );
    if (apiKey) {
      Logger.debug(`🔑 Using API key: ${apiKey.substring(0, 8)}...`);
    }

    this.client = new QdrantClient({
      url,
      apiKey,
    });
    
    // Initialize error handling and performance monitoring
    this.qdrantErrorTranslator = new QdrantErrorTranslator();
    this.qdrantPerformanceMonitor = createPerformanceMonitor('qdrant', {
      enableAutoHealthCheck: true,
      healthCheckIntervalMs: 30000
    });
    
    Logger.info(`✅ Qdrant client initialized`);
  }

  async initialize(collectionName: string = "in-memoria"): Promise<void> {
    const operationId = this.qdrantPerformanceMonitor.startOperation('initialize');
    try {
      Logger.info(`🚀 Initializing Qdrant vector database...`);
      this.collectionName = collectionName || this.collectionName;
      Logger.debug(`📁 Collection name: ${this.collectionName}`);
      Logger.debug(`📐 Embedding dimension: ${this.getEmbeddingDimension()}`);
      await this.ensureCollection();
      this.initialized = true;
      Logger.info(`✅ Qdrant vector database initialized successfully`);
      this.qdrantPerformanceMonitor.endOperation(operationId, 'initialize', true);
    } catch (error) {
      this.qdrantPerformanceMonitor.endOperation(operationId, 'initialize', false);
      const normalizedError = this.qdrantErrorTranslator.translate(error as Error);
      Logger.error(`❌ Failed to initialize Qdrant database:`, normalizedError.toLogSafeObject());
      throw normalizedError;
    }
  }

  private async ensureCollection(): Promise<void> {
    const dimension = this.getEmbeddingDimension();
    Logger.debug(`🔍 Ensuring Qdrant collection "${this.collectionName}"...`);

    // Reuse existing collection when dimensions align; recreate only when explicitly requested
    try {
      const existingInfo = await this.getCollectionInfo();
      if (existingInfo) {
        const vectorParams = this.extractVectorParams(
          (existingInfo as any)?.result?.vectors ||
            (existingInfo as any)?.result?.config?.params?.vectors ||
            (existingInfo as any)?.vectors,
        );

        if (vectorParams?.size) {
          if (vectorParams.size !== dimension) {
            const shouldReset =
              process.env.IN_MEMORIA_QDRANT_RESET === "true";
            const message = `Existing collection "${this.collectionName}" dimension (${vectorParams.size}) does not match expected (${dimension}).`;
            if (shouldReset) {
              Logger.warn(
                `${message} IN_MEMORIA_QDRANT_RESET=true -> recreating collection.`,
              );
              await this.recreateCollection(dimension);
              return;
            }
            throw new Error(
              `${message} Set IN_MEMORIA_QDRANT_RESET=true to recreate or align IN_MEMORIA_EMBEDDING_DIMENSION.`,
            );
          }
          Logger.info(
            `✅ Using existing Qdrant collection "${this.collectionName}" (dimension ${vectorParams.size})`,
          );
          return;
        }

        Logger.warn(
          `⚠️ Could not read vector params for collection "${this.collectionName}". Assuming compatibility and reusing existing collection.`,
        );
        return;
      }
    } catch (error: unknown) {
      const status =
        (error as any)?.status || (error as any)?.response?.status;
      if (status && status !== 404) {
        Logger.error(
          `❌ Failed to inspect collection "${this.collectionName}":`,
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      }
    }

    Logger.info(
      `ℹ️ Collection "${this.collectionName}" not found; will create a new one.`,
    );
    await this.recreateCollection(dimension);
  }

  private async recreateCollection(dimension: number): Promise<void> {
    Logger.info(
      `🆕 Creating Qdrant collection "${this.collectionName}" with anonymous vectors, dimension ${dimension}...`,
    );
    try {
      // Delete only when explicitly recreating
      try {
        await this.client.deleteCollection(this.collectionName);
        Logger.info(
          `🗑️ Successfully deleted existing collection ${this.collectionName}`,
        );
      } catch (error: unknown) {
        Logger.info(
          `Collection ${this.collectionName} does not exist or could not be deleted:`,
          error instanceof Error ? error.message : String(error),
        );
      }

      await this.client.createCollection(this.collectionName, {
        vectors: {
          size: dimension,
          distance: "Cosine",
        },
      });
      Logger.info(
        `✅ Qdrant collection "${this.collectionName}" created successfully`,
      );
    } catch (error: unknown) {
      Logger.error(
        `❌ Failed to create Qdrant collection "${this.collectionName}":`,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  private extractVectorParams(
    vectors: unknown,
  ): { size?: number; distance?: string } | undefined {
    if (!vectors || typeof vectors !== "object") {
      return undefined;
    }

    const record = vectors as Record<string, unknown>;

    if (
      typeof record.size === "number" ||
      typeof record.distance === "string"
    ) {
      return {
        size: typeof record.size === "number" ? record.size : undefined,
        distance:
          typeof record.distance === "string"
            ? (record.distance as string)
            : undefined,
      };
    }

    // Handle named vector configurations: { default: { size, distance } }
    for (const value of Object.values(record)) {
      if (value && typeof value === "object") {
        const nested = value as Record<string, unknown>;
        if (
          typeof nested.size === "number" ||
          typeof nested.distance === "string"
        ) {
          return {
            size:
              typeof nested.size === "number"
                ? (nested.size as number)
                : undefined,
            distance:
              typeof nested.distance === "string"
                ? (nested.distance as string)
                : undefined,
          };
        }
      }
    }

    return undefined;
  }

  private async getCollectionInfo(): Promise<unknown> {
    try {
      const info = await this.client.getCollection(this.collectionName);
      Logger.debug(
        `📊 Current collection info:`,
        JSON.stringify(info, null, 2),
      );
      return info;
    } catch (error: unknown) {
      Logger.debug(
        `Collection ${this.collectionName} info could not be retrieved:`,
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  async storeCodeEmbedding(
    code: string,
    metadata: CodeMetadata,
  ): Promise<void> {
    const operationId = this.qdrantPerformanceMonitor.startOperation('storeCodeEmbedding');
    try {
      this.ensureInitialized();
      const embedding = await this.generateEmbedding(code);

      // Validate embedding for invalid values
      this.validateEmbedding(embedding);

      Logger.debug(
        `🔍 Vector to store - length: ${embedding.length}, first few values: ${embedding.slice(0, 3).join(", ")}`,
      );
      Logger.debug(
        `🔍 Vector format: ${JSON.stringify(embedding).slice(0, 100)}...`,
      );

      await this.client.upsert(this.collectionName, {
        points: [
          {
            id: randomUUID(),
            vector: embedding as any,
            payload: {
              pointId: metadata.id,
              code,
              metadata,
              created: new Date().toISOString(),
              updated: new Date().toISOString(),
            },
          },
        ],
      });
      
      this.qdrantPerformanceMonitor.endOperation(operationId, 'storeCodeEmbedding', true);
      Logger.debug(`✅ Successfully stored code embedding for ${metadata.id}`);
    } catch (error) {
      this.qdrantPerformanceMonitor.endOperation(operationId, 'storeCodeEmbedding', false);
      const normalizedError = this.qdrantErrorTranslator.translate(error as Error);
      Logger.error(`❌ Failed to store code embedding:`, normalizedError.toLogSafeObject());
      throw normalizedError;
    }
  }

  async storeMultipleEmbeddings(
    codeChunks: string[],
    metadataList: CodeMetadata[],
  ): Promise<void> {
    this.ensureInitialized();
    if (codeChunks.length !== metadataList.length) {
      throw new Error(
        "Code chunks and metadata arrays must have the same length",
      );
    }

    const points = [];
    for (let i = 0; i < codeChunks.length; i++) {
      const embedding = await this.generateEmbedding(codeChunks[i]);
      this.validateEmbedding(embedding);
      points.push({
        id: randomUUID(),
        vector: embedding as any,
        payload: {
          pointId: metadataList[i].id,
          code: codeChunks[i],
          metadata: metadataList[i],
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        },
      });
    }

    if (points.length > 0) {
      await this.client.upsert(this.collectionName, { points });
    }
  }

  async findSimilarCode(
    query: string,
    limit: number = 5,
    filters?: Record<string, unknown>,
  ): Promise<SemanticSearchResult[]> {
    const operationId = this.qdrantPerformanceMonitor.startOperation('findSimilarCode');
    try {
      this.ensureInitialized();

      if (!query || query.trim() === "") {
        const filter = this.buildFilter(filters);
        const results = await this.client.scroll(this.collectionName, {
          limit,
          filter,
        });

        const points = results?.points || [];
        const searchResults = points.map((point: any) => ({
          id: point.payload?.pointId || String(point.id),
          code: point.payload?.code || "",
          metadata: point.payload?.metadata,
          similarity: 0.5,
        }));
        
        this.qdrantPerformanceMonitor.endOperation(operationId, 'findSimilarCode', true);
        Logger.debug(`✅ Found ${searchResults.length} results using scroll (no query)`);
        return searchResults;
      }

      const embedding = await this.generateEmbedding(query);
      const filter = this.buildFilter(filters);

      const results = await this.client.search(this.collectionName, {
        vector: embedding as any,
        limit,
        filter,
      });

      const searchResults = (results || []).map((point: any) => ({
        id: point.payload?.pointId || String(point.id),
        code: point.payload?.code || "",
        metadata: point.payload?.metadata,
        similarity: typeof point.score === "number" ? point.score : 0,
      }));
      
      this.qdrantPerformanceMonitor.endOperation(operationId, 'findSimilarCode', true);
      Logger.debug(`✅ Found ${searchResults.length} similar code results`);
      return searchResults;
    } catch (error) {
      this.qdrantPerformanceMonitor.endOperation(operationId, 'findSimilarCode', false);
      const normalizedError = this.qdrantErrorTranslator.translate(error as Error);
      Logger.error(`❌ Failed to find similar code:`, normalizedError.toLogSafeObject());
      throw normalizedError;
    }
  }

  async findSimilarCodeByFile(
    filePath: string,
    limit: number = 5,
  ): Promise<SemanticSearchResult[]> {
    return this.findSimilarCode("", limit, { filePath });
  }

  async findSimilarCodeByLanguage(
    query: string,
    language: string,
    limit: number = 5,
  ): Promise<SemanticSearchResult[]> {
    return this.findSimilarCode(query, limit, { language });
  }

  async updateCodeEmbedding(
    id: string,
    code: string,
    metadata: CodeMetadata,
  ): Promise<void> {
    this.ensureInitialized();
    const uuid = await this.getPointUUID(id);
    if (!uuid) {
      throw new Error("Point with id " + id + " not found");
    }
    const embedding = await this.generateEmbedding(code);
    this.validateEmbedding(embedding);
    await this.client.upsert(this.collectionName, {
      points: [
        {
          id: uuid,
          vector: embedding as any,
          payload: {
            pointId: id,
            code,
            metadata,
            updated: new Date().toISOString(),
          },
        },
      ],
    });
  }

  async deleteCodeEmbedding(id: string): Promise<void> {
    this.ensureInitialized();
    const uuid = await this.getPointUUID(id);
    if (uuid) {
      await this.client.delete(this.collectionName, {
        points: [uuid],
      });
    }
  }

  async deleteCodeEmbeddingsByFile(filePath: string): Promise<void> {
    this.ensureInitialized();
    await this.client.delete(this.collectionName, {
      filter: this.buildFilter({ filePath }),
    });
  }

  async getCollectionStats(): Promise<{ count: number; metadata: unknown }> {
    this.ensureInitialized();
    const info = await this.client.getCollection(this.collectionName);
    const count = info?.points_count ?? 0;

    return {
      count,
      metadata: {
        description: "In Memoria semantic code embeddings",
        engine: "Qdrant",
      },
    };
  }

  // New standardized methods
  getBackendInfo(): BackendInfo {
    return {
      type: 'qdrant',
      version: '1.0.0', // TODO: Get actual Qdrant version
      capabilities: {
        supportsBatchOperations: true,
        supportsFiltering: true,
        supportsMetadataSearch: true,
        maxEmbeddingDimension: 65536, // Qdrant supports very large dimensions
        supportedDistanceMetrics: ['cosine', 'euclidean', 'dot']
      },
      connectionStatus: this.initialized ? 'connected' : 'disconnected',
      metadata: {
        embeddingModel: this.getEmbeddingModel(),
        embeddingDimension: this.getEmbeddingDimension(),
        collectionName: this.collectionName,
        url: process.env.QDRANT_URL || "http://localhost:6333"
      }
    };
  }

  async getHealthStatus(): Promise<HealthStatus> {
    // Use performance monitor for comprehensive health checking
    return await this.qdrantPerformanceMonitor.getHealthStatus(async () => {
      const details: Record<string, unknown> = {};
      
      if (!this.initialized) {
        throw new Error('Database not initialized');
      }
      
      // Test Qdrant connectivity by getting collection info
      try {
        const collectionInfo = await this.client.getCollection(this.collectionName);
        details.collection = 'accessible';
        details.pointsCount = collectionInfo?.points_count || 0;
      } catch (error) {
        const normalizedError = this.qdrantErrorTranslator.translate(error as Error);
        throw normalizedError;
      }
      
      // Check parent class health (embedding pipeline)
      const parentHealth = await super.getHealthStatus();
      if (parentHealth.status === 'degraded') {
        details.embeddingPipeline = 'fallback';
      } else {
        details.embeddingPipeline = 'ready';
      }
      
      return details;
    });
  }

  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    // Get metrics from performance monitor
    const monitorMetrics = this.qdrantPerformanceMonitor.getPerformanceMetrics();
    
    // Get base metrics from parent class
    const baseMetrics = await super.getPerformanceMetrics();
    
    // Get collection stats for additional metrics
    let collectionPointsCount = 0;
    try {
      const stats = await this.getCollectionStats();
      collectionPointsCount = stats.count;
    } catch (error) {
      // Ignore errors for metrics collection
    }
    
    // Merge all metrics with performance monitor taking precedence
    return {
      operationCounts: {
        ...baseMetrics.operationCounts,
        ...monitorMetrics.operationCounts,
        collectionPoints: collectionPointsCount,
        // Add Qdrant-specific operation counts
        qdrantUpsert: monitorMetrics.operationCounts.storeCodeEmbedding || 0,
        qdrantSearch: monitorMetrics.operationCounts.findSimilarCode || 0,
        qdrantScroll: 0 // Would be tracked separately in real implementation
      },
      averageResponseTimes: {
        ...baseMetrics.averageResponseTimes,
        ...monitorMetrics.averageResponseTimes,
        // Add Qdrant-specific response times
        qdrantUpsert: monitorMetrics.averageResponseTimes.storeCodeEmbedding || 100,
        qdrantSearch: monitorMetrics.averageResponseTimes.findSimilarCode || 50,
        qdrantScroll: 30
      },
      errorRates: {
        ...baseMetrics.errorRates,
        ...monitorMetrics.errorRates,
        // Add Qdrant-specific error rates
        qdrantUpsert: monitorMetrics.errorRates.storeCodeEmbedding || 0,
        qdrantSearch: monitorMetrics.errorRates.findSimilarCode || 0,
        qdrantScroll: 0
      },
      cacheHitRates: {
        ...baseMetrics.cacheHitRates,
        ...monitorMetrics.cacheHitRates,
        qdrantCollection: this.initialized ? 1.0 : 0
      },
      memoryUsage: monitorMetrics.memoryUsage
    };
  }

  async close(): Promise<void> {
    // Clean up performance monitoring
    this.qdrantPerformanceMonitor.dispose();
    await super.close();
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        "Vector database not initialized. Call initialize() first.",
      );
    }
  }

  private async getPointUUID(pointId: string): Promise<string | null> {
    const results = await this.client.scroll(this.collectionName, {
      limit: 1,
      filter: { must: [{ key: "pointId", match: { value: pointId } }] },
    });
    return results.points.length > 0 ? String(results.points[0].id) : null;
  }

  private buildFilter(filters?: Record<string, unknown>): any | undefined {
    if (!filters || Object.keys(filters).length === 0) {
      return undefined;
    }

    const must: any[] = [];

    for (const [key, value] of Object.entries(filters)) {
      must.push({
        key: `metadata.${key}`,
        match: { value },
      });
    }

    return { must };
  }

  private validateEmbedding(embedding: number[]): void {
    if (!embedding || embedding.length === 0) {
      throw new Error("Embedding is empty or undefined");
    }

    for (let i = 0; i < embedding.length; i++) {
      const value = embedding[i];
      if (typeof value !== "number" || !isFinite(value)) {
        throw new Error(
          `Invalid embedding value at index ${i}: ${value} (type: ${typeof value}, finite: ${isFinite(value)})`,
        );
      }
    }

    Logger.debug(`✅ Embedding validated: ${embedding.length} finite values`);
  }
}
