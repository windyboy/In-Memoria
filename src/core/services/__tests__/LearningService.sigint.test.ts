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

describe('LearningService SIGINT Handling', () => {
  let learningService: LearningServiceImpl;
  let mockDatabase: SQLiteDatabase;
  let mockVectorStore: VectorStore;
  let mockSemanticEngine: SemanticEngine;
  let mockPatternEngine: PatternEngine;
  let originalProcessOn: typeof process.on;
  let originalProcessRemoveListener: typeof process.removeListener;

  beforeEach(() => {
    // Store original process methods
    originalProcessOn = process.on;
    originalProcessRemoveListener = process.removeListener;

    // Mock process.on and process.removeListener
    process.on = vi.fn();
    process.removeListener = vi.fn();

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
    // Restore original process methods
    process.on = originalProcessOn;
    process.removeListener = originalProcessRemoveListener;
    
    mockDatabase.close();
  });

  it('should set up SIGINT handler during learning', async () => {
    const projectPath = process.cwd();
    
    await learningService.learnFromCodebase(projectPath);
    
    // Verify that SIGINT handler was registered
    expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
  });

  it('should remove SIGINT handler after learning completes', async () => {
    const projectPath = process.cwd();
    
    await learningService.learnFromCodebase(projectPath);
    
    // Verify that SIGINT handler was removed
    expect(process.removeListener).toHaveBeenCalledWith('SIGINT', expect.any(Function));
  });

  it('should provide learning status information', async () => {
    const projectPath = process.cwd();
    
    // Check status before learning
    const statusBefore = await learningService.getLearningStatus(projectPath);
    expect(statusBefore.isLearned).toBe(false);
    expect(statusBefore.conceptCount).toBe(0);
    expect(statusBefore.patternCount).toBe(0);
    
    // Perform learning
    await learningService.learnFromCodebase(projectPath);
    
    // Check status after learning
    const statusAfter = await learningService.getLearningStatus(projectPath);
    expect(statusAfter.isLearned).toBe(true);
    expect(statusAfter.conceptCount).toBeGreaterThan(0);
    expect(statusAfter.patternCount).toBeGreaterThan(0);
    expect(statusAfter.lastLearned).toBeInstanceOf(Date);
  });

  it('should handle progress callback integration', async () => {
    const projectPath = process.cwd();
    const progressCallback = vi.fn();
    
    await learningService.learnFromCodebase(projectPath, { 
      progressCallback,
      enableProgressController: true 
    });
    
    // Verify progress callback was called multiple times
    expect(progressCallback).toHaveBeenCalled();
    
    // Verify progress messages include phase information
    const calls = progressCallback.mock.calls;
    const messages = calls.map(call => call[2]);
    
    expect(messages.some(msg => msg.includes('Starting semantic analysis'))).toBe(true);
    expect(messages.some(msg => msg.includes('Starting pattern discovery'))).toBe(true);
    expect(messages.some(msg => msg.includes('Building vector index'))).toBe(true);
    expect(messages.some(msg => msg.includes('Storing project metadata'))).toBe(true);
  });
});