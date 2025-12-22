import { SQLiteDatabase } from "../../storage/sqlite-db.js";
import { PathValidator } from "../../utils/path-validator.js";
import { translateError } from "../errors.js";

export interface LearningStatus {
    projectPath: string;
    hasIntelligence: boolean;
    conceptsStored: number;
    patternsStored: number;
    lastLearningTime: string | null;
    recommendation: "ready" | "learning_recommended" | "learning_needed";
    message: string;
    isStale: boolean;
    filesInProject: number;
    codeFilesInProject: number;
}

export interface SystemMetrics {
    timestamp: string;
    version: string;
    memory: {
        rss: number;
        heapUsed: number;
        heapTotal: number;
        external: number;
        unit: string;
    };
    system: {
        nodeVersion: string;
        platform: string;
        arch: string;
        uptime: number;
    };
    database: {
        conceptCount: number;
        patternCount: number;
    };
}

export interface IntelligenceMetrics {
    concepts: {
        total: number;
    };
    patterns: {
        total: number;
    };
    quality: {
        averageConfidence?: number;
    };
    coverage: Record<string, any>;
    timestamps: {
        lastConceptLearned?: string;
        lastPatternLearned?: string;
    };
}

export interface HealthStatus {
    status: "healthy" | "degraded" | "unhealthy";
    lastChecked: string;
    components: {
        database: {
            status: "healthy" | "error";
            connected: boolean;
            dataCount?: {
                concepts: number;
                patterns: number;
            };
        };
        intelligence: {
            status: "ready" | "needs_learning" | "error";
            dataQuality: "good" | "empty" | "stale";
            conceptCount: number;
            patternCount: number;
        };
    };
    summary: string;
}

export interface DiagnosticService {
    getLearningStatus(projectPath: string): Promise<LearningStatus>;
    getSystemMetrics(): Promise<SystemMetrics>;
    getIntelligenceMetrics(projectPath: string): Promise<IntelligenceMetrics>;
    getHealthStatus(): Promise<HealthStatus>;
}

export class DiagnosticServiceImpl implements DiagnosticService {
    constructor(private database: SQLiteDatabase) {}

    async getLearningStatus(projectPath: string): Promise<LearningStatus> {
        try {
            PathValidator.validateProjectPath(projectPath, "DiagnosticService.getLearningStatus");

            const concepts = this.database.getSemanticConcepts();
            const patterns = this.database.getDeveloperPatterns();
            const metadata = this.database.getProjectMetadata(projectPath);

            const hasIntelligence = concepts.length > 0 || patterns.length > 0;
            const recommendation = hasIntelligence ? "ready" : "learning_needed";

            return {
                projectPath,
                hasIntelligence,
                conceptsStored: concepts.length,
                patternsStored: patterns.length,
                lastLearningTime: metadata?.lastFullScan?.toISOString() ?? null,
                recommendation,
                message: hasIntelligence
                    ? "Intelligence available for this project"
                    : "Run `in-memoria learn` to build intelligence",
                isStale: false,
                filesInProject: concepts.length,
                codeFilesInProject: concepts.length,
            };
        } catch (error) {
            throw translateError(error, "Learning status");
        }
    }

    async getSystemMetrics(): Promise<SystemMetrics> {
        const memoryUsage = process.memoryUsage();
        const concepts = this.database.getSemanticConcepts().length;
        const patterns = this.database.getDeveloperPatterns().length;

        return {
            timestamp: new Date().toISOString(),
            version: "lightweight",
            memory: {
                rss: memoryUsage.rss,
                heapUsed: memoryUsage.heapUsed,
                heapTotal: memoryUsage.heapTotal,
                external: memoryUsage.external,
                unit: "bytes",
            },
            system: {
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                uptime: process.uptime(),
            },
            database: {
                conceptCount: concepts,
                patternCount: patterns,
            },
        };
    }

    async getIntelligenceMetrics(projectPath: string): Promise<IntelligenceMetrics> {
        try {
            PathValidator.validateProjectPath(projectPath, "DiagnosticService.getIntelligenceMetrics");

            const concepts = this.database.getSemanticConcepts();
            const patterns = this.database.getDeveloperPatterns();

            const averageConfidence =
                concepts.length > 0
                    ? concepts.reduce((sum, concept) => sum + concept.confidenceScore, 0) / concepts.length
                    : undefined;

            return {
                concepts: { total: concepts.length },
                patterns: { total: patterns.length },
                quality: { averageConfidence },
                coverage: {},
                timestamps: {
                    lastConceptLearned: concepts[0]?.updatedAt?.toISOString(),
                    lastPatternLearned: patterns[0]?.lastSeen?.toISOString(),
                },
            };
        } catch (error) {
            throw translateError(error, "Intelligence metrics");
        }
    }

    async getHealthStatus(): Promise<HealthStatus> {
        try {
            const concepts = this.database.getSemanticConcepts().length;
            const patterns = this.database.getDeveloperPatterns().length;

            const hasData = concepts > 0 || patterns > 0;

            return {
                status: "healthy",
                lastChecked: new Date().toISOString(),
            components: {
                database: {
                    status: "healthy",
                    connected: true,
                    dataCount: { concepts, patterns },
                },
                intelligence: {
                    status: hasData ? "ready" : "needs_learning",
                    dataQuality: hasData ? "good" : "empty",
                    conceptCount: concepts,
                    patternCount: patterns,
                    },
                },
                summary: hasData ? "Operational" : "Learning required",
            };
        } catch (error) {
            throw translateError(error, "Health status");
        }
    }
}
