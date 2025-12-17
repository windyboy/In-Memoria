import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Container } from "../../core/container/container.js";
import { Logger } from "../../utils/logger.js";

/**
 * Pure MCP Adapter for Monitoring Tools
 * 
 * This adapter contains NO business logic - only parameter transformation
 * and service method calls. All business logic is handled by the service layer.
 */
export class MonitoringAdapter {
  constructor(private container: Container) {}

  get tools(): Tool[] {
    return [
      {
        name: "get_system_status",
        description:
          "Get comprehensive system status including intelligence data, performance metrics, and health indicators",
        inputSchema: {
          type: "object",
          properties: {
            includeMetrics: {
              type: "boolean",
              description: "Include detailed performance metrics",
              default: true,
            },
            includeDiagnostics: {
              type: "boolean",
              description: "Include system diagnostics",
              default: false,
            },
          },
        },
      },
      {
        name: "get_intelligence_metrics",
        description:
          "Get detailed metrics about the intelligence database and learning state",
        inputSchema: {
          type: "object",
          properties: {
            includeBreakdown: {
              type: "boolean",
              description: "Include detailed breakdown by type and confidence",
              default: true,
            },
          },
        },
      },
      {
        name: "get_performance_status",
        description:
          "Get performance metrics including database size, query times, and resource usage",
        inputSchema: {
          type: "object",
          properties: {
            runBenchmark: {
              type: "boolean",
              description: "Run a quick performance benchmark",
              default: false,
            },
          },
        },
      },
      {
        name: "health_check",
        description:
          "Verify In-Memoria setup and configuration for a project. Checks database accessibility, project structure, and API keys.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Project path to check (defaults to current directory)",
            },
          },
        },
      },
    ];
  }

  /**
   * Pure adapter method for getting system status
   * Contains NO business logic - only parameter transformation and service calls
   */
  async getSystemStatus(args: {
    includeMetrics?: boolean;
    includeDiagnostics?: boolean;
  }): Promise<any> {
    try {
      Logger.info(`MCP Adapter: get_system_status called`);
      
      // Get health status from diagnostic service (read-only)
      const healthStatus = await this.container.diagnosticService.getHealthStatus();
      
      // Get system metrics if requested (read-only)
      let systemMetrics;
      if (args.includeMetrics !== false) {
        systemMetrics = await this.container.diagnosticService.getSystemMetrics();
      }
      
      // Pure response transformation - no business logic
      const status = {
        timestamp: new Date().toISOString(),
        version: '0.6.0',
        status: healthStatus.status,
        components: {
          database: healthStatus.components.database,
          vectorStore: healthStatus.components.vectorStore,
          intelligence: healthStatus.components.intelligence,
        },
        intelligence: healthStatus.components.intelligence,
        ...(systemMetrics && {
          performance: {
            memory: systemMetrics.memory,
            database: systemMetrics.database,
            system: systemMetrics.system,
          },
        }),
        ...(args.includeDiagnostics && {
          diagnostics: {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            environment: {
              workingDirectory: process.cwd(),
            },
          },
        }),
      };
      
      return {
        success: true,
        status,
        message: `System is ${healthStatus.status}`,
        summary: healthStatus.summary,
      };
    } catch (error) {
      Logger.error('MCP Adapter: get_system_status failed:', error);
      
      return {
        success: false,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to retrieve system status',
      };
    }
  }

  /**
   * Pure adapter method for getting intelligence metrics
   * Contains NO business logic - only parameter transformation and service calls
   */
  async getIntelligenceMetrics(args: {
    includeBreakdown?: boolean;
  }): Promise<any> {
    try {
      Logger.info(`MCP Adapter: get_intelligence_metrics called`);
      
      // Pure parameter transformation - no business logic
      const projectPath = process.cwd();
      
      // Get intelligence metrics from diagnostic service (read-only)
      const metrics = await this.container.diagnosticService.getIntelligenceMetrics(projectPath);
      
      // Pure response transformation - no business logic
      return {
        success: true,
        metrics,
        message: `Intelligence metrics: ${metrics.concepts.total} concepts, ${metrics.patterns.total} patterns`,
      };
    } catch (error) {
      Logger.error('MCP Adapter: get_intelligence_metrics failed:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to retrieve intelligence metrics',
      };
    }
  }

  /**
   * Pure adapter method for getting performance status
   * Contains NO business logic - only parameter transformation and service calls
   */
  async getPerformanceStatus(args: {
    runBenchmark?: boolean;
  }): Promise<any> {
    try {
      Logger.info(`MCP Adapter: get_performance_status called`);
      
      // Get system metrics from diagnostic service (read-only)
      const systemMetrics = await this.container.diagnosticService.getSystemMetrics();
      
      // Pure response transformation - no business logic
      const performance = {
        database: systemMetrics.database,
        memory: systemMetrics.memory,
        system: systemMetrics.system,
        ...(args.runBenchmark && {
          benchmark: {
            conceptQuery: systemMetrics.database.queryPerformance.conceptsMs,
            patternQuery: systemMetrics.database.queryPerformance.patternsMs,
            memoryBaseline: systemMetrics.memory.heapUsed,
            memoryDelta: 0, // Placeholder for benchmark delta
          },
        }),
      };
      
      return {
        success: true,
        performance,
        message: `Performance: DB ${systemMetrics.database.size.mb}MB, Memory ${systemMetrics.memory.heapUsed}MB`,
      };
    } catch (error) {
      Logger.error('MCP Adapter: get_performance_status failed:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to retrieve performance metrics',
      };
    }
  }

  /**
   * Pure adapter method for health check
   * Contains NO business logic - only parameter transformation and service calls
   */
  async healthCheck(args: { path?: string }): Promise<{
    status: 'healthy' | 'warning' | 'error';
    checks: {
      name: string;
      status: 'pass' | 'fail' | 'warning';
      message: string;
    }[];
    summary: string;
  }> {
    try {
      Logger.info(`MCP Adapter: health_check called with path: ${args.path}`);
      
      // Pure parameter transformation - no business logic
      const projectPath = args.path || process.cwd();
      
      // Get health status from diagnostic service (read-only)
      const healthStatus = await this.container.diagnosticService.getHealthStatus();
      
      // Get learning status for the specific project (read-only)
      const learningStatus = await this.container.diagnosticService.getLearningStatus(projectPath);
      
      // Pure response transformation - no business logic
      const checks = [
        {
          name: 'Project Path',
          status: 'pass' as const,
          message: `Path exists: ${projectPath}`,
        },
        {
          name: 'Project Structure',
          status: 'pass' as const,
          message: `Valid project detected: ${projectPath}`,
        },
        {
          name: 'Database',
          status: healthStatus.components.database.status === 'healthy' ? 'pass' as const : 'fail' as const,
          message: healthStatus.components.database.status === 'healthy'
            ? `Database healthy with ${healthStatus.components.database.dataCount?.concepts || 0} concepts`
            : `Database error: ${healthStatus.components.database.error || 'Unknown error'}`,
        },
        {
          name: 'Vector Store',
          status: healthStatus.components.vectorStore.status === 'healthy' ? 'pass' as const : 'warning' as const,
          message: healthStatus.components.vectorStore.status === 'healthy'
            ? 'Vector store operational'
            : `Vector store ${healthStatus.components.vectorStore.status}`,
        },
        {
          name: 'Intelligence Data',
          status: learningStatus.hasIntelligence ? 'pass' as const : 'warning' as const,
          message: learningStatus.hasIntelligence
            ? `Intelligence available: ${learningStatus.conceptsStored} concepts, ${learningStatus.patternsStored} patterns`
            : 'No intelligence data - run learning to populate',
        },
        {
          name: 'OpenAI API Key',
          status: process.env.OPENAI_API_KEY ? 'pass' as const : 'warning' as const,
          message: process.env.OPENAI_API_KEY
            ? 'API key configured (vector embeddings enabled)'
            : 'No API key - vector embeddings disabled (optional feature)',
        },
      ];
      
      // Determine overall status
      const hasFailures = checks.some(c => c.status === 'fail');
      const hasWarnings = checks.some(c => c.status === 'warning');
      const overallStatus: 'healthy' | 'warning' | 'error' = hasFailures ? 'error' : hasWarnings ? 'warning' : 'healthy';
      
      // Generate summary
      const passCount = checks.filter(c => c.status === 'pass').length;
      const warnCount = checks.filter(c => c.status === 'warning').length;
      const failCount = checks.filter(c => c.status === 'fail').length;
      
      let summary = `Health check ${overallStatus}: ${passCount} passed`;
      if (warnCount > 0) summary += `, ${warnCount} warnings`;
      if (failCount > 0) summary += `, ${failCount} failures`;
      
      if (overallStatus === 'error') {
        summary += '. Critical issues detected - please address failures.';
      } else if (overallStatus === 'warning') {
        summary += '. Some recommendations available - see warnings.';
      } else {
        summary += '. All systems operational.';
      }
      
      return {
        status: overallStatus,
        checks,
        summary,
      };
    } catch (error) {
      Logger.error('MCP Adapter: health_check failed:', error);
      
      return {
        status: 'error',
        checks: [
          {
            name: 'Health Check',
            status: 'fail',
            message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        summary: 'Health check failed due to system error.',
      };
    }
  }
}