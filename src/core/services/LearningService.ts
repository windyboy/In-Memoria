import { SemanticEngine } from "../../utils/semantic-engine.js";
import { PatternEngine } from "../../utils/pattern-engine.js";
import { SQLiteDatabase } from "../../storage/sqlite-db.js";
import { Logger } from "../../utils/logger.js";
import { PathValidator } from "../../utils/path-validator.js";
import { translateError } from "../errors.js";
import { VectorStore, VectorItem } from "../../storage/vector-store.js";
import { EmbeddingEngine } from "../../utils/embedding-engine.js";
import { EmbeddingConfigRepository } from "../../storage/repositories/embedding-config-repository.js";
import { ChunkRepository } from "../../storage/repositories/chunk-repository.js";

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
        private vectorStore: VectorStore,
        private embeddingEngine: EmbeddingEngine,
        private embeddingConfigRepo: EmbeddingConfigRepository,
        private chunkRepository: ChunkRepository,
    ) {}

    async learnFromCodebase(projectPath: string, options: LearningOptions = {}): Promise<LearningResult> {
        const start = Date.now();
        const errors: string[] = [];

        try {
            PathValidator.validateProjectPath(projectPath, "LearningService.learnFromCodebase");

            // Check if embedding configuration has changed (requires rebuild)
            const needsRebuild = this.embeddingConfigRepo.needsRebuild();
            if (needsRebuild && !options.force) {
                return {
                    success: false,
                    conceptsLearned: 0,
                    patternsDiscovered: 0,
                    featuresLearned: 0,
                    duration: Date.now() - start,
                    errors: ["Embedding configuration changed. Use --force to rebuild vector index."],
                };
            }

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

            let patterns: Array<{ patternId: string; patternType: string; patternContent: Record<string, any>; frequency: number; examples: Record<string, any>[]; confidence: number }> = [];
            if (!options.skipPatterns) {
                const extracted = await this.patternEngine.extractPatterns(projectPath);
                // Aggregate duplicates by type + description to avoid exploding pattern counts
                const patternMap = new Map<
                    string,
                    { patternType: string; description: string; frequency: number }
                >();

                for (const p of extracted) {
                    const key = `${p.type}::${p.description || ""}`;
                    const existing = patternMap.get(key);
                    if (existing) {
                        existing.frequency += p.frequency ?? 1;
                    } else {
                        patternMap.set(key, {
                            patternType: p.type,
                            description: p.description || "",
                            frequency: p.frequency ?? 1,
                        });
                    }
                }

                patterns = Array.from(patternMap.values()).map((pattern, index) => ({
                    patternId: `${pattern.patternType}-${index}`,
                    patternType: pattern.patternType,
                    patternContent: { description: pattern.description },
                    frequency: pattern.frequency,
                    examples: [],
                    confidence: 0.7,
                }));
            }

            // Atomic transaction: concepts + patterns + vectors + embedding config
            const tx = this.db['db'].transaction(() => {
                // 1. Store concepts
                this.db.replaceSemanticConcepts(storedConcepts);
                options.progressCallback?.(60, 100, "Concepts stored");

                // 2. Store patterns
                if (patterns.length > 0) {
                    this.db.replaceDeveloperPatterns(patterns);
                }
                options.progressCallback?.(75, 100, "Patterns stored");

                // 3. Update embedding configuration if needed
                if (needsRebuild || options.force) {
                    this.embeddingConfigRepo.upsertCurrent({});
                    options.progressCallback?.(80, 100, "Embedding config updated");
                }

                // 4. Generate and store chunks for vector indexing
                if (this.vectorStore.isEnabled() && (needsRebuild || options.force)) {
                    options.progressCallback?.(85, 100, "Generating chunks for vector indexing...");

                    // Generate chunks from concepts (simplified for now)
                    const chunks = storedConcepts.map(concept => ({
                        id: concept.id,
                        filePath: concept.filePath,
                        content: `${concept.conceptType}: ${concept.conceptName}`,
                        chunkType: concept.conceptType,
                        embeddingConfigId: 'current',
                        lineStart: concept.lineRange?.start || 0,
                        lineEnd: concept.lineRange?.end || 0,
                        metadata: {
                            confidence: concept.confidenceScore,
                            type: concept.conceptType,
                        },
                    }));

                    this.chunkRepository.upsert(chunks);
                }

                // 5. Update project metadata
                this.db.setProjectMetadata({
                    projectPath,
                    projectName: projectPath.split("/").pop() || projectPath,
                    languagePrimary: analysis.languages[0],
                    languagesDetected: analysis.languages,
                    frameworkDetected: analysis.frameworks,
                    lastFullScan: new Date(),
                });

                options.progressCallback?.(95, 100, "Metadata updated");
            });

            tx();

            // Generate embeddings and update vector index (outside transaction due to async)
            if (this.vectorStore.isEnabled() && (needsRebuild || options.force)) {
                options.progressCallback?.(90, 100, "Building vector index...");

                const chunks = this.chunkRepository.findByIds(storedConcepts.map(c => c.id));
                const vectorItems: VectorItem[] = [];
                for (const chunk of chunks) {
                    const embedding = await this.embeddingEngine.embed(chunk.content);
                    if (embedding.length > 0) {
                        vectorItems.push({
                            id: chunk.id,
                            vector: embedding,
                        });
                    }
                }

                await this.vectorStore.upsertVectors(vectorItems);
            }

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
