import { join } from "path";

class ConfigManager {
    getDatabasePath(projectPath: string): string {
        const explicitPath = process.env.IN_MEMORIA_DB_PATH;
        const filename = process.env.IN_MEMORIA_DB_FILENAME || "in-memoria.db";

        if (explicitPath && explicitPath.trim().length > 0) {
            return explicitPath;
        }

        return join(projectPath, filename);
    }

    getVectorBackend(): "sqlite" | "vec" | "none" {
        const backend = (process.env.IN_MEMORIA_VECTOR_BACKEND || "").toLowerCase();
        if (backend === "none") return "none";
        if (backend === "vec") return "vec";
        return "sqlite";
    }

    getEmbeddingModel(): string {
        return process.env.IN_MEMORIA_EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";
    }

    getEmbeddingDimension(): number {
        const raw = process.env.IN_MEMORIA_EMBEDDING_DIMENSION;
        const parsed = raw ? Number(raw) : 384;
        return Number.isFinite(parsed) ? parsed : 384;
    }

    getVecExtensionPath(): string | undefined {
        const extPath = process.env.IN_MEMORIA_SQLITE_VEC_PATH;
        return extPath && extPath.trim().length > 0 ? extPath : undefined;
    }

}

export const config = new ConfigManager();
