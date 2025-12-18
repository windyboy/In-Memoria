/**
 * Demonstration of idempotent learning behavior
 * 
 * This script shows how the LearningService implements idempotent learning:
 * 1. First run performs full learning
 * 2. Subsequent runs only update timestamps without duplicating data
 * 3. Force option allows full re-learning when needed
 */

import { LearningServiceImpl } from '../LearningService.js';
import { SQLiteDatabase } from '../../../storage/sqlite-db.js';
import { Logger } from '../../../utils/logger.js';

// Mock implementations for demonstration
class MockSemanticEngine {
  async analyzeCodebase(projectPath: string) {
    console.log(`[SemanticEngine] Analyzing codebase: ${projectPath}`);
    return {
      languages: ['typescript', 'javascript'],
      frameworks: ['node', 'express']
    };
  }

  async extractSemanticConcepts(projectPath: string, progressCallback?: Function) {
    console.log(`[SemanticEngine] Extracting concepts from: ${projectPath}`);
    if (progressCallback) {
      progressCallback(50, 100, 'Extracting concepts...');
      progressCallback(100, 100, 'Concepts extracted');
    }
    return [
      {
        id: 'concept-1',
        name: 'UserService',
        type: 'class',
        confidence: 0.9,
        filePath: `${projectPath}/src/services/UserService.ts`,
        lineRange: { start: 1, end: 50 },
        relationships: []
      },
      {
        id: 'concept-2',
        name: 'createUser',
        type: 'function',
        confidence: 0.8,
        filePath: `${projectPath}/src/services/UserService.ts`,
        lineRange: { start: 10, end: 25 },
        relationships: []
      }
    ];
  }
}

class MockPatternEngine {
  async extractPatterns(projectPath: string) {
    console.log(`[PatternEngine] Extracting patterns from: ${projectPath}`);
    return [
      {
        type: 'camelCase_function_naming',
        description: 'Functions use camelCase naming convention',
        frequency: 15
      },
      {
        type: 'service_pattern',
        description: 'Service classes follow dependency injection pattern',
        frequency: 8
      }
    ];
  }
}

class MockVectorStore {
  async initialize(collection: string) {
    console.log(`[VectorStore] Initializing collection: ${collection}`);
  }

  async storeCodeEmbedding(text: string, metadata: any) {
    console.log(`[VectorStore] Storing embedding for: ${metadata.id}`);
  }

  async close() {
    console.log(`[VectorStore] Closing connection`);
  }
}

async function demonstrateIdempotentLearning() {
  console.log('=== Idempotent Learning Demonstration ===\n');

  // Create service with mocks
  const database = new SQLiteDatabase(':memory:');
  const semanticEngine = new MockSemanticEngine() as any;
  const patternEngine = new MockPatternEngine() as any;

  const learningService = new LearningServiceImpl(
    semanticEngine,
    patternEngine,
    database
  );

  const projectPath = '/demo/project';

  // Progress callback to show progress integration
  const progressCallback = (current: number, total: number, message: string) => {
    const percentage = Math.round((current / total) * 100);
    console.log(`  Progress: ${percentage}% - ${message}`);
  };

  try {
    console.log('1. First learning run (full learning)');
    console.log('=====================================');
    const firstResult = await learningService.learnFromCodebase(projectPath, {
      progressCallback
    });
    
    console.log('\nFirst run result:');
    console.log(`  Success: ${firstResult.success}`);
    console.log(`  Concepts learned: ${firstResult.conceptsLearned}`);
    console.log(`  Patterns discovered: ${firstResult.patternsDiscovered}`);
    console.log(`  Duration: ${firstResult.duration}ms`);
    console.log(`  Errors: ${firstResult.errors.join(', ') || 'None'}`);

    // Check learning status
    const statusAfterFirst = await learningService.getLearningStatus(projectPath);
    console.log('\nLearning status after first run:');
    console.log(`  Is learned: ${statusAfterFirst.isLearned}`);
    console.log(`  Last learned: ${statusAfterFirst.lastLearned}`);
    console.log(`  Concept count: ${statusAfterFirst.conceptCount}`);
    console.log(`  Pattern count: ${statusAfterFirst.patternCount}`);

    console.log('\n\n2. Second learning run (idempotent update)');
    console.log('==========================================');
    const secondResult = await learningService.learnFromCodebase(projectPath, {
      progressCallback
    });
    
    console.log('\nSecond run result:');
    console.log(`  Success: ${secondResult.success}`);
    console.log(`  Concepts learned: ${secondResult.conceptsLearned}`);
    console.log(`  Patterns discovered: ${secondResult.patternsDiscovered}`);
    console.log(`  Duration: ${secondResult.duration}ms`);
    console.log(`  Errors: ${secondResult.errors.join(', ') || 'None'}`);

    // Check learning status after idempotent update
    const statusAfterSecond = await learningService.getLearningStatus(projectPath);
    console.log('\nLearning status after second run:');
    console.log(`  Is learned: ${statusAfterSecond.isLearned}`);
    console.log(`  Last learned: ${statusAfterSecond.lastLearned}`);
    console.log(`  Concept count: ${statusAfterSecond.conceptCount}`);
    console.log(`  Pattern count: ${statusAfterSecond.patternCount}`);

    console.log('\n\n3. Third learning run with force (full re-learning)');
    console.log('===================================================');
    const thirdResult = await learningService.learnFromCodebase(projectPath, {
      force: true,
      progressCallback
    });
    
    console.log('\nThird run result (with force):');
    console.log(`  Success: ${thirdResult.success}`);
    console.log(`  Concepts learned: ${thirdResult.conceptsLearned}`);
    console.log(`  Patterns discovered: ${thirdResult.patternsDiscovered}`);
    console.log(`  Duration: ${thirdResult.duration}ms`);
    console.log(`  Errors: ${thirdResult.errors.join(', ') || 'None'}`);

    console.log('\n=== Demonstration Complete ===');
    console.log('\nKey observations:');
    console.log('1. First run performs full learning with engine calls');
    console.log('2. Second run is idempotent - only updates timestamp');
    console.log('3. Third run with force performs full learning again');
    console.log('4. Progress callbacks work throughout all phases');
    console.log('5. Learning status accurately reflects the state');

  } catch (error) {
    console.error('Error during demonstration:', error);
  } finally {
    database.close();
  }
}

// Export for potential use in tests
export { demonstrateIdempotentLearning };

// Run demonstration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateIdempotentLearning().catch(console.error);
}