import { SemanticEngine } from "../../utils/semantic-engine.js";
import { PatternEngine } from "../../utils/pattern-engine.js";
import { SQLiteDatabase } from "../../storage/sqlite-db.js";
import { Logger } from "../../utils/logger.js";
import { PathValidator } from "../../utils/path-validator.js";
import { translateError } from "../errors.js";

export interface LearningOptions {
    force?: boolean;
    progressCallback?: (current: number, total: number, message: string) => void;
    skipPatterns?: boolean;
}

export interface LearningResult {
    success: boolean;
    conceptsLearned: number;
    patternsDiscovered: number;
    featuresLearned: number;
    duration: number;
    errors: string[];
}

export interface LearningService {
    learnFromCodebase(projectPath: string, options?: LearningOptions): Promise<LearningResult>;
}

export class LearningServiceImpl implements LearningService {
    constructor(
        private semanticEngine: SemanticEngine,
        private patternEngine: PatternEngine,
        private db: SQLiteDatabase,
    ) {}

    async learnFromCodebase(projectPath: string, options: LearningOptions = {}): Promise<LearningResult> {
        const start = Date.now();
        const errors: string[] = [];

        try {
            PathValidator.validateProjectPath(projectPath, "LearningService.learnFromCodebase");

            if (!options.force) {
                const existing = this.db.getProjectMetadata(projectPath);
                if (existing?.lastFullScan) {
                    const concepts = this.db.getSemanticConcepts().length;
                    const patterns = this.db.getDeveloperPatterns().length;
                    return {
                        success: true,
                        conceptsLearned: concepts,
                        patternsDiscovered: patterns,
                        featuresLearned: 0,
                        duration: Date.now() - start,
                        errors: ["Existing intelligence detected; rerun with --force to refresh"],
                    };
                }
            }

            const analysis = await this.semanticEngine.analyzeCodebase(projectPath);
            options.progressCallback?.(10, 100, "Scanning codebase...");

            const concepts = await this.semanticEngine.extractSemanticConcepts(
                projectPath,
                options.progressCallback,
            );
            const storedConcepts = concepts.map((concept) => ({
                id: concept.id,
                conceptName: concept.name,
                conceptType: concept.type,
                confidenceScore: concept.confidence,
                filePath: concept.filePath,
                lineRange: concept.lineRange,
            }));
            this.db.replaceSemanticConcepts(storedConcepts);
            options.progressCallback?.(60, 100, "Concepts stored");

            let patterns: Array<{ patternId: string; patternType: string; patternContent: Record<string, any>; frequency: number; examples: Record<string, any>[]; confidence: number }> = [];
            if (!options.skipPatterns) {
                const extracted = await this.patternEngine.extractPatterns(projectPath);
                patterns = extracted.map((pattern, index) => ({
                    patternId: `${pattern.type}-${index}`,
                    patternType: pattern.type,
                    patternContent: { description: pattern.description },
                    frequency: pattern.frequency,
                    examples: [],
                    confidence: 0.7,
                }));
                this.db.replaceDeveloperPatterns(patterns);
            }
            options.progressCallback?.(85, 100, "Patterns stored");

            this.db.setProjectMetadata({
                projectPath,
                projectName: projectPath.split("/").pop() || projectPath,
                languagePrimary: analysis.languages[0],
                languagesDetected: analysis.languages,
                frameworkDetected: analysis.frameworks,
                lastFullScan: new Date(),
            });

            return {
                success: true,
                conceptsLearned: storedConcepts.length,
                patternsDiscovered: patterns.length,
                featuresLearned: 0,
                duration: Date.now() - start,
                errors,
            };
        } catch (error) {
            const translated = translateError(error, "Learning process");
            errors.push(translated.message);
            Logger.error("Learning process failed:", translated);

            return {
                success: false,
                conceptsLearned: 0,
                patternsDiscovered: 0,
                featuresLearned: 0,
                duration: Date.now() - start,
                errors,
            };
        }
    }
}
