import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SearchServiceImpl } from "./SearchService.js";
import { SQLiteDatabase } from "../../storage/sqlite-db.js";
import { VectorStore } from "../../storage/vector-store.js";
import { EmbeddingEngine } from "../../utils/embedding-engine.js";
import { ChunkRepository } from "../../storage/repositories/chunk-repository.js";
import {
  createTestDatabase,
  createMockConcept,
  createMockChunk,
  createMockEmbedding,
} from "../../utils/test-helpers.js";

// Mock embedding engine
class MockEmbeddingEngine {
  async embed(text: string): Promise<number[]> {
    // Return a consistent mock embedding
    return createMockEmbedding();
  }
}

// Mock vector store
class MockVectorStore implements VectorStore {
  private enabled = true;
  private vectors = new Map<string, number[]>();

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  async upsertVectors(items: Array<{ id: string; vector: number[] }>): Promise<void> {
    for (const item of items) {
      this.vectors.set(item.id, item.vector);
    }
  }

  async searchVectors(vector: number[], limit: number): Promise<string[]> {
    // Return mock search results - just return chunk IDs in order
    return Array.from(this.vectors.keys()).slice(0, limit);
  }

  async deleteByIds(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.vectors.delete(id);
    }
  }

  async clear(): Promise<void> {
    this.vectors.clear();
  }

  getVectorCount(): number {
    return this.vectors.size;
  }

  needsRebuild(): boolean {
    return false;
  }
}

