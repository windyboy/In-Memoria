import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Container } from "../../core/container/container.js";
import { Logger } from "../../utils/logger.js";

/**
 * Pure MCP Adapter for Automation Tools
 * 
 * This adapter contains NO business logic - only parameter transformation
 * and service method calls. All business logic is handled by the service layer.
 */
export class AutomationAdapter {
  constructor(private container: Container) {}

  get tools(): Tool[] {
    return [
      {
        name: "auto_learn_if_needed",
        description:
          'Automatically learn from codebase if intelligence data is missing or stale. Call this first before using other In-Memoria tools - it\'s a no-op if data already exists. Includes project setup and verification. Perfect for seamless agent integration.',
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description:
                "Path to the codebase directory (defaults to current working directory)",
            },
            force: {
              type: "boolean",
              description: "Force re-learning even if data exists",
              default: false,
            },
            includeProgress: {
              type: "boolean",
              description: "Include detailed progress information in response",
              default: true,
            },
            skipLearning: {
              type: "boolean",
              description:
                "Skip the learning phase for faster setup (Phase 4: merged from quick_setup)",
              default: false,
            },
            includeSetupSteps: {
              type: "boolean",
              description:
                "Include detailed setup verification steps (Phase 4: merged from quick_setup)",
              default: false,
            },
          },
        },
      },
    ];
  }

  /**
   * Pure adapter method for auto learning
   * Contains NO business logic - only parameter transformation and service calls
   */
  async autoLearnIfNeeded(args: {
    path?: string;
    force?: boolean;
    includeProgress?: boolean;
    skipLearning?: boolean;
    includeSetupSteps?: boolean;
  }): Promise<any> {
    try {
      Logger.info(`MCP Adapter: auto_learn_if_needed called with path: ${args.path}`);
      
      // Pure parameter transformation - no business logic
      const projectPath = args.path || process.cwd();
      const force = args.force || false;
      const skipLearning = args.skipLearning || false;
      const includeSetupSteps = args.includeSetupSteps || false;
      
      // Check learning status first (read-only diagnostic)
      const status = await this.container.diagnosticService.getLearningStatus(projectPath);
      
      // Handle skipLearning case
      if (skipLearning) {
        const setupSteps = includeSetupSteps ? [
          {
            step: 'project_check',
            status: 'completed',
            message: `Project detected at ${projectPath}`,
          },
          {
            step: 'database_init',
            status: 'completed',
            message: 'Database initialized and migrations applied',
          },
          {
            step: 'learning',
            status: 'skipped',
            message: 'Learning phase skipped as requested',
          },
          {
            step: 'verification',
            status: 'completed',
            message: status.message,
            details: status,
          },
        ] : undefined;
        
        return {
          success: true,
          action: includeSetupSteps ? 'setup_completed' : 'skipped',
          projectPath,
          ...(setupSteps && { steps: setupSteps }),
          message: includeSetupSteps 
            ? '✅ Quick setup completed! In Memoria is ready for AI agent use.'
            : 'Setup completed without learning.',
          readyForAgents: status.hasIntelligence,
          intelligenceStatus: status,
        };
      }
      
      // Check if learning is needed
      if (!force && status.hasIntelligence && !status.isStale) {
        const setupSteps = includeSetupSteps ? [
          {
            step: 'project_check',
            status: 'completed',
            message: `Project detected at ${projectPath}`,
          },
          {
            step: 'database_init',
            status: 'completed',
            message: 'Database initialized and migrations applied',
          },
          {
            step: 'learning',
            status: 'skipped',
            message: 'Intelligence data is up-to-date',
          },
          {
            step: 'verification',
            status: 'completed',
            message: status.message,
            details: status,
          },
        ] : undefined;
        
        return {
          success: true,
          action: includeSetupSteps ? 'setup_completed' : 'skipped',
          projectPath,
          ...(setupSteps && { steps: setupSteps }),
          reason: 'Intelligence data is up-to-date',
          status,
          message: includeSetupSteps
            ? '✅ Setup completed! Intelligence data is current.'
            : 'Ready to use! Intelligence data is current.',
          readyForAgents: true,
          intelligenceStatus: status,
        };
      }
      
      // Perform learning using service layer (write-only learning)
      const learningOptions = {
        force,
        progressCallback: args.includeProgress ? (current: number, total: number, message: string) => {
          // Progress callback for real-time updates
          Logger.info(`Learning progress: ${current}/${total} - ${message}`);
        } : undefined,
      };
      
      const learningResult = await this.container.learningService.learnFromCodebase(projectPath, learningOptions);
      
      // Get updated status after learning
      const finalStatus = await this.container.diagnosticService.getLearningStatus(projectPath);
      
      // Pure response transformation - no business logic
      const setupSteps = includeSetupSteps ? [
        {
          step: 'project_check',
          status: 'completed',
          message: `Project detected at ${projectPath}`,
        },
        {
          step: 'database_init',
          status: 'completed',
          message: 'Database initialized and migrations applied',
        },
        {
          step: 'learning',
          status: learningResult.success ? 'completed' : 'failed',
          message: learningResult.success 
            ? `Learned ${learningResult.conceptsLearned} concepts and ${learningResult.patternsDiscovered} patterns`
            : 'Learning failed',
          details: {
            conceptsLearned: learningResult.conceptsLearned,
            patternsLearned: learningResult.patternsDiscovered,
          },
        },
        {
          step: 'verification',
          status: 'completed',
          message: finalStatus.message,
          details: finalStatus,
        },
      ] : undefined;
      
      if (includeSetupSteps) {
        return {
          success: learningResult.success,
          action: 'setup_completed',
          projectPath,
          steps: setupSteps,
          conceptsLearned: learningResult.conceptsLearned,
          patternsLearned: learningResult.patternsDiscovered,
          timeElapsed: learningResult.duration,
          message: learningResult.success
            ? '✅ Quick setup completed! In Memoria is ready for AI agent use.'
            : '❌ Quick setup failed. Manual intervention may be required.',
          readyForAgents: learningResult.success,
          intelligenceStatus: finalStatus,
        };
      }
      
      return {
        action: learningResult.success ? 'learned' : 'failed',
        conceptsLearned: learningResult.conceptsLearned,
        patternsLearned: learningResult.patternsDiscovered,
        timeElapsed: learningResult.duration,
        message: learningResult.success
          ? `✅ Learning completed! Analyzed and learned ${learningResult.conceptsLearned} concepts and ${learningResult.patternsDiscovered} patterns.`
          : '❌ Learning failed. The system will continue with limited intelligence.',
        status: finalStatus,
        ...(learningResult.errors.length > 0 && { errors: learningResult.errors }),
      };
    } catch (error) {
      Logger.error('MCP Adapter: auto_learn_if_needed failed:', error);
      
      // Handle setup steps failure
      if (args.includeSetupSteps) {
        return {
          success: false,
          action: 'setup_failed',
          projectPath: args.path || process.cwd(),
          steps: [
            {
              step: 'error',
              status: 'failed',
              message: `Setup failed: ${error instanceof Error ? error.message : String(error)}`,
              error: error instanceof Error ? error.message : String(error),
            },
          ],
          message: '❌ Quick setup failed. Manual intervention may be required.',
          readyForAgents: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
      
      throw error; // Re-throw service errors without modification
    }
  }
}