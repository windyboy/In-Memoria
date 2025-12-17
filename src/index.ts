#!/usr/bin/env node

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { runServer } from "./mcp-server/server.js";
import { FileWatcher } from "./watchers/file-watcher.js";
import { ChangeAnalyzer } from "./watchers/change-analyzer.js";
import { SemanticEngine } from "./engines/semantic-engine.js";
import { PatternEngine } from "./engines/pattern-engine.js";
import { SQLiteDatabase } from "./storage/sqlite-db.js";
import { createVectorStore } from "./storage/vector-factory.js";
import { InteractiveSetup } from "./cli/interactive-setup.js";
import { DebugTools } from "./cli/debug-tools.js";
import { config } from "./config/config.js";
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
        case "version":
        case "--version":
        case "-v":
            showVersion();
            break;

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

        case "watch":
            const watchPath = args[1] || process.cwd();
            await startWatcher(watchPath);
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

        case "init":
            const initPath = args[1] || process.cwd();
            await initializeProject(initPath);
            break;

        case "setup":
            if (args[1] === "--interactive") {
                const setup = new InteractiveSetup();
                await setup.run();
            } else {
                showHelp();
            }
            break;

        case "debug":
        case "check":
            const debugPath =
                args.find((arg) => !arg.startsWith("--")) || process.cwd();
            const debugOptions = {
                verbose: args.includes("--verbose"),
                checkDatabase: !args.includes("--no-database"),
                checkIntelligence: !args.includes("--no-intelligence"),
                checkFileSystem: !args.includes("--no-filesystem"),
                validateData: args.includes("--validate"),
                performance: args.includes("--performance"),
            };

            const debugTools = new DebugTools(debugOptions);
            await debugTools.runDiagnostics(debugPath);
            break;

        default:
            showHelp();
            break;
    }
}

async function startWatcher(path: string): Promise<void> {
    console.log(`Starting file watcher for: ${path}`);

    // Initialize components
    const database = new SQLiteDatabase(config.getDatabasePath(path));
    const embeddingConfig = config.getEmbeddingConfig();
    const vectorDB = createVectorStore(embeddingConfig);
    
    // Log backend information
    const backendInfo = vectorDB.getBackendInfo();
    console.log(`🔧 Using vector backend: ${backendInfo.type} v${backendInfo.version}`);
    
    const semanticEngine = new SemanticEngine();
    const patternEngine = new PatternEngine(database);
    const analyzer = new ChangeAnalyzer(
        semanticEngine,
        patternEngine,
        database,
    );

    // Setup file watcher
    const watcher = new FileWatcher({
        patterns: [
            `${path}/**/*.ts`,
            `${path}/**/*.tsx`,
            `${path}/**/*.js`,
            `${path}/**/*.jsx`,
            `${path}/**/*.py`,
            `${path}/**/*.rs`,
            `${path}/**/*.go`,
            `${path}/**/*.java`,
            `${path}/**/*.php`,
            `${path}/**/*.phtml`,
            `${path}/**/*.inc`,
        ],
        includeContent: true,
    });

    // Handle file changes
    watcher.on("file:change", async (change) => {
        console.log(`File changed: ${change.path} (${change.type})`);

        try {
            const analysis = await analyzer.analyzeChange(change);
            console.log(
                `Analysis complete: ${analysis.intelligence.insights.join(", ")}`,
            );
        } catch (error) {
            console.error(`Analysis failed: ${error}`);
        }
    });

    watcher.on("watcher:error", (error) => {
        console.error(`Watcher error: ${error}`);
    });

    watcher.startWatching();
    console.log("File watcher started. Press Ctrl+C to stop.");

    // Handle graceful shutdown
    process.on("SIGINT", () => {
        console.log("\nStopping file watcher...");
        watcher.stopWatching();
        database.close();
        process.exit(0);
    });
}





