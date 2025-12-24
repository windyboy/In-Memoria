import { SQLiteDatabase } from "../../storage/sqlite-db.js";
import { translateError, ValidationError } from "../errors.js";
import { VectorStore } from "../../storage/vector-store.js";
import { EmbeddingEngine } from "../../utils/embedding-engine.js";
import { ChunkRepository } from "../../storage/repositories/chunk-repository.js";

export interface SearchOptions {
  language?: string;
  limit?: number;
}

export interface SemanticSearchResult {
  file: string;
  content: string;
  score: number;
  context: string;
  concept: string;
  similarity: number;
  metadata: Record<string, any>;
}

export interface PatternSearchResult {
  file: string;
  content: string;
  score: number;
  context: string;
  patternType: string;
  confidence: number;
  frequency: number;
  metadata: Record<string, any>;
}

export interface TextSearchResult {
  file: string;
  content: string;
  score: number;
  context: string;
  lineNumber: number;
  matchStart: number;
  matchLength: number;
  metadata: Record<string, any>;
}

export interface SearchService {
  searchSemantic(
    query: string,
    options?: SearchOptions,
  ): Promise<SemanticSearchResult[]>;
  searchPatterns(
    query: string,
    options?: SearchOptions,
  ): Promise<PatternSearchResult[]>;
  searchText(
    query: string,
    options?: SearchOptions,
  ): Promise<TextSearchResult[]>;
}

export class SearchServiceImpl implements SearchService {
  constructor(
    private database: SQLiteDatabase,
    private vectorStore: VectorStore,
    private embeddingEngine: EmbeddingEngine,
    private chunkRepository: ChunkRepository,
  ) {}

  async searchSemantic(
    query: string,
    options: SearchOptions = {},
  ): Promise<SemanticSearchResult[]> {
    try {
      this.validateQuery(query, "SearchService.searchSemantic");

      const limit = options.limit ?? 10;
      const results: SemanticSearchResult[] = [];
      const seen = new Set<string>();

      // Phase 1: Vector search → get chunk_ids
      if (this.vectorStore.isEnabled()) {
        try {
          const vector = await this.embeddingEngine.embed(query);
          if (vector.length > 0) {
            const chunkIds = await this.vectorStore.searchVectors(
              vector,
              limit * 2,
            ); // Get more for filtering

            if (chunkIds.length > 0) {
              // Phase 2: Business filtering + get chunk data
              const chunks = this.chunkRepository.findByIds(chunkIds);

              // Apply business filters - maintain order from vector search
              let filteredChunks = chunkIds
                .map((chunkId) => chunks.find((c) => c.id === chunkId))
                .filter((chunk): chunk is NonNullable<typeof chunk> => chunk !== undefined);

              if (options.language) {
                filteredChunks = filteredChunks.filter((chunk) =>
                  chunk.filePath.endsWith(`.${options.language}`),
                );
              }

              // Convert to results with rank-based scoring
              for (let i = 0; i < filteredChunks.length; i++) {
                const chunk = filteredChunks[i];
                if (seen.has(chunk.id)) continue;
                seen.add(chunk.id);

                // Calculate similarity based on rank position (1.0 for first, decreasing)
                const similarity = Math.max(0.1, 1.0 - (i / (limit * 2)));

                results.push({
                  file: chunk.filePath,
                  content: chunk.content,
                  score: similarity,
                  context: chunk.chunkType,
                  concept: chunk.content.substring(0, 50) + "...",
                  similarity: similarity,
                  metadata: {
                    type: chunk.chunkType,
                    searchType: "semantic",
                    source: "vector",
                    chunkId: chunk.id,
                    rank: i,
                  },
                });

                if (results.length >= limit) break;
              }
            }
          }
        } catch (error) {
          // Embedding failed, fall back to concept search
          // Continue to fallback logic below
        }
      }

      // Fallback: Search in concepts if vector search didn't yield enough results
      const remaining = limit - results.length;
      if (remaining > 0) {
        const concepts = this.database
          .getSemanticConcepts()
          .filter((concept) =>
            concept.conceptName.toLowerCase().includes(query.toLowerCase()),
          )
          .slice(0, remaining);

        for (const concept of concepts) {
          if (seen.has(concept.id)) continue;
          results.push({
            file: concept.filePath,
            content: concept.conceptName,
            score: concept.confidenceScore,
            context: `${concept.conceptType} ${concept.conceptName}`,
            concept: concept.conceptName,
            similarity: concept.confidenceScore,
            metadata: {
              type: concept.conceptType,
              searchType: "semantic",
              source: "sqlite",
            },
          });
        }
      }

      return results;
    } catch (error) {
      throw translateError(error, "Semantic search");
    }
  }

  async searchPatterns(
    query: string,
    options: SearchOptions = {},
  ): Promise<PatternSearchResult[]> {
    try {
      this.validateQuery(query, "SearchService.searchPatterns");

      const limit = options.limit ?? 10;
      const patterns = this.database
        .getDeveloperPatterns()
        .filter(
          (pattern) =>
            pattern.patternType.toLowerCase().includes(query.toLowerCase()) ||
            JSON.stringify(pattern.patternContent)
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .slice(0, limit);

      return patterns.map((pattern) => ({
        file: "pattern",
        content: pattern.patternType,
        score: pattern.frequency,
        context: pattern.patternContent.description || pattern.patternType,
        patternType: pattern.patternType,
        confidence: 0.7,
        frequency: pattern.frequency,
        metadata: {
          searchType: "pattern",
        },
      }));
    } catch (error) {
      throw translateError(error, "Pattern search");
    }
  }

  async searchText(
    query: string,
    options: SearchOptions = {},
  ): Promise<TextSearchResult[]> {
    try {
      this.validateQuery(query, "SearchService.searchText");

      // We do not store raw file contents in the database; reuse semantic hits as basic text hints
      const limit = options.limit ?? 20;
      const concepts = this.database
        .getSemanticConcepts()
        .filter((concept) =>
          concept.conceptName.toLowerCase().includes(query.toLowerCase()),
        )
        .slice(0, limit);

      return concepts.map((concept) => ({
        file: concept.filePath || "unknown",
        content: concept.conceptName,
        score: concept.confidenceScore,
        context: concept.conceptType,
        lineNumber: concept.lineRange.start || 1,
        matchStart: 0,
        matchLength: query.length,
        metadata: {
          searchType: "text",
        },
      }));
    } catch (error) {
      throw translateError(error, "Text search");
    }
  }

  private validateQuery(query: string, context: string): void {
    if (!query || typeof query !== "string") {
      throw new ValidationError(
        `Query must be a non-empty string (${context})`,
      );
    }

    if (query.trim().length === 0) {
      throw new ValidationError(
        `Query cannot be empty or whitespace only (${context})`,
      );
    }
  }
}
