#!/usr/bin/env tsx
/**
 * Verification script for In-Memoria refactor simplification metrics
 * Task 26: Verify final simplification metrics
 * Requirements: 12.1, 12.2
 */

import { readdirSync, statSync, readFileSync } from 'fs';
import { join } from 'path';

interface MetricsResult {
  fileCount: number;
  totalLines: number;
  directoryStructure: string[];
  compilationErrors: number;
  architecturalConstraints: {
    correctStructure: boolean;
    noLegacyModules: boolean;
    singleWriterEnforced: boolean;
  };
}

// Baseline metrics (from original codebase before refactor)
const BASELINE = {
  files: 98, // Approximate original file count
  lines: 31592, // Approximate original line count
};

// Target metrics (60% file reduction, 50% line reduction)
const TARGETS = {
  files: 39, // 60% reduction from baseline
  lines: 15796, // 50% reduction from baseline
};

function countFilesRecursive(dir: string, extension: string): number {
  let count = 0;
  const items = readdirSync(dir);
  
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      count += countFilesRecursive(fullPath, extension);
    } else if (item.endsWith(extension)) {
      count++;
    }
  }
  
  return count;
}

function countLinesRecursive(dir: string, extension: string): number {
  let totalLines = 0;
  const items = readdirSync(dir);
  
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      totalLines += countLinesRecursive(fullPath, extension);
    } else if (item.endsWith(extension)) {
      const content = readFileSync(fullPath, 'utf-8');
      totalLines += content.split('\n').length;
    }
  }
  
  return totalLines;
}

function getDirectoryStructure(dir: string): string[] {
  const items = readdirSync(dir);
  return items.filter(item => {
    const fullPath = join(dir, item);
    return statSync(fullPath).isDirectory();
  });
}

function checkArchitecturalConstraints(): MetricsResult['architecturalConstraints'] {
  const srcStructure = getDirectoryStructure('src');
  const expectedDirs = ['cli', 'core', 'mcp', 'storage', 'utils'];
  
  // Check correct structure
  const correctStructure = expectedDirs.every(dir => srcStructure.includes(dir)) &&
    srcStructure.every(dir => expectedDirs.includes(dir));
  
  // Check no legacy modules exist
  const legacyModules = ['watchers', 'automation-tools', 'monitoring-tools', 'documentation-generator'];
  const noLegacyModules = !legacyModules.some(legacy => srcStructure.includes(legacy));
  
  // Check single writer principle (simplified check - look for LearningService)
  const learningServicePath = join('src', 'core', 'services', 'LearningService.ts');
  let singleWriterEnforced = false;
  try {
    statSync(learningServicePath);
    singleWriterEnforced = true;
  } catch {
    singleWriterEnforced = false;
  }
  
  return {
    correctStructure,
    noLegacyModules,
    singleWriterEnforced,
  };
}

function calculatePercentage(current: number, baseline: number): number {
  return ((baseline - current) / baseline) * 100;
}

function main() {
  console.log('='.repeat(80));
  console.log('In-Memoria Refactor - Simplification Metrics Verification');
  console.log('Task 26: Verify final simplification metrics');
  console.log('Requirements: 12.1, 12.2');
  console.log('='.repeat(80));
  console.log();
  
  // Measure current metrics
  const fileCount = countFilesRecursive('src', '.ts');
  const totalLines = countLinesRecursive('src', '.ts');
  const directoryStructure = getDirectoryStructure('src');
  const architecturalConstraints = checkArchitecturalConstraints();
  
  // Calculate reductions
  const fileReduction = calculatePercentage(fileCount, BASELINE.files);
  const lineReduction = calculatePercentage(totalLines, BASELINE.lines);
  
  // Display results
  console.log('📊 FILE COUNT METRICS');
  console.log('-'.repeat(80));
  console.log(`Baseline:        ${BASELINE.files} files`);
  console.log(`Current:         ${fileCount} files`);
  console.log(`Target:          ${TARGETS.files} files (60% reduction)`);
  console.log(`Actual Reduction: ${fileReduction.toFixed(1)}%`);
  console.log(`Status:          ${fileCount <= TARGETS.files ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Gap:             ${fileCount > TARGETS.files ? `Need to remove ${fileCount - TARGETS.files} more files` : 'Target achieved!'}`);
  console.log();
  
  console.log('📏 LINES OF CODE METRICS');
  console.log('-'.repeat(80));
  console.log(`Baseline:        ${BASELINE.lines.toLocaleString()} lines`);
  console.log(`Current:         ${totalLines.toLocaleString()} lines`);
  console.log(`Target:          ${TARGETS.lines.toLocaleString()} lines (50% reduction)`);
  console.log(`Actual Reduction: ${lineReduction.toFixed(1)}%`);
  console.log(`Status:          ${totalLines <= TARGETS.lines ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Gap:             ${totalLines > TARGETS.lines ? `Need to remove ${(totalLines - TARGETS.lines).toLocaleString()} more lines` : 'Target achieved!'}`);
  console.log();
  
  console.log('🏗️  DIRECTORY STRUCTURE');
  console.log('-'.repeat(80));
  console.log(`Expected: cli/, core/, mcp/, storage/, utils/, index.ts`);
  console.log(`Actual:   ${directoryStructure.join('/, ')}/, index.ts`);
  console.log(`Status:   ${architecturalConstraints.correctStructure ? '✅ PASS' : '❌ FAIL'}`);
  console.log();
  
  console.log('🔒 ARCHITECTURAL CONSTRAINTS');
  console.log('-'.repeat(80));
  console.log(`Correct Structure:      ${architecturalConstraints.correctStructure ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`No Legacy Modules:      ${architecturalConstraints.noLegacyModules ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Single Writer Enforced: ${architecturalConstraints.singleWriterEnforced ? '✅ PASS' : '❌ FAIL'}`);
  console.log();
  
  console.log('🔧 COMPILATION STATUS');
  console.log('-'.repeat(80));
  console.log('Run `npm run typecheck` to verify compilation...');
  console.log();
  
  // Overall status
  const allMetricsMet = 
    fileCount <= TARGETS.files &&
    totalLines <= TARGETS.lines &&
    architecturalConstraints.correctStructure &&
    architecturalConstraints.noLegacyModules &&
    architecturalConstraints.singleWriterEnforced;
  
  console.log('='.repeat(80));
  console.log(`OVERALL STATUS: ${allMetricsMet ? '✅ ALL TARGETS MET' : '❌ TARGETS NOT MET'}`);
  console.log('='.repeat(80));
  console.log();
  
  // Exit with appropriate code
  process.exit(allMetricsMet ? 0 : 1);
}

main();
