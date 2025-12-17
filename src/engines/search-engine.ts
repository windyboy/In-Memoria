import { SemanticEngine } from "./semantic-engine.js";
import { PatternEngine } from "./pattern-engine.js";
import { VectorStore } from "../storage/vector-store.js";
import { readFileSync } from "fs";
import { relative } from "path";
import { glob } from "glob";

export interface SearchResult {
    file: string;
    content: string;
    score: number;
    context: string;
    metadata: {
        type: "semantic" | "pattern" | "text";
        [key: string]: any;
    };
}

export interface SearchResponse {
    results: SearchResult[];
    totalFound: number;
    searchType: string;
}

export interface SearchQuery {
    query: string;
    type?: "semantic" | "text" | "pattern";
    language?: string;
    limit?: number;
}

export class SearchEngine {
    constructor(
        private semanticEngine: SemanticEngine,
        private patternEngine: PatternEngine,
        private vectorStore: VectorStore,
        private database: any,
    ) {}

    async search(query: SearchQuery): Promise<SearchResponse> {
        const validatedQuery = this.validateQuery(query);

        switch (validatedQuery.type) {
            case "semantic":
                return await this.semanticSearch(validatedQuery);
            case "pattern":
                return await this.patternSearch(validatedQuery);
            default:
                return await this.textSearch(validatedQuery);
        }
    }

    private validateQuery(
        query: SearchQuery,
    ): SearchQuery & Required<Pick<SearchQuery, "type" | "limit">> {
        return {
            query: query.query,
            type: query.type || "text",
            language: query.language,
            limit: query.limit || 10,
        };
    }

    private async semanticSearch(query: SearchQuery): Promise<SearchResponse> {
        try {
            // Use vector store directly for semantic search
            await this.vectorStore.initialize('in-memoria-intelligence');
            const vectorResults = await this.vectorStore.findSimilarCode(
                query.query,
                query.limit || 10,
            );

            const results: SearchResult[] = [];

            for (const result of vectorResults) {
                try {
                    // Read the file content for context
                    const content = readFileSync(result.metadata.filePath, "utf-8");
                    const lines = content.split("\n");

                    // Get context around the match (simple approach)
                    const contextStart = Math.max(0, 0);
                    const contextEnd = Math.min(lines.length, 10);
                    const context = lines
                        .slice(contextStart, contextEnd)
                        .join("\n");

                    const conceptName = result.metadata.functionName || 
                                      result.metadata.className || 
                                      'unknown';

                    results.push({
                        file: result.metadata.filePath,
                        content: conceptName,
                        score: result.similarity,
                        context:
                            context.substring(0, 200) +
                            (context.length > 200 ? "..." : ""),
                        metadata: {
                            concept: conceptName,
                            similarity: result.similarity,
                            type: "semantic",
                        },
                    });
                } catch (error) {
                    // Skip files that can't be read
                    continue;
                }
            }

            return {
                results,
                totalFound: results.length,
                searchType: "semantic",
            };
        } catch (error: unknown) {
            console.error("Semantic search error:", error);
            return {
                results: [],
                totalFound: 0,
                searchType: "semantic",
                error: error instanceof Error ? error.message : String(error),
            } as SearchResponse & { error: string };
        }
    }

    private async patternSearch(query: SearchQuery): Promise<SearchResponse> {
        try {
            // Search for patterns using the pattern engine
            const relevantPatterns =
                await this.patternEngine.findRelevantPatterns(
                    query.query,
                    undefined, // currentFile
                    undefined, // selectedCode
                );

            const results: SearchResult[] = [];

            for (const pattern of relevantPatterns) {
                // For each pattern, find files that use this pattern
                for (const example of pattern.examples) {
                    try {
                        // Search for files containing similar code patterns
                        const searchPattern = query.language
                            ? `**/*.{${this.getFileExtensionsForLanguage(query.language)}}`
                            : "**/*.{ts,tsx,js,jsx,py,rs,go,java}";

                        const files = await glob(searchPattern, {
                            ignore: [
                                "**/node_modules/**",
                                "**/.git/**",
                                "**/target/**",
                                "**/dist/**",
                            ],
                            absolute: true,
                        });

                        for (const file of files.slice(0, 10)) {
                            // Limit for performance
                            try {
                                const content = readFileSync(file, "utf-8");

                                // Simple pattern matching - look for similar code structures
                                if (
                                    this.matchesPattern(
                                        content,
                                        pattern.patternType,
                                        example.code,
                                    )
                                ) {
                                    const lines = content.split("\n");
                                    const contextStart = Math.max(0, 0);
                                    const contextEnd = Math.min(
                                        lines.length,
                                        5,
                                    );
                                    const context = lines
                                        .slice(contextStart, contextEnd)
                                        .join("\n");

                                    results.push({
                                        file: relative(process.cwd(), file),
                                        content:
                                            pattern.patternContent
                                                ?.description ||
                                            pattern.patternType,
                                        score: pattern.confidence,
                                        context:
                                            context.substring(0, 200) +
                                            (context.length > 200 ? "..." : ""),
                                        metadata: {
                                            patternType: pattern.patternType,
                                            confidence: pattern.confidence,
                                            frequency: pattern.frequency,
                                            type: "pattern",
                                        },
                                    });
                                }
                            } catch (error) {
                                // Skip files that can't be read
                                continue;
                            }
                        }
                    } catch (error) {
                        // Skip pattern examples that cause errors
                        continue;
                    }
                }
            }

            // Remove duplicates and sort by score
            const uniqueResults = results
                .filter(
                    (result, index, arr) =>
                        arr.findIndex((r) => r.file === result.file) === index,
                )
                .sort((a, b) => b.score - a.score);

            return {
                results: uniqueResults.slice(0, query.limit || 10),
                totalFound: uniqueResults.length,
                searchType: "pattern",
            };
        } catch (error: unknown) {
            console.error("Pattern search error:", error);
            return {
                results: [],
                totalFound: 0,
                searchType: "pattern",
                error: error instanceof Error ? error.message : String(error),
            } as SearchResponse & { error: string };
        }
    }

