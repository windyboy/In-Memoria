import { QdrantClient } from "@qdrant/js-client-rest";
import { SurrealVectorDB } from "./vector-db.js";
import {
    CodeMetadata,
    SemanticSearchResult,
    VectorStore,
} from "./vector-store.js";
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
            options?.collection ||
            process.env.QDRANT_COLLECTION ||
            "in-memoria";

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
        Logger.debug(
            `🔍 Checking Qdrant collection "${this.collectionName}"...`,
        );

        try {
            Logger.debug(`📡 Fetching collection info from Qdrant...`);
            const collection = await this.client.getCollection(
                this.collectionName,
            );
            Logger.debug(`✅ Collection exists: ${this.collectionName}`);

            const vectorsConfig =
                (collection as any)?.config?.params?.vectors ??
                (collection as any)?.vectors;

            const vectorParams = this.extractVectorParams(vectorsConfig);
            const size = vectorParams?.size;
            const distance =
                typeof vectorParams?.distance === "string"
                    ? vectorParams.distance.toLowerCase()
                    : undefined;

            if (size !== dimension || (distance && distance !== "cosine")) {
                throw new Error(
                    `Qdrant collection dimension/distance mismatch (expected ${dimension}/Cosine, got ${size}/${vectorParams?.distance})`,
                );
            }
            Logger.debug(
                `📐 Collection configuration matches: dimension=${dimension}, distance=cosine`,
            );
            Logger.info(
                `✅ Qdrant collection "${this.collectionName}" is ready`,
            );
            return;
        } catch (error: unknown) {
            Logger.warn(
                `Qdrant collection check failed (${this.collectionName}), attempting to create:`,
                error,
            );
        }

        Logger.info(
            `🆕 Creating Qdrant collection "${this.collectionName}" with dimension ${dimension}...`,
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
                error,
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
        const size = typeof record.size === "number" ? record.size : undefined;
        const distance =
            typeof record.distance === "string" ? record.distance : undefined;

        if (size !== undefined || distance !== undefined) {
            return { size, distance };
        }

        if (record.params && typeof record.params === "object") {
            return this.extractVectorParams(record.params);
        }

        const firstEntry = Object.values(record)[0];
        return firstEntry ? this.extractVectorParams(firstEntry) : undefined;
    }

    async storeCodeEmbedding(
        code: string,
        metadata: CodeMetadata,
    ): Promise<void> {
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
            points.push({
                id: metadataList[i].id,
                vector: embedding,
                payload: {
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
                id: String(point.id),
                code: point.payload?.code || "",
                metadata: point.payload?.metadata,
                similarity: 0.5,
            }));
        }

        const embedding = await this.generateEmbedding(query);
        const filter = this.buildFilter(filters);

        const results = await this.client.search(this.collectionName, {
            vector: embedding,
            limit,
            filter,
        });

        return (results || []).map((point: any) => ({
            id: String(point.id),
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
        const embedding = await this.generateEmbedding(code);

        await this.client.upsert(this.collectionName, {
            points: [
                {
                    id,
                    vector: embedding,
                    payload: {
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
        await this.client.delete(this.collectionName, {
            points: [id],
        });
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
}
