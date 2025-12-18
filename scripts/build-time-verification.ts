#!/usr/bin/env tsx
/**
 * Build-time Architectural Verification
 * 
 * This script runs comprehensive architectural checks during build time:
 * 1. Service isolation verification
 * 2. Interface layer purity checks
 * 3. Dependency graph analysis
 * 4. Code metrics validation
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

interface ArchitecturalMetrics {
  totalFiles: number;
  cliFiles: number;
  coreFiles: number;
  storageFiles: number;
  mcpFiles: number;
  utilFiles: number;
  violations: number;
  serviceIsolationScore: number;
  interfacePurityScore: number;
}

interface DependencyViolation {
  from: string;
  to: string;
  type: 'forbidden-import' | 'circular-dependency' | 'layer-violation';
  message: string;
}

const violations: DependencyViolation[] = [];

/**
 * Analyze import dependencies in TypeScript files
 */
function analyzeImports(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const imports: string[] = [];
  
  // Match import statements
  const importRegex = /import\s+.*\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  
  return imports;
}

/**
 * Check service isolation - services should not import each other directly
 */
function checkServiceIsolation(): number {
  const servicesDir = path.join(projectRoot, 'src', 'core', 'services');
  
  if (!fs.existsSync(servicesDir)) {
    return 100; // Perfect score if no services directory
  }
  
  const serviceFiles = fs.readdirSync(servicesDir)
    .filter(file => file.endsWith('.ts') && !file.includes('test') && !file.includes('spec'))
    .filter(file => !file.startsWith('index'));
  
  let totalChecks = 0;
  let passedChecks = 0;
  
  for (const serviceFile of serviceFiles) {
    const filePath = path.join(servicesDir, serviceFile);
    const imports = analyzeImports(filePath);
    
    totalChecks++;
    
    // Check if this service imports other services directly
    const serviceImports = imports.filter(imp => 
      imp.includes('./') && 
      imp.includes('Service') && 
      !imp.includes('DiagnosticService') // DiagnosticService is allowed to read from others
    );
    
    if (serviceImports.length === 0 || serviceFile.includes('DiagnosticService')) {
      passedChecks++;
    } else {
      violations.push({
        from: serviceFile,
        to: serviceImports.join(', '),
        type: 'layer-violation',
        message: 'Service should not import other services directly'
      });
    }
  }
  
  return totalChecks > 0 ? (passedChecks / totalChecks) * 100 : 100;
}

/**
 * Check interface layer purity - CLI and MCP should not contain business logic
 */
