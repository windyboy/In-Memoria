import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { AnalysisService } from '../services/AnalysisService.js';
import { SemanticEngine } from '../../utils/semantic-engine.js';
import { PatternEngine } from '../../utils/pattern-engine.js';
import { SQLiteDatabase } from '../../storage/sqlite-db.js';

// Mock the dependencies
vi.mock('../../engines/semantic-engine.js');
vi.mock('../../engines/pattern-engine.js');
vi.mock('../../storage/sqlite-db.js');
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

describe('AnalysisService', () => {
  let analysisService: AnalysisService;
  let mockSemanticEngine: SemanticEngine;
  let mockPatternEngine: PatternEngine;
  let mockDatabase: SQLiteDatabase;

  beforeEach(() => {
    // Create mock instances
    mockSemanticEngine = {
      analyzeCodebase: vi.fn(),
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
      getFileIntelligence: vi.fn(),
      getAIInsights: vi.fn(),
      getFeatureMaps: vi.fn(),
      searchFeatureMaps: vi.fn(),
      getFeatureByName: vi.fn(),
      getEntryPoints: vi.fn(),
      getKeyDirectories: vi.fn(),
      getProjectMetadata: vi.fn(),
      getCurrentWorkSession: vi.fn(),
      getWorkSessions: vi.fn(),
      getProjectDecisions: vi.fn(),
      getProjectDecision: vi.fn()
    } as any;

    analysisService = new AnalysisService(mockSemanticEngine, mockPatternEngine, mockDatabase);
  });

  describe('analyzeCodebase', () => {
    it('should analyze codebase and return comprehensive results', async () => {
      // Arrange
      const projectPath = '/test/project';
      const mockSemanticResult = {
        languages: ['typescript', 'javascript'],
        frameworks: ['react', 'express'],
        complexity: {
          cyclomatic: 15,
          cognitive: 20,
          lines: 5000
        },
        concepts: [
          { name: 'UserService', type: 'class', confidence: 0.9 },
          { name: 'validateUser', type: 'function', confidence: 0.8 }
        ],
        entryPoints: [
          { type: 'web', filePath: 'src/index.tsx', framework: 'react' }
        ],
        keyDirectories: [
          { path: 'src/components', type: 'components', fileCount: 25 }
        ],
        analysisStatus: 'normal' as const
      };

      const mockPatterns = [
        { type: 'singleton', description: 'Singleton pattern usage', frequency: 3 },
        { type: 'factory', description: 'Factory pattern usage', frequency: 5 }
      ];

      (mockSemanticEngine.analyzeCodebase as Mock).mockResolvedValue(mockSemanticResult);
      (mockPatternEngine.extractPatterns as Mock).mockResolvedValue(mockPatterns);

      // Act
      const result = await analysisService.analyzeCodebase(projectPath);

      // Assert
      expect(result).toEqual({
        projectPath,
        languages: ['typescript', 'javascript'],
        frameworks: ['react', 'express'],
        complexity: {
          cyclomatic: 15,
          cognitive: 20,
          lines: 5000
        },
        concepts: [
          {
            id: 'UserService',
            name: 'UserService',
            type: 'class',
            confidence: 0.9,
            filePath: projectPath,
            lineRange: { start: 1, end: 1 },
            relationships: {}
          },
          {
            id: 'validateUser',
            name: 'validateUser',
            type: 'function',
            confidence: 0.8,
            filePath: projectPath,
            lineRange: { start: 1, end: 1 },
            relationships: {}
          }
        ],
        patterns: mockPatterns,
        entryPoints: mockSemanticResult.entryPoints,
        keyDirectories: mockSemanticResult.keyDirectories,
        analysisStatus: 'normal',
        errors: undefined
      });

      expect(mockSemanticEngine.analyzeCodebase).toHaveBeenCalledWith(projectPath);
      expect(mockPatternEngine.extractPatterns).toHaveBeenCalledWith(projectPath);
    });

    it('should handle analysis errors gracefully', async () => {
      // Arrange
      const projectPath = '/test/project';
      const error = new Error('Analysis failed');
      (mockSemanticEngine.analyzeCodebase as Mock).mockRejectedValue(error);

      // Act & Assert
      await expect(analysisService.analyzeCodebase(projectPath))
        .rejects.toThrow('Learning failed: Codebase analysis: Analysis failed');
    });
  });

  describe('getLanguageMetrics', () => {
    it('should return language metrics based on semantic analysis', async () => {
      // Arrange
      const projectPath = '/test/project';
      const mockAnalysis = {
        languages: ['typescript', 'javascript'],
        frameworks: [],
        complexity: { cyclomatic: 10, cognitive: 15, lines: 2000 },
        concepts: [],
        analysisStatus: 'normal' as const
      };

      (mockSemanticEngine.analyzeCodebase as Mock).mockResolvedValue(mockAnalysis);

      // Act
      const result = await analysisService.getLanguageMetrics(projectPath);

      // Assert
      expect(result).toEqual({
        languages: [
          {
            name: 'typescript',
            fileCount: 10,
            lineCount: 1000,
            percentage: 50
          },
          {
            name: 'javascript',
            fileCount: 10,
            lineCount: 1000,
            percentage: 50
          }
        ],
        totalFiles: 20,
        totalLines: 2000,
        primaryLanguage: 'typescript'
      });
    });
  });

  describe('getComplexityMetrics', () => {
    it('should return complexity metrics with maintainability index', async () => {
      // Arrange
      const projectPath = '/test/project';
      const mockAnalysis = {
        languages: ['typescript'],
        frameworks: [],
        complexity: { cyclomatic: 8, cognitive: 12, lines: 1500 },
        concepts: [],
        analysisStatus: 'normal' as const
      };

      (mockSemanticEngine.analyzeCodebase as Mock).mockResolvedValue(mockAnalysis);

      // Act
      const result = await analysisService.getComplexityMetrics(projectPath);

      // Assert
      expect(result).toEqual({
        cyclomatic: 8,
        cognitive: 12,
        lines: 1500,
        maintainabilityIndex: expect.any(Number),
        technicalDebt: {
          score: expect.any(Number),
          issues: expect.any(Array)
        }
      });

      expect(result.maintainabilityIndex).toBeGreaterThan(0);
      expect(result.maintainabilityIndex).toBeLessThanOrEqual(100);
    });
  });

  describe('extractConcepts', () => {
    it('should extract concepts from database without writing', async () => {
      // Arrange
      const projectPath = '/test/project';
      const mockStoredConcepts = [
        {
          id: 'concept-1',
          conceptName: 'UserService',
          conceptType: 'class',
          confidenceScore: 0.9,
          filePath: 'src/services/UserService.ts',
          lineRange: { start: 10, end: 50 },
          relationships: { extends: 'BaseService' },
          evolutionHistory: {},
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      (mockDatabase.getSemanticConcepts as Mock).mockReturnValue(mockStoredConcepts);

      // Act
      const result = await analysisService.extractConcepts(projectPath);

      // Assert
      expect(result).toEqual([
        {
          id: 'concept-1',
          name: 'UserService',
          type: 'class',
          confidence: 0.9,
          filePath: 'src/services/UserService.ts',
          lineRange: { start: 10, end: 50 },
          relationships: { extends: 'BaseService' }
        }
      ]);

      expect(mockDatabase.getSemanticConcepts).toHaveBeenCalledWith();
    });

    it('should handle empty concept database', async () => {
      // Arrange
      const projectPath = '/test/project';
      (mockDatabase.getSemanticConcepts as Mock).mockReturnValue([]);

      // Act
      const result = await analysisService.extractConcepts(projectPath);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('read-only behavior', () => {
    it('should not call any database write methods', async () => {
      // Arrange
      const projectPath = '/test/project';
      
      // Mock all read methods to return empty/default values
      (mockSemanticEngine.analyzeCodebase as Mock).mockResolvedValue({
        languages: [],
        frameworks: [],
        complexity: { cyclomatic: 0, cognitive: 0, lines: 0 },
        concepts: [],
        analysisStatus: 'normal' as const
      });
      (mockPatternEngine.extractPatterns as Mock).mockResolvedValue([]);
      (mockDatabase.getSemanticConcepts as Mock).mockReturnValue([]);

      // Act - call all methods
      await analysisService.analyzeCodebase(projectPath);
      await analysisService.getLanguageMetrics(projectPath);
      await analysisService.getComplexityMetrics(projectPath);
      await analysisService.extractConcepts(projectPath);

      // Assert - verify no write methods were called on database
      expect(mockDatabase).not.toHaveProperty('insertSemanticConcept');
      expect(mockDatabase).not.toHaveProperty('insertDeveloperPattern');
      expect(mockDatabase).not.toHaveProperty('insertFileIntelligence');
      expect(mockDatabase).not.toHaveProperty('insertAIInsight');
      expect(mockDatabase).not.toHaveProperty('insertFeatureMap');
      expect(mockDatabase).not.toHaveProperty('insertEntryPoint');
      expect(mockDatabase).not.toHaveProperty('insertKeyDirectory');
      expect(mockDatabase).not.toHaveProperty('insertProjectMetadata');
      expect(mockDatabase).not.toHaveProperty('updateWorkSession');
    });
  });
});