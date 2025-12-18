import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CodeCartographerMCP } from "../mcp/server.js";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("MCP Server Integration", () => {
  let tempDir: string;
  let projectDir: string;
  let server: CodeCartographerMCP;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "mcp-integration-test-"));
    projectDir = join(tempDir, "test-project");
    mkdirSync(projectDir, { recursive: true });

    // Create test project structure
    writeFileSync(
      join(projectDir, "package.json"),
      JSON.stringify({
        name: "test-project",
        version: "1.0.0",
        description: "Test project for MCP integration",
      }),
    );

    writeFileSync(
      join(projectDir, "index.ts"),
      `
export class TestService {
  private data: string[] = [];

  async addData(item: string): Promise<void> {
    this.data.push(item);
  }

  getData(): string[] {
    return this.data;
  }
}
    `,
    );

    writeFileSync(
      join(projectDir, "utils.ts"),
      `
export function calculateSum(numbers: number[]): number {
  return numbers.reduce((sum, num) => sum + num, 0);
}

export function formatMessage(message: string): string {
  return \`[INFO] \${message}\`;
}
    `,
    );

    // Set test environment
    originalCwd = process.cwd();
    originalEnv = { ...process.env };
    process.chdir(projectDir);
    process.env.IN_MEMORIA_DB_PATH = join(tempDir, "test.db");

    server = new CodeCartographerMCP();

    // Initialize components without starting the transport (for testing)
    await server.initializeForTesting();
  });

  afterEach(async () => {
    try {
      await server.stop();
    } catch (error) {
      // Ignore cleanup errors
    }

    process.chdir(originalCwd);
    process.env = originalEnv;
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("Server Initialization", () => {
    it("should initialize all components successfully", async () => {
      // Initialization happens in constructor, should not throw
      expect(server).toBeDefined();
    });
  });

  describe("Core Analysis Tools", () => {
    it("should analyze codebase successfully", async () => {
      const result = await server.routeToolCall("analyze_codebase", {
        path: ".",
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
      // The actual structure depends on the Rust analyzer, but should be an object
    });

    it("should analyze a single file", async () => {
      const result = await server.routeToolCall("analyze_codebase", {
        path: "index.ts",
      });

      expect(result).toBeDefined();
      expect(result.type).toBe("file");
      expect(result.language).toBeDefined();
    });

    it("should get project blueprint", async () => {
      const result = await server.routeToolCall("get_project_blueprint", {
        path: ".",
        includeFeatureMap: true,
      });

      expect(Array.isArray(result.techStack)).toBe(true);
      expect(result.learningStatus).toBeDefined();
      expect(result.keyDirectories).toBeDefined();
    });

    it("should search codebase", async () => {
      const result = await server.routeToolCall("search_codebase", {
        query: "TestService",
        type: "text",
      });

      expect(result).toBeDefined();
      // Should find the TestService class
    });
  });

  describe("Automation Tools", () => {
    it("should expose learning status via blueprint", async () => {
      const result = await server.routeToolCall("get_project_blueprint", {
        path: ".",
      });

      expect(result.learningStatus).toBeDefined();
      expect(result.learningStatus.recommendation).toMatch(
        /ready|learning_recommended|learning_needed/,
      );
    });

    // Phase 3: Automation and monitoring tools removed from whitelist
  });

  describe("Intelligence Tools", () => {
    // Phase 3: Only whitelisted intelligence tools
    it("should get pattern recommendations", async () => {
      const result = await server.routeToolCall("get_pattern_recommendations", {
        problemDescription: "I need to create a data processing service",
        currentFile: "index.ts",
      });

      expect(result).toBeDefined();
      // Should provide some kind of recommendation
    });

    it("should get intelligence metrics", async () => {
      const result = await server.routeToolCall("get_intelligence_metrics", {
        includeBreakdown: true,
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.metrics).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid tool names", async () => {
      await expect(server.routeToolCall("invalid_tool", {})).rejects.toThrow(
        "Unknown tool",
      );
    });

    it("should validate input parameters", async () => {
      await expect(
        server.routeToolCall("analyze_codebase", {
          path: "", // Invalid empty path
        }),
      ).rejects.toThrow();
    });

    it("should handle missing required parameters", async () => {
      await expect(
        server.routeToolCall("get_pattern_recommendations", {
          // Missing required problemDescription field
        }),
      ).rejects.toThrow();
    });
  });

  describe("Tool Completeness", () => {
    it("should list all supported tools", async () => {
      // Phase 3: Whitelisted tools only
      const expectedTools = [
        // Core Analysis
        "analyze_codebase",
        "search_codebase",
        // Intelligence
        "learn_codebase_intelligence",
        "get_pattern_recommendations",
        "get_project_blueprint",
        "get_intelligence_metrics",
      ];

      const allTools = server.getAllTools().map((tool) => tool.name);
      expectedTools.forEach((tool) => expect(allTools).toContain(tool));
    });

    it("should have proper tool schemas", async () => {
      // Phase 3: Test whitelisted tools only
      const toolsWithValidParams = [
        { name: "get_project_blueprint", params: { path: "." } },
        { name: "get_intelligence_metrics", params: {} },
        { name: "get_pattern_recommendations", params: { problemDescription: "test" } },
      ];

      for (const { name, params } of toolsWithValidParams) {
        const result = await server.routeToolCall(name, params);
        expect(result).toBeDefined();
      }
    });
  });

  describe("End-to-End Workflow", () => {
    it("should support complete agent workflow with whitelisted tools", async () => {
      // 1. Check initial status
      const initialStatus = await server.routeToolCall(
        "get_project_blueprint",
        {
          path: ".",
        },
      );
      expect(initialStatus.learningStatus).toBeDefined();

      // 2. Learn codebase intelligence (manual learning since auto_learn_if_needed is not whitelisted)
      const learningResult = await server.routeToolCall(
        "learn_codebase_intelligence",
        {
          path: ".",
          force: false,
        },
      );
      expect(learningResult.success).toBeDefined();

      // 3. Get intelligence metrics
      const metrics = await server.routeToolCall(
        "get_intelligence_metrics",
        {},
      );
      expect(metrics.success).toBe(true);

      // 4. Analyze the codebase
      const analysis = await server.routeToolCall("analyze_codebase", {
        path: ".",
      });
      expect(analysis).toBeDefined();

      // 5. Get pattern recommendations
      const patterns = await server.routeToolCall("get_pattern_recommendations", {
        problemDescription: "Create a new service class",
      });
      expect(patterns).toBeDefined();

      // Complete workflow should work without errors
    });
  });
});
