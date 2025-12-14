import { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
    CodebaseAnalysisSchema,
    SearchQuerySchema,
    DocOptionsSchema,
    type CodebaseAnalysis,
    type SearchQuery,
    type DocOptions,
} from "../types.js";
import { SemanticEngine } from "../../engines/semantic-engine.js";
import { PatternEngine } from "../../engines/pattern-engine.js";
import { SearchEngine } from "../../engines/search-engine.js";
import { IntelligenceTools } from "./intelligence-tools.js";
import { DocumentationGenerator } from "./documentation-generator.js";
import { readFileSync, statSync, readdirSync, lstatSync } from "fs";
import { join, relative, extname, basename } from "path";
import { detectLanguageFromPath } from "../../utils/language-registry.js";
import { glob } from "glob";
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

export class CoreAnalysisTools {
    private intelligenceTools: IntelligenceTools;
    private searchEngine: SearchEngine;
    private documentationGenerator: DocumentationGenerator;

    constructor(
        private semanticEngine: SemanticEngine,
        private patternEngine: PatternEngine,
        private database: any,
    ) {
        this.intelligenceTools = new IntelligenceTools(
            semanticEngine,
            patternEngine,
            database,
        );
        this.searchEngine = new SearchEngine(
            semanticEngine,
            patternEngine,
            database,
        );
        this.documentationGenerator = new DocumentationGenerator(this.intelligenceTools);
    }

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

