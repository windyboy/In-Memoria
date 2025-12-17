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

// Import DI Container and bootstrap
import { initializeDIContainer, disposeDIContainer } from "../core/bootstrap.js";
import { Container } from "../core/container/container.js";

// Import pure MCP adapters
import { CoreAnalysisAdapter } from "./adapters/core-analysis-adapter.js";
import { IntelligenceAdapter } from "./adapters/intelligence-adapter.js";
import { AutomationAdapter } from "./adapters/automation-adapter.js";
import { MonitoringAdapter } from "./adapters/monitoring-adapter.js";

import { validateInput, VALIDATION_SCHEMAS } from "./validation.js";
import { Logger } from "../utils/logger.js";
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
    private container!: Container;
    private coreAnalysisAdapter!: CoreAnalysisAdapter;
    private intelligenceAdapter!: IntelligenceAdapter;
    private automationAdapter!: AutomationAdapter;
    private monitoringAdapter!: MonitoringAdapter;
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
        // Core Analysis Tools (Pure Adapters)
        this.toolRegistry.set("analyze_codebase", (args) =>
            this.coreAnalysisAdapter.analyzeCodebase(args),
        );
        this.toolRegistry.set("search_codebase", (args) =>
            this.coreAnalysisAdapter.searchCodebase(args),
        );

        // Intelligence Tools (Pure Adapters)
        this.toolRegistry.set("learn_codebase_intelligence", (args) =>
            this.intelligenceAdapter.learnCodebaseIntelligence(args),
        );
        this.toolRegistry.set("get_semantic_insights", (args) =>
            this.intelligenceAdapter.getSemanticInsights(args),
        );
        this.toolRegistry.set("get_pattern_recommendations", (args) =>
            this.intelligenceAdapter.getPatternRecommendations(args),
        );
        this.toolRegistry.set("predict_coding_approach", (args) =>
            this.intelligenceAdapter.predictCodingApproach(args),
        );
        this.toolRegistry.set("get_developer_profile", (args) =>
            this.intelligenceAdapter.getDeveloperProfile(args),
        );
        this.toolRegistry.set("contribute_insights", (args) =>
            this.intelligenceAdapter.contributeInsights(args),
        );
        this.toolRegistry.set("get_project_blueprint", (args) =>
            this.intelligenceAdapter.getProjectBlueprint(args),
        );

        // Automation Tools (Pure Adapters)
        this.toolRegistry.set("auto_learn_if_needed", (args) =>
            this.automationAdapter.autoLearnIfNeeded(args),
        );

        // Monitoring Tools (Pure Adapters)
        this.toolRegistry.set("get_system_status", (args) =>
            this.monitoringAdapter.getSystemStatus(args),
        );
        this.toolRegistry.set("get_intelligence_metrics", (args) =>
            this.monitoringAdapter.getIntelligenceMetrics(args),
        );
        this.toolRegistry.set("get_performance_status", (args) =>
            this.monitoringAdapter.getPerformanceStatus(args),
        );
        this.toolRegistry.set("health_check", (args) =>
            this.monitoringAdapter.healthCheck(args),
        );
    }

    private async initializeComponents(): Promise<void> {
        try {
            Logger.info("Initializing In Memoria components with DI Container...");

            // Initialize DI Container with current working directory as project path
            const projectPath = process.cwd();
            Logger.info(`Initializing DI Container for project: ${projectPath}`);
            
            this.container = await initializeDIContainer({ projectPath });
            Logger.info("DI Container initialized successfully");

            // Initialize pure MCP adapters that use services through DI Container
            this.coreAnalysisAdapter = new CoreAnalysisAdapter(this.container);
            this.intelligenceAdapter = new IntelligenceAdapter(this.container);
            this.automationAdapter = new AutomationAdapter(this.container);
            this.monitoringAdapter = new MonitoringAdapter(this.container);
            Logger.info("MCP adapters initialized");

            // Initialize tool registry for efficient routing
            this.initializeToolRegistry();

            // Perform initial health check using diagnostic service
            try {
                const healthStatus = await this.container.diagnosticService.getHealthStatus();
                Logger.info(`System health: ${healthStatus.status} - ${healthStatus.summary}`);
                
                if (healthStatus.status === 'unhealthy') {
                    Logger.warn("System is unhealthy but continuing initialization");
                }
            } catch (error) {
                Logger.warn("Could not perform initial health check:", error);
            }

            Logger.info("In Memoria components initialized successfully with service layer");
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
                    ...this.coreAnalysisAdapter.tools,
                    ...this.intelligenceAdapter.tools,
                    ...this.automationAdapter.tools,
                    ...this.monitoringAdapter.tools,
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
            ...this.coreAnalysisAdapter.tools,
            ...this.intelligenceAdapter.tools,
            ...this.automationAdapter.tools,
            ...this.monitoringAdapter.tools,
        ];
    }

    /**
     * Initialize components for testing without starting transport
     */
    async initializeForTesting(): Promise<void> {
        await this.initializeComponents();
    }

    async stop(): Promise<void> {
        // Dispose DI Container (handles cleanup of all services)
        if (this.container) {
            try {
                await disposeDIContainer();
                Logger.info("DI Container disposed successfully");
            } catch (error) {
                Logger.warn("Warning: Failed to dispose DI Container:", error);
            }
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
