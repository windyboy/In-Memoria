import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchServiceImpl } from '../services/SearchService.js';

// Define minimal interfaces for testing
interface SearchQuery {
  query: string;
  type: string;
  language?: string;
  limit?: number;
  filters?: Record<string, any>;
}

interface SearchResult {
  id: string;
  content: string;
  metadata: Record<string, any>;
  score: number;
  filePath: string;
  language: string;
}

interface SearchResponse {
  results: SearchResult[];
  totalFound: number;
  searchType: string;
}

interface SearchEngine {
  search(query: SearchQuery): Promise<SearchResponse>;
}

describe('SearchService', () => {
  let searchService: SearchServiceImpl;
  let mockSearchEngine: SearchEngine;

  beforeEach(() => {
    // Create a mock SearchEngine
    mockSearchEngine = {
      search: vi.fn()
    } as any;

    searchService = new SearchServiceImpl(mockSearchEngine);
  });

  describe('searchSemantic', () => {
    it('should perform semantic search and return formatted results', async () => {
      const mockResponse: SearchResponse = {
        results: [
          {
            id: 'test-1',
            content: 'function test() {}',
            score: 0.9,
            filePath: 'test.ts',
            language: 'typescript',
            metadata: {
              type: 'semantic',
              concept: 'test function',
              similarity: 0.9
            }
          }
        ],
        totalFound: 1,
        searchType: 'semantic'
      };

      (mockSearchEngine.search as any).mockResolvedValue(mockResponse);

      const results = await searchService.searchSemantic('test function');

      expect(mockSearchEngine.search).toHaveBeenCalledWith({
        query: 'test function',
        type: 'semantic',
        limit: 10
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        file: 'test.ts',
        content: 'function test() {}',
        score: 0.9,
        context: 'function test() {}',
        concept: 'test function',
        similarity: 0.9,
        metadata: {
          type: 'semantic',
          concept: 'test function',
          similarity: 0.9,
          searchType: 'semantic',
          originalScore: 0.9,
          language: 'typescript'
        }
      });
    });

    it('should validate search query input', async () => {
      await expect(searchService.searchSemantic('')).rejects.toThrow(
        'Validation failed: Query must be a non-empty string',
      );
      await expect(searchService.searchSemantic('   ')).rejects.toThrow(
        'Validation failed: Query cannot be empty or whitespace only',
      );
      await expect(searchService.searchSemantic('a'.repeat(1001))).rejects.toThrow(
        'Validation failed: Query too long (max 1000 characters)',
      );
    });
  });

  describe('searchPatterns', () => {
    it('should perform pattern search and return formatted results', async () => {
      const mockResponse: SearchResponse = {
        results: [
          {
            id: 'service-1',
            content: 'class UserService {}',
            score: 0.8,
            filePath: 'service.ts',
            language: 'typescript',
            metadata: {
              type: 'pattern',
              patternType: 'service_pattern',
              confidence: 0.8,
              frequency: 5
            }
          }
        ],
        totalFound: 1,
        searchType: 'pattern'
      };

      (mockSearchEngine.search as any).mockResolvedValue(mockResponse);

      const results = await searchService.searchPatterns('service pattern');

      expect(mockSearchEngine.search).toHaveBeenCalledWith({
        query: 'service pattern',
        type: 'pattern',
        limit: 10
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        file: 'service.ts',
        content: 'class UserService {}',
        score: 0.8,
        context: 'class UserService {}',
        patternType: 'service_pattern',
        confidence: 0.8,
        frequency: 5,
        metadata: {
          type: 'pattern',
          patternType: 'service_pattern',
          confidence: 0.8,
          frequency: 5,
          searchType: 'pattern',
          originalScore: 0.8,
          language: 'typescript'
        }
      });
    });
  });

  describe('searchText', () => {
    it('should perform text search and return formatted results', async () => {
      const mockResponse: SearchResponse = {
        results: [
          {
            id: 'utils-1',
            content: 'const testValue = "hello world";',
            score: 1.0,
            filePath: 'utils.ts',
            language: 'typescript',
            metadata: {
              type: 'text',
              lineNumber: 1,
              matchStart: 20,
              matchLength: 11
            }
          }
        ],
        totalFound: 1,
        searchType: 'text'
      };

      (mockSearchEngine.search as any).mockResolvedValue(mockResponse);

      const results = await searchService.searchText('hello world');

      expect(mockSearchEngine.search).toHaveBeenCalledWith({
        query: 'hello world',
        type: 'text',
        limit: 20
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        file: 'utils.ts',
        content: 'const testValue = "hello world";',
        score: 1.0,
        context: 'const testValue = "hello world";',
        lineNumber: 1,
        matchStart: 20,
        matchLength: 11,
        metadata: {
          type: 'text',
          lineNumber: 1,
          matchStart: 20,
          matchLength: 11,
          searchType: 'text',
          originalScore: 1.0,
          language: 'typescript'
        }
      });
    });
  });

  describe('search options', () => {
    it('should pass search options to the engine', async () => {
      const mockResponse: SearchResponse = {
        results: [],
        totalFound: 0,
        searchType: 'semantic'
      };

      (mockSearchEngine.search as any).mockResolvedValue(mockResponse);

      await searchService.searchSemantic('test', {
        language: 'typescript',
        limit: 5
      });

      expect(mockSearchEngine.search).toHaveBeenCalledWith({
        query: 'test',
        type: 'semantic',
        language: 'typescript',
        limit: 5
      });
    });
  });

  describe('error handling', () => {
    it('should handle search engine errors gracefully with fallback', async () => {
      const error = new Error('Search engine failed');
      (mockSearchEngine.search as any).mockRejectedValue(error);

      // With fallback logic, these should return empty arrays instead of throwing
      const semanticResult = await searchService.searchSemantic('test');
      const patternResult = await searchService.searchPatterns('test');
      const textResult = await searchService.searchText('test');

      expect(semanticResult).toEqual([]);
      expect(patternResult).toEqual([]);
      expect(textResult).toEqual([]);
    });
  });
});