    async analyzeCodebase(args: { path: string }): Promise<any> {
        // Input validation
        if (!args.path || typeof args.path !== "string") {
            throw new ValidationError(
                "Path parameter is required and must be a string",
                "Please provide a valid file or directory path",
                { operation: "analyze_codebase", component: "core-analysis" }
            );
        }

        // Validate path - prevent path traversal attacks
        if (!PathValidator.isSafeProjectPath(args.path, process.cwd())) {
            throw new PathValidationError(
                args.path,
                "Path contains invalid characters or is outside project root",
                { operation: "analyze_codebase", component: "core-analysis", filePath: args.path }
            );
        }

        try {
            // Check if path is a file or directory
            const stats = statSync(args.path);

            if (stats.isFile()) {
                // FILE ANALYSIS - Token-efficient response focused on concepts
                const content = readFileSync(args.path, "utf-8");
                const language = this.detectLanguage(args.path);
                const lineCount = content.split("\n").length;

                // Perform semantic analysis
                const semanticConcepts =
                    await this.semanticEngine.analyzeFileContent(
                        args.path,
                        content,
                    );
                const patterns = await this.patternEngine.analyzeFilePatterns(
                    args.path,
                    content,
                );
                const complexity = this.calculateDetailedComplexity(
                    content,
                    semanticConcepts,
                );

                return {
                    type: "file",
                    path: args.path,
                    language,
                    lineCount,
                    size: stats.size,
                    // Token-efficient: Top 10 concepts only
                    concepts: semanticConcepts.slice(0, 10).map((c: any) => ({
                        name: c.name,
                        type: c.type,
                        confidence: c.confidence,
                        line: c.lineRange?.start || 0,
                    })),
                    // Token-efficient: Top 5 patterns
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
                // DIRECTORY ANALYSIS - Token-efficient codebase summary
                const analysis = await this.semanticEngine.analyzeCodebase(
                    args.path,
                );
                const patterns = await this.patternEngine.extractPatterns(
                    args.path,
                );

                return {
                    path: args.path,
                    type: "codebase",
                    languages: analysis.languages,
                    frameworks: analysis.frameworks,
                    complexity: analysis.complexity,
                    // Token-efficient: Top 15 concepts only
                    topConcepts: analysis.concepts
                        .slice(0, 15)
                        .map((concept: any) => ({
                            name: concept.name,
                            type: concept.type,
                            confidence: concept.confidence,
                        })),
                    // Token-efficient: Top 10 patterns only
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

    async getFileContent(args: { path: string }): Promise<{
        content: string;
        metadata: {
            size: number;
            lastModified: Date;
            language: string;
            lineCount: number;
            semanticConcepts: Array<{
                name: string;
                type: string;
                confidence: number;
                lineRange: { start: number; end: number };
            }>;
            patterns: Array<{
                type: string;
                description: string;
                confidence: number;
            }>;
            complexity: {
                cyclomatic: number;
                cognitive: number;
                functions: number;
                classes: number;
            };
            dependencies: string[];
            exports: string[];
        };
    }> {
        // Input validation
        if (!args.path || typeof args.path !== "string") {
            throw new ValidationError(
                "Path parameter is required and must be a string",
                "Please provide a valid file path",
                { operation: "get_file_content", component: "core-analysis" }
            );
        }

        // Validate path - prevent path traversal attacks
        if (!PathValidator.isSafeProjectPath(args.path, process.cwd())) {
            throw new PathValidationError(
                args.path,
                "Path contains invalid characters or is outside project root",
                { operation: "get_file_content", component: "core-analysis", filePath: args.path }
            );
        }

        try {
            const content = readFileSync(args.path, "utf-8");
            const stats = statSync(args.path);
            const language = this.detectLanguage(args.path);
            const lineCount = content.split("\n").length;

            // Perform semantic analysis using our Rust engine
            const semanticConcepts =
                await this.semanticEngine.analyzeFileContent(
                    args.path,
                    content,
                );

            // Extract patterns using our pattern engine
            const patterns = await this.patternEngine.analyzeFilePatterns(
                args.path,
                content,
            );

            // Calculate detailed complexity metrics
            const complexity = this.calculateDetailedComplexity(
                content,
                semanticConcepts,
            );

            // Extract dependencies and exports
            const dependencies = this.extractDependencies(content, language);
            const exports = this.extractExports(content, language);

            return {
                content,
                metadata: {
                    size: stats.size,
                    lastModified: stats.mtime,
                    language,
                    lineCount,
                    semanticConcepts,
                    patterns,
                    complexity,
                    dependencies,
                    exports,
                },
            };
        } catch (error) {
            if (error instanceof InMemoriaError) {
                throw error;
            }

            // Convert to proper InMemoria error with MCP compliance
            const inMemoriaError = ErrorUtils.fromError(
                error instanceof Error ? error : new Error(String(error)),
                {
                    operation: "file-analysis",
                    filePath: args.path,
                    component: "core-analysis-tools",
                },
            );

            throw inMemoriaError;
        }
    }

    async getProjectStructure(args: {
        path: string;
        maxDepth?: number;
    }): Promise<{
        structure: any;
        summary: {
            totalFiles: number;
            languages: Record<string, number>;
            directories: number;
        };
    }> {
        const structure = await this.buildDirectoryStructure(
            args.path,
            args.maxDepth || 5,
        );
        const summary = this.calculateStructureSummary(structure);

        return { structure, summary };
    }

    async searchCodebase(args: SearchQuery): Promise<{
        results: Array<{
            file: string;
            content: string;
            score: number;
            context: string;
        }>;
        totalFound: number;
        searchType: string;
    }> {
        const validatedQuery = SearchQuerySchema.parse(args);
        const searchResult = await this.searchEngine.search(validatedQuery);

        return {
            results: searchResult.results.map((result) => ({
                file: result.file,
                content: result.content,
                score: result.score,
                context: result.context,
            })),
            totalFound: searchResult.totalFound,
            searchType: searchResult.searchType,
        };
    }

    async generateDocumentation(
        args: { path: string } & Partial<DocOptions>,
    ): Promise<{
        documentation: string;
        metadata: {
            generatedAt: Date;
            format: string;
            sections: string[];
        };
    }> {
        // Input validation
        if (!args.path || typeof args.path !== "string") {
            throw new ValidationError(
                "Path parameter is required and must be a string",
                "Please provide a valid path for documentation generation",
                { operation: "generate_documentation", component: "core-analysis" }
            );
        }

        // Validate path - prevent path traversal attacks
        if (!PathValidator.isSafeProjectPath(args.path, process.cwd())) {
            throw new PathValidationError(
                args.path,
                "Path contains invalid characters or is outside project root",
                { operation: "generate_documentation", component: "core-analysis", filePath: args.path }
            );
        }

        const options = DocOptionsSchema.parse(args);

        // Use the dedicated documentation generator
        return await this.documentationGenerator.generateDocumentation(args.path, options);
    }

    private detectLanguage(filePath: string): string {
        return detectLanguageFromPath(filePath);
    }

    private calculateDetailedComplexity(
        content: string,
        semanticConcepts: any[],
    ): {
        cyclomatic: number;
        cognitive: number;
        functions: number;
        classes: number;
    } {
        const lines = content.split("\n");

        // Count functions and classes from semantic concepts
        const functions = semanticConcepts.filter(
            (c) => c.type === "function",
        ).length;
        const classes = semanticConcepts.filter(
            (c) => c.type === "class",
        ).length;

        // Calculate cyclomatic complexity
        let cyclomatic = 1; // Base complexity
        const complexityKeywords = [
            "if",
            "else",
            "while",
            "for",
            "switch",
            "case",
            "catch",
            "try",
            "&&",
            "||",
            "?",
        ];

        for (const line of lines) {
            for (const keyword of complexityKeywords) {
                if (keyword === "&&" || keyword === "||" || keyword === "?") {
                    // Handle special characters that don't need word boundaries
                    const matches = line.split(keyword).length - 1;
                    cyclomatic += matches;
                } else {
                    // Handle regular keywords with word boundaries
                    const regex = new RegExp(`\\b${keyword}\\b`, "g");
                    const matches = line.match(regex);
                    if (matches) {
                        cyclomatic += matches.length;
                    }
                }
            }
        }

        // Calculate cognitive complexity (approximation)
        const cognitive =
            Math.floor(cyclomatic * 1.2) + Math.floor(functions * 0.5);

        return {
            cyclomatic,
            cognitive,
            functions,
            classes,
        };
    }

    private extractDependencies(content: string, language: string): string[] {
        const dependencies: string[] = [];
        const lines = content.split("\n");

        for (const line of lines) {
            const trimmed = line.trim();

            // TypeScript/JavaScript imports
            if (language === "typescript" || language === "javascript") {
                if (
                    trimmed.startsWith("import ") &&
                    trimmed.includes(" from ")
                ) {
                    const match = trimmed.match(/from\s+['"](.*?)['"]/);
                    if (match && match[1] && !match[1].startsWith(".")) {
                        const pkg = match[1].split("/")[0];
                        if (!dependencies.includes(pkg)) {
                            dependencies.push(pkg);
                        }
                    }
                }

                if (
                    trimmed.startsWith("const ") &&
                    trimmed.includes("require(")
                ) {
                    const match = trimmed.match(/require\(['"](.*?)['"]\)/);
                    if (match && match[1] && !match[1].startsWith(".")) {
                        const pkg = match[1].split("/")[0];
                        if (!dependencies.includes(pkg)) {
                            dependencies.push(pkg);
                        }
                    }
                }
            }

            // Python imports
            if (language === "python") {
                if (
                    trimmed.startsWith("import ") ||
                    trimmed.startsWith("from ")
                ) {
                    const match = trimmed.match(/(?:import|from)\s+(\w+)/);
                    if (match && match[1] && !dependencies.includes(match[1])) {
                        dependencies.push(match[1]);
                    }
                }
            }

            // Rust use statements
            if (language === "rust") {
                if (trimmed.startsWith("use ")) {
                    const match = trimmed.match(/use\s+(\w+)/);
                    if (match && match[1] && !dependencies.includes(match[1])) {
                        dependencies.push(match[1]);
                    }
                }
            }
        }

        return dependencies.slice(0, 20); // Limit to prevent overwhelming output
    }

    private extractExports(content: string, language: string): string[] {
        const exports: string[] = [];
        const lines = content.split("\n");

        for (const line of lines) {
            const trimmed = line.trim();

            // TypeScript/JavaScript exports
            if (language === "typescript" || language === "javascript") {
                if (trimmed.startsWith("export ")) {
                    // Export function/class/const
                    const match = trimmed.match(
                        /export\s+(?:function|class|const|let|var)\s+(\w+)/,
                    );
                    if (match && match[1] && !exports.includes(match[1])) {
                        exports.push(match[1]);
                    }

                    // Export default
                    if (trimmed.includes("export default")) {
                        const defaultMatch = trimmed.match(
                            /export\s+default\s+(\w+)/,
                        );
                        if (
                            defaultMatch &&
                            defaultMatch[1] &&
                            !exports.includes(defaultMatch[1])
                        ) {
                            exports.push(defaultMatch[1]);
                        }
                    }
                }
            }

            // Python exports (functions and classes at module level)
            if (language === "python") {
                if (
                    trimmed.startsWith("def ") ||
                    trimmed.startsWith("class ")
                ) {
                    const match = trimmed.match(/(?:def|class)\s+(\w+)/);
                    if (match && match[1] && !exports.includes(match[1])) {
                        exports.push(match[1]);
                    }
                }
            }

            // Rust public items
            if (language === "rust") {
                if (trimmed.startsWith("pub ")) {
                    const match = trimmed.match(
                        /pub\s+(?:fn|struct|enum|trait)\s+(\w+)/,
                    );
                    if (match && match[1] && !exports.includes(match[1])) {
                        exports.push(match[1]);
                    }
                }
            }
        }

        return exports.slice(0, 20); // Limit to prevent overwhelming output
    }

    private calculateMaintainabilityIndex(complexity: any): number {
        // Simplified maintainability index calculation
        const volume = Math.log2(complexity.lines || 1);
        const cyclomaticComplexity = complexity.cyclomatic || 1;
        const linesOfCode = complexity.lines || 1;

        // Microsoft maintainability index formula (simplified)
        const maintainabilityIndex = Math.max(
            0,
            171 -
                5.2 * Math.log(volume) -
                0.23 * cyclomaticComplexity -
                16.2 * Math.log(linesOfCode),
        );

        return Math.round(maintainabilityIndex);
    }

    private assessTechnicalDebt(patterns: any[]): string {
        const violationPatterns = patterns.filter(
            (p) =>
                p.pattern_type?.includes("violation") ||
                p.description?.includes("anti-pattern") ||
                p.confidence < 0.5,
        );

        const debtScore = violationPatterns.length;

        if (debtScore === 0) return "low";
        if (debtScore <= 3) return "medium";
        return "high";
    }

    private async buildDirectoryStructure(
        path: string,
        maxDepth: number,
        currentDepth = 0,
    ): Promise<{
        name: string;
        type: "file" | "directory";
        path: string;
        size?: number;
        language?: string;
        lastModified?: Date;
        children?: Array<any>;
    }> {
        try {
            const stats = lstatSync(path);
            const name = basename(path);

            // Skip common ignored directories (but not for root directory)
            if (currentDepth > 0 && this.shouldIgnoreDirectory(name)) {
                return null as any;
            }

            if (stats.isFile()) {
                const language = this.detectLanguage(path);

                return {
                    name,
                    type: "file" as const,
                    path: relative(process.cwd(), path),
                    size: stats.size,
                    language,
                    lastModified: stats.mtime,
                };
            }

            if (stats.isDirectory() && currentDepth < maxDepth) {
                const children: Array<any> = [];

                try {
                    const entries = readdirSync(path);

                    for (const entry of entries) {
                        const entryPath = join(path, entry);
                        const child = await this.buildDirectoryStructure(
                            entryPath,
                            maxDepth,
                            currentDepth + 1,
                        );

                        if (child) {
                            children.push(child);
                        }
                    }
                } catch (error) {
                    // Skip directories we can't read
                }

                // Filter out null children and sort
                const validChildren = children.filter(
                    (child) => child !== null,
                );
                validChildren.sort((a, b) => {
                    if (a.type !== b.type) {
                        return a.type === "directory" ? -1 : 1;
                    }
                    return a.name.localeCompare(b.name);
                });

                return {
                    name,
                    type: "directory" as const,
                    path: relative(process.cwd(), path),
                    children: validChildren,
                };
            }

            return null as any;
        } catch (error) {
            // Skip files/directories we can't access
            return null as any;
        }
    }

    private shouldIgnoreDirectory(name: string): boolean {
        const ignoredDirs = [
            "node_modules",
            ".git",
            ".svn",
            ".hg",
            "target",
            "dist",
            "build",
            ".next",
            "__pycache__",
            ".pytest_cache",
            ".vscode",
            ".idea",
            ".DS_Store",
            "coverage",
            ".nyc_output",
            "logs",
            "*.log",
        ];

        return ignoredDirs.includes(name) || name.startsWith(".");
    }

    private calculateStructureSummary(structure: any): {
        totalFiles: number;
        languages: Record<string, number>;
        directories: number;
        totalSize: number;
        filesByType: Record<string, number>;
        largestFiles: Array<{ name: string; size: number; path: string }>;
        oldestFiles: Array<{ name: string; lastModified: Date; path: string }>;
        newestFiles: Array<{ name: string; lastModified: Date; path: string }>;
    } {
        const summary = {
            totalFiles: 0,
            languages: {} as Record<string, number>,
            directories: 0,
            totalSize: 0,
            filesByType: {} as Record<string, number>,
            largestFiles: [] as Array<{
                name: string;
                size: number;
                path: string;
            }>,
            oldestFiles: [] as Array<{
                name: string;
                lastModified: Date;
                path: string;
            }>,
            newestFiles: [] as Array<{
                name: string;
                lastModified: Date;
                path: string;
            }>,
        };

        const allFiles: Array<{
            name: string;
            size: number;
            path: string;
            lastModified: Date;
            language: string;
        }> = [];

        const traverse = (node: any) => {
            if (!node) return;

            if (node.type === "directory") {
                summary.directories++;
                if (node.children) {
                    node.children.forEach(traverse);
                }
            } else if (node.type === "file") {
                summary.totalFiles++;
                summary.totalSize += node.size || 0;

                // Count by language
                const language = node.language || "unknown";
                summary.languages[language] =
                    (summary.languages[language] || 0) + 1;

                // Count by file extension
                const ext = extname(node.name).toLowerCase() || "no-extension";
                summary.filesByType[ext] = (summary.filesByType[ext] || 0) + 1;

                // Collect file info for sorting
                allFiles.push({
                    name: node.name,
                    size: node.size || 0,
                    path: node.path,
                    lastModified: new Date(node.lastModified || Date.now()),
                    language,
                });
            }
        };

        traverse(structure);

        // Sort and get top files by different criteria
        const sortedBySize = [...allFiles].sort((a, b) => b.size - a.size);
        const sortedByAge = [...allFiles].sort(
            (a, b) => a.lastModified.getTime() - b.lastModified.getTime(),
        );
        const sortedByRecent = [...allFiles].sort(
            (a, b) => b.lastModified.getTime() - a.lastModified.getTime(),
        );

        summary.largestFiles = sortedBySize.slice(0, 5).map((f) => ({
            name: f.name,
            size: f.size,
            path: f.path,
        }));

        summary.oldestFiles = sortedByAge.slice(0, 5).map((f) => ({
            name: f.name,
            lastModified: f.lastModified,
            path: f.path,
        }));

        summary.newestFiles = sortedByRecent.slice(0, 5).map((f) => ({
            name: f.name,
            lastModified: f.lastModified,
            path: f.path,
        }));

        return summary;
    }
}