import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { Logger } from "../utils/logger.js";
import { config } from "../utils/config.js";

export interface VectorItem {
    id: string;        // chunk_id
    vector: number[];  // embedding 向量
}

export interface VectorStore {
    // 向量操作（仅 embedding）
    upsertVectors(items: VectorItem[]): Promise<void>;
    searchVectors(vector: number[], limit: number): Promise<string[]>; // 返回 chunk_ids
    deleteByIds(ids: string[]): Promise<void>;
    clear(): Promise<void>;

    // 索引状态
    isEnabled(): boolean;
    getVectorCount(): number;
    needsRebuild(): boolean; // 检查 embedding 版本是否变化
}

class NullVectorStore implements VectorStore {
    isEnabled(): boolean {
        return false;
    }

    async upsertVectors(): Promise<void> {
        return;
    }

    async searchVectors(): Promise<string[]> {
        return [];
    }

    async deleteByIds(): Promise<void> {
        return;
    }

    async clear(): Promise<void> {
        return;
    }

    getVectorCount(): number {
        return 0;
    }

    needsRebuild(): boolean {
        return false;
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

    async upsertVectors(items: VectorItem[]): Promise<void> {
        if (!items.length) return;

        const tx = this.db.transaction(() => {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO vector_cache (id, vector)
                VALUES (?, ?)
            `);

            items.forEach((item) => {
                stmt.run(
                    item.id,
                    JSON.stringify(item.vector),
                );
            });
        });

        try {
            tx();
        } catch (error) {
            Logger.warn("Failed to upsert vectors into SQLite cache:", error);
        }
    }

    async searchVectors(vector: number[], limit = 10): Promise<string[]> {
        if (!vector.length) return [];
        const rows = this.db
            .prepare("SELECT id, vector FROM vector_cache")
            .all() as Array<{ id: string; vector: string }>;

        const target = this.normalize(vector);
        const scored: Array<{ id: string; score: number }> = [];

        for (const row of rows) {
            try {
                const vec = JSON.parse(row.vector) as number[];
                if (!Array.isArray(vec) || vec.length === 0) continue;
                const score = this.cosine(target, this.normalize(vec));
                scored.push({ id: row.id, score });
            } catch (error) {
                Logger.warn("Failed to parse vector cache entry:", error);
            }
        }

        return scored
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map((item) => item.id);
    }

    async deleteByIds(ids: string[]): Promise<void> {
        if (!ids.length) return;

        const placeholders = ids.map(() => "?").join(",");
        try {
            this.db.prepare(`DELETE FROM vector_cache WHERE id IN (${placeholders})`).run(...ids);
        } catch (error) {
            Logger.warn("Failed to delete vectors from cache:", error);
        }
    }

    getVectorCount(): number {
        try {
            const row = this.db.prepare("SELECT COUNT(*) as count FROM vector_cache").get() as { count: number };
            return row.count;
        } catch {
            return 0;
        }
    }

    needsRebuild(): boolean {
        // Cosine store doesn't track embedding versions, always assume rebuild needed
        return true;
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
                CREATE TABLE IF NOT EXISTS chunk_vectors (
                    chunk_id TEXT PRIMARY KEY,
                    embedding BLOB NOT NULL
                );
                CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vectors_vss
                USING vss0(embedding(${this.dimension}));
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
            // sqlite-vss exposes vss_version(); use it to confirm the extension is active
            this.db.prepare("SELECT vss_version()").get();
        } catch (error) {
            Logger.warn("sqlite-vss validation failed; falling back to cosine store:", error);
            this.available = false;
        }
    }

    async clear(): Promise<void> {
        if (!this.available) {
            return this.cosineFallback.clear();
        }

        try {
            this.db.prepare("DELETE FROM chunk_vectors_vss").run();
            this.db.prepare("DELETE FROM chunk_vectors").run();
        } catch (error) {
            Logger.warn("Failed to clear vec index; falling back:", error);
            await this.cosineFallback.clear();
            this.available = false;
            this.validateVecAvailability();
        }
    }

    async upsertVectors(items: VectorItem[]): Promise<void> {
        if (!items.length) return;

        if (!this.available) {
            return this.cosineFallback.upsertVectors(items);
        }

        const tx = this.db.transaction(() => {
            const vectorStmt = this.db.prepare(`
                INSERT OR REPLACE INTO chunk_vectors (chunk_id, embedding)
                VALUES (?, ?)
            `);

            for (const item of items) {
                const buffer = Buffer.from(new Float32Array(item.vector).buffer);
                vectorStmt.run(item.id, buffer);

                // Insert into vss table
                try {
                    const rowid = this.db.prepare(
                        "SELECT rowid FROM chunk_vectors WHERE chunk_id = ?"
                    ).get(item.id) as { rowid: number } | undefined;

                    if (rowid) {
                        this.db.prepare(`
                            INSERT OR REPLACE INTO chunk_vectors_vss (rowid, embedding)
                            VALUES (?, ?)
                        `).run(rowid.rowid, buffer);
                    }
                } catch (vssError) {
                    Logger.warn(`Failed to insert into vss table for chunk ${item.id}:`, vssError);
                }
            }
        });

        try {
            tx();
        } catch (error) {
            Logger.warn("Failed to upsert into vec index; falling back to cosine store:", error);
            this.available = false;
            this.validateVecAvailability();
            await this.cosineFallback.upsertVectors(items);
        }
    }

    async searchVectors(vector: number[], limit = 10): Promise<string[]> {
        if (!this.available) {
            return this.cosineFallback.searchVectors(vector, limit);
        }

        try {
            const buffer = Buffer.from(new Float32Array(vector).buffer);
            const rows = this.db
                .prepare(`
                    SELECT cv.chunk_id, vss.distance
                    FROM chunk_vectors_vss vss
                    JOIN chunk_vectors cv ON cv.rowid = vss.rowid
                    WHERE vss.vector MATCH topk_cosine(?, ?)
                    ORDER BY vss.distance
                    LIMIT ?
                `)
                .all(buffer, limit, limit) as Array<{ chunk_id: string; distance: number }>;

            return rows.map((row) => row.chunk_id);
        } catch (error) {
            Logger.warn("Vec search failed; falling back to cosine:", error);
            this.available = false;
            this.validateVecAvailability();
            return this.cosineFallback.searchVectors(vector, limit);
        }
    }

    async deleteByIds(ids: string[]): Promise<void> {
        if (!this.available) {
            return this.cosineFallback.deleteByIds(ids);
        }

        if (!ids.length) return;

        const tx = this.db.transaction(() => {
            // Get rowids first
            const placeholders = ids.map(() => "?").join(",");
            const rowids = this.db
                .prepare(`SELECT rowid FROM chunk_vectors WHERE chunk_id IN (${placeholders})`)
                .all(...ids) as Array<{ rowid: number }>;

            // Delete from vss table
            for (const { rowid } of rowids) {
                try {
                    this.db.prepare("DELETE FROM chunk_vectors_vss WHERE rowid = ?").run(rowid);
                } catch (error) {
                    Logger.warn(`Failed to delete from vss for rowid ${rowid}:`, error);
                }
            }

            // Delete from chunk_vectors
            this.db.prepare(`DELETE FROM chunk_vectors WHERE chunk_id IN (${placeholders})`).run(...ids);
        });

        try {
            tx();
        } catch (error) {
            Logger.warn("Failed to delete from vec index; falling back:", error);
            this.available = false;
            this.validateVecAvailability();
            await this.cosineFallback.deleteByIds(ids);
        }
    }

    getVectorCount(): number {
        if (!this.available) {
            return this.cosineFallback.getVectorCount();
        }

        try {
            const row = this.db.prepare("SELECT COUNT(*) as count FROM chunk_vectors").get() as { count: number };
            return row.count;
        } catch {
            return 0;
        }
    }

    needsRebuild(): boolean {
        // For now, always return true. In future phases, this will check embedding config versions
        return true;
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
