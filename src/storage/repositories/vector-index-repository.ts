import Database from "better-sqlite3";
import { dirname, join } from "path";
import { existsSync, mkdirSync } from "fs";
import { Logger } from "../../utils/logger.js";

/**
 * VectorSearchResult - Result from vector search
 */
export interface VectorSearchResult {
    chunkId: string;
    distance: number;
}

/**
 * VectorIndexRepository - Data access layer for vector index (sqlite-vss)
 * Handles ANN search operations
 */
export class VectorIndexRepository {
    private db: Database.Database | null = null;
    private vssAvailable = false;
    private dimension: number;

    constructor(
        private projectPath: string,
        dimension: number = 384,
        private extensionPath?: string,
    ) {
        this.dimension = dimension;
        this.initialize();
    }

    /**
     * Initialize the vector database with sqlite-vss
     */
    private initialize(): void {
        const vecDbPath = join(this.projectPath, "in-memoria-vectors.db");
        const vecDir = dirname(vecDbPath);

        if (!existsSync(vecDir)) {
            mkdirSync(vecDir, { recursive: true });
        }

        try {
            this.db = new Database(vecDbPath);
            this.db.pragma("journal_mode = WAL");
            this.db.pragma("busy_timeout = 30000");

            // Try to load sqlite-vss extension
            if (this.extensionPath) {
                this.db.loadExtension(this.extensionPath);
            }

            // Create vss virtual table
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS chunk_vectors (
                    chunk_id TEXT PRIMARY KEY,
                    embedding BLOB NOT NULL
                );

                CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vectors_vss
                USING vss0(embedding(${this.dimension}));
            `);

            this.vssAvailable = true;
            Logger.info("SQLite-vss vector index initialized successfully");
        } catch (error) {
            Logger.warn("Failed to initialize sqlite-vss, falling back to basic mode:", error);
            this.vssAvailable = false;
        }
    }

    /**
     * Check if vss is available
     */
    isEnabled(): boolean {
        return this.vssAvailable;
    }

    /**
     * Upsert vectors for chunks
     */
    async upsertVectors(items: Array<{ chunkId: string; embedding: number[] }>): Promise<void> {
        if (!this.db || !this.vssAvailable) {
            Logger.warn("Vector index not available, skipping upsert");
            return;
        }

        const tx = this.db.transaction(() => {
            const vectorStmt = this.db!.prepare(`
                INSERT OR REPLACE INTO chunk_vectors (chunk_id, embedding)
                VALUES (?, ?)
            `);

            for (const item of items) {
                const buffer = Buffer.from(new Float32Array(item.embedding).buffer);
                vectorStmt.run(item.chunkId, buffer);

                // Insert into vss table
                try {
                    const rowid = this.db!.prepare(
                        "SELECT rowid FROM chunk_vectors WHERE chunk_id = ?"
                    ).get(item.chunkId) as { rowid: number } | undefined;

                    if (rowid) {
                        this.db!.prepare(`
                            INSERT OR REPLACE INTO chunk_vectors_vss (rowid, embedding)
                            VALUES (?, ?)
                        `).run(rowid.rowid, buffer);
                    }
                } catch (vssError) {
                    Logger.warn(`Failed to insert into vss table for chunk ${item.chunkId}:`, vssError);
                }
            }
        });

        tx();
    }

    /**
     * Search for similar vectors and return chunk IDs with distances
     */
    async search(vector: number[], limit: number = 10): Promise<VectorSearchResult[]> {
        if (!this.db || !this.vssAvailable) {
            return [];
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

            return rows.map((row) => ({
                chunkId: row.chunk_id,
                distance: Number(row.distance || 0),
            }));
        } catch (error) {
            Logger.warn("Vector search failed:", error);
            return [];
        }
    }

    /**
     * Delete vectors by chunk IDs
     */
    async deleteByIds(ids: string[]): Promise<void> {
        if (!this.db || ids.length === 0) return;

        const tx = this.db.transaction(() => {
            // Get rowids first
            const placeholders = ids.map(() => "?").join(",");
            const rowids = this.db!
                .prepare(`SELECT rowid FROM chunk_vectors WHERE chunk_id IN (${placeholders})`)
                .all(...ids) as Array<{ rowid: number }>;

            // Delete from vss table
            for (const { rowid } of rowids) {
                try {
                    this.db!.prepare("DELETE FROM chunk_vectors_vss WHERE rowid = ?").run(rowid);
                } catch (error) {
                    Logger.warn(`Failed to delete from vss for rowid ${rowid}:`, error);
                }
            }

            // Delete from chunk_vectors
            this.db!.prepare(`DELETE FROM chunk_vectors WHERE chunk_id IN (${placeholders})`).run(...ids);
        });

        tx();
    }

    /**
     * Clear all vectors (for rebuild)
     */
    async clear(): Promise<void> {
        if (!this.db) return;

        try {
            this.db.prepare("DELETE FROM chunk_vectors_vss").run();
            this.db.prepare("DELETE FROM chunk_vectors").run();
            Logger.info("Vector index cleared");
        } catch (error) {
            Logger.warn("Failed to clear vector index:", error);
        }
    }

    /**
     * Rebuild the entire vector index from chunks
     */
    async rebuild(chunks: Array<{ id: string; content: string }>, embedFn: (text: string) => Promise<number[]>): Promise<void> {
        await this.clear();

        Logger.info(`Rebuilding vector index for ${chunks.length} chunks...`);

        const batchSize = 50;
        for (let i = 0; i < chunks.length; i += batchSize) {
            const batch = chunks.slice(i, i + batchSize);
            const vectors: Array<{ chunkId: string; embedding: number[] }> = [];

            for (const chunk of batch) {
                const embedding = await embedFn(chunk.content);
                if (embedding.length > 0) {
                    vectors.push({ chunkId: chunk.id, embedding });
                }
            }

            await this.upsertVectors(vectors);
            Logger.debug(`Rebuilt ${Math.min(i + batchSize, chunks.length)}/${chunks.length} vectors`);
        }

        Logger.info("Vector index rebuild complete");
    }

    /**
     * Get vector count
     */
    getCount(): number {
        if (!this.db) return 0;

        try {
            const row = this.db.prepare("SELECT COUNT(*) as count FROM chunk_vectors").get() as { count: number };
            return row.count;
        } catch {
            return 0;
        }
    }

    /**
     * Close the database connection
     */
    close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}