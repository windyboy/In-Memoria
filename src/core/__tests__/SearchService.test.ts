import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchServiceImpl } from '../services/SearchService.js';
import { SearchEngine, SearchQuery, SearchResponse } from '../../engines/search-engine.js';

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
            file: 'test.ts',
            content: 'function test() {}',
            score: 0.9,
            context: 'function test() {\n  return true;\n}',
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
        context: 'function test() {\n  return true;\n}',
        concept: 'test function',
        similarity: 0.9,
        metadata: {
          type: 'semantic',
          concept: 'test function',
          similarity: 0.9,
          searchType: 'semantic',
          originalScore: 0.9
        }
      });
    });

    it('should validate search query input', async () => {
      await expect(searchService.searchSemantic('')).rejects.toThrow('Invalid search query');
      await expect(searchService.searchSemantic('   ')).rejects.toThrow('Invalid search query');
      await expect(searchService.searchSemantic('a'.repeat(1001))).rejects.toThrow('Invalid search query');
    });
  });

  describe('searchPatterns', () => {
    it('should perform pattern search and return formatted results', async () => {
      const mockResponse: SearchResponse = {
        results: [
          {
            file: 'service.ts',
            content: 'class UserService {}',
            score: 0.8,
            context: 'export class UserService {\n  constructor() {}\n}',
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
        context: 'export class UserService {\n  constructor() {}\n}',
        patternType: 'service_pattern',
        confidence: 0.8,
        frequency: 5,
        metadata: {
          type: 'pattern',
          patternType: 'service_pattern',
          confidence: 0.8,
          frequency: 5,
          searchType: 'pattern',
          originalScore: 0.8
        }
      });
    });
  });

  describe('searchText', () => {
    it('should perform text search and return formatted results', async () => {
      const mockResponse: SearchResponse = {
        results: [
          {
            file: 'utils.ts',
            content: 'const testValue = "hello world";',
            score: 1.0,
            context: '1: const testValue = "hello world";\n2: export { testValue };',
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
        context: '1: const testValue = "hello world";\n2: export { testValue };',
        lineNumber: 1,
        matchStart: 20,
        matchLength: 11,
        metadata: {
          type: 'text',
          lineNumber: 1,
          matchStart: 20,
          matchLength: 11,
          searchType: 'text',
          originalScore: 1.0
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
    it('should handle search engine errors gracefully', async () => {
      const error = new Error('Search engine failed');
      (mockSearchEngine.search as any).mockRejectedValue(error);

      await expect(searchService.searchSemantic('test')).rejects.toThrow('Semantic search failed: Search engine failed');
      await expect(searchService.searchPatterns('test')).rejects.toThrow('Pattern search failed: Search engine failed');
      await expect(searchService.searchText('test')).rejects.toThrow('Text search failed: Search engine failed');
    });
  });
});