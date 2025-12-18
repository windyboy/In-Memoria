import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { DiagnosticService, DiagnosticServiceImpl } from '../services/DiagnosticService.js';
import { SQLiteDatabase } from '../../storage/sqlite-db.js';
import { VectorStore } from '../../storage/vector-store.js';

// Mock the dependencies
vi.mock('../../storage/sqlite-db.js');
vi.mock('../../storage/vector-store.js');
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
vi.mock('../../config/config.js', () => ({
  config: {
    getDatabasePath: vi.fn().mockReturnValue('/test/database.db')
  }
}));
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn()
}));

describe('DiagnosticService', () => {
  let diagnosticService: DiagnosticService;
  let mockDatabase: SQLiteDatabase;
  let mockVectorStore: VectorStore;

  beforeEach(() => {
    // Create mock instances
    mockDatabase = {
      getSemanticConcepts: vi.fn(),
      getDeveloperPatterns: vi.fn(),
      getMigrator: vi.fn()
    } as any;

    mockVectorStore = {
      getHealthStatus: vi.fn(),
      getPerformanceMetrics: vi.fn(),
      getBackendInfo: vi.fn()
    } as any;

    diagnosticService = new DiagnosticServiceImpl(mockDatabase, mockVectorStore);
  });

  describe('getLearningStatus', () => {
    it('should return learning status with intelligence data', async () => {
      // Arrange
      const projectPath = '/test/project';
      const mockConcepts = [
        { id: '1', conceptName: 'UserService', conceptType: 'class', confidenceScore: 0.9, createdAt: new Date() }
      ];
      const mockPatterns = [
        { patternId: '1', patternType: 'singleton', frequency: 3, createdAt: new Date() }
      ];

      (mockDatabase.getSemanticConcepts as Mock).mockReturnValue(mockConcepts);
      (mockDatabase.getDeveloperPatterns as Mock).mockReturnValue(mockPatterns);

      // Act
      const result = await diagnosticService.getLearningStatus(projectPath);

      // Assert
      expect(result).toEqual({
        projectPath,
        hasIntelligence: true,
        isStale: expect.any(Boolean),
        conceptsStored: 1,
        patternsStored: 1,
        filesInProject: 100,
        codeFilesInProject: 50,
        lastLearningTime: expect.any(String),
        recommendation: expect.stringMatching(/ready|learning_recommended/),
        message: expect.any(String)
      });

      expect(mockDatabase.getSemanticConcepts).toHaveBeenCalled();
      expect(mockDatabase.getDeveloperPatterns).toHaveBeenCalled();
    });

    it('should return learning needed status when no intelligence data exists', async () => {
      // Arrange
      const projectPath = '/test/project';
      (mockDatabase.getSemanticConcepts as Mock).mockReturnValue([]);
      (mockDatabase.getDeveloperPatterns as Mock).mockReturnValue([]);

      // Act
      const result = await diagnosticService.getLearningStatus(projectPath);

      // Assert
      expect(result).toEqual({
        projectPath,
        hasIntelligence: false,
        isStale: false,
        conceptsStored: 0,
        patternsStored: 0,
        filesInProject: 100,
        codeFilesInProject: 50,
        lastLearningTime: null,
        recommendation: 'learning_needed',
        message: expect.stringContaining('No intelligence data available')
      });
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      const projectPath = '/test/project';
      const error = new Error('Database error');
      (mockDatabase.getSemanticConcepts as Mock).mockImplementation(() => {
        throw error;
      });

      // Act & Assert
      await expect(diagnosticService.getLearningStatus(projectPath))
        .rejects.toThrow('Storage operation failed: Learning status retrieval: Database error');
    });
  });

  describe('getSystemMetrics', () => {
    it('should return comprehensive system metrics', async () => {
      // Arrange
      const mockConcepts = [{ id: '1', createdAt: new Date() }];
      const mockPatterns = [{ id: '1', createdAt: new Date() }];
      
      (mockDatabase.getSemanticConcepts as Mock).mockReturnValue(mockConcepts);
      (mockDatabase.getDeveloperPatterns as Mock).mockReturnValue(mockPatterns);

      // Mock fs functions
      const { existsSync, statSync } = await import('fs');
      (existsSync as Mock).mockReturnValue(true);
      (statSync as Mock).mockReturnValue({
        size: 1024 * 1024, // 1MB
        mtime: new Date()
      });

      // Act
      const result = await diagnosticService.getSystemMetrics();

      // Assert
      expect(result).toEqual({
        timestamp: expect.any(String),
        version: '0.6.0',
        memory: {
          rss: expect.any(Number),
          heapUsed: expect.any(Number),
          heapTotal: expect.any(Number),
          external: expect.any(Number),
          unit: 'MB'
        },
        system: {
          nodeVersion: expect.any(String),
          platform: expect.any(String),
          arch: expect.any(String),
          uptime: expect.any(Number)
        },
        database: {
          size: {
            bytes: expect.any(Number),
            mb: expect.any(Number)
          },
          lastModified: expect.any(String),
          queryPerformance: {
            conceptsMs: expect.any(Number),
            patternsMs: expect.any(Number),
            conceptCount: 1,
            patternsCount: 1,
            performanceRating: expect.stringMatching(/excellent|good|fair|poor/)
          }
        }
      });
    });
  });

  describe('getIntelligenceMetrics', () => {
    it('should return detailed intelligence metrics with breakdowns', async () => {
      // Arrange
      const projectPath = '/test/project';
      const mockConcepts = [
        { id: '1', conceptType: 'class', confidenceScore: 0.9, createdAt: new Date() },
        { id: '2', conceptType: 'function', confidenceScore: 0.7, createdAt: new Date() }
      ];
      const mockPatterns = [
        { patternId: '1', patternType: 'singleton', frequency: 5, createdAt: new Date() },
        { patternId: '2', patternType: 'factory', frequency: 2, createdAt: new Date() }
      ];

      (mockDatabase.getSemanticConcepts as Mock).mockReturnValue(mockConcepts);
      (mockDatabase.getDeveloperPatterns as Mock).mockReturnValue(mockPatterns);

      // Act
      const result = await diagnosticService.getIntelligenceMetrics(projectPath);

      // Assert
      expect(result.concepts.total).toBe(2);
      expect(result.patterns.total).toBe(2);
      expect(result.concepts.breakdown).toEqual({
        byType: {
          class: 1,
          function: 1
        },
        byConfidence: {
          high: 1,
          medium: 1,
          low: 0
        }
      });
      expect(result.patterns.breakdown).toEqual({
        byType: {
          singleton: 1,
          factory: 1
        },
        byFrequency: {
          frequent: 0,
          common: 1,
          rare: 1
        }
      });
      expect(result.quality).toEqual({
        averageConfidence: 0.8,
        highConfidenceRatio: 0.5,
        averagePatternFrequency: 3.5
      });
      expect(result.coverage).toEqual({});
      expect(typeof result.timestamps.lastConceptLearned).toBe('string');
      expect(typeof result.timestamps.lastPatternLearned).toBe('string');
    });

    it('should handle empty intelligence data', async () => {
      // Arrange
      const projectPath = '/test/project';
      (mockDatabase.getSemanticConcepts as Mock).mockReturnValue([]);
      (mockDatabase.getDeveloperPatterns as Mock).mockReturnValue([]);

      // Act
      const result = await diagnosticService.getIntelligenceMetrics(projectPath);

      // Assert
      expect(result).toEqual({
        concepts: {
          total: 0
        },
        patterns: {
          total: 0
        },
        quality: {},
        coverage: {},
        timestamps: {}
      });
    });
  });

  describe('getHealthStatus', () => {
    it('should return comprehensive health status', async () => {
      // Arrange
      const mockConcepts = [{ id: '1', createdAt: new Date() }];
      const mockPatterns = [{ id: '1', createdAt: new Date() }];
      const mockMigrator = {
        getCurrentVersion: vi.fn().mockReturnValue(5),
        getLatestVersion: vi.fn().mockReturnValue(5)
      };
      const mockVectorHealth = {
        status: 'healthy' as const,
        responseTime: 50,
        lastChecked: new Date(),
        details: {}
      };

      (mockDatabase.getSemanticConcepts as Mock).mockReturnValue(mockConcepts);
      (mockDatabase.getDeveloperPatterns as Mock).mockReturnValue(mockPatterns);
      (mockDatabase.getMigrator as Mock).mockReturnValue(mockMigrator);
      (mockVectorStore.getHealthStatus as Mock).mockResolvedValue(mockVectorHealth);

      // Act
      const result = await diagnosticService.getHealthStatus();

      // Assert
      expect(result).toEqual({
        status: 'healthy',
        lastChecked: expect.any(String),
        components: {
          database: {
            status: 'healthy',
            connected: true,
            schemaVersion: 5,
            latestVersion: 5,
            needsMigration: false,
            dataCount: {
              concepts: 1,
              patterns: 1
            }
          },
          vectorStore: {
            status: 'healthy',
            connected: true,
            responseTime: 50
          },
          intelligence: {
            status: 'ready',
            dataQuality: 'good',
            conceptCount: 1,
            patternCount: 1,
            lastUpdate: expect.any(String)
          }
        },
        summary: expect.stringContaining('All systems operational')
      });
    });

    it('should detect degraded status when intelligence needs learning', async () => {
      // Arrange
      (mockDatabase.getSemanticConcepts as Mock).mockReturnValue([]);
      (mockDatabase.getDeveloperPatterns as Mock).mockReturnValue([]);
      (mockDatabase.getMigrator as Mock).mockReturnValue({
        getCurrentVersion: vi.fn().mockReturnValue(5),
        getLatestVersion: vi.fn().mockReturnValue(5)
      });
      (mockVectorStore.getHealthStatus as Mock).mockResolvedValue({
        status: 'healthy' as const,
        responseTime: 50,
        lastChecked: new Date(),
        details: {}
      });

      // Act
      const result = await diagnosticService.getHealthStatus();

      // Assert
      expect(result.status).toBe('degraded');
      expect(result.components.intelligence.status).toBe('needs_learning');
      expect(result.summary).toContain('needs learning');
    });

    it('should detect unhealthy status when database fails', async () => {
      // Arrange
      const error = new Error('Database connection failed');
      (mockDatabase.getSemanticConcepts as Mock).mockImplementation(() => {
        throw error;
      });

      // Act
      const result = await diagnosticService.getHealthStatus();

      // Assert
      expect(result.status).toBe('unhealthy');
      expect(result.components.database.status).toBe('error');
      expect(result.components.database.error).toBe('Database connection failed');
    });
  });

  describe('read-only behavior', () => {
    it('should not call any database write methods', async () => {
      // Arrange
      const projectPath = '/test/project';
      
      // Mock all read methods to return empty/default values
      (mockDatabase.getSemanticConcepts as Mock).mockReturnValue([]);
      (mockDatabase.getDeveloperPatterns as Mock).mockReturnValue([]);
      (mockDatabase.getMigrator as Mock).mockReturnValue({
        getCurrentVersion: vi.fn().mockReturnValue(1),
        getLatestVersion: vi.fn().mockReturnValue(1)
      });
      (mockVectorStore.getHealthStatus as Mock).mockResolvedValue({
        status: 'healthy' as const,
        responseTime: 50,
        lastChecked: new Date(),
        details: {}
      });

      // Act - call all methods
      await diagnosticService.getLearningStatus(projectPath);
      await diagnosticService.getSystemMetrics();
      await diagnosticService.getIntelligenceMetrics(projectPath);
      await diagnosticService.getHealthStatus();

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

      // Assert - verify no write methods were called on vector store
      expect(mockVectorStore).not.toHaveProperty('storeCodeEmbedding');
      expect(mockVectorStore).not.toHaveProperty('storeMultipleEmbeddings');
      expect(mockVectorStore).not.toHaveProperty('updateCodeEmbedding');
      expect(mockVectorStore).not.toHaveProperty('deleteCodeEmbedding');
      expect(mockVectorStore).not.toHaveProperty('deleteCodeEmbeddingsByFile');
    });
  });
});