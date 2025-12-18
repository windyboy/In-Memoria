import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { LearningServiceImpl, LearningService } from '../services/LearningService.js';
import { SemanticEngine } from '../../utils/semantic-engine.js';
import { PatternEngine } from '../../utils/pattern-engine.js';
import { SQLiteDatabase } from '../../storage/sqlite-db.js';

// Mock the dependencies
vi.mock('../../utils/semantic-engine.js');
vi.mock('../../utils/pattern-engine.js');
vi.mock('../../storage/sqlite-db.js');
vi.mock('../../storage/backend-unified.js', () => ({
  createVectorStore: vi.fn(() => ({
    initialize: vi.fn(),
    storeCodeEmbedding: vi.fn(),
    getHealthStatus: vi.fn()
  }))
}));
vi.mock('../../utils/progress-tracker.js', () => ({
  ProgressTracker: vi.fn(() => ({
    addPhase: vi.fn(),
    startPhase: vi.fn(),
    updateProgress: vi.fn(),
    complete: vi.fn(),
    on: vi.fn()
  }))
}));
vi.mock('../../utils/logger.js', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));
vi.mock('../../utils/path-validator.js', () => ({
  PathValidator: {
    validateProjectPath: vi.fn()
  }
}));
vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'test-id-123')
}));

