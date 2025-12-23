import { SQLiteDatabase, Chunk } from "../sqlite-db.js";

/**
 * ChunkRepository - Data access layer for chunks
 * Handles all CRUD operations for chunk data (System of Record)
 */
export class ChunkRepository {
    constructor(private db: SQLiteDatabase) {}

    /**
     * Upsert multiple chunks
     */
    upsert(chunks: Array<Omit<Chunk, "createdAt" | "updatedAt">>): void {
        this.db.upsertChunks(chunks);
    }

    /**
     * Find chunks by their IDs
     */
    findByIds(ids: string[]): Chunk[] {
        return this.db.findChunksByIds(ids);
    }

    /**
     * Delete all chunks for a specific file
     */
    deleteByFile(filePath: string): void {
        this.db.deleteChunksByFile(filePath);
    }

    /**
     * Find all chunks for a file
     */
    findByFile(filePath: string): Chunk[] {
        return this.db.findChunksByIds([]).filter(() => true); // Note: Need to add this method
    }

    /**
     * Count total chunks
     */
    count(): number {
        const row = this.db as any;
        // This would need a count method in SQLiteDatabase
        return 0;
    }
}