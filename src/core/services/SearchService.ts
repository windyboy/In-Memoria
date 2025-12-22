import { SQLiteDatabase } from "../../storage/sqlite-db.js";
import { translateError, ValidationError } from "../errors.js";

export interface SearchOptions {
    language?: string;
    limit?: number;
}

export interface SemanticSearchResult {
    file: string;
    content: string;
    score: number;
    context: string;
    concept: string;
    similarity: number;
    metadata: Record<string, any>;
}

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

export interface SearchService {
    searchSemantic(query: string, options?: SearchOptions): Promise<SemanticSearchResult[]>;
    searchPatterns(query: string, options?: SearchOptions): Promise<PatternSearchResult[]>;
    searchText(query: string, options?: SearchOptions): Promise<TextSearchResult[]>;
}

export class SearchServiceImpl implements SearchService {
    constructor(private database: SQLiteDatabase) {}

    async searchSemantic(query: string, options: SearchOptions = {}): Promise<SemanticSearchResult[]> {
        try {
            this.validateQuery(query, "SearchService.searchSemantic");

            const limit = options.limit ?? 10;
            const concepts = this.database
                .getSemanticConcepts()
                .filter((concept) => concept.conceptName.toLowerCase().includes(query.toLowerCase()))
                .slice(0, limit);

            return concepts.map((concept) => ({
                file: concept.filePath,
                content: concept.conceptName,
                score: concept.confidenceScore,
                context: `${concept.conceptType} ${concept.conceptName}`,
                concept: concept.conceptName,
                similarity: concept.confidenceScore,
                metadata: {
                    type: concept.conceptType,
                    searchType: "semantic",
                },
            }));
        } catch (error) {
            throw translateError(error, "Semantic search");
        }
    }

    async searchPatterns(query: string, options: SearchOptions = {}): Promise<PatternSearchResult[]> {
        try {
            this.validateQuery(query, "SearchService.searchPatterns");

            const limit = options.limit ?? 10;
            const patterns = this.database
                .getDeveloperPatterns()
                .filter((pattern) =>
                    pattern.patternType.toLowerCase().includes(query.toLowerCase()) ||
                    JSON.stringify(pattern.patternContent).toLowerCase().includes(query.toLowerCase()),
                )
                .slice(0, limit);

            return patterns.map((pattern) => ({
                file: "pattern",
                content: pattern.patternType,
                score: pattern.frequency,
                context: pattern.patternContent.description || pattern.patternType,
                patternType: pattern.patternType,
                confidence: 0.7,
                frequency: pattern.frequency,
                metadata: {
                    searchType: "pattern",
                },
            }));
        } catch (error) {
            throw translateError(error, "Pattern search");
        }
    }

    async searchText(query: string, options: SearchOptions = {}): Promise<TextSearchResult[]> {
        try {
            this.validateQuery(query, "SearchService.searchText");

            // We do not store raw file contents in the database; reuse semantic hits as basic text hints
            const limit = options.limit ?? 20;
            const concepts = this.database
                .getSemanticConcepts()
                .filter((concept) => concept.filePath.toLowerCase().includes(query.toLowerCase()))
                .slice(0, limit);

            return concepts.map((concept) => ({
                file: concept.filePath || "unknown",
                content: concept.conceptName,
                score: concept.confidenceScore,
                context: concept.conceptType,
                lineNumber: concept.lineRange.start || 1,
                matchStart: 0,
                matchLength: query.length,
                metadata: {
                    searchType: "text",
                },
            }));
        } catch (error) {
            throw translateError(error, "Text search");
        }
    }

    private validateQuery(query: string, context: string): void {
        if (!query || typeof query !== "string") {
            throw new ValidationError(`Query must be a non-empty string (${context})`);
        }

        if (query.trim().length === 0) {
            throw new ValidationError(`Query cannot be empty or whitespace only (${context})`);
        }
    }
}
