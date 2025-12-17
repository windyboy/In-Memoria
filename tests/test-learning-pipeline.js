#!/usr/bin/env node

import { SemanticEngine } from '../dist/engines/semantic-engine.js';
import { PatternEngine } from '../dist/engines/pattern-engine.js';
import { SQLiteDatabase } from '../dist/storage/sqlite-db.js';
import { IntelligenceTools } from '../dist/mcp-server/tools/intelligence-tools.js';

async function testLearningPipeline() {
  console.log('🧠 Testing Enhanced Learning Pipeline...\n');
  
  try {
    // Initialize components
    const database = new SQLiteDatabase('./test-learning.db');
    const semanticEngine = new SemanticEngine();
    const patternEngine = new PatternEngine(database);
    const intelligenceTools = new IntelligenceTools(semanticEngine, patternEngine, database);
    
    console.log('✅ Initialized all components');
    
    // Test the comprehensive learning pipeline
    console.log('\n🚀 Running comprehensive learning pipeline...');
    const result = await intelligenceTools.learnCodebaseIntelligence({
      path: './src',
      force: true
    });
    
    console.log('\n📊 Learning Pipeline Results:');
    console.log(`   Success: ${result.success}`);
    console.log(`   Concepts learned: ${result.conceptsLearned}`);
    console.log(`   Patterns learned: ${result.patternsLearned}`);
    console.log(`   Time elapsed: ${result.timeElapsed}ms`);
    
    console.log('\n💡 Learning Insights:');
    result.insights.forEach(insight => {
      console.log(`   ${insight}`);
    });
    
    // Test without force (should use cached results)
    console.log('\n🔄 Testing cached learning (force: false)...');
    const cachedResult = await intelligenceTools.learnCodebaseIntelligence({
      path: './src',
      force: false
    });
    
    console.log('\n📊 Cached Results:');
    console.log(`   Success: ${cachedResult.success}`);
    console.log(`   Time elapsed: ${cachedResult.timeElapsed}ms`);
    console.log(`   Insights: ${cachedResult.insights.join(', ')}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack:', error.stack);
  }
}

testLearningPipeline();