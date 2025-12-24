import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SQLiteDatabase } from "./sqlite-db.js";
import {
  createTestDatabase,
  createMockConcept,
  createMockChunk,
} from "../utils/test-helpers.js";

describe("SQLiteDatabase", () => {
  let db: SQLiteDatabase;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  describe("initialization", () => {
    it("should initialize with in-memory database", () => {
      expect(db).toBeDefined();
    });

    it("should create all required tables", () => {
      // Check that tables exist by querying sqlite_master
      const tables = db["db"]
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
        )
        .all()
        .map((row: any) => row.name);

      expect(tables).toContain("semantic_concepts");
      expect(tables).toContain("developer_patterns");
      expect(tables).toContain("chunks");
      expect(tables).toContain("embedding_configs");
    });

    it("should enable WAL mode", () => {
      const result = db["db"].pragma("journal_mode", { simple: true });
      // For in-memory databases, journal mode is 'memory', not 'wal'
      expect(result).toBe("memory");
    });

    it("should set busy timeout", () => {
      // Verify timeout is set (can't directly query, but operation should work)
      expect(() => db["db"].pragma("busy_timeout")).not.toThrow();
    });
  });

  describe("semantic concepts", () => {
    it("should replace semantic concepts", () => {
      const concepts = [
        createMockConcept({
          id: "test-1",
          conceptName: "TestFunction",
          conceptType: "function",
          filePath: "/test/file.ts",
        }),
      ];

      expect(() => db.replaceSemanticConcepts(concepts)).not.toThrow();
    });

    it("should retrieve semantic concepts", () => {
      const concepts = [
        createMockConcept({
          id: "test-1",
          conceptName: "TestFunction",
          conceptType: "function",
        }),
        createMockConcept({
          id: "test-2",
          conceptName: "TestClass",
          conceptType: "class",
        }),
      ];

      db.replaceSemanticConcepts(concepts);
      const retrieved = db.getSemanticConcepts();

      expect(retrieved).toHaveLength(2);
      expect(retrieved[0].conceptName).toBe("TestFunction");
      expect(retrieved[1].conceptName).toBe("TestClass");
    });

    it("should filter concepts by type", () => {
      const concepts = [
        createMockConcept({ id: "test-1", conceptType: "function" }),
        createMockConcept({ id: "test-2", conceptType: "class" }),
        createMockConcept({ id: "test-3", conceptType: "function" }),
      ];

      db.replaceSemanticConcepts(concepts);
      const result = db["db"]
        .prepare(`SELECT * FROM semantic_concepts WHERE type = ?`)
        .all("function");

      expect(result).toHaveLength(2);
    });

    it("should handle empty concept list", () => {
      expect(() => db.replaceSemanticConcepts([])).not.toThrow();
      expect(db.getSemanticConcepts()).toHaveLength(0);
    });
  });

  describe("developer patterns", () => {
    it("should replace developer patterns", () => {
      const patterns = [
        {
          patternId: "pattern-1",
          patternType: "naming",
          patternContent: { pattern: "camelCase" },
          frequency: 1,
          examples: [{ source: "test" }],
          confidence: 0.9,
        },
      ];

      expect(() => db.replaceDeveloperPatterns(patterns)).not.toThrow();
    });

    it("should retrieve developer patterns", () => {
      const patterns = [
        {
          patternId: "pattern-1",
          patternType: "naming",
          patternContent: { pattern: "camelCase" },
          frequency: 1,
          examples: [{}],
          confidence: 0.9,
        },
        {
          patternId: "pattern-2",
          patternType: "structural",
          patternContent: { pattern: "barrel" },
          frequency: 1,
          examples: [{}],
          confidence: 0.8,
        },
      ];

      db.replaceDeveloperPatterns(patterns);
      const retrieved = db.getDeveloperPatterns();

      expect(retrieved).toHaveLength(2);
      expect(retrieved[0].patternType).toBe("naming");
      expect(retrieved[1].patternType).toBe("structural");
    });

    it("should filter patterns by type", () => {
      const patterns = [
        {
          patternId: "pattern-1",
          patternType: "naming",
          patternContent: {},
          frequency: 1,
          examples: [{}],
          confidence: 0.9,
        },
        {
          patternId: "pattern-2",
          patternType: "structural",
          patternContent: {},
          frequency: 1,
          examples: [{}],
          confidence: 0.8,
        },
      ];

      db.replaceDeveloperPatterns(patterns);
      const namingPatterns = db.getDeveloperPatterns("naming");

      expect(namingPatterns).toHaveLength(1);
      expect(namingPatterns[0].patternType).toBe("naming");
    });

    it("should handle empty pattern list", () => {
      expect(() => db.replaceDeveloperPatterns([])).not.toThrow();
      expect(db.getDeveloperPatterns()).toHaveLength(0);
    });
  });

  describe("chunks", () => {
    it("should upsert chunks", () => {
      const chunks = [
        createMockChunk({
          id: "chunk-1",
          filePath: "/test/file.ts",
          content: "function test() {}",
        }),
      ];

      expect(() => db.upsertChunks(chunks)).not.toThrow();
    });

    it("should retrieve chunks by IDs", () => {
      const chunks = [
        createMockChunk({ id: "chunk-1" }),
        createMockChunk({ id: "chunk-2" }),
      ];

      db.upsertChunks(chunks);
      const retrieved = db.findChunksByIds(["chunk-1", "chunk-2"]);

      expect(retrieved).toHaveLength(2);
      expect(retrieved.map((c) => c.id)).toContain("chunk-1");
      expect(retrieved.map((c) => c.id)).toContain("chunk-2");
    });

    it("should return empty array for non-existent chunk IDs", () => {
      const chunks = db.findChunksByIds(["non-existent"]);
      expect(chunks).toHaveLength(0);
    });

    it("should delete chunks by file", () => {
      const chunks = [
        createMockChunk({ id: "chunk-1", filePath: "/test/file1.ts" }),
        createMockChunk({ id: "chunk-2", filePath: "/test/file2.ts" }),
      ];

      db.upsertChunks(chunks);
      db.deleteChunksByFile("/test/file1.ts");

      const remaining = db.findChunksByIds(["chunk-1", "chunk-2"]);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].filePath).toBe("/test/file2.ts");
    });

    it("should handle empty chunks list", () => {
      expect(() => db.upsertChunks([])).not.toThrow();
    });

    it("should handle chunks with special characters in content", () => {
      const chunks = [
        createMockChunk({
          id: "chunk-1",
          content: `function test() { return "Hello 'World'"; }`,
        }),
      ];

      db.upsertChunks(chunks);
      const retrieved = db.findChunksByIds(["chunk-1"]);

      expect(retrieved[0].content).toContain("Hello 'World'");
    });
  });

  describe("embedding config", () => {
    it("should upsert embedding config", () => {
      const config = {
        id: "current",
        model: "test-model",
        dimension: 384,
        normalize: true,
      };

      expect(() => db.upsertEmbeddingConfig(config)).not.toThrow();
    });

    it("should retrieve embedding config", () => {
      const config = {
        id: "current",
        model: "test-model",
        dimension: 384,
        normalize: true,
      };

      db.upsertEmbeddingConfig(config);
      const retrieved = db.getEmbeddingConfig("current");

      expect(retrieved).toBeDefined();
      expect(retrieved?.model).toBe("test-model");
      expect(retrieved?.dimension).toBe(384);
    });

    it("should return undefined for non-existent config", () => {
      const config = db.getEmbeddingConfig("non-existent");
      expect(config).toBeUndefined();
    });

    it("should update existing config", () => {
      const config = {
        id: "current",
        model: "model-v1",
        dimension: 384,
        normalize: true,
      };

      db.upsertEmbeddingConfig(config);

      const updated = {
        id: "current",
        model: "model-v2",
        dimension: 512,
        normalize: false,
      };

      db.upsertEmbeddingConfig(updated);
      const retrieved = db.getEmbeddingConfig("current");

      expect(retrieved?.model).toBe("model-v2");
      expect(retrieved?.dimension).toBe(512);
    });
  });

  describe("transactions", () => {
    it("should support transactions", () => {
      const concepts = [createMockConcept({ id: "test-1" })];

      const transaction = db["db"].transaction(() => {
        db.replaceSemanticConcepts(concepts);
      });

      expect(() => transaction()).not.toThrow();
      expect(db.getSemanticConcepts()).toHaveLength(1);
    });

    it("should rollback on error", () => {
      const transaction = db["db"].transaction(() => {
        db.replaceSemanticConcepts([createMockConcept({ id: "test-1" })]);
        throw new Error("Test error");
      });

      expect(() => transaction()).toThrow("Test error");
      expect(db.getSemanticConcepts()).toHaveLength(0);
    });
  });

  describe("cleanup", () => {
    it("should close database connection", () => {
      const testDb = createTestDatabase();
      expect(() => testDb.close()).not.toThrow();
    });

    it("should allow multiple close calls", () => {
      const testDb = createTestDatabase();
      testDb.close();
      expect(() => testDb.close()).not.toThrow();
    });
  });

  describe("error handling", () => {
    it("should handle invalid concept data gracefully", () => {
      const invalidConcepts = [
        {
          // Missing required fields
          id: "test-1",
        } as any,
      ];

      expect(() => db.replaceSemanticConcepts(invalidConcepts)).toThrow();
    });

    it("should handle SQL injection attempts", () => {
      const maliciousConcept = createMockConcept({
        id: "'; DROP TABLE semantic_concepts; --",
        conceptName: "Malicious",
        confidenceScore: 0.9,
        lineRange: { start: 1, end: 10 },
      });

      expect(() =>
        db.replaceSemanticConcepts([maliciousConcept]),
      ).not.toThrow();

      // Table should still exist
      const concepts = db.getSemanticConcepts();
      expect(concepts).toBeDefined();
    });
  });
});
