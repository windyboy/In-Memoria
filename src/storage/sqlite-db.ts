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

    close(): void {
        try {
            this.db.close();
        } catch (error) {
            Logger.warn("Failed to close SQLite database cleanly:", error);
        }
    }
}
