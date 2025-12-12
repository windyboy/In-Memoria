import { ConfigManager } from '../config/config.js';
import { QdrantVectorDB } from './qdrant-vector-db.js';
import { SurrealVectorDB } from './vector-db.js';
import { VectorStore } from './vector-store.js';
import { EmbeddingConfig } from './vector-types.js';

/**
  * Create a vector store based on configuration/environment.
  * Defaults to Surreal (local SurrealKV) when no override is provided.
  */
export function createVectorStore(embeddingConfig?: EmbeddingConfig): VectorStore {
  const config = ConfigManager.getInstance().getConfig();

  const backendEnv = process.env.IN_MEMORIA_VECTOR_BACKEND?.toLowerCase();
  const backend =
    backendEnv === 'qdrant' || backendEnv === 'surreal'
      ? backendEnv
      : (config.vectorBackend || 'surreal');

  const resolvedEmbedding = embeddingConfig || config.embedding;

  if (backend === 'qdrant') {
    return new QdrantVectorDB(resolvedEmbedding, {
      url: process.env.QDRANT_URL || config.qdrant?.url,
      apiKey: process.env.QDRANT_API_KEY || config.qdrant?.apiKey,
      collection: process.env.QDRANT_COLLECTION || config.qdrant?.collection || 'in-memoria'
    });
  }

  // Default to Surreal (local)
  return new SurrealVectorDB(undefined, resolvedEmbedding);
}
