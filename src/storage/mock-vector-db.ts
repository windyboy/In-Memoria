/**
 * Mock Vector Database Implementation for Testing Extensibility
 * 
 * This mock backend demonstrates how new vector backends can be integrated
 * into the In-Memoria system without modifying existing code. It provides
 * a complete implementation of the VectorStore interface with configurable
 * behavior for testing various scenarios.
 */

import {
  VectorStore,
  CodeMetadata,
  SemanticSearchResult,
  BackendInfo,
  HealthStatus,
  PerformanceMetrics,
  BackendCapabilities
} from './vector-store.js';
import { EmbeddingConfig } from './vector-types.js';
import { Logger } from '../utils/logger.js';
import { randomUUID } from 'crypto';

/**
 * Configuration options for the mock backend
 */
export interface MockVectorDBConfig {
  /** Whether to simulate initialization delays */
  simulateDelay?: boolean;
  /** Delay in milliseconds for operations */
  operationDelay?: number;
  /** Whether to simulate failures */
  simulateFailures?: boolean;
  /** Failure rate (0-1) */
  failureRate?: number;
  /** Maximum number of documents to store */
  maxDocuments?: number;
  /** Whether to track detailed metrics */
  trackMetrics?: boolean;
  /** Custom embedding dimension */
  embeddingDimension?: number;
  /** Custom backend capabilities */
  capabilities?: Partial<BackendCapabilities>;
}

/**
 * Internal document structure for the mock database
 */
interface MockDocument {
  id: string;
  code: string;
  embedding: number[];
  metadata: CodeMetadata;
  created: Date;
  updated: Date;
}

/**
 * Mock Vector Database Implementation
 * 
 * This implementation provides a fully functional vector database that stores
 * data in memory. It's designed to test the extensibility of the backend
 * abstraction system and demonstrate how new backends can be integrated.
 */
export class MockVectorDB implements VectorStore {
  private initialized = false;
  private documents = new Map<string, MockDocument>();
  private config: Required<MockVectorDBConfig>;
  private operationCount = 0;
  private errorCount = 0;
  private totalResponseTime = 0;
  private lastHealthCheck = new Date();
  private embeddingCache = new Map<string, number[]>();

  constructor(
    private embeddingConfig: EmbeddingConfig = {
      model: 'mock-model',
      dimension: 384,
      cacheSize: 1000,
      pooling: 'mean',
      normalize: true
    },
    config: MockVectorDBConfig = {}
  ) {
    // Set default configuration
    this.config = {
      simulateDelay: config.simulateDelay ?? false,
      operationDelay: config.operationDelay ?? 10,
      simulateFailures: config.simulateFailures ?? false,
      failureRate: config.failureRate ?? 0.1,
      maxDocuments: config.maxDocuments ?? 10000,
      trackMetrics: config.trackMetrics ?? true,
      embeddingDimension: config.embeddingDimension ?? embeddingConfig.dimension ?? 384,
      capabilities: {
        supportsBatchOperations: true,
        supportsFiltering: true,
        supportsMetadataSearch: true,
        maxEmbeddingDimension: 4096,
        supportedDistanceMetrics: ['cosine', 'euclidean', 'dot'],
        ...config.capabilities
      }
    };

    Logger.info(`🧪 MockVectorDB initialized with config:`, {
      simulateDelay: this.config.simulateDelay,
      operationDelay: this.config.operationDelay,
      simulateFailures: this.config.simulateFailures,
      failureRate: this.config.failureRate,
      maxDocuments: this.config.maxDocuments,
      embeddingDimension: this.config.embeddingDimension
    });
  }

  async initialize(collectionName: string = 'mock-collection'): Promise<void> {
    await this.simulateOperation('initialize');
    
    if (this.initialized) {
      Logger.debug('MockVectorDB already initialized');
      return;
    }

    Logger.info(`🧪 Initializing MockVectorDB collection: ${collectionName}`);
    
    // Simulate initialization work
    if (this.config.simulateDelay) {
      await this.delay(this.config.operationDelay * 2);
    }

    this.initialized = true;
    Logger.info('✅ MockVectorDB initialized successfully');
  }

