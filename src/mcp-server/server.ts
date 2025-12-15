import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { MCPErrorCode } from "../utils/error-types.js";

import { CoreAnalysisTools } from "./tools/core-analysis.js";
import { IntelligenceTools } from "./tools/intelligence-tools.js";
import { AutomationTools } from "./tools/automation-tools.js";
import { MonitoringTools } from "./tools/monitoring-tools.js";
import { SemanticEngine } from "../engines/semantic-engine.js";
import { PatternEngine } from "../engines/pattern-engine.js";
import { SQLiteDatabase } from "../storage/sqlite-db.js";
import { createVectorStore } from "../storage/vector-factory.js";
import { SurrealVectorDB } from "../storage/vector-db.js";
import { VectorStore } from "../storage/vector-store.js";
import { config } from "../config/config.js";
import { validateInput, VALIDATION_SCHEMAS } from "./validation.js";
import { Logger } from "../utils/logger.js";
import { CircuitBreaker } from "../utils/circuit-breaker.js";
import {
    createToolCallRateLimiter,
    RateLimiter,
} from "../utils/rate-limiter.js";

function getPackageVersion(): string {
    try {
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const packagePath = join(__dirname, "..", "..", "package.json");
        const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
        return typeof packageJson.version === "string"
            ? packageJson.version
            : "0.0.0";
    } catch (error: unknown) {
        Logger.warn(
            "Failed to read package version; defaulting to 0.0.0",
            error instanceof Error ? error.message : String(error),
        );
        return "0.0.0";
    }
}

export class CodeCartographerMCP {
    private server: Server;
    private database!: SQLiteDatabase;
    private vectorDB!: VectorStore;
    private semanticEngine!: SemanticEngine;
    private patternEngine!: PatternEngine;
    private coreTools!: CoreAnalysisTools;
    private intelligenceTools!: IntelligenceTools;
    private automationTools!: AutomationTools;
    private monitoringTools!: MonitoringTools;
    private rateLimiter: RateLimiter;
    private toolRegistry: Map<string, (args: any) => Promise<any>> = new Map();

    constructor() {
        this.server = new Server(
            {
                name: "in-memoria",
                version: getPackageVersion(),
            },
            {
                capabilities: {
                    tools: {},
                },
            },
        );

        // Initialize rate limiter for tool calls
        this.rateLimiter = createToolCallRateLimiter();

        this.setupHandlers();
    }

    private initializeToolRegistry(): void {
        // Core Analysis Tools
        this.toolRegistry.set("analyze_codebase", (args) =>
            this.coreTools.analyzeCodebase(args),
        );
        this.toolRegistry.set("search_codebase", (args) =>
            this.coreTools.searchCodebase(args),
        );

        // Intelligence Tools
        this.toolRegistry.set("learn_codebase_intelligence", (args) =>
            this.intelligenceTools.learnCodebaseIntelligence(args),
        );
        this.toolRegistry.set("get_semantic_insights", (args) =>
            this.intelligenceTools.getSemanticInsights(args),
        );
        this.toolRegistry.set("get_pattern_recommendations", (args) =>
            this.intelligenceTools.getPatternRecommendations(args),
        );
        this.toolRegistry.set("predict_coding_approach", (args) =>
            this.intelligenceTools.predictCodingApproach(args),
        );
        this.toolRegistry.set("get_developer_profile", (args) =>
            this.intelligenceTools.getDeveloperProfile(args),
        );
        this.toolRegistry.set("contribute_insights", (args) =>
            this.intelligenceTools.contributeInsights(args),
        );
        this.toolRegistry.set("get_project_blueprint", (args) =>
            this.intelligenceTools.getProjectBlueprint(args),
        );

        // Automation Tools
        this.toolRegistry.set("auto_learn_if_needed", (args) =>
            this.automationTools.autoLearnIfNeeded(args),
        );

        // Monitoring Tools
        this.toolRegistry.set("get_system_status", (args) =>
            this.monitoringTools.getSystemStatus(args),
        );
        this.toolRegistry.set("get_intelligence_metrics", (args) =>
            this.monitoringTools.getIntelligenceMetrics(args),
        );
        this.toolRegistry.set("get_performance_status", (args) =>
            this.monitoringTools.getPerformanceStatus(args),
        );
        this.toolRegistry.set("health_check", (args) =>
            this.monitoringTools.healthCheck(args),
        );
    }

