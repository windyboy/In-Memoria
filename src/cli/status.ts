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
  
  // Learning Status (always shown)
  console.log("\n=== Learning Status ===");
  console.log(`Intelligence Available: ${data.learningStatus.hasIntelligence ? '✅ Yes' : '❌ No'}`);
  console.log(`Data Freshness: ${data.learningStatus.isStale ? '⚠️  Stale' : '✅ Fresh'}`);
  console.log(`Recommendation: ${formatRecommendation(data.learningStatus.recommendation)}`);
  console.log(`Message: ${data.learningStatus.message}`);
  
  if (data.verbose) {
    console.log(`Concepts Stored: ${data.learningStatus.conceptsStored}`);
    console.log(`Patterns Stored: ${data.learningStatus.patternsStored}`);
    console.log(`Files in Project: ${data.learningStatus.filesInProject}`);
    console.log(`Code Files: ${data.learningStatus.codeFilesInProject}`);
    if (data.learningStatus.lastLearningTime) {
      console.log(`Last Learning: ${formatTimestamp(data.learningStatus.lastLearningTime)}`);
    }
  }
  
  // Health Status
  if (data.healthStatus) {
    console.log("\n=== System Health ===");
    console.log(`Overall Status: ${formatHealthStatus(data.healthStatus.status)}`);
    console.log(`Summary: ${data.healthStatus.summary}`);
    console.log(`Last Checked: ${formatTimestamp(data.healthStatus.lastChecked)}`);
    
    if (data.verbose) {
      console.log("\nComponent Health:");
      console.log(`  Database: ${formatComponentStatus(data.healthStatus.components.database.status)}`);
      console.log(`  Vector Store: ${formatComponentStatus(data.healthStatus.components.vectorStore.status)}`);
      console.log(`  Intelligence: ${formatComponentStatus(data.healthStatus.components.intelligence.status)}`);
      
      // Show component details
      if (data.healthStatus.components.database.dataCount) {
        console.log(`    - Concepts: ${data.healthStatus.components.database.dataCount.concepts}`);
        console.log(`    - Patterns: ${data.healthStatus.components.database.dataCount.patterns}`);
      }
      
      if (data.healthStatus.components.vectorStore.responseTime) {
        console.log(`    - Response Time: ${data.healthStatus.components.vectorStore.responseTime}ms`);
      }
    }
  }
  
  // Intelligence Metrics
  if (data.intelligenceMetrics) {
    console.log("\n=== Intelligence Metrics ===");
    console.log(`Total Concepts: ${data.intelligenceMetrics.concepts.total}`);
    console.log(`Total Patterns: ${data.intelligenceMetrics.patterns.total}`);
    
    if (data.intelligenceMetrics.quality.averageConfidence !== undefined) {
      console.log(`Average Confidence: ${(data.intelligenceMetrics.quality.averageConfidence * 100).toFixed(1)}%`);
    }
    
    if (data.intelligenceMetrics.quality.highConfidenceRatio !== undefined) {
      console.log(`High Confidence Ratio: ${(data.intelligenceMetrics.quality.highConfidenceRatio * 100).toFixed(1)}%`);
    }
    
    if (data.verbose && data.intelligenceMetrics.concepts.breakdown) {
      console.log("\nConcept Breakdown:");
      Object.entries(data.intelligenceMetrics.concepts.breakdown.byType).forEach(([type, count]) => {
        console.log(`  - ${type}: ${count}`);
      });
      
      const conf = data.intelligenceMetrics.concepts.breakdown.byConfidence;
      console.log(`\nConfidence Distribution: High(${conf.high}) Medium(${conf.medium}) Low(${conf.low})`);
    }
    
    if (data.verbose && data.intelligenceMetrics.patterns.breakdown) {
      console.log("\nPattern Breakdown:");
      Object.entries(data.intelligenceMetrics.patterns.breakdown.byType).forEach(([type, count]) => {
        console.log(`  - ${type}: ${count}`);
      });
      
      const freq = data.intelligenceMetrics.patterns.breakdown.byFrequency;
      console.log(`\nFrequency Distribution: Frequent(${freq.frequent}) Common(${freq.common}) Rare(${freq.rare})`);
    }
    
    if (data.intelligenceMetrics.timestamps.lastConceptLearned || data.intelligenceMetrics.timestamps.lastPatternLearned) {
      console.log("\nLast Updates:");
      if (data.intelligenceMetrics.timestamps.lastConceptLearned) {
        console.log(`  Concepts: ${formatTimestamp(data.intelligenceMetrics.timestamps.lastConceptLearned)}`);
      }
      if (data.intelligenceMetrics.timestamps.lastPatternLearned) {
        console.log(`  Patterns: ${formatTimestamp(data.intelligenceMetrics.timestamps.lastPatternLearned)}`);
      }
    }
  }
  
  // System Metrics
  if (data.systemMetrics) {
    console.log("\n=== System Metrics ===");
    console.log(`Version: ${data.systemMetrics.version}`);
    console.log(`Node.js: ${data.systemMetrics.system.nodeVersion}`);
    console.log(`Platform: ${data.systemMetrics.system.platform}`);
    console.log(`Uptime: ${formatUptime(data.systemMetrics.system.uptime)}`);
    
    console.log("\nMemory Usage:");
    console.log(`  RSS: ${data.systemMetrics.memory.rss} ${data.systemMetrics.memory.unit}`);
    console.log(`  Heap Used: ${data.systemMetrics.memory.heapUsed} ${data.systemMetrics.memory.unit}`);
    console.log(`  Heap Total: ${data.systemMetrics.memory.heapTotal} ${data.systemMetrics.memory.unit}`);
    
    console.log("\nDatabase Performance:");
    console.log(`  Size: ${data.systemMetrics.database.size.mb} MB`);
    console.log(`  Query Performance: ${data.systemMetrics.database.queryPerformance.performanceRating}`);
    console.log(`  Concepts Query: ${data.systemMetrics.database.queryPerformance.conceptsMs}ms`);
    console.log(`  Patterns Query: ${data.systemMetrics.database.queryPerformance.patternsMs}ms`);
  }
  
  console.log(); // Final newline
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
function formatComponentStatus(status: string): string {
  switch (status) {
    case 'healthy':
    case 'ready':
      return '✅ Healthy';
    case 'degraded':
    case 'needs_learning':
      return '⚠️  Degraded';
    case 'error':
    case 'unhealthy':
      return '❌ Error';
    default:
      return status;
  }
}

/**
 * Format timestamp for display
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