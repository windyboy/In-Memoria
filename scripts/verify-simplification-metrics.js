#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

function countFilesAndLines(dir, extensions = ['.ts', '.js']) {
  let files = 0;
  let lines = 0;

  function traverse(currentDir) {
    const items = readdirSync(currentDir);
    
    for (const item of items) {
      const fullPath = join(currentDir, item);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        traverse(fullPath);
      } else if (stat.isFile() && extensions.includes(extname(item))) {
        files++;
        const content = readFileSync(fullPath, 'utf-8');
        lines += content.split('\n').length;
      }
    }
  }

  traverse(dir);
  return { files, lines };
}

function getDirectories(dir) {
  try {
    return readdirSync(dir).filter(item => {
      const fullPath = join(dir, item);
      return statSync(fullPath).isDirectory();
    });
  } catch {
    return [];
  }
}

function analyzeDependencies() {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'));
  
  return {
    production: Object.keys(packageJson.dependencies || {}).length,
    development: Object.keys(packageJson.devDependencies || {}).length,
    optional: Object.keys(packageJson.optionalDependencies || {}).length
  };
}

function main() {
  console.log('🔍 Verifying Code Simplification Metrics\n');

  // Measure current metrics
  const srcMetrics = countFilesAndLines('src');
  const srcDirectories = getDirectories('src');
  const dependencies = analyzeDependencies();

  const currentMetrics = {
    fileCount: srcMetrics.files,
    linesOfCode: srcMetrics.lines,
    directories: srcDirectories,
    dependencies
  };

  console.log('📊 Current Metrics:');
  console.log(`   Files in src/: ${currentMetrics.fileCount}`);
  console.log(`   Lines of code: ${currentMetrics.linesOfCode}`);
  console.log(`   Directories in src/: ${currentMetrics.directories.join(', ')}`);
  console.log(`   Dependencies: ${currentMetrics.dependencies.production} prod, ${currentMetrics.dependencies.development} dev, ${currentMetrics.dependencies.optional} optional\n`);

  // Define target requirements from the spec
  const targetDirectories = ['core', 'storage', 'mcp', 'cli', 'utils'];
  const requiredFiles = ['index.ts'];

  // Baseline metrics (these would be from before the refactor)
  // For now, we'll use the current metrics as baseline since we're in the middle of the refactor
  const baselineFileCount = 98; // From our earlier measurement
  const baselineLinesOfCode = 31592; // From our earlier measurement

  console.log('🎯 Target Requirements:');
  console.log(`   File count reduction: ≥60% (target: ≤${Math.floor(baselineFileCount * 0.4)} files)`);
  console.log(`   Lines of code reduction: ≥50% (target: ≤${Math.floor(baselineLinesOfCode * 0.5)} lines)`);
  console.log(`   Required directories: ${targetDirectories.join(', ')}`);
  console.log(`   Required files: ${requiredFiles.join(', ')}\n`);

  // Verify metrics
  let passed = true;
  const results = [];

  // Check file count reduction
  const fileReduction = ((baselineFileCount - currentMetrics.fileCount) / baselineFileCount) * 100;
  const fileTarget = Math.floor(baselineFileCount * 0.4);
  if (currentMetrics.fileCount <= fileTarget) {
    results.push(`✅ File count: ${currentMetrics.fileCount} files (${fileReduction.toFixed(1)}% reduction)`);
  } else {
    results.push(`❌ File count: ${currentMetrics.fileCount} files (${fileReduction.toFixed(1)}% reduction, need ≥60%)`);
    passed = false;
  }

  // Check lines of code reduction
  const linesReduction = ((baselineLinesOfCode - currentMetrics.linesOfCode) / baselineLinesOfCode) * 100;
  const linesTarget = Math.floor(baselineLinesOfCode * 0.5);
  if (currentMetrics.linesOfCode <= linesTarget) {
    results.push(`✅ Lines of code: ${currentMetrics.linesOfCode} lines (${linesReduction.toFixed(1)}% reduction)`);
  } else {
    results.push(`❌ Lines of code: ${currentMetrics.linesOfCode} lines (${linesReduction.toFixed(1)}% reduction, need ≥50%)`);
    passed = false;
  }

  // Check directory structure
  const extraDirectories = currentMetrics.directories.filter(dir => !targetDirectories.includes(dir));
  const missingDirectories = targetDirectories.filter(dir => !currentMetrics.directories.includes(dir));

  if (extraDirectories.length === 0 && missingDirectories.length === 0) {
    results.push(`✅ Directory structure: ${currentMetrics.directories.join(', ')}`);
  } else {
    if (extraDirectories.length > 0) {
      results.push(`❌ Extra directories: ${extraDirectories.join(', ')}`);
      passed = false;
    }
    if (missingDirectories.length > 0) {
      results.push(`❌ Missing directories: ${missingDirectories.join(', ')}`);
      passed = false;
    }
  }

  // Check for essential dependencies (this is subjective, but we'll flag if there are too many)
  const totalDeps = currentMetrics.dependencies.production + currentMetrics.dependencies.development;
  if (totalDeps <= 20) { // Reasonable threshold for essential packages
    results.push(`✅ Dependencies: ${totalDeps} total (${currentMetrics.dependencies.production} prod, ${currentMetrics.dependencies.development} dev)`);
  } else {
    results.push(`⚠️  Dependencies: ${totalDeps} total (consider minimizing to essential packages only)`);
  }

  console.log('📋 Verification Results:');
  results.forEach(result => console.log(`   ${result}`));

  console.log(`\n${passed ? '🎉 All metrics passed!' : '❌ Some metrics need improvement'}`);

  if (!passed) {
    console.log('\n💡 Recommendations:');
    if (currentMetrics.fileCount > fileTarget) {
      console.log('   - Remove or consolidate more files to reach 60% reduction target');
    }
    if (currentMetrics.linesOfCode > linesTarget) {
      console.log('   - Simplify code further to reach 50% lines reduction target');
    }
    if (extraDirectories.length > 0) {
      console.log(`   - Remove directories: ${extraDirectories.join(', ')}`);
    }
  }

  process.exit(passed ? 0 : 1);
}

main();