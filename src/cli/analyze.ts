#!/usr/bin/env node

import {
  initializeDIContainer,
  disposeDIContainer,
} from "../core/bootstrap.js";
import { Logger } from "../utils/logger.js";
import { PathValidator } from "../utils/path-validator.js";
import { translateError, isInMemoriaError } from "../core/errors.js";

/**
 * CLI arguments for the analyze command
 */
export interface AnalyzeArgs {
  path: string;
  verbose?: boolean;
  metrics?: boolean;
  concepts?: boolean;
}

/**
 * Pure CLI adapter for the analyze command
 *
 * This adapter contains no business logic - it only transforms CLI parameters
 * and delegates to the AnalysisService through the DI Container.
 */
export async function handleAnalyzeCommand(args: AnalyzeArgs): Promise<void> {
  try {
    // Validate and resolve the project path
    let projectPath: string;
    try {
      projectPath = PathValidator.validateProjectPath(
        args.path,
        "analyze command",
      );
    } catch (error) {
      throw translateError(error, "Path validation");
    }

    // Initialize DI Container with project path
    const container = await initializeDIContainer({ projectPath });

    // Delegate to AnalysisService (no business logic in adapter)
    const analysis =
      await container.analysisService.analyzeCodebase(projectPath);

    // Get additional metrics if requested
    let languageMetrics: any | undefined;
    let complexityMetrics: any | undefined;

    if (args.metrics || args.verbose) {
      languageMetrics =
        await container.analysisService.getLanguageMetrics(projectPath);
      complexityMetrics =
        await container.analysisService.getComplexityMetrics(projectPath);
    }

    // Transform service results to CLI output
    formatAnalysisResult(analysis, {
      languageMetrics,
      complexityMetrics,
      verbose: args.verbose,
      showConcepts: args.concepts || args.verbose,
    });

    await disposeDIContainer().catch(() => {
      // Ignore cleanup errors
    });

    process.exit(0);
  } catch (error) {
    const standardizedError = translateError(error, "Analyze command");
    Logger.error("Analyze command failed:", standardizedError);
    console.error(
      `❌ Analysis failed [${standardizedError.code}]: ${standardizedError.message}`,
    );

    await disposeDIContainer().catch(() => {
      // Ignore cleanup errors
    });

    process.exit(1);
  }
}

/**
 * Format analysis result for CLI output
 *
 * @param analysis - Analysis result from service
 * @param options - Formatting options
 */
function formatAnalysisResult(
  analysis: any,
  options: {
    languageMetrics?: any;
    complexityMetrics?: any;
    verbose?: boolean;
    showConcepts?: boolean;
  },
): void {
  console.log(`\nAnalyzing codebase: ${analysis.projectPath}`);

  // Basic analysis results
  console.log("\n=== Codebase Analysis Results ===");
  console.log(`Languages: ${analysis.languages.join(", ")}`);
  console.log(`Frameworks: ${analysis.frameworks.join(", ")}`);
  console.log(`Analysis Status: ${analysis.analysisStatus}`);

  // Language metrics
  if (options.languageMetrics) {
    console.log("\n=== Language Distribution ===");
    console.log(`Primary Language: ${options.languageMetrics.primaryLanguage}`);
    console.log(`Total Files: ${options.languageMetrics.totalFiles}`);
    console.log(`Total Lines: ${options.languageMetrics.totalLines}`);

    if (options.verbose && options.languageMetrics.languages.length > 0) {
      console.log("\nLanguage Breakdown:");
      options.languageMetrics.languages.forEach((lang: any) => {
        console.log(
          `  - ${lang.name}: ${lang.fileCount} files (${lang.percentage}%)`,
        );
      });
    }
  }

  // Complexity metrics
  if (options.complexityMetrics) {
    console.log("\n=== Complexity Metrics ===");
    console.log(
      `Cyclomatic Complexity: ${options.complexityMetrics.cyclomatic.toFixed(1)}`,
    );
    console.log(
      `Cognitive Complexity: ${options.complexityMetrics.cognitive.toFixed(1)}`,
    );
    console.log(`Lines of Code: ${options.complexityMetrics.lines}`);

    if (options.complexityMetrics.maintainabilityIndex !== undefined) {
      console.log(
        `Maintainability Index: ${options.complexityMetrics.maintainabilityIndex}/100`,
      );
    }

    if (options.complexityMetrics.technicalDebt && options.verbose) {
      console.log(
        `Technical Debt Score: ${options.complexityMetrics.technicalDebt.score}/100`,
      );
      if (options.complexityMetrics.technicalDebt.issues.length > 0) {
        console.log("Technical Debt Issues:");
        options.complexityMetrics.technicalDebt.issues.forEach((issue: any) => {
          console.log(`  - ${issue}`);
        });
      }
    }
  }

  // Concepts and patterns
  console.log("\n=== Intelligence Data ===");
  console.log(`Fresh concepts found: ${analysis.concepts.length}`);
  console.log(`Fresh patterns found: ${analysis.patterns.length}`);

  if (options.showConcepts && analysis.concepts.length > 0) {
    console.log("\nFresh Concepts (from current analysis):");
    analysis.concepts.slice(0, 5).forEach((concept: any) => {
      console.log(
        `  - ${concept.name} (${concept.type}) - confidence: ${(concept.confidence * 100).toFixed(1)}%`,
      );
    });

    if (analysis.concepts.length > 5) {
      console.log(`  ... and ${analysis.concepts.length - 5} more concepts`);
    }
  }

  if (options.verbose && analysis.patterns.length > 0) {
    console.log("\nFresh Patterns:");
    analysis.patterns.slice(0, 5).forEach((pattern: any) => {
      console.log(
        `  - ${pattern.type}: ${pattern.description} (frequency: ${pattern.frequency})`,
      );
    });

    if (analysis.patterns.length > 5) {
      console.log(`  ... and ${analysis.patterns.length - 5} more patterns`);
    }
  }

  // Entry points and key directories
  if (options.verbose) {
    if (analysis.entryPoints && analysis.entryPoints.length > 0) {
      console.log("\nEntry Points:");
      analysis.entryPoints.forEach((entry: any) => {
        console.log(
          `  - ${entry.type}: ${entry.filePath}${entry.framework ? ` (${entry.framework})` : ""}`,
        );
      });
    }

    if (analysis.keyDirectories && analysis.keyDirectories.length > 0) {
      console.log("\nKey Directories:");
      analysis.keyDirectories.forEach((dir: any) => {
        console.log(`  - ${dir.path} (${dir.type}): ${dir.fileCount} files`);
      });
    }
  }

  // Errors and warnings
  if (analysis.errors && analysis.errors.length > 0) {
    console.log("\n⚠️  Analysis Warnings:");
    analysis.errors.forEach((error: any) => {
      console.log(`  - ${error}`);
    });
  }

  console.log(); // Final newline
}

/**
 * Parse CLI arguments for analyze command
 *
 * @param args - Raw CLI arguments
 * @returns Parsed analyze arguments
 */
export function parseAnalyzeArgs(args: string[]): AnalyzeArgs {
  const path = args.find((arg) => !arg.startsWith("--")) || process.cwd();
  const verbose = args.includes("--verbose");
  const metrics = args.includes("--metrics");
  const concepts = args.includes("--concepts");

  return { path, verbose, metrics, concepts };
}
