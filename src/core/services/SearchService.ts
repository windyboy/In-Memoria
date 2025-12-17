import { SearchEngine, SearchQuery, SearchResponse, SearchResult } from '../../engines/search-engine.js';
import { Logger } from '../../utils/logger.js';
import { PathValidator } from '../../utils/path-validator.js';

/**
 * Search options for customizing search behavior
 */
export interface SearchOptions {
  language?: string;
  limit?: number;
  includeContext?: boolean;
}

/**
 * Semantic search result with enhanced metadata
 */
export interface SemanticSearchResult {
  file: string;
  content: string;
  score: number;
  context: string;
  concept: string;
  similarity: number;
  metadata: Record<string, any>;
}

/**
 * Pattern search result with pattern-specific metadata
 */
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

/**
 * Text search result with match-specific metadata
 */
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

/**
 * SearchService Interface - Read-only search operations
 * 
 * This service provides semantic, pattern, and text search capabilities
 * without performing any database write operations. It integrates with
 * the existing SearchEngine to provide a clean service layer interface.
 */
export interface SearchService {
  /**
   * Perform semantic search across the codebase
   * 
   * @param query - Search query string
   * @param options - Optional search configuration
   * @returns Promise<SemanticSearchResult[]> - Semantic search results
   */
  searchSemantic(query: string, options?: SearchOptions): Promise<SemanticSearchResult[]>;

  /**
   * Search for code patterns in the codebase
   * 
   * @param query - Pattern search query
   * @param options - Optional search configuration
   * @returns Promise<PatternSearchResult[]> - Pattern search results
   */
  searchPatterns(query: string, options?: SearchOptions): Promise<PatternSearchResult[]>;

  /**
   * Perform text-based search across code files
   * 
   * @param query - Text search query
   * @param options - Optional search configuration
   * @returns Promise<TextSearchResult[]> - Text search results
   */
  searchText(query: string, options?: SearchOptions): Promise<TextSearchResult[]>;
}

/**
 * SearchService Implementation - Read-only search operations
 * 
 * This service integrates with the existing SearchEngine to provide
 * semantic, pattern, and text search capabilities. It maintains strict
 * read-only behavior and contains no business logic beyond parameter
 * transformation and result formatting.
 */
export class SearchServiceImpl implements SearchService {
  constructor(
    private searchEngine: SearchEngine
  ) {}

  /**
   * Perform semantic search across the codebase
   * 
   * Uses the existing SearchEngine's semantic search capabilities to find
   * conceptually similar code based on semantic understanding.
   */
  async searchSemantic(query: string, options: SearchOptions = {}): Promise<SemanticSearchResult[]> {
    try {
      Logger.info(`Performing semantic search for: "${query}"`);
      
      // Validate query input
      this.validateSearchQuery(query, 'SearchService.searchSemantic');
      
      // Build search query for the engine
      const searchQuery: SearchQuery = {
        query,
        type: 'semantic',
        language: options.language,
        limit: options.limit || 10
      };
      
      // Execute search using existing engine (read-only)
      const response: SearchResponse = await this.searchEngine.search(searchQuery);
      
      // Transform results to semantic search format
      const results: SemanticSearchResult[] = response.results.map(result => ({
        file: result.file,
        content: result.content,
        score: result.score,
        context: result.context,
        concept: result.metadata.concept || result.content,
        similarity: result.metadata.similarity || result.score,
        metadata: {
          ...result.metadata,
          searchType: 'semantic',
          originalScore: result.score
        }
      }));
      
      Logger.info(`Semantic search completed. Found ${results.length} results`);
      return results;
      
    } catch (error) {
      Logger.error('Semantic search failed:', error);
      throw new Error(`Semantic search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search for code patterns in the codebase
   * 
   * Uses the existing SearchEngine's pattern search capabilities to find
   * code that matches specific development patterns and conventions.
   */
  async searchPatterns(query: string, options: SearchOptions = {}): Promise<PatternSearchResult[]> {
    try {
      Logger.info(`Performing pattern search for: "${query}"`);
      
      // Validate query input
      this.validateSearchQuery(query, 'SearchService.searchPatterns');
      
      // Build search query for the engine
      const searchQuery: SearchQuery = {
        query,
        type: 'pattern',
        language: options.language,
        limit: options.limit || 10
      };
      
      // Execute search using existing engine (read-only)
      const response: SearchResponse = await this.searchEngine.search(searchQuery);
      
      // Transform results to pattern search format
      const results: PatternSearchResult[] = response.results.map(result => ({
        file: result.file,
        content: result.content,
        score: result.score,
        context: result.context,
        patternType: result.metadata.patternType || 'unknown',
        confidence: result.metadata.confidence || result.score,
        frequency: result.metadata.frequency || 1,
        metadata: {
          ...result.metadata,
          searchType: 'pattern',
          originalScore: result.score
        }
      }));
      
      Logger.info(`Pattern search completed. Found ${results.length} results`);
      return results;
      
    } catch (error) {
      Logger.error('Pattern search failed:', error);
      throw new Error(`Pattern search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform text-based search across code files
   * 
   * Uses the existing SearchEngine's text search capabilities to find
   * literal text matches across the codebase with contextual information.
   */
  async searchText(query: string, options: SearchOptions = {}): Promise<TextSearchResult[]> {
    try {
      Logger.info(`Performing text search for: "${query}"`);
      
      // Validate query input
      this.validateSearchQuery(query, 'SearchService.searchText');
      
      // Build search query for the engine
      const searchQuery: SearchQuery = {
        query,
        type: 'text',
        language: options.language,
        limit: options.limit || 20
      };
      
      // Execute search using existing engine (read-only)
      const response: SearchResponse = await this.searchEngine.search(searchQuery);
      
      // Transform results to text search format
      const results: TextSearchResult[] = response.results.map(result => ({
        file: result.file,
        content: result.content,
        score: result.score,
        context: result.context,
        lineNumber: result.metadata.lineNumber || 1,
        matchStart: result.metadata.matchStart || 0,
        matchLength: result.metadata.matchLength || query.length,
        metadata: {
          ...result.metadata,
          searchType: 'text',
          originalScore: result.score
        }
      }));
      
      Logger.info(`Text search completed. Found ${results.length} results`);
      return results;
      
    } catch (error) {
      Logger.error('Text search failed:', error);
      throw new Error(`Text search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate search query input
   * 
   * @private
   * @param query - Search query to validate
   * @param context - Context for error reporting
   */
  private validateSearchQuery(query: string, context: string): void {
    if (!query || typeof query !== 'string') {
      throw new Error(`Invalid search query: query must be a non-empty string (${context})`);
    }
    
    if (query.trim().length === 0) {
      throw new Error(`Invalid search query: query cannot be empty or whitespace only (${context})`);
    }
    
    if (query.length > 1000) {
      throw new Error(`Invalid search query: query too long (max 1000 characters) (${context})`);
    }
  }
}

// Export the implementation class for bootstrap compatibility
// (SearchServiceImpl is already exported above as part of the class declaration)