  async verifyEmbeddingModel(): Promise<void> {
    await this.simulateOperation('verifyEmbeddingModel');
    
    Logger.info(`🧪 Verifying mock embedding model: ${this.embeddingConfig.model}`);
    
    if (this.config.simulateDelay) {
      await this.delay(this.config.operationDelay);
    }

    Logger.info('✅ Mock embedding model verified');
  }

  async storeCodeEmbedding(code: string, metadata: CodeMetadata): Promise<void> {
    await this.simulateOperation('storeCodeEmbedding');
    this.ensureInitialized();

    if (this.documents.size >= this.config.maxDocuments) {
      throw new Error(`Maximum document limit reached: ${this.config.maxDocuments}`);
    }

    const embedding = await this.generateMockEmbedding(code);
    const document: MockDocument = {
      id: metadata.id,
      code,
      embedding,
      metadata,
      created: new Date(),
      updated: new Date()
    };

    this.documents.set(metadata.id, document);
    Logger.debug(`🧪 Stored mock document: ${metadata.id} (${code.length} chars)`);
  }

  async storeMultipleEmbeddings(
    codeChunks: string[],
    metadataList: CodeMetadata[]
  ): Promise<void> {
    await this.simulateOperation('storeMultipleEmbeddings');
    this.ensureInitialized();

    if (codeChunks.length !== metadataList.length) {
      throw new Error('Code chunks and metadata arrays must have the same length');
    }

    if (this.documents.size + codeChunks.length > this.config.maxDocuments) {
      throw new Error(`Batch would exceed maximum document limit: ${this.config.maxDocuments}`);
    }

    for (let i = 0; i < codeChunks.length; i++) {
      await this.storeCodeEmbedding(codeChunks[i], metadataList[i]);
    }

    Logger.debug(`🧪 Stored ${codeChunks.length} mock documents in batch`);
  }

  async findSimilarCode(
    query: string,
    limit: number = 5,
    filters?: Record<string, unknown>
  ): Promise<SemanticSearchResult[]> {
    await this.simulateOperation('findSimilarCode');
    this.ensureInitialized();

    if (!query || query.trim() === '') {
      // Return all documents matching filters
      const results = Array.from(this.documents.values())
        .filter(doc => this.matchesFilters(doc, filters))
        .slice(0, limit)
        .map(doc => ({
          id: doc.id,
          code: doc.code,
          metadata: doc.metadata,
          similarity: 0.5 // Default similarity for non-search results
        }));

      Logger.debug(`🧪 Found ${results.length} mock documents (no query)`);
      return results;
    }

    const queryEmbedding = await this.generateMockEmbedding(query);
    const results: SemanticSearchResult[] = [];

    for (const doc of this.documents.values()) {
      if (!this.matchesFilters(doc, filters)) {
        continue;
      }

      const similarity = this.cosineSimilarity(queryEmbedding, doc.embedding);
      results.push({
        id: doc.id,
        code: doc.code,
        metadata: doc.metadata,
        similarity
      });
    }

    // Sort by similarity and limit results
    results.sort((a, b) => b.similarity - a.similarity);
    const limitedResults = results.slice(0, limit);

    Logger.debug(`🧪 Found ${limitedResults.length} similar mock documents`);
    return limitedResults;
  }

  async findSimilarCodeByFile(
    filePath: string,
    limit: number = 5
  ): Promise<SemanticSearchResult[]> {
    return this.findSimilarCode('', limit, { filePath });
  }

  async findSimilarCodeByLanguage(
    query: string,
    language: string,
    limit: number = 5
  ): Promise<SemanticSearchResult[]> {
    return this.findSimilarCode(query, limit, { language });
  }

  async updateCodeEmbedding(
    id: string,
    code: string,
    metadata: CodeMetadata
  ): Promise<void> {
    await this.simulateOperation('updateCodeEmbedding');
    this.ensureInitialized();

    const existingDoc = this.documents.get(id);
    if (!existingDoc) {
      throw new Error(`Document with id ${id} not found`);
    }

    const embedding = await this.generateMockEmbedding(code);
    const updatedDoc: MockDocument = {
      ...existingDoc,
      code,
      embedding,
      metadata,
      updated: new Date()
    };

    this.documents.set(id, updatedDoc);
    Logger.debug(`🧪 Updated mock document: ${id}`);
  }

