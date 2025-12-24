#!/usr/bin/env tsx
/**
 * Architectural Guardrails Verification Script
 *
 * This script enforces architectural constraints:
 * 1. CLI layer cannot import from core layer
 * 2. No fs.watch or file watching usage anywhere
 * 3. Service isolation is maintained
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

interface Violation {
  file: string;
  line: number;
  rule: string;
  message: string;
}

const violations: Violation[] = [];

/**
 * Recursively find all TypeScript files in a directory
 */
function findTypeScriptFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Skip node_modules, dist, and other build directories
      if (!["node_modules", "dist", "rust-core", ".git"].includes(file)) {
        findTypeScriptFiles(filePath, fileList);
      }
    } else if (file.endsWith(".ts") && !file.endsWith(".d.ts")) {
      fileList.push(filePath);
    }
  }

  return fileList;
}

/**
 * Check if CLI files import from core layer
 */
function checkCliImports(filePath: string, content: string): void {
  const relativePath = path.relative(projectRoot, filePath);

  // Only check files in src/cli directory
  if (!relativePath.startsWith("src" + path.sep + "cli")) {
    return;
  }

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for imports from core layer (except bootstrap and errors which are allowed entry points)
    const coreImportPattern = /import\s+.*\s+from\s+['"]\.\.\/core\//;
    if (
      coreImportPattern.test(line) &&
      !line.includes("bootstrap") &&
      !line.includes("errors")
    ) {
      violations.push({
        file: relativePath,
        line: i + 1,
        rule: "no-cli-core-imports",
        message:
          "CLI layer cannot import from core layer. Use DI container through bootstrap instead.",
      });
    }
  }
}

/**
 * Check for fs.watch usage anywhere in the codebase
 */
function checkFileWatchUsage(filePath: string, content: string): void {
  const relativePath = path.relative(projectRoot, filePath);

  // Skip the architectural guardrails test file itself since it needs to check for violations
  if (relativePath.includes("architectural-guardrails.test.ts")) {
    return;
  }

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for fs.watch
    if (
      line.includes("fs.watch") &&
      !line.trim().startsWith("//") &&
      !line.trim().startsWith("*")
    ) {
      violations.push({
        file: relativePath,
        line: i + 1,
        rule: "no-fs-watch",
        message:
          "fs.watch is not allowed. This violates the architectural constraint against file watchers.",
      });
    }

    // Check for fs.watchFile
    if (
      line.includes("fs.watchFile") &&
      !line.trim().startsWith("//") &&
      !line.trim().startsWith("*")
    ) {
      violations.push({
        file: relativePath,
        line: i + 1,
        rule: "no-fs-watchFile",
        message:
          "fs.watchFile is not allowed. This violates the architectural constraint against file watchers.",
      });
    }

    // Check for chokidar imports
    if (line.includes("from 'chokidar'") || line.includes('from "chokidar"')) {
      violations.push({
        file: relativePath,
        line: i + 1,
        rule: "no-chokidar",
        message:
          "chokidar is not allowed. This violates the architectural constraint against file watchers.",
      });
    }
  }
}

/**
 * Check for service isolation violations
 */
function checkServiceIsolation(filePath: string, content: string): void {
  const relativePath = path.relative(projectRoot, filePath);

  // Only check files in src/core/services directory
  if (
    !relativePath.startsWith("src" + path.sep + "core" + path.sep + "services")
  ) {
    return;
  }

  // Skip test files (both __tests__ directories and .test.ts files)
  if (relativePath.includes("__tests__") || relativePath.endsWith(".test.ts")) {
    return;
  }

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for direct service-to-service imports (except DiagnosticService which can read from others)
    const serviceImportPattern =
      /import\s+.*\s+from\s+['"]\.\/(?:Analysis|Learning|Search)Service/;
    if (
      serviceImportPattern.test(line) &&
      !relativePath.includes("DiagnosticService")
    ) {
      violations.push({
        file: relativePath,
        line: i + 1,
        rule: "no-service-coupling",
        message:
          "Services should not import each other directly. Use DI container for orchestration.",
      });
    }
  }
}

/**
 * Main verification function
 */
function verifyArchitecture(): void {
  console.log("🔍 Verifying architectural constraints...\n");

  const srcDir = path.join(projectRoot, "src");
  const files = findTypeScriptFiles(srcDir);

  console.log(`📁 Checking ${files.length} TypeScript files...\n`);

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");

    checkCliImports(file, content);
    checkFileWatchUsage(file, content);
    checkServiceIsolation(file, content);
  }

  if (violations.length === 0) {
    console.log("✅ All architectural constraints are satisfied!\n");
    process.exit(0);
  } else {
    console.error("❌ Architectural violations found:\n");

    for (const violation of violations) {
      console.error(`  ${violation.file}:${violation.line}`);
      console.error(`    [${violation.rule}] ${violation.message}\n`);
    }

    console.error(`\n❌ Total violations: ${violations.length}\n`);
    process.exit(1);
  }
}

// Run verification
verifyArchitecture();