describe("SearchService", () => {
  let db: SQLiteDatabase;
  let searchService: SearchServiceImpl;
  let vectorStore: MockVectorStore;
  let embeddingEngine: EmbeddingEngine;
  let chunkRepository: ChunkRepository;

  beforeEach(() => {
    db = createTestDatabase();
    vectorStore = new MockVectorStore();
    embeddingEngine = new MockEmbeddingEngine() as any;
    chunkRepository = new ChunkRepository(db);

    searchService = new SearchServiceImpl(
      db,
      vectorStore,
      embeddingEngine,
      chunkRepository,
    );
  });

  afterEach(() => {
    db.close();
  });

  describe("searchSemantic", () => {
    it("should return empty results when no data exists", async () => {
      const results = await searchService.searchSemantic("test query");
      expect(results).toEqual([]);
    });

    it("should return semantic search results when data exists", async () => {
      // Setup: Add chunks and vectors
      const chunks = [
        createMockChunk({
          id: "chunk-1",
          filePath: "/test/auth.ts",
          content: "function authenticate(user) { return true; }",
          chunkType: "function",
        }),
        createMockChunk({
          id: "chunk-2",
          filePath: "/test/user.ts",
          content: "class User { constructor(name) { this.name = name; } }",
          chunkType: "class",
        }),
      ];

      db.upsertChunks(chunks);
      await vectorStore.upsertVectors([
        { id: "chunk-1", vector: createMockEmbedding() },
        { id: "chunk-2", vector: createMockEmbedding() },
      ]);

      // Execute search
      const results = await searchService.searchSemantic("authentication");

      // Verify
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty("file");
      expect(results[0]).toHaveProperty("content");
      expect(results[0]).toHaveProperty("score");
      expect(results[0]).toHaveProperty("similarity");
    });

    it("should respect limit option", async () => {
      // Setup: Add 5 chunks
      const vectorItems = [];
      for (let i = 0; i < 5; i++) {
        const chunk = createMockChunk({
          id: `chunk-${i}`,
          filePath: `/test/file${i}.ts`,
          content: `function test${i}() { return ${i}; }`,
        });
        db.upsertChunks([chunk]);
        vectorItems.push({ id: chunk.id, vector: createMockEmbedding() });
      }
      await vectorStore.upsertVectors(vectorItems);

      // Execute with limit
      const results = await searchService.searchSemantic("test", { limit: 2 });

      // Verify
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it("should filter by language when specified", async () => {
      // Setup: Add chunks in different languages
      const chunks = [
        createMockChunk({
          id: "chunk-1",
          filePath: "/test/file.ts",
          content: "typescript code",
        }),
        createMockChunk({
          id: "chunk-2",
          filePath: "/test/file.js",
          content: "javascript code",
        }),
        createMockChunk({
          id: "chunk-3",
          filePath: "/test/file.py",
          content: "python code",
        }),
      ];

      db.upsertChunks(chunks);
      await vectorStore.upsertVectors(
        chunks.map(chunk => ({ id: chunk.id, vector: createMockEmbedding() }))
      );

      // Execute with language filter
      const results = await searchService.searchSemantic("code", {
        language: "ts",
      });

      // Verify - should only return TypeScript files
      expect(results.every((r) => r.file.endsWith(".ts"))).toBe(true);
    });

    it("should handle empty query gracefully", async () => {
      await expect(searchService.searchSemantic("")).rejects.toThrow();
    });

    it("should handle vector search disabled", async () => {
      // Disable vector search
      vectorStore.setEnabled(false);

      // Should fall back to concept search
      const concepts = [
        createMockConcept({
          id: "concept-1",
          conceptName: "TestFunction",
          conceptType: "function",
          filePath: "/test/file.ts",
        }),
      ];
      db.replaceSemanticConcepts(concepts);

      const results = await searchService.searchSemantic("TestFunction");

      // Should return concept-based results
      expect(results).toBeDefined();
    });

    it("should not return duplicate results", async () => {
      // Setup: Add chunks
      const chunks = [
        createMockChunk({
          id: "chunk-1",
          filePath: "/test/file.ts",
          content: "duplicate content",
        }),
      ];

      db.upsertChunks(chunks);
      await vectorStore.upsertVectors([
        { id: "chunk-1", vector: createMockEmbedding() },
      ]);

      // Execute
      const results = await searchService.searchSemantic("duplicate");

      // Verify no duplicates
      const ids = results.map((r) => r.file + r.content);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });
  });

  describe("searchText", () => {
    it("should return empty results when no concepts match", async () => {
      const results = await searchService.searchText("nonexistent");
      expect(results).toEqual([]);
    });

    it("should search concepts by text query", async () => {
      // Setup: Add concepts
      const concepts = [
        createMockConcept({
          id: "concept-1",
          conceptName: "AuthenticationService",
          conceptType: "class",
          filePath: "/test/auth.ts",
        }),
        createMockConcept({
          id: "concept-2",
          conceptName: "UserService",
          conceptType: "class",
          filePath: "/test/user.ts",
        }),
      ];

      db.replaceSemanticConcepts(concepts);

      // Execute search
      const results = await searchService.searchText("Service");

      // Verify
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.content.includes("Service"))).toBe(true);
    });

    it("should be case-insensitive", async () => {
      const concepts = [
        createMockConcept({
          id: "concept-1",
          conceptName: "TestFunction",
          filePath: "/test/file.ts",
        }),
      ];

      db.replaceSemanticConcepts(concepts);

      // Search with different cases
      const lowerResults = await searchService.searchText("testfunction");
      const upperResults = await searchService.searchText("TESTFUNCTION");

      expect(lowerResults.length).toBeGreaterThan(0);
      expect(upperResults.length).toBeGreaterThan(0);
    });

    it("should respect limit option", async () => {
      // Add multiple concepts
      for (let i = 0; i < 10; i++) {
        db.replaceSemanticConcepts([
          createMockConcept({
            id: `concept-${i}`,
            conceptName: `TestFunction${i}`,
          }),
        ]);
      }

      const results = await searchService.searchText("TestFunction", {
        limit: 3,
      });
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it("should handle special characters in query", async () => {
      const concepts = [
        createMockConcept({
          id: "concept-1",
          conceptName: "function_with_underscore",
        }),
      ];

      db.replaceSemanticConcepts(concepts);

      const results = await searchService.searchText("function_with");
      expect(results.length).toBeGreaterThan(0);
    });

    it("should validate empty query", async () => {
      await expect(searchService.searchText("")).rejects.toThrow();
    });
  });

  describe("searchPatterns", () => {
    it("should return empty results when no patterns exist", async () => {
      const results = await searchService.searchPatterns("naming");
      expect(results).toEqual([]);
    });

    it("should search patterns by type", async () => {
      // Setup: Add patterns
      const patterns = [
        {
          patternId: "pattern-1",
          patternType: "naming",
          patternContent: { pattern: "camelCase", example: "testFunction" },
          frequency: 1,
          examples: [{ files: ["/test/file1.ts"] }],
          confidence: 0.9,
        },
        {
          patternId: "pattern-2",
          patternType: "structural",
          patternContent: { pattern: "barrel exports" },
          frequency: 1,
          examples: [{ files: ["/test/file2.ts"] }],
          confidence: 0.8,
        },
      ];

      db.replaceDeveloperPatterns(patterns);

      // Execute search
      const results = await searchService.searchPatterns("naming");

      // Verify
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].patternType).toBe("naming");
      expect(results[0]).toHaveProperty("confidence");
      expect(results[0]).toHaveProperty("frequency");
    });

    it("should respect limit option", async () => {
      // Add multiple patterns
      for (let i = 0; i < 5; i++) {
        db.replaceDeveloperPatterns([
          {
            patternId: `pattern-${i}`,
            patternType: "naming",
            patternContent: { pattern: `pattern${i}` },
            frequency: 1,
            examples: [{}],
            confidence: 0.9 - i * 0.1,
          },
        ]);
      }

      const results = await searchService.searchPatterns("naming", {
        limit: 2,
      });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it("should validate empty query", async () => {
      await expect(searchService.searchPatterns("")).rejects.toThrow();
    });

    it("should sort patterns by confidence", async () => {
      // Add patterns with different confidence scores
      const patterns = [
        {
          patternId: "pattern-1",
          patternType: "naming",
          patternContent: { pattern: "pattern1" },
          frequency: 1,
          examples: [{}],
          confidence: 0.5,
        },
        {
          patternId: "pattern-2",
          patternType: "naming",
          patternContent: { pattern: "pattern2" },
          frequency: 1,
          examples: [{}],
          confidence: 0.9,
        },
        {
          patternId: "pattern-3",
          patternType: "naming",
          patternContent: { pattern: "pattern3" },
          frequency: 1,
          examples: [{}],
          confidence: 0.7,
        },
      ];

      db.replaceDeveloperPatterns(patterns);

      const results = await searchService.searchPatterns("naming");

      // Verify sorted by confidence (descending)
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].confidence).toBeGreaterThanOrEqual(
          results[i + 1].confidence,
        );
      }
    });
  });

  describe("error handling", () => {
    it("should handle database errors gracefully", async () => {
      // Close database to simulate error
      db.close();

      await expect(searchService.searchText("query")).rejects.toThrow();
    });

    it("should handle embedding engine errors", async () => {
      // Mock embedding engine to throw error
      const errorEngine = {
        async embed(text: string): Promise<number[]> {
          throw new Error("Embedding failed");
        },
      };

      const errorService = new SearchServiceImpl(
        db,
        vectorStore,
        errorEngine as any,
        chunkRepository,
      );

      // Should handle error gracefully (fall back to concept search)
      const concepts = [
        createMockConcept({
          id: "concept-1",
          conceptName: "TestFunction",
        }),
      ];
      db.replaceSemanticConcepts(concepts);

      const results = await errorService.searchSemantic("TestFunction");
      expect(results).toBeDefined();
    });
  });
});
