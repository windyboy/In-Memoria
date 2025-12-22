#!/usr/bin/env node

import { initializeDIContainer } from '../core/bootstrap.js';
import { Logger } from '../utils/logger.js';
import { PathValidator } from '../utils/path-validator.js';
import { translateError, isInMemoriaError } from '../core/errors.js';

/**
 * CLI arguments for the status command
 */
export interface StatusArgs {
  path: string;
  verbose?: boolean;
  health?: boolean;
  system?: boolean;
  intelligence?: boolean;
}

/**
 * Pure CLI adapter for the status command
 * 
 * This adapter contains no business logic - it only transforms CLI parameters
 * and delegates to the DiagnosticService through the DI Container.
 */
export async function handleStatusCommand(args: StatusArgs): Promise<void> {
  try {
    // Validate and resolve the project path
    let projectPath: string;
    try {
      projectPath = PathValidator.validateProjectPath(args.path, 'status command');
    } catch (error) {
      throw translateError(error, 'Path validation');
    }
    
    // Initialize DI Container with project path
    const container = await initializeDIContainer({ projectPath });
    
    // Get learning status (always shown)
    const learningStatus = await container.diagnosticService.getLearningStatus(projectPath);
    
    // Get additional metrics if requested
    let systemMetrics: any | undefined;
    let intelligenceMetrics: any | undefined;
    let healthStatus: any | undefined;
    
    if (args.system || args.verbose) {
      systemMetrics = await container.diagnosticService.getSystemMetrics();
    }
    
    if (args.intelligence || args.verbose) {
      intelligenceMetrics = await container.diagnosticService.getIntelligenceMetrics(projectPath);
    }
    
    if (args.health || args.verbose) {
      healthStatus = await container.diagnosticService.getHealthStatus();
    }
    
    // Transform service results to CLI output
    formatStatusResult({
      learningStatus,
      systemMetrics,
      intelligenceMetrics,
      healthStatus,
      verbose: args.verbose
    });
    
    // Set exit code based on health status
    if (healthStatus && healthStatus.status === 'unhealthy') {
      process.exit(1);
    }
    
  } catch (error) {
    const standardizedError = translateError(error, 'Status command');
    Logger.error('Status command failed:', standardizedError);
    console.error(`❌ Status check failed [${standardizedError.code}]: ${standardizedError.message}`);
    process.exit(1);
  }
}

/**
 * Format status result for CLI output
 * 
 * @param data - Status data from services
 */
function formatStatusResult(data: {
  learningStatus: any;
  systemMetrics?: any;
  intelligenceMetrics?: any;
  healthStatus?: any;
  verbose?: boolean;
}): void {
  console.log(`\nIn-Memoria Status for: ${data.learningStatus.projectPath}`);
  console.log("\n=== Learning Status ===");
  console.log(`Intelligence Available: ${data.learningStatus.hasIntelligence ? "✅ Yes" : "❌ No"}`);
  console.log(`Recommendation: ${formatRecommendation(data.learningStatus.recommendation)}`);
  console.log(`Message: ${data.learningStatus.message}`);
  if (data.learningStatus.lastLearningTime) {
    console.log(`Last Learning: ${formatTimestamp(data.learningStatus.lastLearningTime)}`);
  }
  if (data.verbose) {
    console.log(`Concepts Stored: ${data.learningStatus.conceptsStored}`);
    console.log(`Patterns Stored: ${data.learningStatus.patternsStored}`);
  }

  if (data.healthStatus) {
    console.log("\n=== System Health ===");
    console.log(`Overall Status: ${formatHealthStatus(data.healthStatus.status)}`);
    console.log(`Summary: ${data.healthStatus.summary}`);
    if (data.verbose && data.healthStatus.components.database.dataCount) {
      console.log(`Concepts: ${data.healthStatus.components.database.dataCount.concepts}`);
      console.log(`Patterns: ${data.healthStatus.components.database.dataCount.patterns}`);
    }
  }

  if (data.intelligenceMetrics) {
    console.log("\n=== Intelligence Metrics ===");
    console.log(`Total Concepts: ${data.intelligenceMetrics.concepts.total}`);
    console.log(`Total Patterns: ${data.intelligenceMetrics.patterns.total}`);
    if (data.intelligenceMetrics.quality.averageConfidence !== undefined) {
      console.log(
        `Average Confidence: ${(data.intelligenceMetrics.quality.averageConfidence * 100).toFixed(1)}%`,
      );
    }
    if (data.intelligenceMetrics.timestamps.lastConceptLearned) {
      console.log(`Last Concept Update: ${formatTimestamp(data.intelligenceMetrics.timestamps.lastConceptLearned)}`);
    }
    if (data.intelligenceMetrics.timestamps.lastPatternLearned) {
      console.log(`Last Pattern Update: ${formatTimestamp(data.intelligenceMetrics.timestamps.lastPatternLearned)}`);
    }
  }

  if (data.systemMetrics) {
    console.log("\n=== System Metrics ===");
    console.log(`Node.js: ${data.systemMetrics.system.nodeVersion}`);
    console.log(`Platform: ${data.systemMetrics.system.platform}`);
    console.log(`Uptime: ${formatUptime(data.systemMetrics.system.uptime)}`);
    console.log(`Concepts in DB: ${data.systemMetrics.database.conceptCount}`);
    console.log(`Patterns in DB: ${data.systemMetrics.database.patternCount}`);
  }

  console.log();
}

/**
 * Format recommendation status with appropriate emoji
 */
function formatRecommendation(recommendation: string): string {
  switch (recommendation) {
    case 'ready':
      return '✅ Ready';
    case 'learning_recommended':
      return '⚠️  Learning Recommended';
    case 'learning_needed':
      return '❌ Learning Needed';
    default:
      return recommendation;
  }
}

/**
 * Format health status with appropriate emoji
 */
function formatHealthStatus(status: string): string {
  switch (status) {
    case 'healthy':
      return '✅ Healthy';
    case 'degraded':
      return '⚠️  Degraded';
    case 'unhealthy':
      return '❌ Unhealthy';
    default:
      return status;
  }
}

/**
 * Format component status with appropriate emoji
 */
function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString();
  } catch {
    return timestamp;
  }
}

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Parse CLI arguments for status command
 * 
 * @param args - Raw CLI arguments
 * @returns Parsed status arguments
 */
export function parseStatusArgs(args: string[]): StatusArgs {
  const path = args.find(arg => !arg.startsWith('--')) || process.cwd();
  const verbose = args.includes('--verbose');
  const health = args.includes('--health');
  const system = args.includes('--system');
  const intelligence = args.includes('--intelligence');
  
  return { path, verbose, health, system, intelligence };
}
