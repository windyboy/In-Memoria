import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LearningServiceImpl } from '../LearningService.js';
import { SQLiteDatabase } from '../../../storage/sqlite-db.js';
import { VectorStore } from '../../../storage/vector-store.js';
import { SemanticEngine } from '../../../utils/semantic-engine.js';
import { PatternEngine } from '../../../utils/pattern-engine.js';
import { Logger } from '../../../utils/logger.js';

// Mock the logger to avoid console output during tests
vi.mock('../../../utils/logger.js', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('LearningService Idempotent Behavior', () => {
  let learningService: LearningServiceImpl;
  let mockDatabase: SQLiteDatabase;
  let mockVectorStore: VectorStore;
  let mockSemanticEngine: SemanticEngine;
  let mockPatternEngine: PatternEngine;

  beforeEach(() => {
    // Create mock database
    mockDatabase = new SQLiteDatabase(':memory:');
    
    // Create mock vector store
    mockVectorStore = {
      initialize: vi.fn().mockResolvedValue(undefined),
      storeCodeEmbedding: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined)
    } as any;

    // Create mock semantic engine
    mockSemanticEngine = {
      analyzeCodebase: vi.fn().mockResolvedValue({
        languages: ['typescript'],
        frameworks: ['node']
      }),
      extractSemanticConcepts: vi.fn().mockResolvedValue([
        {
          id: 'concept-1',
          name: 'TestFunction',
          type: 'function',
          confidence: 0.8,
          filePath: '/test/file.ts',
          lineRange: { start: 1, end: 10 },
          relationships: []
        }
      ])
    } as any;

    // Create mock pattern engine
    mockPatternEngine = {
      extractPatterns: vi.fn().mockResolvedValue([
        {
          type: 'camelCase_function_naming',
          description: 'Functions use camelCase naming',
          frequency: 5
        }
      ])
    } as any;

    learningService = new LearningServiceImpl(
      mockSemanticEngine,
      mockPatternEngine,
      mockDatabase
    );
  });

  afterEach(() => {
    mockDatabase.close();
  });

  it('should perform full learning on first run', async () => {
    const projectPath = process.cwd();
    
    const result = await learningService.learnFromCodebase(projectPath);
    
    expect(result.success).toBe(true);
    expect(result.conceptsLearned).toBeGreaterThan(0);
    expect(result.patternsDiscovered).toBeGreaterThan(0);
    expect(result.errors).not.toContain('Idempotent update: timestamp updated, no data duplication');
    
    // Verify that semantic engine and pattern engine were called
    expect(mockSemanticEngine.analyzeCodebase).toHaveBeenCalledWith(projectPath);
    expect(mockSemanticEngine.extractSemanticConcepts).toHaveBeenCalled();
    expect(mockPatternEngine.extractPatterns).toHaveBeenCalledWith(projectPath);
  });

  it('should perform idempotent update on subsequent runs without force', async () => {
    const projectPath = process.cwd();
    
    // First learning run
    const firstResult = await learningService.learnFromCodebase(projectPath);
    expect(firstResult.success).toBe(true);
    
    // Reset mocks to verify they're not called again
    vi.clearAllMocks();
    
    // Second learning run (should be idempotent)
    const secondResult = await learningService.learnFromCodebase(projectPath);
    
    expect(secondResult.success).toBe(true);
    expect(secondResult.errors).toContain('Idempotent update: timestamp updated, no data duplication');
    
    // Verify that engines were NOT called again (idempotent behavior)
    expect(mockSemanticEngine.analyzeCodebase).not.toHaveBeenCalled();
    expect(mockSemanticEngine.extractSemanticConcepts).not.toHaveBeenCalled();
    expect(mockPatternEngine.extractPatterns).not.toHaveBeenCalled();
    
    // Verify counts are preserved
    expect(secondResult.conceptsLearned).toBe(firstResult.conceptsLearned);
    expect(secondResult.patternsDiscovered).toBe(firstResult.patternsDiscovered);
  });

  it('should perform full learning when force option is used', async () => {
    const projectPath = process.cwd();
    
    // First learning run
    await learningService.learnFromCodebase(projectPath);
    
    // Reset mocks
    vi.clearAllMocks();
    
    // Second learning run with force option
    const result = await learningService.learnFromCodebase(projectPath, { force: true });
    
    expect(result.success).toBe(true);
    expect(result.errors).not.toContain('Idempotent update: timestamp updated, no data duplication');
    
    // Verify that engines were called again (force override)
    expect(mockSemanticEngine.analyzeCodebase).toHaveBeenCalledWith(projectPath);
    expect(mockSemanticEngine.extractSemanticConcepts).toHaveBeenCalled();
    expect(mockPatternEngine.extractPatterns).toHaveBeenCalledWith(projectPath);
  });

  it('should call progress callback during learning', async () => {
    const projectPath = process.cwd();
    const progressCallback = vi.fn();
    
    await learningService.learnFromCodebase(projectPath, { progressCallback });
    
    // Verify progress callback was called
    expect(progressCallback).toHaveBeenCalled();
    
    // Verify it was called with proper parameters
    const calls = progressCallback.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    
    // Check that calls have the expected structure (current, total, message)
    calls.forEach(call => {
      expect(call).toHaveLength(3);
      expect(typeof call[0]).toBe('number'); // current
      expect(typeof call[1]).toBe('number'); // total
      expect(typeof call[2]).toBe('string'); // message
    });
  });

  it('should update only timestamp for idempotent operations', async () => {
    const projectPath = process.cwd();
    
    // First learning run
    await learningService.learnFromCodebase(projectPath);
    
    // Get initial metadata
    const initialMetadata = mockDatabase.getProjectMetadata(projectPath);
    expect(initialMetadata).toBeTruthy();
    const initialTimestamp = initialMetadata!.lastFullScan;
    
    // Wait a bit to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Second learning run (idempotent)
    await learningService.learnFromCodebase(projectPath);
    
    // Get updated metadata
    const updatedMetadata = mockDatabase.getProjectMetadata(projectPath);
    expect(updatedMetadata).toBeTruthy();
    const updatedTimestamp = updatedMetadata!.lastFullScan;
    
    // Verify timestamp was updated
    expect(updatedTimestamp).not.toEqual(initialTimestamp);
    expect(updatedTimestamp!.getTime()).toBeGreaterThan(initialTimestamp!.getTime());
    
    // Verify other metadata fields remain the same
    expect(updatedMetadata!.projectPath).toBe(initialMetadata!.projectPath);
    expect(updatedMetadata!.languagesDetected).toEqual(initialMetadata!.languagesDetected);
    expect(updatedMetadata!.frameworkDetected).toEqual(initialMetadata!.frameworkDetected);
  });
});