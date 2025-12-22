#!/usr/bin/env node

import { initializeDIContainer, disposeDIContainer } from '../core/bootstrap.js';
import { Logger } from '../utils/logger.js';
import { PathValidator } from '../utils/path-validator.js';
import { translateError, isInMemoriaError } from '../core/errors.js';

/**
 * CLI arguments for the learn command
 */
export interface LearnArgs {
  path: string;
  force?: boolean;
  verbose?: boolean;
  quick?: boolean;
}

/**
 * Pure CLI adapter for the learn command
 *
 * This adapter contains no business logic - it only transforms CLI parameters
 * and delegates to the LearningService through the DI Container.
 */
export async function handleLearnCommand(args: LearnArgs): Promise<void> {
  try {
    // Validate and resolve the project path
    let projectPath: string;
    try {
      projectPath = PathValidator.validateProjectPath(args.path, 'learn command');
    } catch (error) {
      throw translateError(error, 'Path validation');
    }

    // Initialize DI Container with project path
    const container = await initializeDIContainer({ projectPath });

    // Transform CLI arguments to service options
    const options: any = {
      force: args.force || false,
      progressCallback: createProgressCallback(args.verbose),
      maxFiles: args.quick ? 50 : undefined, // Limit to 50 files in quick mode
      skipPatterns: args.quick ? true : false // Skip expensive pattern analysis in quick mode
    };

    if (args.quick) {
      console.log('⚡ Quick learning mode enabled (limited to 50 files, pattern analysis skipped)');
    }

    // Delegate to LearningService (no business logic in adapter)
    const result = await container.learningService.learnFromCodebase(projectPath, options);

    // Transform service result to CLI output
    formatLearningResult(result, args.verbose);

    // Set exit code based on result
    if (!result.success) {
      // Clean up resources before exiting with error
      await disposeDIContainer().catch(() => {
        // Ignore cleanup errors on failure
      });
      process.exit(1);
    }

    // Clean up resources
    await disposeDIContainer().catch(() => {
      // Ignore cleanup errors
    });

    // Exit successfully after learning completes
    process.exit(0);

  } catch (error) {
    const standardizedError = translateError(error, 'Learn command');
    Logger.error('Learn command failed:', standardizedError);
    console.error(`❌ Learning failed [${standardizedError.code}]: ${standardizedError.message}`);

    // Clean up resources on error
    await disposeDIContainer().catch(() => {
      // Ignore cleanup errors
    });

    process.exit(1);
  }
}

/**
 * Create progress callback for CLI output
 *
 * @param verbose - Whether to show verbose progress
 * @returns Progress callback function
 */
function createProgressCallback(verbose?: boolean) {
  if (!verbose) {
    // Simple milestone-based progress tracking for non-verbose mode
    let lastLoggedPercent = -1;

    return (current: number, total: number, message: string) => {
      const percent = Math.floor((current / total) * 100);
      const milestone = Math.floor(percent / 25) * 25;

      if (
        milestone !== lastLoggedPercent &&
        (milestone === 0 || milestone === 25 || milestone === 50 || milestone === 75 || milestone === 100)
      ) {
        console.log(`   ${milestone}% - ${message}`);
        lastLoggedPercent = milestone;
      }
    };
  }

  // Verbose progress callback
  return (current: number, total: number, message: string) => {
    const percent = Math.floor((current / total) * 100);
    console.log(`   ${percent}% (${current}/${total}) - ${message}`);
  };
}

/**
 * Format learning result for CLI output
 *
 * @param result - Learning result from service
 * @param verbose - Whether to show verbose output
 */
function formatLearningResult(result: any, verbose?: boolean): void {
  if (verbose && result.insights && result.insights.length > 0) {
    console.log("\n📝 Learning Details:");
    result.insights.forEach((insight: string) => console.log(insight));
    console.log("");
  }

  if (!result.success) {
    console.error("❌ Learning failed - see details above");
    if (result.errors && result.errors.length > 0) {
      result.errors.forEach((error: string) => console.error(`   ${error}`));
    }
    return;
  }

  // Print summary
  const separator = "━".repeat(60);
  console.log(`${separator}`);
  console.log(`📊 Concepts:  ${result.conceptsLearned || 0}`);
  console.log(`🔍 Patterns:  ${result.patternsDiscovered || result.patternsLearned || 0}`);
  console.log(`🗺️  Features:  ${result.featuresLearned || 0}`);
  console.log(`⏱️  Duration:  ${Math.round((result.duration || 0) / 1000)}s`);
  console.log(`${separator}\n`);
}

/**
 * Parse CLI arguments for learn command
 *
 * @param args - Raw CLI arguments
 * @returns Parsed learn arguments
 */
export function parseLearnArgs(args: string[]): LearnArgs {
  const path = args.find(arg => !arg.startsWith('--')) || process.cwd();
  const force = args.includes('--force');
  const verbose = args.includes('--verbose');
  const quick = args.includes('--quick');

  return { path, force, verbose, quick };
}
