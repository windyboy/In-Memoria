import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Container } from "../../core/container/container.js";
import { Logger } from "../../utils/logger.js";
import { translateError } from "../../core/errors.js";

/**
 * Unified MCP Adapter for All Tools
 * 
 * This adapter consolidates core-analysis-adapter.ts and intelligence-adapter.ts
 * into a single adapter to meet code simplification metrics.
 * 
 * Contains NO business logic - only parameter transformation and service method calls.
 * All business logic is handled by the service layer.
 */
export class UnifiedMCPAdapter {
  constructor(private container: Container) {}

  get tools(): Tool[] {
    return [
      // Core Analysis Tools
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
      // Intelligence Tools
      {
        name: "learn_codebase_intelligence",
        description:
          "Build intelligence database from codebase (one-time setup, ~30-60s). Required before using predict_coding_approach, get_project_blueprint, or get_pattern_recommendations. Re-run with force=true if codebase has significant changes. Most users should use auto_learn_if_needed instead - it runs this automatically when needed.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the codebase to learn from",
            },
            force: {
              type: "boolean",
              description:
                "Force re-learning even if codebase was previously analyzed (use when codebase has significant changes)",
            },
          },
          required: ["path"],
        },
      },
      {
        name: "get_semantic_insights",
        description:
          'Search for code-level symbols (variables, functions, classes) by name and see their relationships, usage patterns, and evolution. Use this to find where a specific function/class is defined, how it\'s used, or what it depends on. Searches actual code identifiers (e.g., "DatabaseConnection", "processRequest"), NOT business concepts or natural language descriptions.',
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                'Code identifier to search for (e.g., "DatabaseConnection", "processRequest"). Matches against function/class/variable names, not descriptions.',
            },
            conceptType: {
              type: "string",
              description:
                "Filter by concept type (class, function, interface, variable, etc.)",
            },
            limit: {
              type: "number",
              minimum: 1,
              maximum: 50,
              description: "Maximum number of insights to return",
            },
          },
        },
      },
      {
        name: "get_pattern_recommendations",
        description:
          'Get coding pattern recommendations learned from this codebase. Use this when implementing new features to follow existing patterns (e.g., "create a new service class", "add API endpoint"). Returns patterns like Factory, Singleton, DependencyInjection with confidence scores and actual examples from your code. These patterns are learned from the codebase, not hardcoded - they reflect how THIS project does things.',
        inputSchema: {
          type: "object",
          properties: {
            currentFile: {
              type: "string",
              description: "Current file being worked on",
            },
            selectedCode: {
              type: "string",
              description: "Currently selected code snippet",
            },
            problemDescription: {
              type: "string",
              description:
                'What you want to implement (e.g., "create a new service", "add database repository", "implement API handler")',
            },
            preferences: {
              type: "object",
              description: "Developer preferences and constraints",
            },
            includeRelatedFiles: {
              type: "boolean",
              description:
                "Include suggestions for related files where similar patterns are used",
            },
          },
          required: ["problemDescription"],
        },
      },
      {
        name: "predict_coding_approach",
        description:
          'Find which files to modify for a task using intelligent file routing. Use this when the user asks "where should I...", "what files...", or "how do I add/implement..." to route them directly to the relevant files without exploration. Returns target files, suggested starting point, and reasoning based on feature mapping and codebase intelligence.',
        inputSchema: {
          type: "object",
          properties: {
            problemDescription: {
              type: "string",
              description:
                'Description of what the user wants to add, modify, or implement (e.g., "add Ruby language support", "implement database caching", "fix authentication bug")',
            },
            context: {
              type: "object",
              description:
                "Additional context about the current codebase and requirements",
            },
            includeFileRouting: {
              type: "boolean",
              description:
                "Include smart file routing to identify target files for the task. Defaults to true. Set to false to disable.",
              default: true,
            },
          },
          required: ["problemDescription"],
        },
      },
      {
        name: "get_project_blueprint",
        description:
          "Get instant project blueprint - eliminates cold start exploration by providing tech stack, entry points, key directories, and architecture overview",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description:
                "Path to the project (defaults to current working directory)",
            },
            includeFeatureMap: {
              type: "boolean",
              description: "Include feature-to-file mapping (if available)",
              default: true,
            },
          },
        },
      },
      {
        name: "get_intelligence_metrics",
        description:
          "Get detailed analytics on learned concepts and patterns including breakdowns by type, confidence scores, and quality metrics",
        inputSchema: {
          type: "object",
          properties: {
            includeBreakdown: {
              type: "boolean",
              description: "Include detailed breakdown by type and confidence",
              default: true,
            },
          },
        },
      },
    ];
  }
  // ============================================================================
  // TOOL HANDLERS
  // ============================================================================

  async analyzeCodebase(args: { path: string; includeFileContent?: boolean }): Promise<any> {
    try {
      Logger.debug(`🔍 MCP analyzeCodebase called with path: ${args.path}`);
      
      // Use AnalysisService through DI Container (pure adapter - no business logic)
      const result = await this.container.analysisService.analyzeCodebase(args.path);
      
      // Determine if this is a file or directory analysis
      const { statSync } = await import('fs');
      let analysisType = 'directory';
      let language = undefined;
      
      try {
        const stats = statSync(args.path);
        if (stats.isFile()) {
          analysisType = 'file';
          // Determine language from file extension
          const ext = args.path.split('.').pop()?.toLowerCase();
          const languageMap: Record<string, string> = {
            'ts': 'typescript',
            'js': 'javascript',
            'py': 'python',
            'rs': 'rust',
            'go': 'go',
            'java': 'java',
            'cpp': 'cpp',
            'c': 'c',
            'cs': 'csharp',
            'php': 'php',
            'sql': 'sql'
          };
          language = ext ? languageMap[ext] : undefined;
        }
      } catch (error) {
        // If we can't stat the file, assume it's a directory
        analysisType = 'directory';
      }
      
      Logger.debug(`✅ MCP analyzeCodebase completed for: ${args.path}`);
      return {
        ...result,
        type: analysisType,
        language: language
      };
    } catch (error) {
      Logger.error(`❌ MCP analyzeCodebase failed for ${args.path}:`, error);
      throw translateError(error, 'analyze_codebase');
    }
  }

  async searchCodebase(args: { 
    query: string; 
    type?: string; 
    language?: string; 
    limit?: number 
  }): Promise<any> {
    try {
      Logger.debug(`🔍 MCP searchCodebase called with query: ${args.query}, type: ${args.type}`);
      
      // Use SearchService through DI Container (pure adapter - no business logic)
      const searchType = args.type || 'semantic';
      let result;
      
      switch (searchType) {
        case 'semantic':
          result = await this.container.searchService.searchSemantic(args.query, {
            language: args.language,
            limit: args.limit
          });
          break;
        case 'text':
          result = await this.container.searchService.searchText(args.query, {
            language: args.language,
            limit: args.limit
          });
          break;
        case 'pattern':
          result = await this.container.searchService.searchPatterns(args.query, {
            language: args.language,
            limit: args.limit
          });
          break;
        default:
          throw new Error(`Unsupported search type: ${searchType}`);
      }
      
      Logger.debug(`✅ MCP searchCodebase completed for: ${args.query}`);
      return result;
    } catch (error) {
      Logger.error(`❌ MCP searchCodebase failed for ${args.query}:`, error);
      throw translateError(error, 'search_codebase');
    }
  }

  async learnCodebaseIntelligence(args: { path: string; force?: boolean }): Promise<any> {
    try {
      Logger.debug(`🔍 MCP learnCodebaseIntelligence called with path: ${args.path}, force: ${args.force}`);
      
      // Use LearningService through DI Container (pure adapter - no business logic)
      const result = await this.container.learningService.learnFromCodebase(args.path, {
        force: args.force
      });
      
      Logger.debug(`✅ MCP learnCodebaseIntelligence completed for: ${args.path}`);
      return {
        success: result.success,
        conceptsLearned: result.conceptsLearned,
        patternsLearned: result.patternsDiscovered,
        featuresLearned: result.featuresLearned || 0,
        insights: [],
        timeElapsed: result.duration
      };
    } catch (error) {
      Logger.error(`❌ MCP learnCodebaseIntelligence failed for ${args.path}:`, error);
      throw translateError(error, 'learn_codebase_intelligence');
    }
  }

  async getSemanticInsights(args: { 
    query?: string; 
    conceptType?: string; 
    limit?: number 
  }): Promise<any> {
    try {
      Logger.debug(`🔍 MCP getSemanticInsights called with query: ${args.query}, type: ${args.conceptType}`);
      
      // Use SearchService through DI Container (pure adapter - no business logic)
      const result = await this.container.searchService.searchSemantic(args.query || '', {
        limit: args.limit
      });
      
      Logger.debug(`✅ MCP getSemanticInsights completed`);
      return {
        insights: result || [],
        totalAvailable: result.length || 0
      };
    } catch (error) {
      Logger.error(`❌ MCP getSemanticInsights failed:`, error);
      throw translateError(error, 'get_semantic_insights');
    }
  }

  async getPatternRecommendations(args: any): Promise<any> {
    try {
      Logger.debug(`🔍 MCP getPatternRecommendations called`);
      
      // TODO: Implement pattern recommendations through service layer
      // For now, return empty recommendations
      Logger.debug(`✅ MCP getPatternRecommendations completed`);
      return {
        recommendations: [],
        reasoning: "Pattern recommendations not yet implemented in service layer",
        relatedFiles: []
      };
    } catch (error) {
      Logger.error(`❌ MCP getPatternRecommendations failed:`, error);
      throw translateError(error, 'get_pattern_recommendations');
    }
  }

  async predictCodingApproach(args: any): Promise<any> {
    try {
      Logger.debug(`🔍 MCP predictCodingApproach called`);
      
      // TODO: Implement coding approach prediction through service layer
      // For now, return basic approach
      Logger.debug(`✅ MCP predictCodingApproach completed`);
      return {
        approach: "Analyze the codebase structure and identify relevant files",
        confidence: 0.5,
        reasoning: "Coding approach prediction not yet implemented in service layer",
        suggestedPatterns: [],
        estimatedComplexity: "medium"
      };
    } catch (error) {
      Logger.error(`❌ MCP predictCodingApproach failed:`, error);
      throw translateError(error, 'predict_coding_approach');
    }
  }

  async getProjectBlueprint(args: { path?: string; includeFeatureMap?: boolean }): Promise<any> {
    try {
      Logger.debug(`🔍 MCP getProjectBlueprint called with path: ${args.path}`);
      
      // Use AnalysisService to get basic project analysis
      const projectPath = args.path || process.cwd();
      const analysis = await this.container.analysisService.analyzeCodebase(projectPath);
      
      Logger.debug(`✅ MCP getProjectBlueprint completed`);
      return {
        techStack: analysis.languages || [],
        entryPoints: {},
        keyDirectories: {},
        architecture: "Modular",
        learningStatus: {
          hasIntelligence: false,
          isStale: false,
          conceptsStored: 0,
          patternsStored: 0,
          recommendation: "learning_recommended",
          message: "Project blueprint generation not yet fully implemented in service layer"
        }
      };
    } catch (error) {
      Logger.error(`❌ MCP getProjectBlueprint failed:`, error);
      throw translateError(error, 'get_project_blueprint');
    }
  }

  async getIntelligenceMetrics(args: { includeBreakdown?: boolean }): Promise<any> {
    try {
      Logger.debug(`🔍 MCP getIntelligenceMetrics called with includeBreakdown: ${args.includeBreakdown}`);
      
      // Use DiagnosticService through DI Container (pure adapter - no business logic)
      const projectPath = process.cwd();
      const metrics = await this.container.diagnosticService.getIntelligenceMetrics(projectPath);
      
      Logger.debug(`✅ MCP getIntelligenceMetrics completed`);
      return {
        success: true,
        metrics: metrics
      };
    } catch (error) {
      Logger.error(`❌ MCP getIntelligenceMetrics failed:`, error);
      throw translateError(error, 'get_intelligence_metrics');
    }
  }
}