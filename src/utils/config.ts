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
}

export const config = new ConfigManager();
