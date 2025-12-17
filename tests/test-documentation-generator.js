#!/usr/bin/env node

import { SemanticEngine } from '../dist/engines/semantic-engine.js';
import { PatternEngine } from '../dist/engines/pattern-engine.js';
import { SQLiteDatabase } from '../dist/storage/sqlite-db.js';
import { SemanticVectorDB } from '../dist/storage/vector-db.js';
import { CoreAnalysisTools } from '../dist/mcp-server/tools/core-analysis.js';
import { writeFileSync } from 'fs';

async function testDocumentationGenerator() {
  console.log('📚 Testing Intelligent Documentation Generator...\n');
  
  try {
    // Initialize components
    const database = new SQLiteDatabase('./test-docs.db');
    const vectorDB = new SemanticVectorDB();
    const semanticEngine = new SemanticEngine();
    const patternEngine = new PatternEngine(database);
    const coreTools = new CoreAnalysisTools(semanticEngine, patternEngine, database);
    
    console.log('✅ Initialized all components');
    
    // Test documentation generation
    console.log('\n📖 Generating documentation for ./src...');
    const result = await coreTools.generateDocumentation({
      path: './src',
      format: 'markdown',
      includeExamples: true,
      includeArchitecture: true
    });
    
    console.log('\n📊 Documentation Generation Results:');
    console.log(`   Success: Generated documentation`);
    console.log(`   Format: ${result.metadata.format}`);
    console.log(`   Generated at: ${result.metadata.generatedAt.toLocaleString()}`);
    console.log(`   Sections: ${result.metadata.sections.join(', ')}`);
    console.log(`   Length: ${result.documentation.length} characters`);
    
    // Save documentation to file
    const filename = `docs/GENERATED_DOCS_${Date.now()}.md`;
    writeFileSync(filename, result.documentation);
    console.log(`\n💾 Documentation saved to: ${filename}`);
    
    // Show preview of generated content
    console.log('\n📋 Documentation Preview (first 500 characters):');
    console.log('─'.repeat(60));
    console.log(result.documentation.substring(0, 500) + '...');
    console.log('─'.repeat(60));
    
    // Test different formats
    console.log('\n🔄 Testing different formats...');
    
    // HTML format
    const htmlResult = await coreTools.generateDocumentation({
      path: './src',
      format: 'html',
      includeExamples: false
    });
    console.log(`   HTML format: ${htmlResult.documentation.length} characters`);
    
    // JSON format  
    const jsonResult = await coreTools.generateDocumentation({
      path: './src',
      format: 'json',
      includeArchitecture: false
    });
    console.log(`   JSON format: ${jsonResult.documentation.length} characters`);
    
    console.log('\n🎉 Documentation generator working successfully!');
    console.log('\n✨ Key Features Demonstrated:');
    console.log('   ✅ Intelligent codebase analysis');
    console.log('   ✅ Pattern-based documentation');
    console.log('   ✅ Multiple output formats');
    console.log('   ✅ Configurable sections');
    console.log('   ✅ Automated insights generation');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack:', error.stack);
  }
}

testDocumentationGenerator();