import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SimplifiedSQLiteDatabase, SemanticConcept, DeveloperPattern, FeatureMap, ProjectMetadata } from '../simplified-sqlite-db.js';

describe('SimplifiedSQLiteDatabase', () => {
  let db: SimplifiedSQLiteDatabase;

  beforeEach(() => {
    // Use in-memory database for testing
    db = new SimplifiedSQLiteDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('Database Initialization', () => {
    it('should initialize with simplified schema', () => {
      const counts = db.getTableCounts();
      
      // Should have exactly 4 tables
      expect(Object.keys(counts)).toHaveLength(4);
      expect(counts).toHaveProperty('semantic_concepts');
      expect(counts).toHaveProperty('developer_patterns');
      expect(counts).toHaveProperty('feature_map');
      expect(counts).toHaveProperty('project_metadata');
      
      // All tables should be empty initially
      expect(counts.semantic_concepts).toBe(0);
      expect(counts.developer_patterns).toBe(0);
      expect(counts.feature_map).toBe(0);
      expect(counts.project_metadata).toBe(0);
    });
  });

  describe('Semantic Concepts', () => {
    it('should insert and retrieve semantic concepts', () => {
      const concept: Omit<SemanticConcept, 'createdAt'> = {
        id: 'test-concept-1',
        name: 'TestClass',
        type: 'class',
        confidence: 0.95,
        context: 'src/test.ts'
      };

      db.insertSemanticConcept(concept);
      
      const retrieved = db.getSemanticConceptById('test-concept-1');
      expect(retrieved).toBeTruthy();
      expect(retrieved!.name).toBe('TestClass');
      expect(retrieved!.type).toBe('class');
      expect(retrieved!.confidence).toBe(0.95);
      expect(retrieved!.context).toBe('src/test.ts');
    });

    it('should search semantic concepts', () => {
      const concepts: Omit<SemanticConcept, 'createdAt'>[] = [
        {
          id: 'concept-1',
          name: 'UserService',
          type: 'class',
          confidence: 0.9,
          context: 'src/services/user.ts'
        },
        {
          id: 'concept-2',
          name: 'AuthService',
          type: 'class',
          confidence: 0.8,
          context: 'src/services/auth.ts'
        }
      ];

      concepts.forEach(concept => db.insertSemanticConcept(concept));
      
      const results = db.searchSemanticConcepts('Service');
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('UserService'); // Higher confidence first
    });
  });

  describe('Developer Patterns', () => {
    it('should insert and retrieve developer patterns', () => {
      const pattern: Omit<DeveloperPattern, 'createdAt'> = {
        id: 'pattern-1',
        name: 'Repository Pattern',
        category: 'architecture',
        frequency: 5,
        examples: [
          { file: 'src/repositories/user.ts', usage: 'UserRepository class' }
        ]
      };

      db.insertDeveloperPattern(pattern);
      
      const retrieved = db.getDeveloperPatternById('pattern-1');
      expect(retrieved).toBeTruthy();
      expect(retrieved!.name).toBe('Repository Pattern');
      expect(retrieved!.category).toBe('architecture');
      expect(retrieved!.frequency).toBe(5);
      expect(retrieved!.examples).toHaveLength(1);
    });

    it('should get patterns by category', () => {
      const patterns: Omit<DeveloperPattern, 'createdAt'>[] = [
        {
          id: 'pattern-1',
          name: 'Repository Pattern',
          category: 'architecture',
          frequency: 5,
          examples: []
        },
        {
          id: 'pattern-2',
          name: 'Factory Pattern',
          category: 'creational',
          frequency: 3,
          examples: []
        }
      ];

      patterns.forEach(pattern => db.insertDeveloperPattern(pattern));
      
      const architecturePatterns = db.getDeveloperPatterns('architecture');
      expect(architecturePatterns).toHaveLength(1);
      expect(architecturePatterns[0].name).toBe('Repository Pattern');
    });
  });

  describe('Feature Map', () => {
    it('should insert and retrieve feature maps', () => {
      const feature: Omit<FeatureMap, 'createdAt'> = {
        id: 'feature-1',
        featureName: 'User Authentication',
        filePaths: ['src/auth/login.ts', 'src/auth/register.ts'],
        confidence: 0.85
      };

      db.insertFeatureMap(feature);
      
      const retrieved = db.getFeatureMapById('feature-1');
      expect(retrieved).toBeTruthy();
      expect(retrieved!.featureName).toBe('User Authentication');
      expect(retrieved!.filePaths).toHaveLength(2);
      expect(retrieved!.confidence).toBe(0.85);
    });

    it('should get feature by name', () => {
      const feature: Omit<FeatureMap, 'createdAt'> = {
        id: 'feature-1',
        featureName: 'User Management',
        filePaths: ['src/users/'],
        confidence: 0.9
      };

      db.insertFeatureMap(feature);
      
      const retrieved = db.getFeatureMapByName('User Management');
      expect(retrieved).toBeTruthy();
      expect(retrieved!.id).toBe('feature-1');
    });
  });

  describe('Project Metadata', () => {
    it('should insert and retrieve project metadata', () => {
      const metadata: ProjectMetadata = {
        projectPath: '/test/project',
        lastLearned: new Date('2024-01-01T00:00:00Z'),
        version: '1.0.0',
        languages: ['typescript', 'javascript'],
        frameworks: ['react', 'express'],
        stats: { fileCount: 100, lineCount: 5000 }
      };

      db.insertProjectMetadata(metadata);
      
      const retrieved = db.getProjectMetadata('/test/project');
      expect(retrieved).toBeTruthy();
      expect(retrieved!.version).toBe('1.0.0');
      expect(retrieved!.languages).toEqual(['typescript', 'javascript']);
      expect(retrieved!.frameworks).toEqual(['react', 'express']);
      expect(retrieved!.stats.fileCount).toBe(100);
    });
  });

  describe('Data Management', () => {
    it('should clear all data', () => {
      // Insert some test data
      db.insertSemanticConcept({
        id: 'test-1',
        name: 'Test',
        type: 'class',
        confidence: 0.5,
        context: 'test'
      });

      db.insertProjectMetadata({
        projectPath: '/test',
        lastLearned: new Date(),
        languages: ['typescript'],
        frameworks: [],
        stats: {}
      });

      // Verify data exists
      let counts = db.getTableCounts();
      expect(counts.semantic_concepts).toBe(1);
      expect(counts.project_metadata).toBe(1);

      // Clear all data
      db.clearAllData();

      // Verify data is cleared
      counts = db.getTableCounts();
      expect(counts.semantic_concepts).toBe(0);
      expect(counts.developer_patterns).toBe(0);
      expect(counts.feature_map).toBe(0);
      expect(counts.project_metadata).toBe(0);
    });
  });
});