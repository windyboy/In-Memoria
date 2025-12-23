import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "fs";
import { dirname } from "path";
import { Logger } from "../utils/logger.js";

export interface SemanticConcept {
    id: string;
    conceptName: string;
    conceptType: string;
    confidenceScore: number;
    filePath: string;
    lineRange: { start: number; end: number };
    createdAt: Date;
    updatedAt: Date;
}

export interface DeveloperPattern {
    patternId: string;
    patternType: string;
    patternContent: Record<string, any>;
    frequency: number;
    examples: Record<string, any>[];
    confidence: number;
    createdAt: Date;
    lastSeen: Date;
}

export interface ProjectMetadata {
    projectPath: string;
    projectName: string;
    languagePrimary?: string;
    languagesDetected?: string[];
    frameworkDetected?: string[];
    lastFullScan?: Date;
}

export interface EmbeddingConfig {
    id: string;
    model: string;
    dimension: number;
    normalize: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface Chunk {
    id: string;
    filePath: string;
    content: string;
    chunkType: string;
    embeddingConfigId: string;
    lineStart: number;
    lineEnd: number;
    metadata: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

export class SQLiteDatabase {
    private db: Database.Database;

    constructor(dbPath: string = ":memory:") {
        if (dbPath !== ":memory:") {
            const dir = dirname(dbPath);
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }
        }

        this.db = new Database(dbPath);
        this.db.pragma("journal_mode = WAL");
        this.db.pragma("busy_timeout = 30000");
        this.initialize();
    }

    private initialize(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS semantic_concepts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                confidence REAL NOT NULL,
                file_path TEXT,
                line_start INTEGER DEFAULT 0,
                line_end INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS developer_patterns (
                id TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                description TEXT,
                frequency INTEGER DEFAULT 1,
                examples TEXT DEFAULT '[]',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS project_metadata (
                project_path TEXT PRIMARY KEY,
                project_name TEXT,
                language_primary TEXT,
                languages_detected TEXT,
                framework_detected TEXT,
                last_full_scan TEXT
            );

            CREATE TABLE IF NOT EXISTS embedding_configs (
                id TEXT PRIMARY KEY DEFAULT 'current',
                model TEXT NOT NULL,
                dimension INTEGER NOT NULL,
                normalize BOOLEAN DEFAULT TRUE,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS chunks (
                id TEXT PRIMARY KEY,
                file_path TEXT NOT NULL,
                content TEXT NOT NULL,
                chunk_type TEXT NOT NULL,
                embedding_config_id TEXT DEFAULT 'current',
                line_start INTEGER DEFAULT 0,
                line_end INTEGER DEFAULT 0,
                metadata TEXT DEFAULT '{}',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS chunk_vectors (
                chunk_id TEXT PRIMARY KEY,
                embedding BLOB NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_chunks_file_path ON chunks(file_path);
            CREATE INDEX IF NOT EXISTS idx_chunks_type ON chunks(chunk_type);
            CREATE INDEX IF NOT EXISTS idx_chunks_embedding_config ON chunks(embedding_config_id);
        `);
    }

    replaceSemanticConcepts(concepts: Array<Omit<SemanticConcept, "createdAt" | "updatedAt">>): void {
        const tx = this.db.transaction(() => {
            this.db.prepare("DELETE FROM semantic_concepts").run();
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO semantic_concepts (
                    id, name, type, confidence, file_path, line_start, line_end, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `);

            concepts.forEach((concept) => {
                stmt.run(
                    concept.id,
                    concept.conceptName,
                    concept.conceptType,
                    concept.confidenceScore,
                    concept.filePath,
                    concept.lineRange.start,
                    concept.lineRange.end,
                );
            });
        });

        tx();
    }

    getSemanticConcepts(): SemanticConcept[] {
        const rows = this.db
            .prepare("SELECT * FROM semantic_concepts ORDER BY updated_at DESC")
            .all() as Array<Record<string, any>>;

        return rows.map((row) => ({
            id: String(row.id),
            conceptName: String(row.name),
            conceptType: String(row.type),
            confidenceScore: Number(row.confidence),
            filePath: String(row.file_path || ""),
            lineRange: { start: Number(row.line_start || 0), end: Number(row.line_end || 0) },
            createdAt: new Date(String(row.created_at)),
            updatedAt: new Date(String(row.updated_at)),
        }));
    }

    replaceDeveloperPatterns(patterns: Array<Omit<DeveloperPattern, "createdAt" | "lastSeen">>): void {
        const tx = this.db.transaction(() => {
            this.db.prepare("DELETE FROM developer_patterns").run();
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO developer_patterns (
                    id, category, description, frequency, examples, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `);

            patterns.forEach((pattern) => {
                stmt.run(
                    pattern.patternId,
                    pattern.patternType,
                    JSON.stringify(pattern.patternContent),
                    pattern.frequency,
                    JSON.stringify(pattern.examples || []),
                );
            });
        });

        tx();
    }

    getDeveloperPatterns(patternType?: string, limit?: number): DeveloperPattern[] {
        let query = "SELECT * FROM developer_patterns";
        const params: unknown[] = [];

        if (patternType) {
            query += " WHERE category = ?";
            params.push(patternType);
        }

        query += " ORDER BY frequency DESC";
        if (limit && limit > 0) {
            query += " LIMIT ?";
            params.push(limit);
        }

        const rows = this.db.prepare(query).all(...params) as Array<Record<string, any>>;

        return rows.map((row) => ({
            patternId: String(row.id),
            patternType: String(row.category),
            patternContent: JSON.parse(String(row.description || "{}")),
            frequency: Number(row.frequency),
            examples: JSON.parse(String(row.examples || "[]")),
            confidence: 0.7,
            createdAt: new Date(String(row.created_at)),
            lastSeen: new Date(String(row.updated_at)),
        }));
    }

    setProjectMetadata(metadata: ProjectMetadata): void {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO project_metadata (
                project_path,
                project_name,
                language_primary,
                languages_detected,
                framework_detected,
                last_full_scan
            ) VALUES (?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            metadata.projectPath,
            metadata.projectName,
            metadata.languagePrimary || null,
            metadata.languagesDetected ? JSON.stringify(metadata.languagesDetected) : null,
            metadata.frameworkDetected ? JSON.stringify(metadata.frameworkDetected) : null,
            metadata.lastFullScan ? metadata.lastFullScan.toISOString() : null,
        );
    }

    getProjectMetadata(projectPath: string): ProjectMetadata | undefined {
        const row = this.db
            .prepare("SELECT * FROM project_metadata WHERE project_path = ?")
            .get(projectPath) as Record<string, any> | undefined;

        if (!row) return undefined;

        return {
            projectPath: String(row.project_path),
            projectName: String(row.project_name || ""),
            languagePrimary: row.language_primary ? String(row.language_primary) : undefined,
            languagesDetected: row.languages_detected ? JSON.parse(String(row.languages_detected)) : undefined,
            frameworkDetected: row.framework_detected ? JSON.parse(String(row.framework_detected)) : undefined,
            lastFullScan: row.last_full_scan ? new Date(String(row.last_full_scan)) : undefined,
        };
    }

    // EmbeddingConfigRepository methods
    upsertEmbeddingConfig(config: Omit<EmbeddingConfig, "createdAt" | "updatedAt">): void {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO embedding_configs (
                id, model, dimension, normalize, created_at, updated_at
            ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);

        stmt.run(
            config.id,
            config.model,
            config.dimension,
            config.normalize ? 1 : 0,
        );
    }

    getEmbeddingConfig(id: string = "current"): EmbeddingConfig | undefined {
        const row = this.db
            .prepare("SELECT * FROM embedding_configs WHERE id = ?")
            .get(id) as Record<string, any> | undefined;

        if (!row) return undefined;

        return {
            id: String(row.id),
            model: String(row.model),
            dimension: Number(row.dimension),
            normalize: Boolean(row.normalize),
            createdAt: new Date(String(row.created_at)),
            updatedAt: new Date(String(row.updated_at)),
        };
    }

    // ChunkRepository methods
    upsertChunks(chunks: Array<Omit<Chunk, "createdAt" | "updatedAt">>): void {
        const tx = this.db.transaction(() => {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO chunks (
                    id, file_path, content, chunk_type, embedding_config_id,
                    line_start, line_end, metadata, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `);

            chunks.forEach((chunk) => {
                stmt.run(
                    chunk.id,
                    chunk.filePath,
                    chunk.content,
                    chunk.chunkType,
                    chunk.embeddingConfigId,
                    chunk.lineStart,
                    chunk.lineEnd,
                    JSON.stringify(chunk.metadata || {}),
                );
            });
        });

        tx();
    }

    findChunksByIds(ids: string[]): Chunk[] {
        if (ids.length === 0) return [];

        const placeholders = ids.map(() => "?").join(",");
        const rows = this.db
            .prepare(`SELECT * FROM chunks WHERE id IN (${placeholders})`)
            .all(...ids) as Array<Record<string, any>>;

        return rows.map((row) => ({
            id: String(row.id),
            filePath: String(row.file_path),
            content: String(row.content),
            chunkType: String(row.chunk_type),
            embeddingConfigId: String(row.embedding_config_id),
            lineStart: Number(row.line_start || 0),
            lineEnd: Number(row.line_end || 0),
            metadata: JSON.parse(String(row.metadata || "{}")),
            createdAt: new Date(String(row.created_at)),
            updatedAt: new Date(String(row.updated_at)),
        }));
    }

    deleteChunksByFile(filePath: string): void {
        this.db.prepare("DELETE FROM chunks WHERE file_path = ?").run(filePath);
    }

    // VectorIndexRepository methods (basic operations on chunk_vectors table)
    upsertChunkVectors(vectors: Array<{ chunkId: string; embedding: number[] }>): void {
        const tx = this.db.transaction(() => {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO chunk_vectors (chunk_id, embedding)
                VALUES (?, ?)
            `);

            vectors.forEach((vector) => {
                const buffer = Buffer.from(new Float32Array(vector.embedding).buffer);
                stmt.run(vector.chunkId, buffer);
            });
        });

        tx();
    }

    deleteChunkVectorsByIds(ids: string[]): void {
        if (ids.length === 0) return;

        const placeholders = ids.map(() => "?").join(",");
        this.db.prepare(`DELETE FROM chunk_vectors WHERE chunk_id IN (${placeholders})`).run(...ids);
    }

    getChunkVectorCount(): number {
        const row = this.db.prepare("SELECT COUNT(*) as count FROM chunk_vectors").get() as { count: number };
        return row.count;
    }

    close(): void {
        try {
            this.db.close();
        } catch (error) {
            Logger.warn("Failed to close SQLite database cleanly:", error);
        }
    }
}