  async deleteCodeEmbedding(id: string): Promise<void> {
    await this.simulateOperation('deleteCodeEmbedding');
    this.ensureInitialized();

    const deleted = this.documents.delete(id);
    if (!deleted) {
      Logger.warn(`🧪 Document with id ${id} not found for deletion`);
    } else {
      Logger.debug(`🧪 Deleted mock document: ${id}`);
    }
  }

  async deleteCodeEmbeddingsByFile(filePath: string): Promise<void> {
    await this.simulateOperation('deleteCodeEmbeddingsByFile');
    this.ensureInitialized();

    let deletedCount = 0;
    for (const [id, doc] of this.documents.entries()) {
      if (doc.metadata.filePath === filePath) {
        this.documents.delete(id);
        deletedCount++;
      }
    }

    Logger.debug(`🧪 Deleted ${deletedCount} mock documents for file: ${filePath}`);
  }

  async getCollectionStats(): Promise<{ count: number; metadata: unknown }> {
    await this.simulateOperation('getCollectionStats');
    this.ensureInitialized();

    return {
      count: this.documents.size,
      metadata: {
        description: 'Mock vector database for testing',
        engine: 'MockVectorDB',
        maxDocuments: this.config.maxDocuments,
        embeddingDimension: this.config.embeddingDimension,
        cacheSize: this.embeddingCache.size
      }
    };
  }

  async close(): Promise<void> {
    // Don't simulate failures for close operation to avoid cleanup issues
    if (this.config.trackMetrics) {
      this.operationCount++;
    }
    
    Logger.info('🧪 Closing MockVectorDB');
    this.documents.clear();
    this.embeddingCache.clear();
    this.initialized = false;
    Logger.info('✅ MockVectorDB closed');
  }

  // New standardized methods
  getBackendInfo(): BackendInfo {
    return {
      type: 'mock',
      version: '1.0.0',
      capabilities: this.config.capabilities as BackendCapabilities,
      connectionStatus: this.initialized ? 'connected' : 'disconnected',
      metadata: {
        description: 'Mock vector database for testing extensibility',
        embeddingModel: this.embeddingConfig.model,
        embeddingDimension: this.config.embeddingDimension,
        documentCount: this.documents.size,
        maxDocuments: this.config.maxDocuments,
        simulateDelay: this.config.simulateDelay,
        simulateFailures: this.config.simulateFailures,
        failureRate: this.config.failureRate,
        trackMetrics: this.config.trackMetrics
      }
    };
  }

  async getHealthStatus(): Promise<HealthStatus> {
    const startTime = Date.now();
    
    try {
      // Simulate health check
      if (this.config.simulateDelay) {
        await this.delay(5);
      }

      const responseTime = Date.now() - startTime;
      this.lastHealthCheck = new Date();

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      // Determine health status based on configuration and state
      if (!this.initialized) {
        status = 'unhealthy';
      } else if (this.documents.size > this.config.maxDocuments * 0.9) {
        status = 'degraded'; // Near capacity
      } else if (this.config.simulateFailures && this.errorCount > this.operationCount * 0.1) {
        status = 'degraded'; // High error rate
      }

      return {
        status,
        lastChecked: this.lastHealthCheck,
        responseTime,
        details: {
          initialized: this.initialized,
          documentCount: this.documents.size,
          maxDocuments: this.config.maxDocuments,
          operationCount: this.operationCount,
          errorCount: this.errorCount,
          errorRate: this.operationCount > 0 ? this.errorCount / this.operationCount : 0,
          cacheSize: this.embeddingCache.size,
          memoryUsage: this.estimateMemoryUsage()
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        lastChecked: new Date(),
        responseTime: Date.now() - startTime,
        details: {
          error: error instanceof Error ? error.message : String(error),
          initialized: this.initialized
        }
      };
    }
  }

  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    const avgResponseTime = this.operationCount > 0 ? this.totalResponseTime / this.operationCount : 0;
    const errorRate = this.operationCount > 0 ? this.errorCount / this.operationCount : 0;
    const cacheHitRate = this.embeddingCache.size > 0 ? 0.8 : 0; // Simulate 80% cache hit rate

    return {
      operationCounts: {
        total: this.operationCount,
        successful: this.operationCount - this.errorCount,
        failed: this.errorCount,
        storeCodeEmbedding: Math.floor(this.operationCount * 0.3),
        findSimilarCode: Math.floor(this.operationCount * 0.5),
        deleteCodeEmbedding: Math.floor(this.operationCount * 0.1),
        other: Math.floor(this.operationCount * 0.1)
      },
      averageResponseTimes: {
        overall: avgResponseTime,
        storeCodeEmbedding: avgResponseTime * 1.2,
        findSimilarCode: avgResponseTime * 0.8,
        deleteCodeEmbedding: avgResponseTime * 0.5,
        initialize: avgResponseTime * 2
      },
      errorRates: {
        overall: errorRate,
        storeCodeEmbedding: errorRate * 0.8,
        findSimilarCode: errorRate * 0.5,
        deleteCodeEmbedding: errorRate * 1.2,
        connection: errorRate * 0.3
      },
      cacheHitRates: {
        embedding: cacheHitRate,
        query: cacheHitRate * 0.9,
        metadata: cacheHitRate * 0.95
      },
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  // Helper methods

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('MockVectorDB not initialized. Call initialize() first.');
    }
  }

