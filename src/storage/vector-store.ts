import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { Logger } from "../utils/logger.js";
import { config } from "../utils/config.js";

export interface VectorItemPayload {
    id: string;
    type: "concept" | "pattern";
    filePath?: string;
    conceptName?: string;
    conceptType?: string;
    patternType?: string;
}

export interface VectorItem {
    id: string;
    vector: number[];
    payload: VectorItemPayload;
}

export interface VectorSearchResult {
    id: string;
    score: number;
    payload: VectorItemPayload;
}

export interface VectorStore {
    isEnabled(): boolean;
    upsert(items: VectorItem[]): Promise<void>;
    search(vector: number[], limit?: number): Promise<VectorSearchResult[]>;
    clear(): Promise<void>;
}

class NullVectorStore implements VectorStore {
    isEnabled(): boolean {
        return false;
    }

    async upsert(): Promise<void> {
        return;
    }

    async search(): Promise<VectorSearchResult[]> {
        return [];
    }

    async clear(): Promise<void> {
        return;
    }
}

class SQLiteCosineVectorStore implements VectorStore {
    private db: Database.Database;
    private dimension: number;

    constructor(dbPath: string, dimension: number) {
        if (!existsSync(dirname(dbPath))) {
            mkdirSync(dirname(dbPath), { recursive: true });
        }
        this.db = new Database(dbPath);
        this.db.pragma("journal_mode = WAL");
        this.db.pragma("busy_timeout = 30000");
        this.dimension = dimension;
        this.initialize();
    }

    isEnabled(): boolean {
        return true;
    }

    private initialize(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS vector_cache (
                id TEXT PRIMARY KEY,
                vector TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        `);
    }

    async clear(): Promise<void> {
        try {
            this.db.prepare("DELETE FROM vector_cache").run();
        } catch (error) {
            Logger.warn("Failed to clear vector cache:", error);
        }
    }

    async upsert(items: VectorItem[]): Promise<void> {
        if (!items.length) return;

        const tx = this.db.transaction(() => {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO vector_cache (id, vector, payload)
                VALUES (?, ?, ?)
            `);

            items.forEach((item) => {
                stmt.run(
                    item.id,
                    JSON.stringify(item.vector),
                    JSON.stringify(item.payload),
                );
            });
        });

        try {
            tx();
        } catch (error) {
            Logger.warn("Failed to upsert vectors into SQLite cache:", error);
        }
    }

    async search(vector: number[], limit = 10): Promise<VectorSearchResult[]> {
        if (!vector.length) return [];
        const rows = this.db
            .prepare("SELECT id, vector, payload FROM vector_cache")
            .all() as Array<{ id: string; vector: string; payload: string }>;

        const target = this.normalize(vector);
        const scored: Array<{ id: string; score: number; payload: VectorItemPayload }> = [];

        for (const row of rows) {
            try {
                const vec = JSON.parse(row.vector) as number[];
                if (!Array.isArray(vec) || vec.length === 0) continue;
                const payload = JSON.parse(row.payload) as VectorItemPayload;
                const score = this.cosine(target, this.normalize(vec));
                scored.push({ id: row.id, score, payload });
            } catch (error) {
                Logger.warn("Failed to parse vector cache entry:", error);
            }
        }

        return scored
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map((item) => ({
                id: item.id,
                score: item.score,
                payload: item.payload,
            }));
    }

    private normalize(vec: number[]): number[] {
        const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
        if (!isFinite(norm) || norm === 0) return vec.map(() => 0);
        return vec.map((v) => v / norm);
    }

    private cosine(a: number[], b: number[]): number {
        const len = Math.min(a.length, b.length, this.dimension);
        let dot = 0;
        for (let i = 0; i < len; i++) {
            dot += (a[i] || 0) * (b[i] || 0);
        }
        return dot;
    }
}

class SQLiteVecVectorStore implements VectorStore {
    private db: Database.Database;
    private dimension: number;
    private cosineFallback: SQLiteCosineVectorStore;
    private available = false;

    private toSafeInteger(value: unknown): number | undefined {
        const num = typeof value === "bigint"
            ? Number(value)
            : Number.parseInt(String(value), 10);
        return Number.isSafeInteger(num) ? num : undefined;
    }

    constructor(vecDbPath: string, dimension: number, extensionPath: string) {
        const dir = dirname(vecDbPath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }

        this.db = new Database(vecDbPath, { fileMustExist: false });
        this.db.pragma("journal_mode = WAL");
        this.db.pragma("busy_timeout = 30000");
        this.dimension = dimension;
        this.cosineFallback = new SQLiteCosineVectorStore(vecDbPath, dimension);

        this.initialize(extensionPath);
        this.validateVecAvailability();
    }

    isEnabled(): boolean {
        return this.available;
    }

