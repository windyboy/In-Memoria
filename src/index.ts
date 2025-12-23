#!/usr/bin/env node

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { runServer } from "./mcp/server.js";
import { Logger } from "./utils/logger.js";
import { PathValidator } from "./utils/path-validator.js";

function getVersion(): string {
    try {
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const packagePath = join(__dirname, "..", "package.json");
        const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
        return packageJson.version;
    } catch (error) {
        return "unknown";
    }
}

function showVersion(): void {
    const version = getVersion();
    console.log(`In Memoria v${version}`);
    console.log("Persistent Intelligence Infrastructure for AI Agents");
    console.log("https://github.com/windyboy/In-Memoria");
}

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    // Check critical environment variables for crash safety
    if (!process.env.SURREAL_SYNC_DATA) {
        Logger.warn(
            '⚠️  SURREAL_SYNC_DATA not set. Setting to "true" for crash safety.',
        );
        Logger.warn(
            "⚠️  To silence this warning, set: export SURREAL_SYNC_DATA=true",
        );
        process.env.SURREAL_SYNC_DATA = "true";
    }

    // Handle version flags
    if (args.includes("--version") || args.includes("-v")) {
        showVersion();
        return;
    }

    switch (command) {
        case "server":
            // Set MCP server mode BEFORE any logging
            process.env.MCP_SERVER = "true";

            // Accept optional path argument to set working directory
            // If no path provided, server runs globally and tools receive project paths
            const serverPath = args[1];

            if (serverPath) {
                const { resolve } = await import("path");
                const resolvedPath = resolve(serverPath);

                if (
                    !PathValidator.isSafeProjectPath(
                        resolvedPath,
                        process.cwd(),
                    )
                ) {
                    console.error(`❌ Error: Invalid path: ${resolvedPath}`);
                    process.exit(1);
                }

                Logger.info(`📂 Working directory: ${resolvedPath}`);
                process.chdir(resolvedPath);
            }

            Logger.info(`🚀 Starting In Memoria MCP Server`);
            await runServer();
            break;

        case "learn":
            const { handleLearnCommand, parseLearnArgs } = await import("./cli/learn.js");
            const learnArgs = parseLearnArgs(args.slice(1));
            await handleLearnCommand(learnArgs);
            break;

        case "analyze":
            const { handleAnalyzeCommand, parseAnalyzeArgs } = await import("./cli/analyze.js");
            const analyzeArgs = parseAnalyzeArgs(args.slice(1));
            await handleAnalyzeCommand(analyzeArgs);
            break;

        case "status":
                    const { handleStatusCommand, parseStatusArgs } = await import("./cli/status.js");
                    const statusArgs = parseStatusArgs(args.slice(1));
                    await handleStatusCommand(statusArgs);
                    break;
        
                case "rebuild-index":
                    const { handleRebuildIndexCommand, parseRebuildIndexArgs } = await import("./cli/rebuild-index.js");
                    const rebuildArgs = parseRebuildIndexArgs(args.slice(1));
                    await handleRebuildIndexCommand(rebuildArgs);
                    break;
        
                default:
            showHelp();
            break;
    }
}

function showHelp(): void {
    console.log(`
In Memoria v${getVersion()} - Persistent Intelligence Infrastructure for AI Agents

In Memoria learns from codebases and provides semantic analysis and search capabilities.

Usage: in-memoria <command> [options]

Commands:
  server [path]             Start MCP server for AI assistant integration
  learn [path] [options]    Analyze codebase and build semantic intelligence database
  analyze [path]            Show insights about codebase structure and patterns
  status [path]             Show learning status and system health information
  rebuild-index [path]      Rebuild vector index from existing chunks
  --version, -v             Display version information

Learn Options:
  --quick                   Fast learning mode (limits files, skips patterns)
  --force                   Force re-learning even if already learned
  --verbose                 Show detailed progress information

Rebuild Options:
  --force                   Force rebuild even if config unchanged

Examples:
  in-memoria learn .                # Build intelligence from current directory
  in-memoria learn . --quick        # Fast learning (recommended for first run)
  in-memoria learn . --force        # Force complete re-learning
  in-memoria server                 # Start MCP server for AI assistants
  in-memoria server ./my-project    # Start server scoped to specific project
  in-memoria analyze ./lib          # Analyze library code insights
  in-memoria rebuild-index .        # Rebuild vector index

Environment Variables:
  OPENAI_API_KEY           Optional: Enable OpenAI embeddings (falls back to local)
  IN_MEMORIA_DB_PATH       Custom database location
  IN_MEMORIA_LOG_LEVEL     Set logging level (error, warn, info, debug)

For documentation, visit: https://github.com/windyboy/In-Memoria
`);
}

// Handle unhandled errors
process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    process.exit(1);
});

process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
    process.exit(1);
});

// Run the CLI
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