    private async initializeComponents(): Promise<void> {
        try {
            Logger.info("Initializing In Memoria components...");

            // Initialize storage using configuration management
            // Database path is determined by config based on the analyzed project
            const appConfig = config.getConfig();
            const dbPath = config.getDatabasePath(); // Will use current directory as project path
            Logger.info(`Attempting to initialize database at: ${dbPath}`);

            try {
                this.database = new SQLiteDatabase(dbPath);
                Logger.info("SQLite database initialized successfully");
            } catch (dbError: unknown) {
                Logger.error("Failed to initialize SQLite database:", dbError);
                Logger.error(
                    "The MCP server will continue with limited functionality",
                );
                throw new Error(
                    `Database initialization failed: ${dbError instanceof Error ? dbError.message : String(dbError)}`,
                );
            }

            const embeddingConfig = config.getEmbeddingConfig();

            // Create circuit breaker for vector DB initialization with retry and fallback
            const vectorDBCircuitBreaker = new CircuitBreaker({
                failureThreshold: 3, // 3 failures before opening
                recoveryTimeout: 60000, // 1 minute recovery time
                requestTimeout: 30000, // 30 seconds per initialization attempt
                monitoringWindow: 300000, // 5 minute monitoring window
            });

            try {
                await vectorDBCircuitBreaker.execute(
                    async () => {
                        this.vectorDB = createVectorStore(embeddingConfig);
                        await this.vectorDB.initialize();
                    },
                    async () => {
                        Logger.warn(
                            "Vector database initialization failed after retries, falling back to local SurrealDB",
                        );
                        this.vectorDB = new SurrealVectorDB(
                            undefined,
                            embeddingConfig,
                        );
                        await this.vectorDB.initialize();
                    },
                );
                Logger.info("Vector database initialized successfully");
            } catch (error) {
                Logger.error(
                    "Critical error: Even fallback vector database initialization failed:",
                    error,
                );
                throw new Error(
                    "Unable to initialize any vector database backend",
                );
            }

            // Initialize engines
            this.semanticEngine = new SemanticEngine(
                this.database,
                this.vectorDB,
            );
            this.patternEngine = new PatternEngine(this.database);
            Logger.info("Analysis engines initialized");

            // Initialize tool collections
            this.coreTools = new CoreAnalysisTools(
                this.semanticEngine,
                this.patternEngine,
                this.database,
            );
            this.intelligenceTools = new IntelligenceTools(
                this.semanticEngine,
                this.patternEngine,
                this.database,
                this.vectorDB, // Pass shared vectorDB instance
            );
            this.automationTools = new AutomationTools(
                this.semanticEngine,
                this.patternEngine,
                this.database,
            );
            this.monitoringTools = new MonitoringTools(
                this.semanticEngine,
                this.patternEngine,
                this.database,
                dbPath,
            );
            Logger.info("Tool collections initialized");

            // Initialize tool registry for efficient routing
            this.initializeToolRegistry();

            Logger.info("In Memoria components initialized successfully");
        } catch (error: unknown) {
            Logger.error("Failed to initialize In Memoria components:", error);
            Logger.error(
                "Stack trace:",
                error instanceof Error
                    ? error.stack
                    : "No stack trace available",
            );
            throw error;
        }
    }

    private setupHandlers(): void {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    ...this.coreTools.tools,
                    ...this.intelligenceTools.tools,
                    ...this.automationTools.tools,
                    ...this.monitoringTools.tools,
                ],
            };
        });

        // Handle tool calls
        this.server.setRequestHandler(
            CallToolRequestSchema,
            async (request) => {
                const { name, arguments: args } = request.params;

                // Check rate limit
                const rateLimitResult = this.rateLimiter.check();
                if (!rateLimitResult.allowed) {
                    const resetInSeconds = Math.ceil(
                        (rateLimitResult.resetTime - Date.now()) / 1000,
                    );
                    throw new McpError(
                        MCPErrorCode.RATE_LIMITED,
                        `Rate limit exceeded. Try again in ${resetInSeconds} seconds.`,
                    );
                }

                try {
                    // Route to appropriate tool handler
                    const result = await this.routeToolCall(name, args);

                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(result, null, 2),
                            },
                        ],
                    };
                } catch (error) {
                    if (error instanceof McpError) {
                        throw error;
                    }

                    throw new McpError(
                        ErrorCode.InternalError,
                        `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            },
        );
    }

    public async routeToolCall(name: string, args: any): Promise<any> {
        // Validate input using Zod schemas
        const schema =
            VALIDATION_SCHEMAS[name as keyof typeof VALIDATION_SCHEMAS];
        if (schema) {
            args = validateInput(schema, args, name);
        }

        // Look up handler in registry
        const handler = this.toolRegistry.get(name);
        if (!handler) {
            throw new McpError(
                ErrorCode.MethodNotFound,
                `Unknown tool: ${name}`,
            );
        }

        return await handler(args);
    }

    async start(): Promise<void> {
        // Set environment variable to indicate MCP server mode
        process.env.MCP_SERVER = "true";

        await this.initializeComponents();

        const transport = new StdioServerTransport();
        await this.server.connect(transport);

        Logger.info("In Memoria MCP Server started");
    }

    /**
     * Get all registered tools (for testing and introspection)
     */
    getAllTools(): any[] {
        return [
            ...this.coreTools.tools,
            ...this.intelligenceTools.tools,
            ...this.automationTools.tools,
            ...this.monitoringTools.tools,
        ];
    }

    /**
     * Initialize components for testing without starting transport
     */
    async initializeForTesting(): Promise<void> {
        await this.initializeComponents();
    }

    async stop(): Promise<void> {
        // Clean up semantic engine resources
        if (this.semanticEngine) {
            this.semanticEngine.cleanup();
        }

        // Close vector database
        if (this.vectorDB) {
            try {
                await this.vectorDB.close();
            } catch (error) {
                console.warn(
                    "Warning: Failed to close vector database:",
                    error,
                );
            }
        }

        // Close SQLite database
        if (this.database) {
            this.database.close();
        }

        // Clean up rate limiter
        this.rateLimiter.destroy();

        // Close MCP server
        await this.server.close();
    }
}

// Export for CLI usage
export async function runServer(): Promise<void> {
    const server = new CodeCartographerMCP();

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
        await server.stop();
        process.exit(0);
    });

    process.on("SIGTERM", async () => {
        await server.stop();
        process.exit(0);
    });

    await server.start();
}