    private initialize(extensionPath: string): void {
        try {
            this.db.loadExtension(extensionPath);
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS vector_payloads (
                    rowid INTEGER PRIMARY KEY AUTOINCREMENT,
                    id TEXT UNIQUE NOT NULL,
                    payload TEXT NOT NULL
                );
                CREATE VIRTUAL TABLE IF NOT EXISTS vector_index USING vec0(
                    vector float[${this.dimension}]
                );
            `);
            this.available = true;
        } catch (error) {
            Logger.warn("SQLite vec initialization failed:", error);
            this.available = false;
        }
    }

    private validateVecAvailability(): void {
        if (!this.available) return;
        try {
            // sqlite-vec exposes vec_version(); use it to confirm the extension is active
            this.db.prepare("SELECT vec_version()").get();
        } catch (error) {
            Logger.warn("sqlite-vec validation failed; falling back to cosine store:", error);
            this.available = false;
        }
    }

    async clear(): Promise<void> {
        if (!this.available) {
            return this.cosineFallback.clear();
        }

        try {
            this.db.prepare("DELETE FROM vector_index").run();
            this.db.prepare("DELETE FROM vector_payloads").run();
        } catch (error) {
            Logger.warn("Failed to clear vec index; falling back:", error);
            await this.cosineFallback.clear();
            this.available = false;
            this.validateVecAvailability();
        }
    }

    async upsert(items: VectorItem[]): Promise<void> {
        if (!items.length) return;

        if (!this.available) {
            return this.cosineFallback.upsert(items);
        }

        const tx = this.db.transaction(() => {
            const selectPayload = this.db.prepare(
                `SELECT rowid FROM vector_payloads WHERE id = ?`,
            );
            const insertPayload = this.db.prepare(
                `INSERT INTO vector_payloads (id, payload) VALUES (?, ?)`,
            );
            const updatePayload = this.db.prepare(
                `UPDATE vector_payloads SET payload = ? WHERE id = ?`,
            );
            const deleteVector = this.db.prepare(
                `DELETE FROM vector_index WHERE rowid = ?`,
            );
            const vectorStmt = this.db.prepare(`
                INSERT OR REPLACE INTO vector_index (rowid, vector)
                VALUES (?, ?)
            `);

            for (const item of items) {
                const payloadJson = JSON.stringify(item.payload);
                const existing = selectPayload.get(item.id) as { rowid?: number | string } | undefined;
                let rowid: number | undefined;

                if (existing && existing.rowid !== undefined) {
                    updatePayload.run(payloadJson, item.id);
                    const raw = existing.rowid;
                    rowid = this.toSafeInteger(raw);
                } else {
                    const res = insertPayload.run(item.id, payloadJson);
                    const raw = res.lastInsertRowid;
                    rowid = this.toSafeInteger(raw);
                }

                if (!Number.isInteger(rowid)) {
                    Logger.warn(`Skipping vector upsert due to non-integer rowid for id=${item.id}`);
                    continue;
                }

                const buffer = Buffer.from(new Float32Array(item.vector).buffer);
                try {
                    const rowidInt = Number(rowid);
                    deleteVector.run(rowidInt); // ensure no PK conflict
                    vectorStmt.run(BigInt(rowidInt), buffer);
                } catch (error) {
                    Logger.warn(`Vec upsert failed for id=${item.id}, rowid=${rowid}; skipping this item`, error);
                }
            }
        });

        try {
            tx();
        } catch (error) {
            Logger.warn("Failed to upsert into vec index; falling back to cosine store:", error);
            this.available = false;
            this.validateVecAvailability();
            await this.cosineFallback.upsert(items);
        }
    }

    async search(vector: number[], limit = 10): Promise<VectorSearchResult[]> {
        if (!this.available) {
            return this.cosineFallback.search(vector, limit);
        }

        try {
            const buffer = Buffer.from(new Float32Array(vector).buffer);
            const rows = this.db
                .prepare(
                    `
                    SELECT p.id, p.payload, v.distance
                    FROM vector_index v
                    JOIN vector_payloads p ON p.rowid = v.rowid
                    WHERE v.vector MATCH topk_cosine(?, ?)
                    ORDER BY v.distance
                    LIMIT ?
                `,
                )
                .all(limit, buffer, limit) as Array<{ id: string; payload: string; distance: number }>;

            return rows.map((row) => ({
                id: row.id,
                score: 1 / (1 + Number(row.distance || 0)),
                payload: JSON.parse(row.payload) as VectorItemPayload,
            }));
        } catch (error) {
            Logger.warn("Vec search failed; falling back to cosine:", error);
            this.available = false;
            this.validateVecAvailability();
            return this.cosineFallback.search(vector, limit);
        }
    }
}

export function createVectorStore(projectPath: string): VectorStore {
    const backend = config.getVectorBackend();
    if (backend === "none") {
        return new NullVectorStore();
    }

    const dbPath = config.getDatabasePath(projectPath);
    const vecDbPath = join(dirname(dbPath), "in-memoria-vectors.db");
    const dimension = config.getEmbeddingDimension();

    if (backend === "vec") {
        const extPath = config.getVecExtensionPath();
        if (!extPath) {
            Logger.warn("IN_MEMORIA_SQLITE_VEC_PATH not set; falling back to cosine vector store.");
            return new SQLiteCosineVectorStore(dbPath, dimension);
        }

        try {
            return new SQLiteVecVectorStore(vecDbPath, dimension, extPath);
        } catch (error) {
            Logger.warn("Failed to initialize SQLite vec; falling back to cosine vector store:", error);
            return new SQLiteCosineVectorStore(dbPath, dimension);
        }
    }

    return new SQLiteCosineVectorStore(dbPath, dimension);
}
