import { describe, it, expect } from "vitest";
import { initializeDIContainer, disposeDIContainer } from "./core/bootstrap.js";

describe("lightweight bootstrap", () => {
    it("initializes core services", async () => {
        const container = await initializeDIContainer({ projectPath: process.cwd() });

        // Access the core services to ensure they are wired
        expect(container.analysisService).toBeDefined();
        expect(container.learningService).toBeDefined();
        expect(container.searchService).toBeDefined();
        expect(container.diagnosticService).toBeDefined();

        await disposeDIContainer();
    });
});
