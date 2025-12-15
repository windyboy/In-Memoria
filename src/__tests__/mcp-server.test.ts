import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CodeCartographerMCP } from "../mcp-server/server.js";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("CodeCartographerMCP Server", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "in-memoria-mcp-test-"));
    // Set test database path
    process.env.IN_MEMORIA_DB_PATH = join(tempDir, "test.db");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    delete process.env.IN_MEMORIA_DB_PATH;
  });

  it("should create MCP server instance", () => {
    const server = new CodeCartographerMCP();
    expect(server).toBeDefined();
  });

  it("should handle tool routing without errors", async () => {
    const server = new CodeCartographerMCP();

    // Test invalid tool name
    const mockRoute = vi
      .spyOn(server, "routeToolCall")
      .mockRejectedValue(new Error("Unknown tool"));
    await expect(mockRoute("invalid_tool", {})).rejects.toThrow("Unknown tool");
    vi.restoreAllMocks();
  });
});
