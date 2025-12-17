import { describe, it, expect, beforeEach, vi, Mocked } from "vitest";
import { SearchEngine } from "../engines/search-engine.js";
import { SemanticEngine } from "../engines/semantic-engine.js";
import { PatternEngine } from "../engines/pattern-engine.js";
import { VectorStore } from "../storage/vector-store.js";

// Mock dependencies
vi.mock("../engines/semantic-engine.js");
vi.mock("../engines/pattern-engine.js");
vi.mock("../storage/vector-store.js");
vi.mock("fs", () => ({
  readFileSync: vi.fn(),
}));
vi.mock("glob", () => ({
  glob: vi.fn(),
}));
vi.mock("path", () => ({
  relative: vi.fn(),
}));

describe("SearchEngine", () => {
  let searchEngine: SearchEngine;
  let mockSemanticEngine: Mocked<SemanticEngine>;
  let mockPatternEngine: Mocked<PatternEngine>;
  let mockVectorStore: Mocked<VectorStore>;
  let mockDatabase: any;

  beforeEach(() => {
    mockSemanticEngine = new SemanticEngine() as Mocked<SemanticEngine>;
    mockPatternEngine = new PatternEngine({} as any) as Mocked<PatternEngine>;
    
    // Create a mock VectorStore object since it's an interface
    mockVectorStore = {
      initialize: vi.fn().mockResolvedValue(undefined),
      verifyEmbeddingModel: vi.fn().mockResolvedValue(undefined),
      storeCodeEmbedding: vi.fn().mockResolvedValue(undefined),
      storeMultipleEmbeddings: vi.fn().mockResolvedValue(undefined),
      findSimilarCode: vi.fn().mockResolvedValue([]),
      findSimilarCodeByFile: vi.fn().mockResolvedValue([]),
      findSimilarCodeByLanguage: vi.fn().mockResolvedValue([]),
      updateCodeEmbedding: vi.fn().mockResolvedValue(undefined),
      deleteCodeEmbedding: vi.fn().mockResolvedValue(undefined),
      deleteCodeEmbeddingsByFile: vi.fn().mockResolvedValue(undefined),
      getCollectionStats: vi.fn().mockResolvedValue({ count: 0, metadata: {} }),
      close: vi.fn().mockResolvedValue(undefined),
      getBackendInfo: vi.fn().mockReturnValue({
        type: 'mock',
        version: '1.0.0',
        capabilities: {
          supportsBatchOperations: true,
          supportsFiltering: true,
          supportsMetadataSearch: true,
          maxEmbeddingDimension: 1536,
          supportedDistanceMetrics: ['cosine']
        },
        connectionStatus: 'connected' as const,
        metadata: {}
      }),
      getHealthStatus: vi.fn().mockResolvedValue({
        status: 'healthy' as const,
        lastChecked: new Date(),
        responseTime: 10,
        details: {}
      }),
      getPerformanceMetrics: vi.fn().mockResolvedValue({
        operationCounts: { total: 0 },
        averageResponseTimes: { overall: 0 },
        errorRates: { overall: 0 },
        cacheHitRates: { overall: 0 },
        memoryUsage: 0
      })
    } as Mocked<VectorStore>;
    
    mockDatabase = {};

    searchEngine = new SearchEngine(
      mockSemanticEngine,
      mockPatternEngine,
      mockVectorStore,
      mockDatabase,
    );
  });

  describe("validateQuery", () => {
    it("should set default type to 'text' if not provided", () => {
      const query = { query: "test" };
      const result = (searchEngine as any).validateQuery(query);
      expect(result.type).toBe("text");
    });

    it("should set default limit to 10 if not provided", () => {
      const query = { query: "test" };
      const result = (searchEngine as any).validateQuery(query);
      expect(result.limit).toBe(10);
    });

    it("should preserve provided values", () => {
      const query = {
        query: "test",
        type: "semantic",
        limit: 5,
        language: "typescript",
      };
      const result = (searchEngine as any).validateQuery(query);
      expect(result.query).toBe("test");
      expect(result.type).toBe("semantic");
      expect(result.limit).toBe(5);
      expect(result.language).toBe("typescript");
    });

    it("should allow language to be undefined", () => {
      const query = { query: "test" };
      const result = (searchEngine as any).validateQuery(query);
      expect(result.language).toBeUndefined();
    });
  });

  describe("search", () => {
    it("should call semanticSearch for semantic type", async () => {
      const mockResult = {
        results: [],
        totalFound: 0,
        searchType: "semantic",
      };
      vi.spyOn(searchEngine as any, "semanticSearch").mockResolvedValue(
        mockResult,
      );

      const result = await searchEngine.search({
        query: "test",
        type: "semantic",
      });
      expect((searchEngine as any).semanticSearch).toHaveBeenCalledWith({
        query: "test",
        type: "semantic",
        limit: 10,
      });
      expect(result).toEqual(mockResult);
    });

    it("should call patternSearch for pattern type", async () => {
      const mockResult = {
        results: [],
        totalFound: 0,
        searchType: "pattern",
      };
      vi.spyOn(searchEngine as any, "patternSearch").mockResolvedValue(
        mockResult,
      );

      const result = await searchEngine.search({
        query: "test",
        type: "pattern",
      });
      expect((searchEngine as any).patternSearch).toHaveBeenCalledWith({
        query: "test",
        type: "pattern",
        limit: 10,
      });
      expect(result).toEqual(mockResult);
    });

    it("should call textSearch for text type", async () => {
      const mockResult = {
        results: [],
        totalFound: 0,
        searchType: "text",
      };
      vi.spyOn(searchEngine as any, "textSearch").mockResolvedValue(mockResult);

      const result = await searchEngine.search({
        query: "test",
        type: "text",
      });
      expect((searchEngine as any).textSearch).toHaveBeenCalledWith({
        query: "test",
        type: "text",
        limit: 10,
      });
      expect(result).toEqual(mockResult);
    });

    it("should default to textSearch if type is not recognized", async () => {
      const mockResult = {
        results: [],
        totalFound: 0,
        searchType: "text",
      };
      vi.spyOn(searchEngine as any, "textSearch").mockResolvedValue(mockResult);

      const result = await searchEngine.search({
        query: "test",
        type: "unknown" as any,
      });
      expect((searchEngine as any).textSearch).toHaveBeenCalled();
      expect(result).toEqual(mockResult);
    });
  });

  describe("semanticSearch", () => {
    it("should return results from semantic engine", async () => {
      const mockVectorResults = [
        { 
          similarity: 0.9,
          metadata: { 
            filePath: "file1.ts", 
            functionName: "testFunction" 
          }
        },
      ];
      mockVectorStore.findSimilarCode.mockResolvedValue(mockVectorResults);

      const { readFileSync } = await import("fs");
      (readFileSync as any).mockReturnValue("content");

      const result = await (searchEngine as any).semanticSearch({
        query: "test",
        limit: 10,
      });

      expect(mockVectorStore.findSimilarCode).toHaveBeenCalledWith(
        "test",
        10,
      );
      expect(result.results).toHaveLength(1);
      expect(result.searchType).toBe("semantic");
    });

    it("should handle errors gracefully", async () => {
      mockVectorStore.findSimilarCode.mockRejectedValue(
        new Error("Test error"),
      );

      const result = await (searchEngine as any).semanticSearch({
        query: "test",
        limit: 10,
      });

      expect(result.results).toEqual([]);
      expect(result.totalFound).toBe(0);
      expect(result.searchType).toBe("semantic");
      expect(result.error).toBe("Test error");
    });
  });

  describe("patternSearch", () => {
    it("should return results from pattern engine", async () => {
      const mockPatterns = [
        {
          patternId: "test_pattern_id",
          patternType: "test_pattern",
          patternContent: {},
          frequency: 1,
          contexts: ["test context"],
          examples: [{ code: "example code" }],
          confidence: 0.8,
        },
      ];
      mockPatternEngine.findRelevantPatterns.mockResolvedValue(mockPatterns);

      const { glob } = await import("glob");
      (glob as any).mockResolvedValue(["file1.ts"]);

      const { readFileSync } = await import("fs");
      (readFileSync as any).mockReturnValue("example code");

      vi.spyOn(searchEngine as any, "matchesPattern").mockReturnValue(true);

      const result = await (searchEngine as any).patternSearch({
        query: "test",
        limit: 10,
      });

      expect(result.results).toHaveLength(1);
      expect(result.searchType).toBe("pattern");
    });

    it("should handle errors gracefully", async () => {
      mockPatternEngine.findRelevantPatterns.mockRejectedValue(
        new Error("Test error"),
      );

      const result = await (searchEngine as any).patternSearch({
        query: "test",
        limit: 10,
      });

      expect(result.results).toEqual([]);
      expect(result.totalFound).toBe(0);
      expect(result.searchType).toBe("pattern");
      expect(result.error).toBe("Test error");
    });
  });

  describe("textSearch", () => {
    it("should return results for text matches", async () => {
      const { glob } = await import("glob");
      (glob as any).mockResolvedValue(["file1.ts"]);

      const { readFileSync } = await import("fs");
      (readFileSync as any).mockReturnValue("test content with match");

      const result = await (searchEngine as any).textSearch({
        query: "match",
        limit: 10,
      });

      expect(result.results).toHaveLength(1);
      expect(result.searchType).toBe("text");
    });

    it("should handle errors gracefully", async () => {
      const { glob } = await import("glob");
      (glob as any).mockRejectedValue(new Error("Test error"));

      const result = await (searchEngine as any).textSearch({
        query: "test",
        limit: 10,
      });

      expect(result.results).toEqual([]);
      expect(result.totalFound).toBe(0);
      expect(result.searchType).toBe("text");
      expect(result.error).toBe("Test error");
    });
  });

  describe("matchesPattern", () => {
    it("should match camelCase function naming", () => {
      const result = (searchEngine as any).matchesPattern(
        "function testFunction() {}",
        "camelCase_function_naming",
        "function example() {}",
      );
      expect(result).toBe(true);
    });

    it("should match PascalCase class naming", () => {
      const result = (searchEngine as any).matchesPattern(
        "class TestClass {}",
        "PascalCase_class_naming",
        "class Example {}",
      );
      expect(result).toBe(true);
    });

    it("should return false for no match", () => {
      const result = (searchEngine as any).matchesPattern(
        "random code",
        "unknown_pattern",
        "example",
      );
      expect(result).toBe(false);
    });
  });

  describe("calculateTextMatchScore", () => {
    it("should calculate score for exact match", () => {
      const score = (searchEngine as any).calculateTextMatchScore(
        "exact match",
        { index: 0, 0: "exact match" } as any,
        "exact match",
      );
      expect(score).toBeGreaterThan(1.0);
    });

    it("should boost score for word boundaries", () => {
      const score = (searchEngine as any).calculateTextMatchScore(
        " test ",
        { index: 1, 0: "test" } as any,
        "test",
      );
      expect(score).toBeGreaterThan(1.0);
    });
  });

  describe("getFileExtensionsForLanguage", () => {
    it("should return correct extensions for typescript", () => {
      const result = (searchEngine as any).getFileExtensionsForLanguage(
        "typescript",
      );
      expect(result).toBe("ts,tsx");
    });

    it("should return default for unknown language", () => {
      const result = (searchEngine as any).getFileExtensionsForLanguage(
        "unknown",
      );
      expect(result).toBe("ts,js,py,rs");
    });
  });
});
