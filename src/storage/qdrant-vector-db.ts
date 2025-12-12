import { QdrantClient } from '@qdrant/js-client-rest';
import { SurrealVectorDB } from './vector-db.js';
import { CodeMetadata, SemanticSearchResult, VectorStore } from './vector-store.js';
import { EmbeddingConfig } from './vector-types.js';
import { Logger } from '../utils/logger.js';

interface QdrantOptions {
  url: string;
  apiKey?: string;
  collection: string;
}

export class QdrantVectorDB extends SurrealVectorDB implements VectorStore {
  private client: QdrantClient;
  private collectionName: string;
  private initialized = false;

  constructor(embeddingConfig?: EmbeddingConfig, options?: Partial<QdrantOptions>) {
    super(undefined, embeddingConfig);

    const url = options?.url || process.env.QDRANT_URL || 'http://localhost:6333';
    const apiKey = options?.apiKey || process.env.QDRANT_API_KEY;
    this.collectionName = options?.collection || process.env.QDRANT_COLLECTION || 'in-memoria';

    this.client = new QdrantClient({
      url,
      apiKey,
      prefer_grpc: false
    });
  }

  async initialize(collectionName: string = 'in-memoria'): Promise<void> {
    this.collectionName = collectionName || this.collectionName;
    await this.ensureCollection();
    this.initialized = true;
  }

  private async ensureCollection(): Promise<void> {
    const dimension = this.getEmbeddingDimension();

    try {
      const collection = await this.client.getCollection(this.collectionName);
      const vectorsConfig = (collection?.result as any)?.config?.params?.vectors || (collection?.result as any)?.vectors;

      const size = vectorsConfig?.size ?? vectorsConfig?.params?.size;
      const distance = vectorsConfig?.distance ?? vectorsConfig?.params?.distance;

      if (size !== dimension || (distance && distance.toLowerCase() !== 'cosine')) {
        throw new Error(
          `Qdrant collection dimension/distance mismatch (expected ${dimension}/Cosine, got ${size}/${distance})`
        );
      }
      return;
    } catch (error: unknown) {
      Logger.warn(`Qdrant collection check failed (${this.collectionName}), attempting to create:`, error);
    }

    await this.client.createCollection(this.collectionName, {
      vectors: {
        size: dimension,
        distance: 'Cosine'
      }
    });
  }

  async storeCodeEmbedding(code: string, metadata: CodeMetadata): Promise<void> {
    this.ensureInitialized();
    const embedding = await this.generateEmbedding(code);

    await this.client.upsert(this.collectionName, {
      points: [
        {
          id: metadata.id,
          vector: embedding,
          payload: {
            code,
            metadata,
            created: new Date().toISOString(),
            updated: new Date().toISOString()
          }
        }
      ]
    });
  }

  async storeMultipleEmbeddings(codeChunks: string[], metadataList: CodeMetadata[]): Promise<void> {
    this.ensureInitialized();
    if (codeChunks.length !== metadataList.length) {
      throw new Error('Code chunks and metadata arrays must have the same length');
    }

    const points = [];
    for (let i = 0; i < codeChunks.length; i++) {
      const embedding = await this.generateEmbedding(codeChunks[i]);
      points.push({
        id: metadataList[i].id,
        vector: embedding,
        payload: {
          code: codeChunks[i],
          metadata: metadataList[i],
          created: new Date().toISOString(),
          updated: new Date().toISOString()
        }
      });
    }

    if (points.length > 0) {
      await this.client.upsert(this.collectionName, { points });
    }
  }

  async findSimilarCode(
    query: string,
    limit: number = 5,
    filters?: Record<string, unknown>
  ): Promise<SemanticSearchResult[]> {
    this.ensureInitialized();

    if (!query || query.trim() === '') {
      const filter = this.buildFilter(filters);
      const results = await this.client.scroll(this.collectionName, {
        limit,
        filter
      });

      const points = results?.result?.points || [];
      return points.map((point: any) => ({
        id: String(point.id),
        code: point.payload?.code || '',
        metadata: point.payload?.metadata,
        similarity: 0.5
      }));
    }

    const embedding = await this.generateEmbedding(query);
    const filter = this.buildFilter(filters);

    const results = await this.client.search(this.collectionName, {
      vector: embedding,
      limit,
      filter
    });

    return (results || []).map((point: any) => ({
      id: String(point.id),
      code: point.payload?.code || '',
      metadata: point.payload?.metadata,
      similarity: typeof point.score === 'number' ? point.score : 0
    }));
  }

  async findSimilarCodeByFile(filePath: string, limit: number = 5): Promise<SemanticSearchResult[]> {
    return this.findSimilarCode('', limit, { filePath });
  }

  async findSimilarCodeByLanguage(
    query: string,
    language: string,
    limit: number = 5
  ): Promise<SemanticSearchResult[]> {
    return this.findSimilarCode(query, limit, { language });
  }

  async updateCodeEmbedding(id: string, code: string, metadata: CodeMetadata): Promise<void> {
    this.ensureInitialized();
    const embedding = await this.generateEmbedding(code);

    await this.client.upsert(this.collectionName, {
      points: [
        {
          id,
          vector: embedding,
          payload: {
            code,
            metadata,
            updated: new Date().toISOString()
          }
        }
      ]
    });
  }

  async deleteCodeEmbedding(id: string): Promise<void> {
    this.ensureInitialized();
    await this.client.delete(this.collectionName, {
      points: [id]
    });
  }

  async deleteCodeEmbeddingsByFile(filePath: string): Promise<void> {
    this.ensureInitialized();
    await this.client.delete(this.collectionName, {
      filter: this.buildFilter({ filePath })
    });
  }

  async getCollectionStats(): Promise<{ count: number; metadata: unknown }> {
    this.ensureInitialized();
    const info = await this.client.getCollection(this.collectionName);
    const count = (info as any)?.result?.points_count || 0;

    return {
      count,
      metadata: {
        description: 'In Memoria semantic code embeddings',
        engine: 'Qdrant'
      }
    };
  }

  async close(): Promise<void> {
    await super.close();
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Vector database not initialized. Call initialize() first.');
    }
  }

  private buildFilter(filters?: Record<string, unknown>): any | undefined {
    if (!filters || Object.keys(filters).length === 0) {
      return undefined;
    }

    const must: any[] = [];

    for (const [key, value] of Object.entries(filters)) {
      must.push({
        key: `metadata.${key}`,
        match: { value }
      });
    }

    return { must };
  }
}