async function initializeProject(path: string): Promise<void> {
    console.log(`Initializing In Memoria for project: ${path}`);

    // Create .in-memoria directory
    const { mkdirSync, writeFileSync, existsSync } = await import("fs");
    const { join } = await import("path");

    const configDir = join(path, ".in-memoria");
    if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
    }

    // Create default configuration
    const defaultConfig = {
        version: "0.7.0",
        intelligence: {
            enableRealTimeAnalysis: true,
            enablePatternLearning: true,
            vectorEmbeddings: process.env.OPENAI_API_KEY ? true : false,
        },
        watching: {
            patterns: [
                "**/*.ts",
                "**/*.tsx",
                "**/*.js",
                "**/*.jsx",
                "**/*.py",
                "**/*.rs",
                "**/*.go",
                "**/*.java",
            ],
            ignored: [
                "**/node_modules/**",
                "**/.git/**",
                "**/dist/**",
                "**/build/**",
                "**/target/**",
            ],
            debounceMs: 500,
        },
        mcp: {
            serverPort: 3000,
            enableAllTools: true,
        },
    };

    const configPath = join(configDir, "config.json");
    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));

    // Create gitignore entry
    const gitignorePath = join(path, ".gitignore");
    if (existsSync(gitignorePath)) {
        const { readFileSync, appendFileSync } = await import("fs");
        const gitignoreContent = readFileSync(gitignorePath, "utf-8");
        if (!gitignoreContent.includes("in-memoria.db")) {
            appendFileSync(
                gitignorePath,
                "\n# In Memoria\nin-memoria.db\n.in-memoria/cache/\n",
            );
        }
    }

    console.log("✅ In Memoria initialized!");
    console.log(`Configuration saved to: ${configPath}`);
    console.log("\nNext steps:");
    console.log("1. Run `in-memoria learn` to learn from your codebase");
    console.log("2. Run `in-memoria server` to start the MCP server");
    console.log("3. Run `in-memoria watch` to monitor file changes");
}

function showHelp(): void {
    console.log(`
In Memoria v${getVersion()} - Persistent Intelligence Infrastructure for AI Agents

In Memoria provides AI assistants with persistent memory and intelligence about your codebase,
enabling semantic search, pattern recognition, and contextual understanding across sessions.

Usage: in-memoria <command> [options]

Core Commands:
  server [path]             Start MCP server for AI assistant integration (Claude, Copilot, etc.)
  setup --interactive       Run interactive setup wizard for configuration and dependencies

Development Commands:
  learn [path]              Analyze codebase and build semantic intelligence database
  analyze [path]            Show insights about codebase structure and patterns
  status [path]             Show learning status and system health information
  watch [path]              Monitor file changes and update intelligence in real-time

Utility Commands:
  check, debug [path] [opts] Run diagnostics and health checks
  init [path]               Initialize In Memoria configuration for a project
  version, --version, -v    Display version information

Diagnostic Options (for 'check'/'debug' commands):
  --verbose                 Show detailed diagnostic output
  --validate                Validate data integrity and consistency
  --performance             Analyze system performance metrics
  --no-database             Skip database connectivity checks
  --no-intelligence         Skip intelligence data validation
  --no-filesystem           Skip filesystem access checks

Quick Start Examples:
  in-memoria setup --interactive    # First-time setup (recommended)
  in-memoria learn .                # Build intelligence from current directory
  in-memoria server                 # Start MCP server for AI assistants

Advanced Examples:
  in-memoria server ./my-project    # Start server scoped to specific project
  in-memoria check --verbose        # Full system diagnostics
  in-memoria watch ./src            # Watch source directory for changes
  in-memoria analyze ./lib          # Analyze library code insights

Environment Variables:
  OPENAI_API_KEY           Optional: Enable OpenAI embeddings (falls back to local)
  IN_MEMORIA_DB_PATH       Custom database location
  IN_MEMORIA_LOG_LEVEL     Set logging level (error, warn, info, debug)

For documentation, visit: https://github.com/windyboy/In-Memoria
For AI agent instructions, see: AGENT.md
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
