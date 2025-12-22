import {
  SemanticAnalyzer,
  BlueprintAnalyzer,
  FrameworkDetector,
} from "./rust-bindings.js";
import {
  CircuitBreaker,
  createRustAnalyzerCircuitBreaker,
} from "../utils/circuit-breaker.js";
import {
  globalProfiler,
  PerformanceOptimizer,
} from "../utils/performance-profiler.js";
import { detectLanguageFromPath as resolveLanguageFromPath } from "../utils/language-registry.js";
import { Logger } from "./logger.js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

export interface CodebaseAnalysisResult {
  languages: string[];
  frameworks: string[];
  complexity: {
    cyclomatic: number;
    cognitive: number;
    lines: number;
  };
  concepts: Array<{
    name: string;
    type: string;
    confidence: number;
  }>;
  analysisStatus?: "normal" | "degraded";
  errors?: string[];
  entryPoints?: Array<{
    type: string;
    filePath: string;
    framework?: string;
  }>;
  keyDirectories?: Array<{
    path: string;
    type: string;
    fileCount: number;
  }>;
}

export interface FileAnalysisResult {
  concepts: Array<{
    name: string;
    type: string;
    confidence: number;
    filePath: string;
    lineRange: { start: number; end: number };
  }>;
}

/**
 * SemanticEngine - Pure Calculation Utility
 * 
 * This engine is now a stateless calculation utility that only performs analysis
 * and returns results. It does NOT perform any database write operations.
 * All storage operations are handled by the LearningService (single writer principle).
 */
export class SemanticEngine {
  private rustAnalyzer: InstanceType<typeof SemanticAnalyzer> | null = null;
  private rustCircuitBreaker: CircuitBreaker;
  private initializationPromise: Promise<void> | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Performance caches
  private fileAnalysisCache = new Map<
    string,
    { result: FileAnalysisResult["concepts"]; timestamp: number }
  >();
  private codebaseAnalysisCache = new Map<
    string,
    { result: CodebaseAnalysisResult; timestamp: number }
  >();

  // Cache TTL in milliseconds (5 minutes)
  private readonly CACHE_TTL = 5 * 60 * 1000;

