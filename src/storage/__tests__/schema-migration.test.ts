import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteDatabase } from '../sqlite-db.js';
// SimplifiedSQLiteDatabase removed in Phase 3 - schema simplified and consolidated into SQLiteDatabase
import { DatabaseMigrator } from '../migrations.js';
import Database from 'better-sqlite3';

describe('Schema Migration', () => {
  let legacyDb: SQLiteDatabase;

  beforeEach(() => {
    // Create legacy database with existing data
    legacyDb = new SQLiteDatabase(':memory:');
    
    // Add some test data to legacy database
    legacyDb.insertSemanticConcept({
      id: 'concept-1',
      conceptName: 'UserService',
      conceptType: 'class',
      confidenceScore: 0.9,
      relationships: { extends: 'BaseService' },
      evolutionHistory: { created: '2024-01-01' },
      filePath: 'src/services/user.ts',
      lineRange: { start: 1, end: 50 }
    });

    legacyDb.insertDeveloperPattern({
      patternId: 'pattern-1',
      patternType: 'architecture',
      patternContent: { name: 'Repository Pattern' },
      frequency: 5,
      contexts: ['services'],
      examples: [{ file: 'user-repo.ts' }],
      confidence: 0.8
    });

    legacyDb.insertFeatureMap({
      id: 'feature-1',
      projectPath: '/test/project',
      featureName: 'User Management',
      primaryFiles: ['src/user.ts'],
      relatedFiles: ['src/user-service.ts'],
      dependencies: [],
      status: 'active'
    });

    legacyDb.insertProjectMetadata({
      projectId: 'test-project',
      projectPath: '/test/project',
      projectName: 'Test Project',
      languagePrimary: 'typescript',
      languagesDetected: ['typescript', 'javascript'],
      frameworkDetected: ['react'],
      intelligenceVersion: '1.0.0',
      lastFullScan: new Date('2024-01-01')
    });
  });

  afterEach(() => {
    legacyDb.close();
  });

  describe('Migration Process', () => {
    it('should migrate legacy database to simplified schema', () => {
      // Get the underlying database connection
      const db = (legacyDb as any).db as Database.Database;
      const migrator = new DatabaseMigrator(db);
      
      // Check current version (should be 7 after legacy setup)
      const currentVersion = migrator.getCurrentVersion();
      expect(currentVersion).toBeGreaterThanOrEqual(0);
      
      // Apply migration 8 (simplified schema)
      if (currentVersion < 8) {
        migrator.migrate();
      }
      
      // Verify migration was applied
      expect(migrator.getCurrentVersion()).toBe(8);
      
      // Verify simplified schema exists
      const tables = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'
        ORDER BY name
      `).all() as Array<{ name: string }>;
      
      const tableNames = tables.map(t => t.name);
      expect(tableNames).toEqual(['developer_patterns', 'feature_map', 'project_metadata', 'semantic_concepts']);
      
      // Verify data was migrated correctly
      const concepts = db.prepare('SELECT * FROM semantic_concepts').all();
      expect(concepts).toHaveLength(1);
      expect(concepts[0]).toMatchObject({
        id: 'concept-1',
        name: 'UserService',
        type: 'class',
        confidence: 0.9
      });
      
      const patterns = db.prepare('SELECT * FROM developer_patterns').all();
      expect(patterns).toHaveLength(1);
      expect(patterns[0]).toMatchObject({
        id: 'pattern-1',
        name: 'architecture',
        category: 'architecture',
        frequency: 5
      });
      
      const features = db.prepare('SELECT * FROM feature_map').all();
      expect(features).toHaveLength(1);
      expect(features[0]).toMatchObject({
        id: 'feature-1',
        feature_name: 'User Management'
      });
      
      const projects = db.prepare('SELECT * FROM project_metadata').all();
      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({
        project_path: '/test/project'
      });
    });

    it('should handle empty database migration', () => {
      // Create empty database
      const emptyDb = new Database(':memory:');
      const migrator = new DatabaseMigrator(emptyDb);
      
      // Apply all migrations
      migrator.migrate();
      
      // Verify final schema
      expect(migrator.getCurrentVersion()).toBe(8);
      
      const tables = emptyDb.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'
        ORDER BY name
      `).all() as Array<{ name: string }>;
      
      const tableNames = tables.map(t => t.name);
      expect(tableNames).toEqual(['developer_patterns', 'feature_map', 'project_metadata', 'semantic_concepts']);
      
      emptyDb.close();
    });
  });

  describe('Data Integrity', () => {
    it('should preserve essential data during migration', () => {
      // Get the underlying database connection
      const db = (legacyDb as any).db as Database.Database;
      
      // Count records before migration
      const beforeCounts = {
        concepts: db.prepare('SELECT COUNT(*) as count FROM semantic_concepts').get() as { count: number },
        patterns: db.prepare('SELECT COUNT(*) as count FROM developer_patterns').get() as { count: number },
        features: db.prepare('SELECT COUNT(*) as count FROM feature_map').get() as { count: number },
        projects: db.prepare('SELECT COUNT(*) as count FROM project_metadata').get() as { count: number }
      };
      
      // Apply migration
      const migrator = new DatabaseMigrator(db);
      if (migrator.getCurrentVersion() < 8) {
        migrator.migrate();
      }
      
      // Count records after migration
      const afterCounts = {
        concepts: db.prepare('SELECT COUNT(*) as count FROM semantic_concepts').get() as { count: number },
        patterns: db.prepare('SELECT COUNT(*) as count FROM developer_patterns').get() as { count: number },
        features: db.prepare('SELECT COUNT(*) as count FROM feature_map').get() as { count: number },
        projects: db.prepare('SELECT COUNT(*) as count FROM project_metadata').get() as { count: number }
      };
      
      // Verify record counts are preserved
      expect(afterCounts.concepts.count).toBe(beforeCounts.concepts.count);
      expect(afterCounts.patterns.count).toBe(beforeCounts.patterns.count);
      expect(afterCounts.features.count).toBe(beforeCounts.features.count);
      expect(afterCounts.projects.count).toBe(beforeCounts.projects.count);
    });
  });
});