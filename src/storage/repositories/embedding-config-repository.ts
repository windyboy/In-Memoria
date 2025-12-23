import { SQLiteDatabase, EmbeddingConfig } from "../sqlite-db.js";

/**
 * EmbeddingConfigRepository - Data access layer for embedding configuration
 * Handles embedding version control
 */
export class EmbeddingConfigRepository {
    constructor(
        private db: SQLiteDatabase,
        private currentModel: string,
        private currentDimension: number,
    ) {}

    /**
     * Get current embedding configuration
     */
    getCurrent(): EmbeddingConfig | undefined {
        return this.db.getEmbeddingConfig("current");
    }

    /**
     * Upsert current embedding configuration
     */
    upsertCurrent(config: Partial<Omit<EmbeddingConfig, "id" | "createdAt" | "updatedAt">>): void {
        this.db.upsertEmbeddingConfig({
            id: "current",
            model: config.model || this.currentModel,
            dimension: config.dimension || this.currentDimension,
            normalize: config.normalize ?? true,
        });
    }

    /**
     * Check if embedding configuration has changed (requires rebuild)
     */
    needsRebuild(): boolean {
        const current = this.getCurrent();
        if (!current) {
            return true; // No config means we need to create it
        }
        return (
            current.model !== this.currentModel ||
            current.dimension !== this.currentDimension
        );
    }

    /**
     * Get all embedding configurations (for migration/audit)
     */
    getAll(): EmbeddingConfig[] {
        const rows = (this.db as any).db
            .prepare("SELECT * FROM embedding_configs ORDER BY created_at DESC")
            .all();

        return rows.map((row: any) => ({
            id: String(row.id),
            model: String(row.model),
            dimension: Number(row.dimension),
            normalize: Boolean(row.normalize),
            createdAt: new Date(String(row.created_at)),
            updatedAt: new Date(String(row.updated_at)),
        }));
    }
}