    private async textSearch(query: SearchQuery): Promise<SearchResponse> {
        try {
            const searchPattern = query.language
                ? `**/*.{${this.getFileExtensionsForLanguage(query.language)}}`
                : "**/*.{ts,tsx,js,jsx,py,rs,go,java,cpp,c,cs,php,rb,swift,kt}";

            const files = await glob(searchPattern, {
                ignore: [
                    "**/node_modules/**",
                    "**/.git/**",
                    "**/target/**",
                    "**/dist/**",
                    "**/build/**",
                ],
                absolute: true,
            });

            const results: SearchResult[] = [];
            const searchRegex = new RegExp(
                query.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                "gi",
            );

            for (const file of files) {
                try {
                    const content = readFileSync(file, "utf-8");
                    const lines = content.split("\n");

                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        const matches = [...line.matchAll(searchRegex)];

                        for (const match of matches) {
                            const lineNumber = i + 1;
                            const contextStart = Math.max(0, i - 2);
                            const contextEnd = Math.min(lines.length, i + 3);
                            const context = lines
                                .slice(contextStart, contextEnd)
                                .map((l, idx) => {
                                    const actualLineNum =
                                        contextStart + idx + 1;
                                    const marker =
                                        actualLineNum === lineNumber
                                            ? ">"
                                            : " ";
                                    return `${marker} ${actualLineNum}: ${l}`;
                                })
                                .join("\n");

                            // Calculate relevance score based on match context
                            const score = this.calculateTextMatchScore(
                                line,
                                match,
                                query.query,
                            );

                            results.push({
                                file: relative(process.cwd(), file),
                                content: line.trim(),
                                score,
                                context,
                                metadata: {
                                    lineNumber,
                                    matchStart: match.index,
                                    matchLength: match[0].length,
                                    type: "text",
                                },
                            });
                        }
                    }
                } catch (error) {
                    // Skip files that can't be read
                    continue;
                }
            }

            // Sort by relevance and limit results
            const sortedResults = results
                .sort((a, b) => b.score - a.score)
                .slice(0, query.limit || 20);

            return {
                results: sortedResults,
                totalFound: results.length,
                searchType: "text",
            };
        } catch (error: unknown) {
            console.error("Text search error:", error);
            return {
                results: [],
                totalFound: 0,
                searchType: "text",
                error: error instanceof Error ? error.message : String(error),
            } as SearchResponse & { error: string };
        }
    }

    private getFileExtensionsForLanguage(language: string): string {
        const extensions: Record<string, string> = {
            typescript: "ts,tsx",
            javascript: "js,jsx",
            python: "py",
            rust: "rs",
            go: "go",
            java: "java",
            cpp: "cpp,cc,cxx,hpp,h",
            c: "c,h",
            csharp: "cs",
            php: "php",
            ruby: "rb",
            swift: "swift",
            kotlin: "kt",
        };

        return extensions[language.toLowerCase()] || "ts,js,py,rs";
    }

    private matchesPattern(
        content: string,
        patternType: string,
        exampleCode: string,
    ): boolean {
        // Simple pattern matching based on pattern type
        switch (patternType) {
            case "camelCase_function_naming":
                return /function\s+[a-z][a-zA-Z]*/.test(content);
            case "PascalCase_class_naming":
                return /class\s+[A-Z][a-zA-Z]*/.test(content);
            case "testing":
                return /describe|it|test|expect|mock/.test(content);
            case "api_design":
                return /app\.(get|post|put|delete)|router\.(get|post|put|delete)/.test(
                    content,
                );
            case "dependency_injection":
                return /constructor\([^)]*private|@Injectable/.test(content);
            case "factory":
                return /Factory|create\w*\(/.test(content);
            case "singleton":
                return /getInstance|private\s+static\s+instance/.test(content);
            default:
                // Generic pattern matching - look for similar keywords
                const keywords = exampleCode.match(/\b\w{3,}\b/g) || [];
                return keywords.some((keyword) => content.includes(keyword));
        }
    }

    private calculateTextMatchScore(
        line: string,
        match: RegExpMatchArray,
        query: string,
    ): number {
        let score = 1.0;

        // Boost score for exact matches
        if (match[0].toLowerCase() === query.toLowerCase()) {
            score += 0.5;
        }

        // Boost score for matches at word boundaries
        if (match.index !== undefined) {
            const beforeChar = line[match.index - 1];
            const afterChar = line[match.index + match[0].length];

            if (!beforeChar || /\W/.test(beforeChar)) score += 0.2;
            if (!afterChar || /\W/.test(afterChar)) score += 0.2;
        }

        // Boost score for matches in function/class names
        if (/(function|class|interface|type)\s/.test(line)) {
            score += 0.3;
        }

        // Boost score for matches in comments
        if (/\/\/|#|<!--/.test(line)) {
            score += 0.1;
        }

        return score;
    }
}