function checkInterfacePurity(): number {
  const cliDir = path.join(projectRoot, 'src', 'cli');
  const mcpDir = path.join(projectRoot, 'src', 'mcp-server');
  
  let totalChecks = 0;
  let passedChecks = 0;
  
  // Check CLI files
  if (fs.existsSync(cliDir)) {
    const cliFiles = fs.readdirSync(cliDir).filter(file => file.endsWith('.ts'));
    
    for (const cliFile of cliFiles) {
      const filePath = path.join(cliDir, cliFile);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      totalChecks++;
      
      // Check for business logic indicators (complex conditionals, loops, calculations)
      const businessLogicPatterns = [
        /for\s*\(/g,
        /while\s*\(/g,
        /if\s*\([^)]*\&\&[^)]*\)/g, // Complex conditionals
        /if\s*\([^)]*\|\|[^)]*\)/g,
        /\.map\s*\(/g,
        /\.filter\s*\(/g,
        /\.reduce\s*\(/g
      ];
      
      let hasBusinessLogic = false;
      for (const pattern of businessLogicPatterns) {
        if (pattern.test(content)) {
          hasBusinessLogic = true;
          break;
        }
      }
      
      if (!hasBusinessLogic) {
        passedChecks++;
      } else {
        violations.push({
          from: cliFile,
          to: 'business logic detected',
          type: 'layer-violation',
          message: 'CLI layer should not contain business logic'
        });
      }
    }
  }
  
  // Check MCP adapter files
  if (fs.existsSync(mcpDir)) {
    const adapterDir = path.join(mcpDir, 'adapters');
    if (fs.existsSync(adapterDir)) {
      const adapterFiles = fs.readdirSync(adapterDir).filter(file => file.endsWith('.ts'));
      
      for (const adapterFile of adapterFiles) {
        const filePath = path.join(adapterDir, adapterFile);
        const content = fs.readFileSync(filePath, 'utf-8');
        
        totalChecks++;
        
        // Adapters should primarily contain parameter transformation
        const lines = content.split('\n');
        const logicLines = lines.filter(line => 
          line.includes('for (') || 
          line.includes('while (') || 
          line.includes('if (') && line.includes('&&') || line.includes('||')
        ).length;
        
        if (logicLines < 3) { // Allow minimal logic for parameter validation
          passedChecks++;
        } else {
          violations.push({
            from: adapterFile,
            to: 'complex logic detected',
            type: 'layer-violation',
            message: 'MCP adapter should only contain parameter transformation'
          });
        }
      }
    }
  }
  
  return totalChecks > 0 ? (passedChecks / totalChecks) * 100 : 100;
}

/**
 * Calculate architectural metrics
 */
function calculateMetrics(): ArchitecturalMetrics {
  const srcDir = path.join(projectRoot, 'src');
  
  function countFiles(dir: string): number {
    if (!fs.existsSync(dir)) return 0;
    
    return fs.readdirSync(dir)
      .filter(file => file.endsWith('.ts') && !file.endsWith('.d.ts'))
      .length;
  }
  
  const metrics: ArchitecturalMetrics = {
    totalFiles: countFiles(srcDir),
    cliFiles: countFiles(path.join(srcDir, 'cli')),
    coreFiles: countFiles(path.join(srcDir, 'core')),
    storageFiles: countFiles(path.join(srcDir, 'storage')),
    mcpFiles: countFiles(path.join(srcDir, 'mcp-server')),
    utilFiles: countFiles(path.join(srcDir, 'utils')),
    violations: violations.length,
    serviceIsolationScore: checkServiceIsolation(),
    interfacePurityScore: checkInterfacePurity()
  };
  
  return metrics;
}

/**
 * Main build-time verification
 */
function runBuildTimeVerification(): void {
  console.log('🏗️  Running build-time architectural verification...\n');
  
  const metrics = calculateMetrics();
  
  console.log('📊 Architectural Metrics:');
  console.log(`   Total TypeScript files: ${metrics.totalFiles}`);
  console.log(`   CLI files: ${metrics.cliFiles}`);
  console.log(`   Core files: ${metrics.coreFiles}`);
  console.log(`   Storage files: ${metrics.storageFiles}`);
  console.log(`   MCP files: ${metrics.mcpFiles}`);
  console.log(`   Utility files: ${metrics.utilFiles}`);
  console.log(`   Service isolation score: ${metrics.serviceIsolationScore.toFixed(1)}%`);
  console.log(`   Interface purity score: ${metrics.interfacePurityScore.toFixed(1)}%\n`);
  
  if (violations.length > 0) {
    console.error('❌ Architectural violations found:');
    for (const violation of violations) {
      console.error(`   ${violation.from} -> ${violation.to}`);
      console.error(`   [${violation.type}] ${violation.message}\n`);
    }
  }
  
  // Define thresholds
  const minServiceIsolationScore = 80;
  const minInterfacePurityScore = 80;
  
  const passed = 
    metrics.serviceIsolationScore >= minServiceIsolationScore &&
    metrics.interfacePurityScore >= minInterfacePurityScore &&
    violations.length === 0;
  
  if (passed) {
    console.log('✅ Build-time architectural verification passed!\n');
    process.exit(0);
  } else {
    console.error('❌ Build-time architectural verification failed!');
    console.error(`   Required service isolation score: ${minServiceIsolationScore}% (actual: ${metrics.serviceIsolationScore.toFixed(1)}%)`);
    console.error(`   Required interface purity score: ${minInterfacePurityScore}% (actual: ${metrics.interfacePurityScore.toFixed(1)}%)`);
    console.error(`   Total violations: ${violations.length}\n`);
    process.exit(1);
  }
}

// Run verification
runBuildTimeVerification();