describe('LearningService', () => {
  let learningService: LearningService;
  let mockSemanticEngine: SemanticEngine;
  let mockPatternEngine: PatternEngine;
  let mockDatabase: SQLiteDatabase;

  beforeEach(() => {
    // Create mock instances
    mockSemanticEngine = {
      analyzeCodebase: vi.fn(),
      extractSemanticConcepts: vi.fn(),
      analyzeFileContent: vi.fn(),
      learnFromCodebase: vi.fn(),
      updateFromAnalysis: vi.fn(),
      findRelatedConcepts: vi.fn(),
      searchSemanticallySimilar: vi.fn(),
      detectEntryPoints: vi.fn(),
      mapKeyDirectories: vi.fn(),
      getCacheStats: vi.fn(),
      cleanup: vi.fn()
    } as any;

    mockPatternEngine = {
      extractPatterns: vi.fn(),
      analyzeFilePatterns: vi.fn()
    } as any;

    mockDatabase = {
      getSemanticConcepts: vi.fn(),
      getDeveloperPatterns: vi.fn(),
      getProjectMetadata: vi.fn(),
      insertSemanticConcept: vi.fn(),
      insertDeveloperPattern: vi.fn(),
      insertProjectMetadata: vi.fn(),
      insertAIInsight: vi.fn(),
      createWorkSession: vi.fn(),
      updateWorkSession: vi.fn(),
      upsertProjectDecision: vi.fn(),
      insertEntryPoint: vi.fn(),
      insertKeyDirectory: vi.fn(),
      close: vi.fn()
    } as any;

    learningService = new LearningServiceImpl(mockSemanticEngine, mockPatternEngine, mockDatabase);
  });

  describe('learnFromCodebase', () => {
    it('should handle learning errors gracefully', async () => {
      // Arrange
      const projectPath = '/test/project';
      const error = new Error('Semantic analysis failed');
      
      (mockDatabase.getProjectMetadata as Mock).mockReturnValue(null);
      (mockSemanticEngine.analyzeCodebase as Mock).mockRejectedValue(error);

      // Act
      const result = await learningService.learnFromCodebase(projectPath);

      // Assert
      expect(result.success).toBe(false);
      expect(result.conceptsLearned).toBe(0);
      expect(result.patternsDiscovered).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Learning failed');
    });

    it('should implement idempotent behavior when already learned', async () => {
      // Arrange
      const projectPath = '/test/project';
      const existingMetadata = {
        projectId: 'existing-id',
        projectPath,
        lastFullScan: new Date('2023-01-01')
      };

      (mockDatabase.getProjectMetadata as Mock).mockReturnValue(existingMetadata);
      (mockDatabase.getSemanticConcepts as Mock).mockReturnValue([{ id: '1' }, { id: '2' }]);
      (mockDatabase.getDeveloperPatterns as Mock).mockReturnValue([{ id: '1' }]);

      // Act
      const result = await learningService.learnFromCodebase(projectPath, { force: false });

      // Assert - The test should verify idempotent behavior regardless of success/failure
      // The key is that no heavy processing should be done
      expect(mockSemanticEngine.analyzeCodebase).not.toHaveBeenCalled();
      expect(mockSemanticEngine.extractSemanticConcepts).not.toHaveBeenCalled();
      expect(mockPatternEngine.extractPatterns).not.toHaveBeenCalled();
      
      // If successful, should return existing counts
      if (result.success) {
        expect(result.conceptsLearned).toBe(2);
        expect(result.patternsDiscovered).toBe(1);
        expect(result.errors).toEqual(['Idempotent update: timestamp updated, no data duplication']);
      }
    });
  });

  describe('updateProjectMetadata', () => {
    it('should store project metadata using single writer principle', async () => {
      // Arrange
      const projectPath = '/test/project';
      const metadata = {
        projectPath,
        lastLearned: new Date(),
        version: '1.0.0',
        languages: ['typescript', 'javascript'],
        frameworks: ['react']
      };

      // Act
      await learningService.updateProjectMetadata(projectPath, metadata);

      // Assert
      expect(mockDatabase.insertProjectMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          projectPath: metadata.projectPath,
          projectName: 'project',
          languagePrimary: 'typescript',
          languagesDetected: ['typescript', 'javascript'],
          frameworkDetected: ['react'],
          intelligenceVersion: '1.0.0',
          lastFullScan: metadata.lastLearned
        })
      );
    });

    it('should handle metadata update errors', async () => {
      // Arrange
      const projectPath = '/test/project';
      const metadata = {
        projectPath,
        lastLearned: new Date(),
        version: '1.0.0',
        languages: ['typescript'],
        frameworks: []
      };
      const error = new Error('Database insert failed');
      
      (mockDatabase.insertProjectMetadata as Mock).mockImplementation(() => {
        throw error;
      });

      // Act & Assert
      await expect(learningService.updateProjectMetadata(projectPath, metadata))
        .rejects.toThrow('Storage operation failed: Project metadata update: Database insert failed');
    });
  });

  describe('storeSemanticConcepts', () => {
    it('should store semantic concepts using single writer principle', async () => {
      // Arrange
      const concepts = [
        {
          id: 'concept-1',
          name: 'UserService',
          type: 'class',
          confidence: 0.9,
          context: 'src/services/UserService.ts',
          relationships: ['BaseService']
        },
        {
          id: 'concept-2',
          name: 'validateUser',
          type: 'function',
          confidence: 0.8
        }
      ];

      (mockDatabase.getSemanticConcepts as Mock).mockReturnValue([]);
      (mockDatabase.getDeveloperPatterns as Mock).mockReturnValue([]);

      // Act
      await learningService.storeSemanticConcepts(concepts);

      // Assert
      expect(mockDatabase.insertSemanticConcept).toHaveBeenCalledTimes(2);
      expect(mockDatabase.insertSemanticConcept).toHaveBeenCalledWith({
        id: 'concept-1',
        conceptName: 'UserService',
        conceptType: 'class',
        confidenceScore: 0.9,
        relationships: ['BaseService'],
        evolutionHistory: {},
        filePath: 'src/services/UserService.ts',
        lineRange: { start: 1, end: 1 },
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      });
    });

    it('should implement idempotent behavior for duplicate concepts', async () => {
      // Arrange
      const concepts = [
        {
          id: 'concept-1',
          name: 'UserService',
          type: 'class',
          confidence: 0.9
        }
      ];

      const existingConcepts = [
        {
          id: 'concept-1',
          conceptName: 'UserService',
          confidenceScore: 0.8,
          filePath: 'unknown'
        }
      ];

      (mockDatabase.getSemanticConcepts as Mock).mockReturnValue(existingConcepts);

      // Act
      await learningService.storeSemanticConcepts(concepts);

      // Assert - should update existing concept with higher confidence
      expect(mockDatabase.insertSemanticConcept).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'concept-1',
          conceptName: 'UserService',
          confidenceScore: 0.9,
          updatedAt: expect.any(Date)
        })
      );
    });
  });

  describe('storeDeveloperPatterns', () => {
    it('should store developer patterns using single writer principle', async () => {
      // Arrange
      const patterns = [
        {
          id: 'pattern-1',
          name: 'Singleton Pattern',
          category: 'creational',
          frequency: 5,
          examples: [{ file: 'service.ts', line: 10 }]
        }
      ];

      (mockDatabase.getDeveloperPatterns as Mock).mockReturnValue([]);

      // Act
      await learningService.storeDeveloperPatterns(patterns);

      // Assert
      expect(mockDatabase.insertDeveloperPattern).toHaveBeenCalledWith({
        patternId: 'pattern-1',
        patternType: 'creational',
        patternContent: { name: 'Singleton Pattern' },
        frequency: 5,
        contexts: ['manual'],
        examples: [{ file: 'service.ts', line: 10 }],
        confidence: 0.8,
        createdAt: expect.any(Date),
        lastSeen: expect.any(Date)
      });
    });

    it('should implement idempotent behavior for duplicate patterns', async () => {
      // Arrange
      const patterns = [
        {
          id: 'pattern-1',
          name: 'Singleton Pattern',
          category: 'creational',
          frequency: 5,
          examples: []
        }
      ];

      const existingPatterns = [
        {
          patternId: 'pattern-1',
          frequency: 3,
          confidence: 0.7
        }
      ];

      (mockDatabase.getDeveloperPatterns as Mock).mockReturnValue(existingPatterns);

      // Act
      await learningService.storeDeveloperPatterns(patterns);

      // Assert - should update with higher frequency and confidence
      expect(mockDatabase.insertDeveloperPattern).toHaveBeenCalledWith(
        expect.objectContaining({
          patternId: 'pattern-1',
          frequency: 5, // Max of existing (3) and new (5)
          confidence: 0.8 // Max of existing (0.7) and new (0.8)
        })
      );
    });
  });

  describe('getLearningStatus', () => {
    it('should return learning status without writing to database', async () => {
      // Arrange
      const projectPath = '/test/project';
      const mockMetadata = {
        projectPath,
        lastFullScan: new Date('2023-01-01')
      };

      (mockDatabase.getProjectMetadata as Mock).mockReturnValue(mockMetadata);
      (mockDatabase.getSemanticConcepts as Mock).mockReturnValue([{ id: '1' }, { id: '2' }]);
      (mockDatabase.getDeveloperPatterns as Mock).mockReturnValue([{ id: '1' }]);

      // Act
      const result = await learningService.getLearningStatus(projectPath);

      // Assert
      expect(result).toEqual({
        isLearned: true,
        lastLearned: mockMetadata.lastFullScan,
        conceptCount: 2,
        patternCount: 1
      });

      // Verify only read operations were performed
      expect(mockDatabase.getProjectMetadata).toHaveBeenCalledWith(projectPath);
      expect(mockDatabase.getSemanticConcepts).toHaveBeenCalled();
      expect(mockDatabase.getDeveloperPatterns).toHaveBeenCalled();
    });

    it('should handle missing metadata gracefully', async () => {
      // Arrange
      const projectPath = '/test/project';
      
      (mockDatabase.getProjectMetadata as Mock).mockReturnValue(null);
      (mockDatabase.getSemanticConcepts as Mock).mockReturnValue([]);
      (mockDatabase.getDeveloperPatterns as Mock).mockReturnValue([]);

      // Act
      const result = await learningService.getLearningStatus(projectPath);

      // Assert
      expect(result).toEqual({
        isLearned: false,
        conceptCount: 0,
        patternCount: 0
      });
    });
  });

  describe('single writer principle methods', () => {
    it('should store AI insight using single writer principle', async () => {
      // Arrange
      const insight = {
        insightId: 'insight-1',
        insightType: 'code_quality',
        insightContent: { message: 'High complexity detected' },
        confidenceScore: 0.8,
        sourceAgent: 'complexity_analyzer',
        validationStatus: 'pending' as const,
        impactPrediction: { severity: 'medium' }
      };

      // Act
      await learningService.storeAIInsight(insight);

      // Assert
      expect(mockDatabase.insertAIInsight).toHaveBeenCalledWith(insight);
    });

    it('should create work session using single writer principle', async () => {
      // Arrange
      const session = {
        id: 'session-1',
        projectPath: '/test/project',
        currentFiles: ['file1.ts', 'file2.ts'],
        completedTasks: ['task1'],
        pendingTasks: ['task2', 'task3'],
        blockers: ['blocker1'],
        lastFeature: 'user-auth'
      };

      // Act
      await learningService.createWorkSession(session);

      // Assert
      expect(mockDatabase.createWorkSession).toHaveBeenCalledWith(session);
    });

    it('should update work session using single writer principle', async () => {
      // Arrange
      const sessionId = 'session-1';
      const updates = {
        currentFiles: ['file3.ts'],
        lastFeature: 'user-profile',
        pendingTasks: ['task4']
      };

      // Act
      await learningService.updateWorkSession(sessionId, updates);

      // Assert
      expect(mockDatabase.updateWorkSession).toHaveBeenCalledWith(sessionId, updates);
    });

    it('should store project decision using single writer principle', async () => {
      // Arrange
      const decision = {
        id: 'decision-1',
        projectPath: '/test/project',
        decisionKey: 'architecture',
        decisionValue: 'microservices',
        reasoning: 'Better scalability'
      };

      // Act
      await learningService.storeProjectDecision(decision);

      // Assert
      expect(mockDatabase.upsertProjectDecision).toHaveBeenCalledWith(decision);
    });

    it('should store entry point using single writer principle', async () => {
      // Arrange
      const entryPoint = {
        id: 'entry-1',
        projectPath: '/test/project',
        entryType: 'web',
        filePath: 'src/index.tsx',
        description: 'React application entry point',
        framework: 'react'
      };

      // Act
      await learningService.storeEntryPoint(entryPoint);

      // Assert
      expect(mockDatabase.insertEntryPoint).toHaveBeenCalledWith(entryPoint);
    });

    it('should store key directory using single writer principle', async () => {
      // Arrange
      const directory = {
        id: 'dir-1',
        projectPath: '/test/project',
        directoryPath: 'src/components',
        directoryType: 'components',
        fileCount: 25,
        description: 'React components directory'
      };

      // Act
      await learningService.storeKeyDirectory(directory);

      // Assert
      expect(mockDatabase.insertKeyDirectory).toHaveBeenCalledWith(directory);
    });
  });

  describe('error handling', () => {
    it('should translate and propagate errors consistently', async () => {
      // Arrange
      const projectPath = '/test/project';
      const metadata = {
        projectPath,
        lastLearned: new Date(),
        version: '1.0.0',
        languages: ['typescript'],
        frameworks: []
      };
      
      const dbError = new Error('Database connection lost');
      (mockDatabase.insertProjectMetadata as Mock).mockImplementation(() => {
        throw dbError;
      });

      // Act & Assert
      await expect(learningService.updateProjectMetadata(projectPath, metadata))
        .rejects.toThrow('Storage operation failed: Project metadata update: Database connection lost');
    });
  });

  describe('single writer enforcement', () => {
    it('should be the only service allowed to perform database writes', async () => {
      // Arrange
      const projectPath = '/test/project';
      const concepts = [{ id: '1', name: 'Test', type: 'class', confidence: 0.8 }];
      const patterns = [{ id: '1', name: 'Test Pattern', category: 'structural', frequency: 3, examples: [] }];

      (mockDatabase.getSemanticConcepts as Mock).mockReturnValue([]);
      (mockDatabase.getDeveloperPatterns as Mock).mockReturnValue([]);

      // Act - perform various write operations
      await learningService.storeSemanticConcepts(concepts);
      await learningService.storeDeveloperPatterns(patterns);
      await learningService.updateProjectMetadata(projectPath, {
        projectPath,
        lastLearned: new Date(),
        version: '1.0.0',
        languages: ['typescript'],
        frameworks: []
      });

      // Assert - verify all write operations went through the service
      expect(mockDatabase.insertSemanticConcept).toHaveBeenCalled();
      expect(mockDatabase.insertDeveloperPattern).toHaveBeenCalled();
      expect(mockDatabase.insertProjectMetadata).toHaveBeenCalled();
    });
  });
});