  private async simulateOperation(operationName: string): Promise<void> {
    if (this.config.trackMetrics) {
      this.operationCount++;
    }

    // Simulate failures
    if (this.config.simulateFailures && Math.random() < this.config.failureRate) {
      this.errorCount++;
      throw new Error(`Simulated failure in ${operationName}`);
    }

    // Simulate delay
    if (this.config.simulateDelay) {
      const startTime = Date.now();
      await this.delay(this.config.operationDelay);
      const responseTime = Date.now() - startTime;
      this.totalResponseTime += responseTime;
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async generateMockEmbedding(text: string): Promise<number[]> {
    // Check cache first
    const cacheKey = this.hashString(text);
    const cached = this.embeddingCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Generate deterministic mock embedding based on text content
    const embedding = new Array(this.config.embeddingDimension).fill(0);
    
    // Use text content to generate deterministic values
    for (let i = 0; i < text.length && i < this.config.embeddingDimension; i++) {
      const charCode = text.charCodeAt(i);
      embedding[i % this.config.embeddingDimension] += charCode / 255.0;
    }

    // Add some randomness based on text hash
    const hash = this.hashString(text);
    for (let i = 0; i < this.config.embeddingDimension; i++) {
      embedding[i] += (hash % 1000) / 1000.0 * 0.1; // Small random component
    }

    // Normalize the embedding
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }

    // Cache the result
    this.embeddingCache.set(cacheKey, embedding);
    
    return embedding;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private matchesFilters(doc: MockDocument, filters?: Record<string, unknown>): boolean {
    if (!filters || Object.keys(filters).length === 0) {
      return true;
    }

    for (const [key, value] of Object.entries(filters)) {
      const docValue = (doc.metadata as any)[key];
      if (docValue !== value) {
        return false;
      }
    }

    return true;
  }

  private estimateMemoryUsage(): number {
    let totalBytes = 0;
    
    // Estimate document storage
    for (const doc of this.documents.values()) {
      totalBytes += doc.code.length * 2; // UTF-16 encoding
      totalBytes += doc.embedding.length * 8; // 8 bytes per number
      totalBytes += 200; // Metadata overhead
    }
    
    // Estimate cache storage
    for (const embedding of this.embeddingCache.values()) {
      totalBytes += embedding.length * 8;
    }
    
    return totalBytes;
  }

  // Additional methods for testing extensibility

  /**
   * Get the current configuration (for testing)
   */
  getConfig(): Required<MockVectorDBConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration at runtime (for testing)
   */
  updateConfig(updates: Partial<MockVectorDBConfig>): void {
    Object.assign(this.config, updates);
    Logger.info('🧪 MockVectorDB configuration updated', updates);
  }

  /**
   * Reset all metrics (for testing)
   */
  resetMetrics(): void {
    this.operationCount = 0;
    this.errorCount = 0;
    this.totalResponseTime = 0;
    Logger.debug('🧪 MockVectorDB metrics reset');
  }

  /**
   * Get all stored documents (for testing)
   */
  getAllDocuments(): MockDocument[] {
    return Array.from(this.documents.values());
  }

  /**
   * Clear all documents (for testing)
   */
  clearDocuments(): void {
    this.documents.clear();
    Logger.debug('🧪 MockVectorDB documents cleared');
  }
}