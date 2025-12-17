import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Container } from "../../core/container/container.js";
import { Logger } from "../../utils/logger.js";

/**
 * Pure MCP Adapter for Core Analysis Tools
 * 
 * This adapter contains NO business logic - only parameter transformation
 * and service method calls. All business logic is handled by the service layer.
 */
export class CoreAnalysisAdapter {
  constructor(private container: Container) {}

  get tools(): Tool[] {
    return [
      {
        name: "analyze_codebase",
        description:
          "One-time analysis of a specific file or directory. Returns AST structure, complexity metrics, and detected patterns for that path only. For project-wide understanding, use get_project_blueprint instead (faster, uses learned intelligence). Use this for deep-dive analysis of a specific file you're currently working on.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description:
                "Path to specific file or directory to analyze in detail",
            },
            includeFileContent: {
              type: "boolean",
              description:
                "If true and path is a file, include full file content in response (default: false)",
            },
          },
          required: ["path"],
        },
      },
      {
        name: "search_codebase",
        description:
          'Search for code by text matching or patterns. Use "text" type for finding specific strings/keywords in code. Use "pattern" type for regex/AST patterns. Note: For "where should I work?" or "what files to modify?" questions, use predict_coding_approach instead - it provides intelligent file routing without exploration.',
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "Search query - literal text string or regex pattern depending on type",
            },
            type: {
              type: "string",
              enum: ["semantic", "text", "pattern"],
              description:
                'Type of search: "text" for literal string matching, "pattern" for regex/AST patterns, "semantic" for concept-based search',
            },
            language: {
              type: "string",
              description:
                'Filter results by programming language (e.g., "typescript", "rust", "python")',
            },
            limit: {
              type: "number",
              minimum: 1,
              maximum: 100,
              description: "Maximum number of results to return",
            },
          },
          required: ["query"],
        },
      },
    ];
  }

  /**
   * Pure adapter method for codebase analysis
   * Contains NO business logic - only parameter transformation and service calls
   */
  async analyzeCodebase(args: { path: string; includeFileContent?: boolean }): Promise<any> {
    try {
      Logger.info(`MCP Adapter: analyze_codebase called with path: ${args.path}`);
      
      // Pure parameter transformation - no business logic
      const projectPath = args.path;
      
      // Call service layer method (read-only analysis)
      const analysis = await this.container.analysisService.analyzeCodebase(projectPath);
      
      // Determine if this is a file or directory analysis
      const { statSync } = await import('fs');
      let analysisType = "codebase";
      try {
        const stats = statSync(projectPath);
        analysisType = stats.isFile() ? "file" : "codebase";
      } catch {
        // If we can't stat the path, default to codebase
        analysisType = "codebase";
      }
      
      // Pure response transformation - no business logic
      return {
        type: analysisType,
        path: analysis.projectPath,
        language: analysis.languages.length > 0 ? analysis.languages[0] : 'unknown',
        languages: analysis.languages,
        frameworks: analysis.frameworks,
        complexity: analysis.complexity,
        concepts: analysis.concepts.slice(0, 15).map(concept => ({
          name: concept.name,
          type: concept.type,
          confidence: concept.confidence,
        })),
        patterns: analysis.patterns.slice(0, 10).map(pattern => ({
          type: pattern.type,
          description: pattern.description,
          frequency: pattern.frequency,
        })),
        summary: {
          totalConcepts: analysis.concepts.length,
          totalPatterns: analysis.patterns.length,
          note: "Use get_semantic_insights to explore all concepts. Use get_project_blueprint for structure.",
        },
      };
    } catch (error) {
      Logger.error('MCP Adapter: analyze_codebase failed:', error);
      throw error; // Re-throw service errors without modification
    }
  }

  /**
   * Pure adapter method for codebase search
   * Contains NO business logic - only parameter transformation and service calls
   */
  async searchCodebase(args: {
    query: string;
    type?: "semantic" | "text" | "pattern";
    language?: string;
    limit?: number;
  }): Promise<any> {
    try {
      Logger.info(`MCP Adapter: search_codebase called with query: "${args.query}", type: ${args.type}`);
      
      // Pure parameter transformation - no business logic
      const searchOptions = {
        language: args.language,
        limit: args.limit || 20,
      };
      
      // Route to appropriate service method based on search type
      let results: any[];
      const searchType = args.type || "text";
      
      switch (searchType) {
        case "semantic":
          results = await this.container.searchService.searchSemantic(args.query, searchOptions);
          break;
        case "pattern":
          results = await this.container.searchService.searchPatterns(args.query, searchOptions);
          break;
        case "text":
        default:
          results = await this.container.searchService.searchText(args.query, searchOptions);
          break;
      }
      
      // Pure response transformation - no business logic
      return {
        results: results.map(result => ({
          file: result.file,
          content: result.content,
          score: result.score,
          context: result.context,
        })),
        totalFound: results.length,
        searchType,
      };
    } catch (error) {
      Logger.error('MCP Adapter: search_codebase failed:', error);
      throw error; // Re-throw service errors without modification
    }
  }
}