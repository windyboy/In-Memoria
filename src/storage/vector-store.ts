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

export interface VectorStore {
  initialize(collectionName?: string): Promise<void>;
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
}

export { EmbeddingConfig };
