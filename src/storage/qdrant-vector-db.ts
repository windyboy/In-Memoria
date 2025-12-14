import { QdrantClient } from "@qdrant/js-client-rest";
import { SurrealVectorDB } from "./vector-db.js";
import {
  CodeMetadata,
  SemanticSearchResult,
  VectorStore,
} from "./vector-store.js";
import { randomUUID } from "crypto";
import { EmbeddingConfig } from "./vector-types.js";
import { Logger } from "../utils/logger.js";

interface QdrantOptions {
  url: string;
  apiKey?: string;
  collection: string;
}

export class QdrantVectorDB extends SurrealVectorDB implements VectorStore {
  private client: QdrantClient;
  private collectionName: string;

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
    Logger.info(`✅ Qdrant client initialized`);
  }

  async initialize(collectionName: string = "in-memoria"): Promise<void> {
    Logger.info(`🚀 Initializing Qdrant vector database...`);
    this.collectionName = collectionName || this.collectionName;
    Logger.debug(`📁 Collection name: ${this.collectionName}`);
    Logger.debug(`📐 Embedding dimension: ${this.getEmbeddingDimension()}`);
    await this.ensureCollection();
    this.initialized = true;
    Logger.info(`✅ Qdrant vector database initialized successfully`);
  }

  private async ensureCollection(): Promise<void> {
    const dimension = this.getEmbeddingDimension();
    Logger.debug(`🔍 Ensuring Qdrant collection "${this.collectionName}"...`);

    // Always delete existing collection to force recreate with anonymous vectors
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

    Logger.info(
      `🆕 Creating Qdrant collection "${this.collectionName}" with anonymous vectors, dimension ${dimension}...`,
    );
    try {
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
    this.ensureInitialized();

    if (!query || query.trim() === "") {
      const filter = this.buildFilter(filters);
      const results = await this.client.scroll(this.collectionName, {
        limit,
        filter,
      });

      const points = results?.points || [];
      return points.map((point: any) => ({
        id: point.payload?.pointId || String(point.id),
        code: point.payload?.code || "",
        metadata: point.payload?.metadata,
        similarity: 0.5,
      }));
    }

    const embedding = await this.generateEmbedding(query);
    const filter = this.buildFilter(filters);

    const results = await this.client.search(this.collectionName, {
      vector: embedding as any,
      limit,
      filter,
    });

    return (results || []).map((point: any) => ({
      id: point.payload?.pointId || String(point.id),
      code: point.payload?.code || "",
      metadata: point.payload?.metadata,
      similarity: typeof point.score === "number" ? point.score : 0,
    }));
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

  async close(): Promise<void> {
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
