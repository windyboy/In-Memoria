import { ConfigManager } from "../config/config.js";
import { QdrantVectorDB } from "./qdrant-vector-db.js";
import { SurrealVectorDB } from "./vector-db.js";
import { VectorStore } from "./vector-store.js";
import { EmbeddingConfig } from "./vector-types.js";
import { Logger } from "../utils/logger.js";

/**
 * Create a vector store based on configuration/environment.
 * Defaults to Surreal (local SurrealKV) when no override is provided.
 */
export function createVectorStore(
    embeddingConfig?: EmbeddingConfig,
): VectorStore {
    const config = ConfigManager.getInstance().getConfig();

    const backendEnv = process.env.IN_MEMORIA_VECTOR_BACKEND?.toLowerCase();
    const backend =
        backendEnv === "qdrant" || backendEnv === "surreal"
            ? backendEnv
            : config.vectorBackend || "surreal";

    const resolvedEmbedding = embeddingConfig || config.embedding;

    Logger.info(`🔧 Creating vector store with backend: ${backend}`);
    Logger.info(`   Model: ${resolvedEmbedding.model}`);
    Logger.info(`   Dimension: ${resolvedEmbedding.dimension}`);

    if (backend === "qdrant") {
        const qdrantOptions = {
            url: process.env.QDRANT_URL || config.qdrant?.url,
            apiKey: process.env.QDRANT_API_KEY || config.qdrant?.apiKey,
            collection:
                process.env.QDRANT_COLLECTION ||
                config.qdrant?.collection ||
                "in-memoria",
        };
        Logger.info(`   Qdrant URL: ${qdrantOptions.url}`);
        Logger.info(`   Collection: ${qdrantOptions.collection}`);
        return new QdrantVectorDB(resolvedEmbedding, qdrantOptions);
    }

    // Default to Surreal (local)
    Logger.info(`   Using local SurrealKV vector store`);
    return new SurrealVectorDB(undefined, resolvedEmbedding);
}