  constructor() {
    this.rustCircuitBreaker = createRustAnalyzerCircuitBreaker();

    // Create memoized versions of expensive operations
    this.memoizedLanguageDetection = PerformanceOptimizer.memoize(
      this.detectLanguageFromPath.bind(this),
      (filePath: string) => filePath.split(".").pop() || "unknown",
    );

    // Schedule periodic cache cleanup
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupCaches();
      },
      5 * 60 * 1000,
    ); // Every 5 minutes
  }

  /**
   * Lazy initialization of Rust analyzer
   */
  private async initializeRustAnalyzer(): Promise<void> {
    if (this.rustAnalyzer) return;

    if (!this.initializationPromise) {
      this.initializationPromise = globalProfiler.timeAsync(
        "RustAnalyzer.initialization",
        async () => {
          this.rustAnalyzer = new SemanticAnalyzer();
        },
      );
    }

    await this.initializationPromise;
  }

  private memoizedLanguageDetection: (filePath: string) => string;

  async analyzeCodebase(path: string): Promise<CodebaseAnalysisResult> {
    return globalProfiler.timeAsync(
      "SemanticEngine.analyzeCodebase",
      async () => {
        // Check cache first
        const cacheKey = `codebase:${path}`;
        const cached = this.codebaseAnalysisCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
          return cached.result;
        }

        // Ensure Rust analyzer is initialized
        await this.initializeRustAnalyzer();

        const result = await this.rustCircuitBreaker.execute(
          async () => {
            const result = await this.rustAnalyzer!.analyzeCodebase(path);
            const frameworks = this.filterFrameworks(result.frameworks || [], path);
            return {
              languages: result.languages,
              frameworks,
              complexity: {
                cyclomatic: result.complexity.cyclomatic,
                cognitive: result.complexity.cognitive,
                lines: result.complexity.lines,
              },
              concepts: result.concepts.map((c: any) => ({
                name: c.name,
                type: c.conceptType,
                confidence: c.confidence,
              })),
            };
          },
          // Fallback to TypeScript analysis
          async () => this.fallbackAnalysis(path),
        );

        const entryPoints = await this.detectEntryPoints(
          path,
          result.frameworks,
        );
        const keyDirectories = await this.mapKeyDirectories(path);

        const enrichedResult = {
          ...result,
          entryPoints,
          keyDirectories,
        };

        // Cache the enriched result
        this.codebaseAnalysisCache.set(cacheKey, {
          result: enrichedResult,
          timestamp: Date.now(),
        });

        return enrichedResult;
      },
    );
  }

  async analyzeFileContent(
    filePath: string,
    content: string,
  ): Promise<FileAnalysisResult["concepts"]> {
    return globalProfiler.timeAsync(
      "SemanticEngine.analyzeFileContent",
      async () => {
        // Create cache key based on file path and content hash
        const contentHash = this.hashString(content);
        const cacheKey = `file:${filePath}:${contentHash}`;

        // Check cache first
        const cached = this.fileAnalysisCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
          return cached.result;
        }

        // Ensure Rust analyzer is initialized
        await this.initializeRustAnalyzer();

        const result = await this.rustCircuitBreaker.execute(
          async () => {
            const concepts = await this.rustAnalyzer!.analyzeFileContent(
              filePath,
              content,
            );
            return concepts.map((c: any) => ({
              name: c.name,
              type: c.conceptType,
              confidence: c.confidence,
              filePath: c.filePath,
              lineRange: {
                start: c.lineRange.start,
                end: c.lineRange.end,
              },
            }));
          },
          // Fallback to pattern-based analysis
          async () => {
            console.warn(
              "⚠️  FALLBACK: Using limited pattern-based file analysis",
            );
            console.warn("   This means reduced accuracy and missed concepts");
            return this.fallbackFileAnalysis(filePath, content);
          },
        );

        // Cache the result
        this.fileAnalysisCache.set(cacheKey, { result, timestamp: Date.now() });

        return result;
      },
    );
  }

  /**
   * Analyze codebase and extract semantic concepts
   * 
   * This method now only performs analysis and returns results.
   * It does NOT store anything in the database - that's handled by LearningService.
   */
  async extractSemanticConcepts(
    path: string,
    progressCallback?: (
      current: number,
      total: number,
      message: string,
    ) => void,
  ): Promise<
    Array<{
      id: string;
      name: string;
      type: string;
      confidence: number;
      filePath: string;
      lineRange: { start: number; end: number };
      relationships: Record<string, any>;
    }>
  > {
    try {
      // Use Logger instead of console.error to avoid duplicate logs
      // LearningService already logs this, so we skip it here to prevent duplication
      // Logger.info(`🧠 Starting semantic analysis for: ${path}`);

      // Ensure Rust analyzer is initialized
      await this.initializeRustAnalyzer();

      // Estimate file count for progress reporting
      let estimatedFiles = 0;
      try {
        const glob = (await import("glob")).glob;
        const files = await glob(
          "**/*.{ts,tsx,js,jsx,py,rs,go,java,c,cpp,svelte,vue,php,phtml,inc}",
          {
            cwd: path,
            ignore: [
              "**/node_modules/**",
              "**/dist/**",
              "**/build/**",
              "**/.git/**",
            ],
            nodir: true,
          },
        );
        estimatedFiles = files.length;
        if (progressCallback && estimatedFiles > 0) {
          progressCallback(0, estimatedFiles, "Starting semantic analysis...");
        }
      } catch (error) {
        console.warn("Failed to estimate file count for progress tracking");
      }

      // Add timeout protection for the entire analysis process with periodic progress updates
      const abortController = new AbortController();
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeoutId = setTimeout(() => {
          abortController.abort();
          reject(
            new Error(
              "Analysis process timed out after 5 minutes. This can happen with very large Svelte/Vue codebases.",
            ),
          );
        }, 300000); // 5 minutes

        // Clean up timeout if aborted
        abortController.signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
        });
      });

      // Progress tracking with AbortController
      let progressTimer: NodeJS.Timeout | null = null;
      if (progressCallback && estimatedFiles > 0) {
        let elapsed = 0;
        const progressInterval = 2000; // Update every 2 seconds

        progressTimer = setInterval(() => {
          if (abortController.signal.aborted) {
            if (progressTimer) clearInterval(progressTimer);
            return;
          }

          elapsed += progressInterval;

          // Provide estimated progress based on time (rough heuristic)
          const estimatedProgress = Math.min(
            Math.floor((elapsed / 300000) * estimatedFiles), // 300000 = 5 minutes
            estimatedFiles - 1,
          );
          progressCallback(
            estimatedProgress,
            estimatedFiles,
            `Analyzing codebase... (${Math.floor(elapsed / 1000)}s elapsed)`,
          );
        }, progressInterval);

        // Clean up progress timer on abort
        abortController.signal.addEventListener('abort', () => {
          if (progressTimer) clearInterval(progressTimer);
        });
      }

      let concepts: any[];
      try {
        concepts = await Promise.race([
          this.rustAnalyzer!.learnFromCodebase(path),
          timeoutPromise,
        ]);
      } finally {
        // Ensure cleanup happens
        abortController.abort();
      }

      if (progressCallback && estimatedFiles > 0) {
        progressCallback(
          estimatedFiles,
          estimatedFiles,
          "Semantic analysis complete",
        );
      }

      // Log completion - LearningService will also log this, but with more context
      // So we use debug level here to avoid duplication
      Logger.debug(`✅ Extracted ${concepts.length} concepts from codebase`);

      // Return analysis results without storing them
      const result = concepts.map((c: any) => ({
        id: c.id,
        name: c.name,
        type: c.conceptType,
        confidence: c.confidence,
        filePath: c.filePath,
        lineRange: {
          start: c.lineRange.start,
          end: c.lineRange.end,
        },
        relationships: c.relationships,
      }));

      return result;
    } catch (error: unknown) {
      console.error("Semantic analysis error:", error);

      // Provide more specific error messages for common issues
      if (
        (error instanceof Error && error.message.includes("timeout")) ||
        (error instanceof Error && error.message.includes("timed out"))
      ) {
        throw new Error(
          "Analysis process timed out. This commonly happens with:\n" +
            "  • Large projects with many files\n" +
            "  • Projects with very large files (>1MB)\n" +
            "  • Complex nested directory structures\n" +
            "  • Malformed or corrupted source files\n\n" +
            "Try running on a smaller subset of your codebase first.",
        );
      }

      return [];
    }
  }



  async findRelatedConcepts(conceptId: string): Promise<string[]> {
    try {
      return await this.rustAnalyzer.getConceptRelationships(conceptId);
    } catch (error) {
      console.error("Failed to get relationships:", error);
      return [];
    }
  }



  private async fallbackAnalysis(
    path: string,
  ): Promise<CodebaseAnalysisResult> {
    // Provide limited analysis but be very explicit about limitations
    console.warn("⚠️  SEMANTIC ANALYSIS DEGRADED for", path);
    console.warn("   Using basic file system analysis only:");
    console.warn("   • No AST-based semantic concept extraction");
    console.warn("   • No framework detection from dependencies");
    console.warn("   • No complexity metrics calculation");
    console.warn("   • No cross-file relationship analysis");
    console.warn("   • Results will be extremely limited");

    return {
      languages: ["analysis_failed"], // Explicitly indicates failure
      frameworks: [], // Honest that framework detection failed
      complexity: {
        cyclomatic: -1, // Use -1 to indicate "could not calculate" vs 0 which means "no complexity"
        cognitive: -1, // Negative values clearly indicate measurement failure
        lines: 0, // This we can still count from file system
      },
      concepts: [], // Empty but user knows why from the warnings above
      analysisStatus: "degraded" as const, // Add metadata about quality
      errors: ["Rust analyzer unavailable"], // Include specific failure reasons
    };
  }

  private fallbackFileAnalysis(
    filePath: string,
    content: string,
  ): FileAnalysisResult["concepts"] {
    // Instead of fake analysis, provide limited but honest results
    console.warn(
      `⚠️  Using limited pattern-based analysis for ${filePath} (Rust analyzer unavailable)`,
    );

    const concepts: FileAnalysisResult["concepts"] = [];
    const lines = content.split("\n");

    // Look for class declarations
    lines.forEach((line, index) => {
      const classMatch = line.match(/class\s+(\w+)/);
      if (classMatch) {
        concepts.push({
          name: classMatch[1],
          type: "class",
          confidence: 0.4, // Lower confidence for fallback analysis
          filePath,
          lineRange: { start: index + 1, end: index + 1 },
        });
      }

      // Look for function declarations
      const funcMatch =
        line.match(/function\s+(\w+)/) || line.match(/(\w+)\s*\(/);
      if (funcMatch) {
        concepts.push({
          name: funcMatch[1],
          type: "function",
          confidence: 0.3, // Even lower confidence for regex-based detection
          filePath,
          lineRange: { start: index + 1, end: index + 1 },
        });
      }
    });

    // Be explicit about limitations
    if (concepts.length === 0) {
      console.warn(
        `⚠️  No concepts detected in ${filePath} using fallback analysis. This may indicate:`,
      );
      console.warn("   • File uses patterns not detectable by regex");
      console.warn("   • File contains complex syntax requiring AST parsing");
      console.warn("   • File is not a source code file");
    }

    return concepts;
  }

  /**
   * Simple hash function for cache keys
   */
  private hashString(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString();

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return hash.toString();
  }

  /**
   * Clean up old cache entries to prevent memory leaks
   */
  private cleanupCaches(): void {
    const now = Date.now();

    // Clean file analysis cache
    for (const [key, cached] of this.fileAnalysisCache.entries()) {
      if (now - cached.timestamp >= this.CACHE_TTL) {
        this.fileAnalysisCache.delete(key);
      }
    }

    // Clean codebase analysis cache
    for (const [key, cached] of this.codebaseAnalysisCache.entries()) {
      if (now - cached.timestamp >= this.CACHE_TTL) {
        this.codebaseAnalysisCache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): {
    fileCache: { size: number; hitRate?: number };
    codebaseCache: { size: number; hitRate?: number };
  } {
    return {
      fileCache: { size: this.fileAnalysisCache.size },
      codebaseCache: { size: this.codebaseAnalysisCache.size },
    };
  }

  private detectLanguageFromPath(filePath: string): string {
    return resolveLanguageFromPath(filePath);
  }

  /**
   * Filter framework detection using package.json dependencies (and fall back to Rust detection if no match).
   */
  private filterFrameworks(rustFrameworks: string[], projectPath: string): string[] {
    const rustSet = new Set(
      (rustFrameworks || []).map((f) => f.toLowerCase().trim()).filter(Boolean),
    );

    const depFrameworks = this.detectFrameworksFromPackageJson(projectPath);
    // If we have overlap, trust the intersection. Otherwise, prefer dependency-derived frameworks (if any).
    const intersection = Array.from(rustSet).filter((f) => depFrameworks.has(f));
    if (intersection.length > 0) {
      return intersection;
    }
    if (depFrameworks.size > 0) {
      return Array.from(depFrameworks);
    }
    // No signal from dependencies; return original list (could still be empty).
    return Array.from(rustSet);
  }

  private detectFrameworksFromPackageJson(projectPath: string): Set<string> {
    const frameworks = new Set<string>();
    try {
      const pkgPath = join(projectPath, "package.json");
      if (!existsSync(pkgPath)) {
        return frameworks;
      }
      const pkgRaw = readFileSync(pkgPath, "utf-8");
      const pkg = JSON.parse(pkgRaw) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };
      Object.keys(deps).forEach((dep) => {
        const name = dep.toLowerCase();
        if (name === "react" || name === "next") frameworks.add("react");
        if (name === "vue" || name === "nuxt") frameworks.add("vue");
        if (name === "svelte" || name === "sveltekit") frameworks.add("svelte");
        if (name === "express" || name === "fastify" || name === "koa" || name === "hapi") frameworks.add("express");
        if (name === "nest" || name === "@nestjs/core") frameworks.add("nestjs");
        if (name === "vite") frameworks.add("vite");
        if (name === "webpack") frameworks.add("webpack");
        if (name === "jest") frameworks.add("jest");
      });
    } catch (error) {
      Logger.warn("Failed to parse package.json for framework detection:", error);
    }
    return frameworks;
  }

  /**
   * Detect entry points using Rust analyzer with TypeScript fallback
   * Uses CircuitBreaker pattern for graceful degradation
   */
  async detectEntryPoints(
    projectPath: string,
    frameworks: string[],
  ): Promise<
    Array<{
      type: string;
      filePath: string;
      framework?: string;
    }>
  > {
    // Rust implementation
    const rustImplementation = async () => {
      const frameworkInfo =
        await FrameworkDetector.detectFrameworks(projectPath);
      const entryPoints = await BlueprintAnalyzer.detectEntryPoints(
        projectPath,
        frameworkInfo,
      );

      return entryPoints.map((ep: any) => ({
        type: ep.entryType || ep.entry_type, // Try camelCase first (NAPI conversion), fallback to snake_case
        filePath: ep.filePath || ep.file_path,
        framework: ep.framework || undefined,
      }));
    };

    // TypeScript fallback implementation
    const fallbackImplementation = async () => {
      const { access } = await import("fs/promises");
      const { join, resolve } = await import("path");
      const { constants } = await import("fs");
      const entryPoints: Array<{
        type: string;
        filePath: string;
        framework?: string;
      }> = [];

      try {
        // Validate projectPath is safe (prevent path traversal)
        const resolvedProject = resolve(projectPath);

        // Helper to safely check file existence
        const fileExists = async (relPath: string): Promise<boolean> => {
          try {
            const fullPath = join(projectPath, relPath);
            const resolved = resolve(fullPath);

            // Ensure path is within project boundaries
            if (!resolved.startsWith(resolvedProject)) {
              console.warn(`⚠️  Path traversal detected: ${relPath}`);
              return false;
            }

            await access(resolved, constants.F_OK);
            return true;
          } catch {
            return false;
          }
        };

        // React/Next.js entry points
        if (
          frameworks.some(
            (f) =>
              f.toLowerCase().includes("react") ||
              f.toLowerCase().includes("next"),
          )
        ) {
          const reactEntries = [
            "src/index.tsx",
            "src/index.jsx",
            "src/App.tsx",
            "src/App.jsx",
            "pages/_app.tsx",
            "pages/_app.js",
          ];
          for (const entry of reactEntries) {
            if (await fileExists(entry)) {
              entryPoints.push({
                type: "web",
                filePath: entry,
                framework: "react",
              });
            }
          }
        }

        // Express/Node API entry points
        if (
          frameworks.some(
            (f) =>
              f.toLowerCase().includes("express") ||
              f.toLowerCase().includes("node"),
          )
        ) {
          const apiEntries = [
            "server.js",
            "app.js",
            "index.js",
            "src/server.ts",
            "src/app.ts",
            "src/index.ts",
          ];
          for (const entry of apiEntries) {
            if (await fileExists(entry)) {
              entryPoints.push({
                type: "api",
                filePath: entry,
                framework: "express",
              });
            }
          }
        }

        // FastAPI/Python entry points
        if (
          frameworks.some(
            (f) =>
              f.toLowerCase().includes("fastapi") ||
              f.toLowerCase().includes("flask"),
          )
        ) {
          const pythonEntries = [
            "main.py",
            "app.py",
            "server.py",
            "api/main.py",
          ];
          for (const entry of pythonEntries) {
            if (await fileExists(entry)) {
              entryPoints.push({
                type: "api",
                filePath: entry,
                framework: "fastapi",
              });
            }
          }
        }

        // Svelte entry points
        if (frameworks.some((f) => f.toLowerCase().includes("svelte"))) {
          const svelteEntries = [
            "src/routes/+page.svelte",
            "src/main.ts",
            "src/main.js",
          ];
          for (const entry of svelteEntries) {
            if (await fileExists(entry)) {
              entryPoints.push({
                type: "web",
                filePath: entry,
                framework: "svelte",
              });
            }
          }
        }

        // CLI entry points
        const cliEntries = ["cli.js", "bin/cli.js", "src/cli.ts", "src/cli.js"];
        for (const entry of cliEntries) {
          if (await fileExists(entry)) {
            entryPoints.push({ type: "cli", filePath: entry });
          }
        }

        return entryPoints;
      } catch (error) {
        console.warn(
          "⚠️  Entry point detection failed:",
          error instanceof Error ? error.message : "Unknown error",
        );
        console.warn("   Blueprint may be incomplete. This could indicate:");
        console.warn("   • Invalid project path");
        console.warn("   • Permission issues");
        console.warn("   • Unsupported project structure");
        return [];
      }
    };

    // When blueprint support is unavailable, skip the Rust path entirely
    if (
      !BlueprintAnalyzer ||
      typeof BlueprintAnalyzer.detectEntryPoints !== "function"
    ) {
      return fallbackImplementation();
    }

    // Use CircuitBreaker to try Rust first, fall back to TypeScript
    return this.rustCircuitBreaker.execute(
      rustImplementation,
      fallbackImplementation,
    );
  }

  /**
   * Map key directories using Rust analyzer with TypeScript fallback
   * Uses CircuitBreaker pattern for graceful degradation
   */
  async mapKeyDirectories(projectPath: string): Promise<
    Array<{
      path: string;
      type: string;
      fileCount: number;
    }>
  > {
    // Rust implementation
    const rustImplementation = async () => {
      const keyDirs = await BlueprintAnalyzer.mapKeyDirectories(projectPath);

      return keyDirs.map((dir: any) => ({
        path: dir.path,
        type: dir.dirType || dir.dir_type, // Try camelCase first (NAPI conversion), fallback to snake_case
        fileCount: dir.fileCount || dir.file_count,
      }));
    };

    // TypeScript fallback implementation
    const fallbackImplementation = async () => {
      const { access, stat } = await import("fs/promises");
      const { join, resolve } = await import("path");
      const { constants } = await import("fs");
      const keyDirectories: Array<{
        path: string;
        type: string;
        fileCount: number;
      }> = [];

      try {
        // Validate projectPath
        const resolvedProject = resolve(projectPath);

        const commonDirs = [
          { pattern: "src/components", type: "components" },
          { pattern: "src/utils", type: "utils" },
          { pattern: "src/services", type: "services" },
          { pattern: "src/api", type: "api" },
          { pattern: "src/auth", type: "auth" },
          { pattern: "src/models", type: "models" },
          { pattern: "src/views", type: "views" },
          { pattern: "src/pages", type: "pages" },
          { pattern: "src/lib", type: "library" },
          { pattern: "lib", type: "library" },
          { pattern: "utils", type: "utils" },
          { pattern: "middleware", type: "middleware" },
          { pattern: "routes", type: "routes" },
        ];

        for (const dir of commonDirs) {
          const fullPath = join(projectPath, dir.pattern);
          const resolved = resolve(fullPath);

          // Path validation
          if (!resolved.startsWith(resolvedProject)) {
            continue;
          }

          try {
            await access(resolved, constants.F_OK);
            const stats = await stat(resolved);

            if (stats.isDirectory()) {
              // Count files in directory with depth limit
              const fileCount = await this.countFilesInDirectory(resolved, 5);
              keyDirectories.push({
                path: dir.pattern,
                type: dir.type,
                fileCount,
              });
            }
          } catch {
            // Directory doesn't exist, skip it
            continue;
          }
        }

        return keyDirectories;
      } catch (error) {
        console.warn(
          "⚠️  Failed to map key directories:",
          error instanceof Error ? error.message : "Unknown error",
        );
        console.warn("   Blueprint may be incomplete");
        return [];
      }
    };

    if (
      !BlueprintAnalyzer ||
      typeof BlueprintAnalyzer.mapKeyDirectories !== "function"
    ) {
      return fallbackImplementation();
    }

    // Use CircuitBreaker to try Rust first, fall back to TypeScript
    return this.rustCircuitBreaker.execute(
      rustImplementation,
      fallbackImplementation,
    );
  }

  /**
   * Count files recursively in a directory (async with depth limit)
   * @param dirPath - Directory to count files in
   * @param maxDepth - Maximum recursion depth (default 5)
   * @param currentDepth - Current depth (for internal recursion tracking)
   */
  private async countFilesInDirectory(
    dirPath: string,
    maxDepth: number = 5,
    currentDepth: number = 0,
  ): Promise<number> {
    // Prevent infinite recursion
    if (currentDepth >= maxDepth) {
      return 0;
    }

    const { readdir } = await import("fs/promises");
    const { join } = await import("path");
    let count = 0;

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules and other common ignore patterns
          if (
            ![
              "node_modules",
              ".git",
              "dist",
              "build",
              ".next",
              "__pycache__",
              "venv",
            ].includes(entry.name)
          ) {
            count += await this.countFilesInDirectory(
              fullPath,
              maxDepth,
              currentDepth + 1,
            );
          }
        } else if (entry.isFile()) {
          count++;
        }
      }
    } catch {
      // Ignore errors for individual directories (permission issues, etc.)
    }

    return count;
  }

  /**
   * Clean up resources to prevent process hanging
   */
  cleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Clear caches
    this.fileAnalysisCache.clear();
    this.codebaseAnalysisCache.clear();
  }
}
