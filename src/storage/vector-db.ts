import { existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { Surreal } from "surrealdb";
import * as SurrealNodeModule from "@surrealdb/node";
import {
  globalProfiler,
  PerformanceOptimizer,
} from "../utils/performance-profiler.js";
import { Logger } from "../utils/logger.js";
import {
  CodeMetadata,
  SemanticSearchResult,
  VectorStore,
} from "./vector-store.js";
import { EmbeddingConfig } from "./vector-types.js";

type TransformersModule = typeof import("@xenova/transformers");
type PipelineFactory = TransformersModule["pipeline"];
type TransformersEnv = TransformersModule["env"];

interface CodeDocument {
  id?: string;
  code: string;
  embedding?: number[];
  metadata: CodeMetadata;
  created: Date;
  updated: Date;
  [key: string]: unknown;
}

const DEFAULT_MODEL = "Xenova/all-MiniLM-L6-v2";
const ALLOWED_MODELS: Record<string, number> = {
  "Xenova/all-MiniLM-L6-v2": 384,
  "Xenova/all-MiniLM-L12-v2": 384,
  "Xenova/paraphrase-MiniLM-L6-v2": 384,
  "Xenova/all-mpnet-base-v2": 768,
  "Xenova/paraphrase-multilingual-MiniLM-L12-v2": 384,
  "Xenova/msmarco-distilbert-base-v4": 768,
  "Xenova/multi-qa-MiniLM-L6-cos-v1": 384,
};

export class SurrealVectorDB implements VectorStore {
  private db: Surreal;
  protected initialized: boolean = false;
  private localEmbeddingPipeline: any; // Use any to avoid complex typing issues
  private transformersPipelineFactory: PipelineFactory | null = null;
  private transformersLoadPromise?: Promise<PipelineFactory | null>;
  private transformersEnv: TransformersEnv | null = null;

  // Configurable embedding settings
  private embeddingModel: string;
  private embeddingDimension: number;
  private embeddingCacheSize: number;
  private embeddingPooling: "mean" | "cls";
  private embeddingNormalize: boolean;
  private offlineMode: boolean;
  private preferredCacheDir: string;
  private localModelRoot: string | null = null;

  // Real vector operations with caching
  private embeddingCache = new Map<
    string,
    { embedding: number[]; size: number; timestamp: number }
  >();
  private cacheMemoryUsage = 0;
  private maxCacheMemoryMB = 100; // 100MB default memory limit

  // Embedding progress tracking
  private hasLoggedEmbeddingStart = false;
  private transformersFailed = false;
  private hasLoggedEmbeddingCacheDir = false;

  constructor(_apiKey?: string, embeddingConfig?: EmbeddingConfig) {
    this.db = new Surreal({
      engines: (SurrealNodeModule as any).surrealdbNodeEngines(),
    });

    // Initialize embedding configuration
    const requestedModel =
      embeddingConfig?.model ||
      process.env.IN_MEMORIA_EMBEDDING_MODEL ||
      DEFAULT_MODEL;

    this.embeddingModel = this.validateModel(requestedModel);

    this.embeddingDimension =
      embeddingConfig?.dimension ||
      parseInt(process.env.IN_MEMORIA_EMBEDDING_DIMENSION || "", 10) ||
      ALLOWED_MODELS[this.embeddingModel] ||
      ALLOWED_MODELS[DEFAULT_MODEL];

    this.embeddingCacheSize =
      embeddingConfig?.cacheSize ||
      parseInt(process.env.IN_MEMORIA_EMBEDDING_CACHE_SIZE || "", 10) ||
      1000;

    this.embeddingPooling =
      embeddingConfig?.pooling ||
      (process.env.IN_MEMORIA_EMBEDDING_POOLING as "mean" | "cls") ||
      "mean";

    this.embeddingNormalize =
      embeddingConfig?.normalize !== undefined
        ? embeddingConfig.normalize
        : process.env.IN_MEMORIA_EMBEDDING_NORMALIZE !== "false"; // Default true

    this.offlineMode =
      process.env.IN_MEMORIA_EMBEDDINGS_LOCAL_ONLY === "true" ||
      process.env.IN_MEMORIA_EMBEDDINGS_OFFLINE === "true" ||
      process.env.TRANSFORMERS_OFFLINE === "true";
    this.preferredCacheDir = this.resolveEmbeddingCacheDir();

    if (this.offlineMode) {
      Logger.info(
        "🔒 Local-only embeddings enabled; remote model downloads are disabled",
      );
    }

    // Calculate memory limit based on embedding dimension and cache size
    // Each embedding: dimension * 4 bytes (float32) * cacheSize
    const bytesPerEmbedding = this.embeddingDimension * 4;
    const totalBytes = bytesPerEmbedding * this.embeddingCacheSize;
    this.maxCacheMemoryMB = Math.ceil(totalBytes / (1024 * 1024)) + 10; // Add 10MB buffer

    Logger.info(
      `📊 Embedding cache configured: ${this.embeddingCacheSize} entries, ~${this.maxCacheMemoryMB}MB memory limit`,
    );

    // Log model configuration
    Logger.info(`🤖 Embedding model configuration:`);
    Logger.info(`   Model: ${this.embeddingModel}`);
    Logger.info(`   Dimension: ${this.embeddingDimension}`);
    Logger.info(`   Pooling: ${this.embeddingPooling}`);
    Logger.info(`   Normalize: ${this.embeddingNormalize}`);
    Logger.info(`   Cache size: ${this.embeddingCacheSize}`);

    // API key parameter kept for backwards compatibility but unused
    // Pipeline initialization is now lazy (deferred until first use)
  }

  /**
   * Resolve the Hugging Face cache directory, preferring user-provided
   * overrides and HF_HOME/HUGGINGFACE_HUB_CACHE. We intentionally avoid
   * the transformers.js default cache to reuse existing Hugging Face assets.
   */
  private resolveEmbeddingCacheDir(): string {
    const explicitCache =
      process.env.IN_MEMORIA_EMBEDDING_CACHE_DIR &&
      process.env.IN_MEMORIA_EMBEDDING_CACHE_DIR.trim();
    if (explicitCache) {
      return process.env.IN_MEMORIA_EMBEDDING_CACHE_DIR as string;
    }

    const huggingFaceCache =
      process.env.HUGGINGFACE_HUB_CACHE && process.env.HUGGINGFACE_HUB_CACHE.trim();
    if (huggingFaceCache) {
      return process.env.HUGGINGFACE_HUB_CACHE as string;
    }

    const hfHome =
      process.env.HF_HOME && process.env.HF_HOME.trim()
        ? (process.env.HF_HOME as string)
        : join(homedir(), ".cache", "huggingface");

    return join(hfHome, "hub");
  }

  /**
   * Validate model name against allowlist
   * Returns validated model name or falls back to default
   */
  private validateModel(requestedModel: string): string {
    if (ALLOWED_MODELS[requestedModel]) {
      Logger.info(`✅ Model validated: ${requestedModel} (in allowlist)`);
      return requestedModel;
    }

    if (requestedModel.startsWith("Xenova/")) {
      Logger.warn(`⚠️  Using custom Xenova model: ${requestedModel}`);
      Logger.warn(
        `   This model is not in the official allowlist. Supported models: ${Object.keys(ALLOWED_MODELS).join(", ")}`,
      );
      return requestedModel;
    }

    Logger.warn(`⚠️  Model "${requestedModel}" is not supported.`);
    Logger.warn(
      `   Falling back to default: ${DEFAULT_MODEL}. Supported models: ${Object.keys(ALLOWED_MODELS).join(", ")}`,
    );
    return DEFAULT_MODEL;
  }

  /**
   * Get the current embedding model configuration
   */
  getEmbeddingModel(): string {
    return this.embeddingModel;
  }

  /**
   * Get the current embedding dimension
   */
  getEmbeddingDimension(): number {
    return this.embeddingDimension;
  }

  /**
   * Get the current embedding cache size
   */
  getEmbeddingCacheSize(): number {
    return this.embeddingCacheSize;
  }

  /**
   * Verify embedding model availability before learning begins.
   * Attempts to prepare the local pipeline and reports whether the
   * optimized path will be used or if we will fall back.
   */
  async verifyEmbeddingModel(): Promise<void> {
    Logger.info(
      `🔍 Verifying embedding model availability for ${this.embeddingModel}...`,
    );
    try {
      await this.initializeLocalEmbeddings();
      if (this.localEmbeddingPipeline) {
        Logger.info(
          `✅ ${this.embeddingModel} is ready (${this.embeddingDimension}d); using transformers.js embeddings`,
        );
      } else {
        Logger.warn(
          `⚠️ ${this.embeddingModel} could not be prepared; using fallback local embeddings`,
        );
      }
    } catch (error: unknown) {
      Logger.warn(
        `⚠️ Failed to verify ${this.embeddingModel}; continuing with fallback embeddings`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Lazily load the transformers pipeline factory to avoid crashing when the native dependency is missing
   */
  private async loadTransformersPipelineFactory(): Promise<PipelineFactory | null> {
    if (this.transformersPipelineFactory) {
      return this.transformersPipelineFactory;
    }

    // Provide a deterministic cache hint early so it shows up in logs even if import fails
    if (!this.hasLoggedEmbeddingCacheDir) {
      const cacheHint = this.preferredCacheDir;
      try {
        mkdirSync(cacheHint, { recursive: true });
        Logger.info(
          `📍 Intended local embedding cache directory: ${cacheHint} (override with IN_MEMORIA_EMBEDDING_CACHE_DIR or Hugging Face envs)`,
        );
        this.hasLoggedEmbeddingCacheDir = true;
      } catch (error) {
        Logger.warn(
          "⚠️  Unable to prepare embedding cache directory:",
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    if (!this.transformersLoadPromise) {
      Logger.info(
        `📦 Loading transformers.js pipeline factory for ${this.embeddingModel}...`,
      );
      this.transformersLoadPromise = (async () => {
        try {
          Logger.debug(`🔍 Importing @xenova/transformers module...`);
          const transformers: TransformersModule =
            await import("@xenova/transformers");
          this.transformersEnv = transformers.env;
          this.configureTransformersEnv(transformers.env);
          this.logEmbeddingModelLocation(transformers.env);
          Logger.info(
            `✅ Successfully loaded transformers.js pipeline factory`,
          );
          return transformers.pipeline;
        } catch (error: unknown) {
          Logger.warn(
            "⚠️ Unable to load @xenova/transformers pipeline:",
            error instanceof Error ? error.message : String(error),
          );
          Logger.info(
            "📝 Falling back to the deterministic local embedding generator.",
          );
          return null;
        }
      })();
    }

    this.transformersPipelineFactory = await this.transformersLoadPromise;
    return this.transformersPipelineFactory;
  }

  private configureTransformersEnv(env: TransformersEnv): void {
    try {
      mkdirSync(this.preferredCacheDir, { recursive: true });
      env.cacheDir = this.preferredCacheDir;
    } catch (error) {
      Logger.warn(
        "⚠️  Unable to prepare embedding cache directory:",
        error instanceof Error ? error.message : String(error),
      );
    }

    const discoveredLocalModel =
      this.localModelRoot || this.findLocalModelRoot();
    if (discoveredLocalModel) {
      this.localModelRoot = discoveredLocalModel;
      env.localModelPath = discoveredLocalModel;
    } else {
      env.localModelPath = this.preferredCacheDir;
    }

    // Always allow local models; optionally disable remote fetches when offline
    env.allowLocalModels = true;
    env.allowRemoteModels = !this.offlineMode;
  }

  private logEmbeddingModelLocation(env?: TransformersEnv): void {
    if (!env) {
      return;
    }

    let localModelPath =
      typeof env.localModelPath === "string" && env.localModelPath.trim()
        ? env.localModelPath
        : null;
    let cacheDir =
      typeof env.cacheDir === "string" && env.cacheDir.trim()
        ? env.cacheDir
        : null;

    if (!localModelPath) {
      env.localModelPath = this.preferredCacheDir;
      localModelPath = this.preferredCacheDir;
    }
    if (!cacheDir) {
      try {
        mkdirSync(this.preferredCacheDir, { recursive: true });
        env.cacheDir = this.preferredCacheDir;
        cacheDir = this.preferredCacheDir;
      } catch (error) {
        Logger.warn(
          "⚠️  Unable to prepare embedding cache directory:",
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    if (localModelPath) {
      Logger.info(
        `📍 Local embedding model path for ${this.embeddingModel}: ${localModelPath}`,
      );
    } else if (cacheDir) {
      Logger.info(
        `📍 Local embedding cache for ${this.embeddingModel}: ${cacheDir}`,
      );
    } else {
      Logger.info(
        "📍 Local embedding cache not configured; using transformers.js defaults",
      );
    }

    Logger.debug(
      `🌐 Embedding model access: allowLocalModels=${env.allowLocalModels}, allowRemoteModels=${env.allowRemoteModels}, cacheDir=${cacheDir || "unknown"}`,
    );
  }

  private findLocalModelRoot(): string | null {
    const slug = this.embeddingModel.replace(/\//g, "--");
    const friendlyName = this.embeddingModel.replace("Xenova/", "");
    const candidates = [
      this.preferredCacheDir,
      join(this.preferredCacheDir, this.embeddingModel),
      join(this.preferredCacheDir, friendlyName),
      join(this.preferredCacheDir, "Xenova", friendlyName),
      join(this.preferredCacheDir, `models--${slug}`),
    ];

    for (const candidate of candidates) {
      const resolved = this.resolveSnapshotPath(candidate);
      if (resolved) {
        return resolved;
      }
    }

    return null;
  }

  private resolveSnapshotPath(basePath: string): string | null {
    const hasModelFiles = (pathToCheck: string): boolean =>
      existsSync(join(pathToCheck, "config.json")) ||
      existsSync(join(pathToCheck, "tokenizer.json")) ||
      existsSync(join(pathToCheck, "onnx"));

    if (hasModelFiles(basePath)) {
      return basePath;
    }

    const snapshotsDir = join(basePath, "snapshots");
    if (!existsSync(snapshotsDir)) {
      return null;
    }

    const candidates = readdirSync(snapshotsDir, {
      withFileTypes: true,
    }).filter((dir) => dir.isDirectory());

    if (!candidates.length) {
      return null;
    }

    const newest = candidates
      .map((dir) => ({
        name: dir.name,
        mtime: statSync(join(snapshotsDir, dir.name)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime)[0].name;

    const snapshotPath = join(snapshotsDir, newest);
    return hasModelFiles(snapshotPath) ? snapshotPath : null;
  }

  /**
   * Initialize local embedding pipeline using transformers.js
   */
  private async initializeLocalEmbeddings(): Promise<void> {
    // If transformers already failed, don't retry
    if (this.transformersFailed) {
      Logger.debug("Transformers.js previously failed, using fallback");
      return;
    }

    const pipelineFactory = await this.loadTransformersPipelineFactory();
    if (!pipelineFactory) {
      Logger.info(
        `🔄 No transformers pipeline available, using fallback embedding method`,
      );
      this.transformersFailed = true;
      return;
    }

    if (this.offlineMode) {
      this.localModelRoot = this.localModelRoot || this.findLocalModelRoot();
      if (!this.localModelRoot) {
        Logger.info(
          "🔄 Offline/local-only mode without cached model assets; using fallback embedding method",
        );
        this.transformersFailed = true;
        return;
      }
      if (this.transformersEnv) {
        this.transformersEnv.localModelPath = this.localModelRoot;
      }
    }

    try {
      Logger.info(
        `🔧 Initializing ${this.embeddingModel} embedding pipeline (${this.embeddingDimension}d)...`,
      );
      Logger.debug(
        `🔄 Creating feature-extraction pipeline with model: ${this.embeddingModel}`,
      );
      const startTime = Date.now();
      this.localEmbeddingPipeline = await pipelineFactory(
        "feature-extraction",
        this.embeddingModel,
      );
      const loadTime = Date.now() - startTime;
      Logger.info(
        `✅ ${this.embeddingModel} pipeline ready (${this.embeddingDimension}d) in ${loadTime}ms`,
      );
      Logger.debug(
        `📊 Model details: pooling=${this.embeddingPooling}, normalize=${this.embeddingNormalize}`,
      );
    } catch (error: unknown) {
      Logger.warn(
        `⚠️ Failed to initialize ${this.embeddingModel}:`,
        error instanceof Error ? error.message : String(error),
      );
      Logger.info("📝 Will use fallback local embedding method");
      this.localEmbeddingPipeline = null;
      this.transformersFailed = true;
    }
  }

  async initialize(collectionName: string = "in-memoria"): Promise<void> {
    try {
      // Use SurrealKV for persistent storage of vector embeddings
      // IMPORTANT: Requires SURREAL_SYNC_DATA=true for crash safety
      const dbPath =
        process.env.IN_MEMORIA_VECTOR_DB_PATH || "in-memoria-vectors.db";
      await this.db.connect(`surrealkv://${dbPath}`);

      // Use database and namespace
      await this.db.use({
        namespace: "in_memoria",
        database: collectionName,
      });

      // Execute SurrealDB definitions with idempotent error handling
      const definitions = [
        "DEFINE ANALYZER code_analyzer TOKENIZERS blank FILTERS lowercase,ascii;",
        "DEFINE TABLE code_documents SCHEMAFULL;",
        "DEFINE FIELD code ON code_documents TYPE string;",
        "DEFINE FIELD embedding ON code_documents TYPE array;",
        "DEFINE FIELD metadata ON code_documents TYPE object;",
        "DEFINE FIELD created ON code_documents TYPE datetime DEFAULT time::now();",
        "DEFINE FIELD updated ON code_documents TYPE datetime DEFAULT time::now();",
        "DEFINE INDEX code_content ON code_documents COLUMNS code SEARCH ANALYZER code_analyzer BM25(1.2,0.75) HIGHLIGHTS;",
      ];

      for (const definition of definitions) {
        try {
          await this.db.query(definition);
        } catch (error: any) {
          if (error.message && error.message.includes("already exists")) {
            Logger.debug(
              `Definition already exists: ${definition.split(" ")[1]} ${definition.split(" ")[2] || ""}`,
            );
          } else {
            throw error;
          }
        }
      }

      this.initialized = true;
    } catch (error) {
      Logger.error("Failed to initialize SurrealDB:", error);
      throw error;
    }
  }

  async storeCodeEmbedding(
    code: string,
    metadata: CodeMetadata,
  ): Promise<void> {
    if (!this.initialized) {
      throw new Error(
        "Vector database not initialized. Call initialize() first.",
      );
    }

    const embedding = await this.generateEmbedding(code);
    const document: CodeDocument = {
      code,
      embedding,
      metadata,
      created: new Date(),
      updated: new Date(),
    };

    await this.db.create("code_documents", document);
  }

  async storeMultipleEmbeddings(
    codeChunks: string[],
    metadataList: CodeMetadata[],
  ): Promise<void> {
    if (!this.initialized) {
      throw new Error(
        "Vector database not initialized. Call initialize() first.",
      );
    }

    if (codeChunks.length !== metadataList.length) {
      throw new Error(
        "Code chunks and metadata arrays must have the same length",
      );
    }

    const documents: CodeDocument[] = await Promise.all(
      codeChunks.map(async (code, index) => ({
        code,
        embedding: await this.generateEmbedding(code),
        metadata: metadataList[index],
        created: new Date(),
        updated: new Date(),
      })),
    );

    // Insert multiple documents
    for (const doc of documents) {
      await this.db.create("code_documents", doc);
    }
  }

  async findSimilarCode(
    query: string,
    limit: number = 5,
    filters?: Record<string, any>,
  ): Promise<SemanticSearchResult[]> {
    if (!this.initialized) {
      throw new Error(
        "Vector database not initialized. Call initialize() first.",
      );
    }

    if (!query || query.trim() === "") {
      // If no query, just return all documents matching filters
      let searchQuery = "SELECT * FROM code_documents";
      const params: Record<string, any> = { limit };

      if (filters) {
        const filterConditions = Object.entries(filters)
          .map(([key, value]) => `metadata.${key} = $${key}`)
          .join(" AND ");
        searchQuery += ` WHERE ${filterConditions}`;
        Object.assign(params, filters);
      }

      searchQuery += ` LIMIT $limit`;

      const results = await this.db.query(searchQuery, params);
      const documents = (results[0] as any[]) || [];

      return documents.map((doc) => ({
        id: doc.id,
        code: doc.code,
        metadata: doc.metadata,
        similarity: 0.5, // Default similarity for non-search results
      }));
    }

    // Build candidate set with BM25 search, then rank by cosine similarity using stored embeddings
    const candidateLimit = Math.max(limit * 5, 50);
    let searchQuery = `
      SELECT *, search::score(1) AS bm25
      FROM code_documents
      WHERE code @@ $query
    `;

    if (filters) {
      const filterConditions = Object.entries(filters)
        .map(([key, value]) => `metadata.${key} = $${key}`)
        .join(" AND ");
      searchQuery += ` AND ${filterConditions}`;
    }

    searchQuery += ` ORDER BY bm25 DESC LIMIT $candidateLimit`;

    const params: Record<string, any> = {
      query,
      candidateLimit,
    };
    if (filters) {
      Object.assign(params, filters);
    }

    const results = await this.db.query(searchQuery, params);
    const documents = (results[0] as any[]) || [];

    if (!documents.length) {
      return [];
    }

    const queryEmbedding = await this.generateEmbedding(query);
    const scored = documents
      .filter(
        (doc) =>
          Array.isArray(doc.embedding) && doc.embedding.length > 0,
      )
      .map((doc) => ({
        id: doc.id,
        code: doc.code,
        metadata: doc.metadata,
        similarity: this.cosineSimilarity(
          queryEmbedding,
          doc.embedding as number[],
        ),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    // Fallback to BM25 scores when embeddings are missing
    if (scored.length === 0) {
      return documents.slice(0, limit).map((doc: any) => ({
        id: doc.id,
        code: doc.code,
        metadata: doc.metadata,
        similarity: doc.bm25 || 0,
      }));
    }

    return scored;
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
    if (!this.initialized) {
      throw new Error(
        "Vector database not initialized. Call initialize() first.",
      );
    }

    const embedding = await this.generateEmbedding(code);
    await this.db.merge(id, {
      code,
      embedding,
      metadata,
      updated: new Date(),
    });
  }

  async deleteCodeEmbedding(id: string): Promise<void> {
    if (!this.initialized) {
      throw new Error(
        "Vector database not initialized. Call initialize() first.",
      );
    }

    await this.db.delete(id);
  }

  async deleteCodeEmbeddingsByFile(filePath: string): Promise<void> {
    if (!this.initialized) {
      throw new Error(
        "Vector database not initialized. Call initialize() first.",
      );
    }

    await this.db.query(
      "DELETE code_documents WHERE metadata.filePath = $filePath",
      {
        filePath,
      },
    );
  }

  async getCollectionStats(): Promise<{ count: number; metadata: any }> {
    if (!this.initialized) {
      throw new Error(
        "Vector database not initialized. Call initialize() first.",
      );
    }

    const result = await this.db.query(
      "SELECT count() AS total FROM code_documents GROUP ALL",
    );
    const count =
      Array.isArray(result) && Array.isArray(result[0]) && result[0][0]
        ? (result[0][0] as any).total || 0
        : 0;

    return {
      count,
      metadata: {
        description: "In Memoria semantic code embeddings",
        engine: "SurrealDB",
      },
    };
  }

  // Generate semantic embeddings using the best available method
  protected async generateEmbedding(code: string): Promise<number[]> {
    Logger.debug(
      `🔄 Generating embedding for code snippet (${code.length} chars)`,
    );
    const embedding = await this.generateRealSemanticEmbedding(code);
    Logger.debug(
      `✅ Generated embedding vector of dimension ${embedding.length}`,
    );
    return embedding;
  }

  /**
   * Generate real semantic embeddings using local method
   */
  private async generateRealSemanticEmbedding(code: string): Promise<number[]> {
    // Check cache first
    const cacheKey = this.createCacheKey(code);
    const cached = this.embeddingCache.get(cacheKey);
    if (cached) {
      Logger.debug(
        `♻️ Using cached embedding for key: ${cacheKey.substring(0, 32)}...`,
      );
      // Update timestamp for LRU
      cached.timestamp = Date.now();
      return cached.embedding;
    }

    // Log once at start of embedding process
    if (!this.hasLoggedEmbeddingStart) {
      Logger.info("🔧 Initializing local embedding pipeline...");
      this.hasLoggedEmbeddingStart = true;
    }

    Logger.debug(`⚙️ Generating new embedding for code (${code.length} chars)`);
    // Use local embedding
    const embedding = await this.getLocalEmbedding(code);
    Logger.debug(`✅ Generated new embedding, dimension: ${embedding.length}`);

    // Cache the result
    this.cacheEmbedding(cacheKey, embedding);
    return embedding;
  }

  /**
   * Get local embeddings using transformers.js or fallback method
   */
  private async getLocalEmbedding(code: string): Promise<number[]> {
    // Lazily initialize pipeline if not already done
    if (!this.localEmbeddingPipeline) {
      await this.initializeLocalEmbeddings();
    }

    const cleanCode = this.preprocessCodeForEmbedding(code);

    if (this.localEmbeddingPipeline) {
      try {
        const result = await this.localEmbeddingPipeline(cleanCode, {
          pooling: this.embeddingPooling,
          normalize: this.embeddingNormalize,
        });

        // Convert tensor to array
        const embedding = Array.from(result.data) as number[];
        return this.ensureExpectedDimension(embedding);
      } catch (error: unknown) {
        Logger.warn(
          `⚠️ ${this.embeddingModel} pipeline failed:`,
          error instanceof Error ? error.message : String(error),
        );
        // Clear pipeline to force fallback on next call
        this.localEmbeddingPipeline = null;
      }
    }

    // Fallback to deterministic local method
    return this.generateFallbackEmbedding(cleanCode);
  }

  /**
   * For backward compatibility - use the proper local embedding method
   */
  private async generateLocalEmbedding(text: string): Promise<number[]> {
    return this.getLocalEmbedding(text);
  }

  private generateFallbackEmbedding(code: string): number[] {
    const tokens = this.extractMeaningfulTokens(code);
    if (tokens.length === 0) {
      return new Array(this.embeddingDimension).fill(0);
    }

    const vector = new Float32Array(this.embeddingDimension);
    for (const token of tokens) {
      const bucket = Math.abs(this.hashToken(token)) % this.embeddingDimension;
      vector[bucket] += 1;
    }

    return this.normalizeVector(Array.from(vector));
  }

  private ensureExpectedDimension(vector: number[]): number[] {
    if (vector.length === this.embeddingDimension) {
      return vector;
    }
    if (vector.length > this.embeddingDimension) {
      return vector.slice(0, this.embeddingDimension);
    }
    const padded = new Array(this.embeddingDimension).fill(0);
    for (let i = 0; i < vector.length; i++) {
      padded[i] = vector[i];
    }
    return padded;
  }

  private hashToken(token: string): number {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = (hash << 5) - hash + token.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  /**
   * Extract meaningful programming tokens
   */
  private extractMeaningfulTokens(code: string): string[] {
    // Remove comments and strings
    const cleanCode = code
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/["'`][^"'`]*["'`]/g, "STRING");

    // Extract identifiers and keywords
    const tokens = cleanCode.match(/\b[a-zA-Z][a-zA-Z0-9_]*\b/g) || [];

    // Filter out very short tokens and common noise
    const noise = new Set([
      "a",
      "an",
      "the",
      "is",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
    ]);
    return tokens
      .filter((token) => token.length > 2)
      .filter((token) => !noise.has(token.toLowerCase()));
  }

  /**
   * Preprocess code for embedding
   */
  private preprocessCodeForEmbedding(code: string): string {
    return code
      .replace(/\s+/g, " ") // Normalize whitespace
      .replace(/\/\/.*$/gm, "") // Remove comments
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .trim()
      .substring(0, 8000); // Limit for API
  }

  /**
   * Create cache key from code
   */
  private createCacheKey(code: string): string {
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < Math.min(code.length, 1000); i++) {
      const char = code.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  }

  /**
   * Compute cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0 || a.length !== b.length) {
      return 0;
    }

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Cache embedding with memory-aware LRU eviction
   */
  private cacheEmbedding(key: string, embedding: number[]): void {
    const embeddingSize = embedding.length * 4; // 4 bytes per float32
    const cacheEntry = {
      embedding,
      size: embeddingSize,
      timestamp: Date.now(),
    };

    // Check if we need to evict entries
    while (
      this.cacheMemoryUsage + embeddingSize >
      this.maxCacheMemoryMB * 1024 * 1024
    ) {
      this.evictOldestCacheEntry();
    }

    // Add to cache
    this.embeddingCache.set(key, cacheEntry);
    this.cacheMemoryUsage += embeddingSize;

    // Also enforce count-based limit as fallback
    if (this.embeddingCache.size > this.embeddingCacheSize) {
      this.evictOldestCacheEntry();
    }
  }

  /**
   * Evict the oldest cache entry
   */
  private evictOldestCacheEntry(): void {
    if (this.embeddingCache.size === 0) return;

    let oldestKey: string | null = null;
    let oldestTimestamp = Infinity;

    // Find oldest entry
    for (const [key, entry] of this.embeddingCache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.embeddingCache.get(oldestKey)!;
      this.cacheMemoryUsage -= entry.size;
      this.embeddingCache.delete(oldestKey);
    }
  }

  /**
   * Normalize vector for cosine similarity
   */
  private normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(
      vector.reduce((sum, val) => sum + val * val, 0),
    );
    if (magnitude === 0) return vector;
    return vector.map((val) => val / magnitude);
  }

  // Cleanup method
  async close(): Promise<void> {
    // Dispose of transformers.js pipeline to prevent hanging
    if (this.localEmbeddingPipeline) {
      try {
        // Check if the pipeline has a dispose method
        if (typeof this.localEmbeddingPipeline.dispose === "function") {
          await this.localEmbeddingPipeline.dispose();
        }
        this.localEmbeddingPipeline = null;
      } catch (error) {
        Logger.warn(
          "Warning: Failed to dispose local embedding pipeline:",
          error,
        );
      }
    }

    // Close SurrealDB connection
    if (this.db) {
      await this.db.close();
    }
  }
}

// Backwards compatibility export
export class SemanticVectorDB extends SurrealVectorDB {}
