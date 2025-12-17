#!/usr/bin/env node

/**
 * Simple integration test for AnalysisService through DI Container
 * This verifies that task 2 (AnalysisService implementation) is working correctly
 */

import { initializeDIContainer, disposeDIContainer } from './src/core/bootstrap.js';
import { mkdtemp, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

async function testAnalysisServiceIntegration() {
  console.log('🧪 Testing AnalysisService integration...');
  
  let tempDir;
  let container;
  
  try {
    // Create a temporary test project
    tempDir = await mkdtemp(join(tmpdir(), 'test-analysis-'));
    console.log(`📁 Created test project at: ${tempDir}`);
    
    // Create some test files
    await mkdir(join(tempDir, 'src'), { recursive: true });
    await writeFile(join(tempDir, 'src', 'index.ts'), `
export class UserService {
  constructor(private database: Database) {}
  
  async getUser(id: string): Promise<User> {
    return this.database.findUser(id);
  }
}

export function validateEmail(email: string): boolean {
  return email.includes('@');
}
`);
    
    await writeFile(join(tempDir, 'package.json'), JSON.stringify({
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        'typescript': '^4.0.0'
      }
    }, null, 2));
    
    console.log('📝 Created test files');
    
    // Initialize DI Container
    console.log('🔧 Initializing DI Container...');
    container = await initializeDIContainer({ projectPath: tempDir });
    console.log('✅ DI Container initialized');
    
    // Test AnalysisService methods
    console.log('🔍 Testing AnalysisService.analyzeCodebase...');
    const analysis = await container.analysisService.analyzeCodebase(tempDir);
    console.log(`✅ Analysis completed: ${analysis.concepts.length} concepts, ${analysis.patterns.length} patterns`);
    console.log(`   Languages: ${analysis.languages.join(', ')}`);
    console.log(`   Complexity: ${analysis.complexity.lines} lines, cyclomatic: ${analysis.complexity.cyclomatic}`);
    
    console.log('📊 Testing AnalysisService.getLanguageMetrics...');
    const languageMetrics = await container.analysisService.getLanguageMetrics(tempDir);
    console.log(`✅ Language metrics: ${languageMetrics.totalFiles} files, primary: ${languageMetrics.primaryLanguage}`);
    
    console.log('🔧 Testing AnalysisService.getComplexityMetrics...');
    const complexityMetrics = await container.analysisService.getComplexityMetrics(tempDir);
    console.log(`✅ Complexity metrics: maintainability index: ${complexityMetrics.maintainabilityIndex}`);
    
    console.log('💡 Testing AnalysisService.extractConcepts...');
    const concepts = await container.analysisService.extractConcepts(tempDir);
    console.log(`✅ Extracted ${concepts.length} concepts from database`);
    
    // Verify read-only behavior
    console.log('🔒 Verifying read-only behavior...');
    // The service should not have any write methods
    const writeMethodNames = ['insertSemanticConcept', 'insertDeveloperPattern', 'storeSemanticConcepts'];
    for (const methodName of writeMethodNames) {
      if (typeof container.analysisService[methodName] === 'function') {
        throw new Error(`❌ AnalysisService should not have write method: ${methodName}`);
      }
    }
    console.log('✅ Read-only behavior verified');
    
    console.log('🎉 All AnalysisService integration tests passed!');
    
  } catch (error) {
    console.error('❌ Integration test failed:', error);
    process.exit(1);
  } finally {
    // Clean up
    if (container) {
      await disposeDIContainer();
      console.log('🧹 DI Container disposed');
    }
  }
}

// Run the test
testAnalysisServiceIntegration().catch(console.error);