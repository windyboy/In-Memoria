/**
 * Unified MCP Tools
 * 
 * This module consolidates core-analysis.ts and intelligence-tools.ts
 * into a single file to meet code simplification metrics.
 * 
 * Requirements addressed: 9.2, 12.1, 12.2
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
    CodebaseAnalysisSchema,
    SearchQuerySchema,
    CodingContextSchema,
    AIInsightsSchema,
    type CodebaseAnalysis,
    type SearchQuery,
    type CodingContext,
    type AIInsights,
    type SemanticInsight,
    type PatternRecommendation,
    type CodingApproachPrediction,
    type DeveloperProfile,
} from "../types.js";
import { SemanticEngine } from "../../utils/semantic-engine.js";
import { PatternEngine } from "../../utils/pattern-engine.js";
import { SQLiteDatabase } from "../../storage/sqlite-db.js";
import { VectorStore } from "../../storage/vector-store.js";
import { readFileSync, statSync, readdirSync, lstatSync } from "fs";
import { join, relative, extname, basename } from "path";
import { detectLanguageFromPath } from "../../utils/language-registry.js";
import {
    ErrorFactory,
    MCPErrorUtils,
    ErrorUtils,
    InMemoriaError,
    MCPErrorCode,
    ValidationError,
    PathValidationError,
    AnalysisError,
} from "../../utils/error-types.js";
import { PathValidator } from "../../utils/path-validator.js";
import { nanoid } from "nanoid";
import path from "path";

export class UnifiedMCPTools {
    constructor(
        private semanticEngine: SemanticEngine,
        private patternEngine: PatternEngine,
        private database: SQLiteDatabase,
        private vectorDB?: VectorStore,
    ) {}

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
        ];
    }
    // ============================================================================
    // CORE ANALYSIS METHODS
    // ============================================================================

    async analyzeCodebase(args: { path: string }): Promise<any> {
        if (!args.path || typeof args.path !== "string") {
            throw new ValidationError(
                "Path parameter is required and must be a string",
                "Please provide a valid file or directory path",
                { operation: "analyze_codebase", component: "unified-tools" }
            );
        }

        if (!PathValidator.isSafeProjectPath(args.path, process.cwd())) {
            throw new PathValidationError(
                args.path,
                "Path contains invalid characters or is outside project root",
                { operation: "analyze_codebase", component: "unified-tools", filePath: args.path }
            );
        }

        try {
            const stats = statSync(args.path);

            if (stats.isFile()) {
                const content = readFileSync(args.path, "utf-8");
                const language = this.detectLanguage(args.path);
                const lineCount = content.split("\n").length;

                const semanticConcepts = await this.semanticEngine.analyzeFileContent(args.path, content);
                const patterns = await this.patternEngine.analyzeFilePatterns(args.path, content);
                const complexity = this.calculateDetailedComplexity(content, semanticConcepts);

                return {
                    type: "file",
                    path: args.path,
                    language,
                    lineCount,
                    size: stats.size,
                    concepts: semanticConcepts.slice(0, 10).map((c: any) => ({
                        name: c.name,
                        type: c.type,
                        confidence: c.confidence,
                        line: c.lineRange?.start || 0,
                    })),
                    patterns: patterns.slice(0, 5).map((p: any) => ({
                        type: p.type,
                        description: p.description,
                        frequency: p.frequency || 1,
                    })),
                    complexity: {
                        cyclomatic: complexity.cyclomatic,
                        cognitive: complexity.cognitive,
                        lines: lineCount,
                    },
                    note: "For full file content, use a file reading tool. For all concepts, use get_semantic_insights.",
                };
            } else {
                const analysis = await this.semanticEngine.analyzeCodebase(args.path);
                const patterns = await this.patternEngine.extractPatterns(args.path);

                return {
                    path: args.path,
                    type: "codebase",
                    languages: analysis.languages,
                    frameworks: analysis.frameworks,
                    complexity: analysis.complexity,
                    topConcepts: analysis.concepts.slice(0, 15).map((concept: any) => ({
                        name: concept.name,
                        type: concept.type,
                        confidence: concept.confidence,
                    })),
                    topPatterns: patterns.slice(0, 10).map((p: any) => ({
                        type: p.type,
                        description: p.description,
                        frequency: p.frequency,
                    })),
                    summary: {
                        totalConcepts: analysis.concepts.length,
                        totalPatterns: patterns.length,
                        note: "Use get_semantic_insights to explore all concepts. Use get_project_blueprint for structure.",
                    },
                };
            }
        } catch (error) {
            console.error("Analysis error:", error);
            return {
                path: args.path,
                languages: [],
                frameworks: [],
                complexity: { cyclomatic: 0, cognitive: 0, lines: 0 },
                concepts: [],
                patterns: [],
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }

    // ============================================================================
    // INTELLIGENCE METHODS
    // ============================================================================

    async learnCodebaseIntelligence(args: {
        path: string;
        force?: boolean;
    }): Promise<{
        success: boolean;
        conceptsLearned: number;
        patternsLearned: number;
        featuresLearned?: number;
        insights: string[];
        timeElapsed: number;
        blueprint?: {
            techStack: string[];
            entryPoints: Record<string, string>;
            keyDirectories: Record<string, string>;
            architecture: string;
        };
    }> {
        // Use new LearningService through DI Container (single writer principle)
        const { initializeDIContainer } = await import('../../core/bootstrap.js');
        const container = await initializeDIContainer({ projectPath: args.path });
        
        const result = await container.learningService.learnFromCodebase(args.path, {
            force: args.force,
        });
        
        return {
            success: result.success,
            conceptsLearned: result.conceptsLearned,
            patternsLearned: result.patternsDiscovered,
            featuresLearned: result.featuresLearned || 0,
            insights: [],
            timeElapsed: result.duration,
            blueprint: undefined
        };
    }

    async getSemanticInsights(args: {
        query?: string;
        conceptType?: string;
        limit?: number;
    }): Promise<{
        insights: SemanticInsight[];
        totalAvailable: number;
    }> {
        const concepts = this.database.getSemanticConcepts();

        const filtered = concepts.filter((concept) => {
            if (args.conceptType && concept.conceptType !== args.conceptType) return false;
            if (args.query && !concept.conceptName.toLowerCase().includes(args.query.toLowerCase())) return false;
            return true;
        });

        const limit = args.limit || 10;
        const limited = filtered.slice(0, limit);

        const insights: SemanticInsight[] = limited.map((concept) => ({
            concept: concept.conceptName,
            relationships: Object.keys(concept.relationships),
            usage: {
                frequency: concept.confidenceScore * 100,
                contexts: [concept.filePath],
            },
            evolution: {
                firstSeen: concept.createdAt,
                lastModified: concept.updatedAt,
                changeCount: concept.evolutionHistory?.changes?.length || 0,
            },
        }));

        return {
            insights,
            totalAvailable: filtered.length,
        };
    }

    async getPatternRecommendations(
        args: CodingContext & {
            includeRelatedFiles?: boolean;
        },
    ): Promise<{
        recommendations: PatternRecommendation[];
        reasoning: string;
        relatedFiles?: string[];
    }> {
        const context = CodingContextSchema.parse(args);
        const patterns = this.database.getDeveloperPatterns(undefined, 100);

        const relevantPatterns = await this.patternEngine.findRelevantPatterns(
            context.problemDescription,
            context.currentFile,
            context.selectedCode,
        );

        const truncateCode = (code: string, maxLength: number = 150): string => {
            if (code.length <= maxLength) return code;
            return code.substring(0, maxLength) + "...";
        };

        const recommendations: PatternRecommendation[] = relevantPatterns.map(
            (pattern) => ({
                pattern: pattern.patternId,
                description: pattern.patternContent.description || "Pattern recommendation",
                confidence: pattern.confidence,
                examples: pattern.examples.slice(0, 2).map((ex) => truncateCode(ex.code || "")),
                reasoning: `Based on ${pattern.frequency} similar occurrences in your codebase`,
            }),
        );

        const result: {
            recommendations: PatternRecommendation[];
            reasoning: string;
            relatedFiles?: string[];
        } = {
            recommendations,
            reasoning: `Found ${recommendations.length} relevant patterns based on your coding history and current context`,
        };

        if (args.includeRelatedFiles) {
            const projectPath = process.cwd();
            const files = await this.patternEngine.findFilesUsingPatterns(relevantPatterns, projectPath);
            result.relatedFiles = files;
        }

        return result;
    }

    async predictCodingApproach(args: {
        problemDescription: string;
        context?: Record<string, any>;
        includeFileRouting?: boolean;
    }): Promise<
        CodingApproachPrediction & {
            fileRouting?: {
                intendedFeature: string;
                targetFiles: string[];
                workType: string;
                suggestedStartPoint: string;
                confidence: number;
                reasoning: string;
            };
        }
    > {
        const prediction = await this.patternEngine.predictApproach(
            args.problemDescription,
            args.context || {},
        );

        const result: CodingApproachPrediction & {
            fileRouting?: {
                intendedFeature: string;
                targetFiles: string[];
                workType: string;
                suggestedStartPoint: string;
                confidence: number;
                reasoning: string;
            };
        } = {
            approach: prediction.approach,
            confidence: prediction.confidence,
            reasoning: prediction.reasoning,
            suggestedPatterns: prediction.patterns,
            estimatedComplexity: prediction.complexity,
        };

        const includeRouting = args.includeFileRouting !== false;

        if (includeRouting) {
            const projectPath = process.cwd();
            const routing = await this.patternEngine.routeRequestToFiles(
                args.problemDescription,
                projectPath,
            );
            if (routing) {
                result.fileRouting = {
                    intendedFeature: routing.intendedFeature,
                    targetFiles: routing.targetFiles,
                    workType: routing.workType,
                    suggestedStartPoint: routing.suggestedStartPoint,
                    confidence: routing.confidence,
                    reasoning: routing.reasoning,
                };
            }
        }

        return result;
    }

    async getProjectBlueprint(args: {
        path?: string;
        includeFeatureMap?: boolean;
    }): Promise<{
        techStack: string[];
        entryPoints: Record<string, string>;
        keyDirectories: Record<string, string>;
        architecture: string;
        featureMap?: Record<string, string[]>;
        learningStatus?: {
            hasIntelligence: boolean;
            isStale: boolean;
            conceptsStored: number;
            patternsStored: number;
            recommendation: string;
            message: string;
        };
    }> {
        const projectPath = PathValidator.validateAndWarnProjectPath(args.path, "get_project_blueprint");
        const { config } = await import("../../utils/config.js");
        const projectDbPath = config.getDatabasePath(projectPath);
        const projectDatabase = new SQLiteDatabase(projectDbPath);

        try {
            const entryPoints = projectDatabase.getEntryPoints(projectPath);
            const entryPointsMap = entryPoints.reduce((acc, ep) => {
                acc[ep.entryType] = ep.filePath;
                return acc;
            }, {} as Record<string, string>);

            const keyDirs = projectDatabase.getKeyDirectories(projectPath);
            const keyDirsMap = keyDirs.reduce((acc, dir) => {
                acc[dir.directoryType] = dir.directoryPath;
                return acc;
            }, {} as Record<string, string>);

            let featureMap: Record<string, string[]> | undefined;
            if (args.includeFeatureMap) {
                const features = projectDatabase.getFeatureMaps(projectPath);
                featureMap = features.reduce((acc, feature) => {
                    acc[feature.featureName] = feature.primaryFiles;
                    return acc;
                }, {} as Record<string, string[]>);
            }

            const techStack = [...new Set(entryPoints.map((ep) => ep.framework).filter(Boolean))] as string[];
            const architecture = this.inferArchitectureFromBlueprint({ frameworks: techStack, keyDirectories: keyDirs });
            const learningStatus = await this.getLearningStatus(projectDatabase, projectPath);

            return {
                techStack,
                entryPoints: entryPointsMap,
                keyDirectories: keyDirsMap,
                architecture,
                ...(featureMap && Object.keys(featureMap).length > 0 ? { featureMap } : {}),
                learningStatus,
            };
        } finally {
            projectDatabase.close();
        }
    }
    // ============================================================================
    // HELPER METHODS
    // ============================================================================

    private detectLanguage(filePath: string): string {
        return detectLanguageFromPath(filePath);
    }

    private calculateDetailedComplexity(content: string, semanticConcepts: any[]): {
        cyclomatic: number;
        cognitive: number;
        functions: number;
        classes: number;
    } {
        const lines = content.split("\n");
        const functions = semanticConcepts.filter((c) => c.type === "function").length;
        const classes = semanticConcepts.filter((c) => c.type === "class").length;

        let cyclomatic = 1;
        const complexityKeywords = ["if", "else", "while", "for", "switch", "case", "catch", "try", "&&", "||", "?"];

        for (const line of lines) {
            for (const keyword of complexityKeywords) {
                if (keyword === "&&" || keyword === "||" || keyword === "?") {
                    const matches = line.split(keyword).length - 1;
                    cyclomatic += matches;
                } else {
                    const regex = new RegExp(`\\b${keyword}\\b`, "g");
                    const matches = line.match(regex);
                    if (matches) {
                        cyclomatic += matches.length;
                    }
                }
            }
        }

        const cognitive = Math.floor(cyclomatic * 1.2) + Math.floor(functions * 0.5);

        return { cyclomatic, cognitive, functions, classes };
    }

    private async getLearningStatus(database: SQLiteDatabase, projectPath: string): Promise<{
        hasIntelligence: boolean;
        isStale: boolean;
        conceptsStored: number;
        patternsStored: number;
        recommendation: string;
        message: string;
    }> {
        try {
            const concepts = database.getSemanticConcepts();
            const patterns = database.getDeveloperPatterns();

            const hasIntelligence = concepts.length > 0 || patterns.length > 0;
            const isStale = false;

            return {
                hasIntelligence,
                isStale,
                conceptsStored: concepts.length,
                patternsStored: patterns.length,
                recommendation: hasIntelligence && !isStale ? "ready" : "learning_recommended",
                message: hasIntelligence && !isStale
                    ? `Intelligence is ready! ${concepts.length} concepts and ${patterns.length} patterns available.`
                    : `Learning recommended for optimal functionality.`,
            };
        } catch (error) {
            return {
                hasIntelligence: false,
                isStale: false,
                conceptsStored: 0,
                patternsStored: 0,
                recommendation: "learning_needed",
                message: "No intelligence data available. Learning needed for optimal functionality.",
            };
        }
    }

    private inferArchitectureFromBlueprint(blueprint: {
        frameworks: string[];
        keyDirectories: any[];
    }): string {
        const { frameworks, keyDirectories } = blueprint;

        if (frameworks.some((f) => f.toLowerCase().includes("react"))) {
            return "Component-Based (React)";
        } else if (frameworks.some((f) => f.toLowerCase().includes("express"))) {
            return "REST API (Express)";
        } else if (frameworks.some((f) => f.toLowerCase().includes("fastapi"))) {
            return "REST API (FastAPI)";
        } else if (keyDirectories.some((d) => d.directoryType === "services")) {
            return "Service-Oriented";
        } else if (keyDirectories.some((d) => d.directoryType === "components")) {
            return "Component-Based";
        } else if (
            keyDirectories.some((d) => d.directoryType === "models") &&
            keyDirectories.some((d) => d.directoryType === "views")
        ) {
            return "MVC Pattern";
        } else {
            return "Modular";
        }
    }
}