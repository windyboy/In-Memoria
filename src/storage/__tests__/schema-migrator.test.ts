import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SchemaMigrator } from '../schema-migrator.js';
import Database from 'better-sqlite3';

describe('SchemaMigrator', () => {
  let db: Database.Database;
  let migrator: SchemaMigrator;

  beforeEach(() => {
    db = new Database(':memory:');
    migrator = new SchemaMigrator(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('Fresh Database', () => {
    it('should create simplified schema from scratch', () => {
      expect(migrator.needsSimplification()).toBe(false);
      
      migrator.createSimplifiedSchema();
      
      expect(migrator.validateSimplifiedSchema()).toBe(true);
      
      // Verify tables exist
      const tables = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `).all() as Array<{ name: string }>;
      
      const tableNames = tables.map(t => t.name);
      expect(tableNames).toEqual(['developer_patterns', 'feature_map', 'project_metadata', 'semantic_concepts']);
    });
  });

  describe('Legacy Database Migration', () => {
    beforeEach(() => {
      // Create a legacy database structure
      db.exec(`
        -- Legacy tables that should be migrated
        CREATE TABLE semantic_concepts (
          id TEXT PRIMARY KEY,
          concept_name TEXT NOT NULL,
          concept_type TEXT NOT NULL,
          confidence_score REAL DEFAULT 0.0,
          relationships TEXT,
          evolution_history TEXT,
          file_path TEXT,
          line_range TEXT,
          created_at DATETIME DEFAULT (datetime('now', 'utc')),
          updated_at DATETIME DEFAULT (datetime('now', 'utc'))
        );

        CREATE TABLE developer_patterns (
          pattern_id TEXT PRIMARY KEY,
          pattern_type TEXT NOT NULL,
          pattern_content TEXT NOT NULL,
          frequency INTEGER DEFAULT 1,
          contexts TEXT,
          examples TEXT,
          confidence REAL DEFAULT 0.0,
          created_at DATETIME DEFAULT (datetime('now', 'utc')),
          last_seen DATETIME DEFAULT (datetime('now', 'utc'))
        );

        CREATE TABLE feature_map (
          id TEXT PRIMARY KEY,
          project_path TEXT NOT NULL,
          feature_name TEXT NOT NULL,
          primary_files TEXT NOT NULL,
          related_files TEXT,
          dependencies TEXT,
          status TEXT DEFAULT 'active',
          created_at DATETIME DEFAULT (datetime('now', 'utc')),
          updated_at DATETIME DEFAULT (datetime('now', 'utc'))
        );

        CREATE TABLE project_metadata (
          project_id TEXT PRIMARY KEY,
          project_path TEXT NOT NULL UNIQUE,
          project_name TEXT,
          language_primary TEXT,
          languages_detected TEXT,
          framework_detected TEXT,
          intelligence_version TEXT,
          last_full_scan DATETIME,
          created_at DATETIME DEFAULT (datetime('now', 'utc')),
          updated_at DATETIME DEFAULT (datetime('now', 'utc'))
        );

        -- Legacy tables that should be dropped
        CREATE TABLE architectural_decisions (
          decision_id TEXT PRIMARY KEY,
          decision_context TEXT NOT NULL
        );

        CREATE TABLE file_intelligence (
          file_path TEXT PRIMARY KEY,
          file_hash TEXT NOT NULL
        );

        CREATE TABLE ai_insights (
          insight_id TEXT PRIMARY KEY,
          insight_type TEXT NOT NULL
        );
      `);

      // Insert test data
      db.exec(`
        INSERT INTO semantic_concepts (id, concept_name, concept_type, confidence_score, file_path)
        VALUES ('concept-1', 'UserService', 'class', 0.9, 'src/user.ts');

        INSERT INTO developer_patterns (pattern_id, pattern_type, pattern_content, frequency, examples)
        VALUES ('pattern-1', 'repository', '{"name": "Repository Pattern"}', 5, '[]');

        INSERT INTO feature_map (id, project_path, feature_name, primary_files)
        VALUES ('feature-1', '/test', 'User Auth', '["auth.ts"]');

        INSERT INTO project_metadata (project_id, project_path, languages_detected, framework_detected, last_full_scan)
        VALUES ('proj-1', '/test', '["typescript"]', '["react"]', datetime('now'));
      `);
    });

    it('should detect need for simplification', () => {
      expect(migrator.needsSimplification()).toBe(true);
    });

    it('should migrate legacy database to simplified schema', () => {
      // Verify we have legacy data
      const beforeConcepts = db.prepare('SELECT COUNT(*) as count FROM semantic_concepts').get() as { count: number };
      const beforePatterns = db.prepare('SELECT COUNT(*) as count FROM developer_patterns').get() as { count: number };
      const beforeFeatures = db.prepare('SELECT COUNT(*) as count FROM feature_map').get() as { count: number };
      const beforeProjects = db.prepare('SELECT COUNT(*) as count FROM project_metadata').get() as { count: number };

      expect(beforeConcepts.count).toBe(1);
      expect(beforePatterns.count).toBe(1);
      expect(beforeFeatures.count).toBe(1);
      expect(beforeProjects.count).toBe(1);

      // Perform migration
      migrator.migrateToSimplifiedSchema();

      // Verify schema is simplified
      expect(migrator.validateSimplifiedSchema()).toBe(true);

      // Verify data was preserved
      const afterConcepts = db.prepare('SELECT COUNT(*) as count FROM semantic_concepts').get() as { count: number };
      const afterPatterns = db.prepare('SELECT COUNT(*) as count FROM developer_patterns').get() as { count: number };
      const afterFeatures = db.prepare('SELECT COUNT(*) as count FROM feature_map').get() as { count: number };
      const afterProjects = db.prepare('SELECT COUNT(*) as count FROM project_metadata').get() as { count: number };

      expect(afterConcepts.count).toBe(1);
      expect(afterPatterns.count).toBe(1);
      expect(afterFeatures.count).toBe(1);
      expect(afterProjects.count).toBe(1);

      // Verify data structure is correct
      const concept = db.prepare('SELECT * FROM semantic_concepts WHERE id = ?').get('concept-1') as any;
      expect(concept.name).toBe('UserService');
      expect(concept.type).toBe('class');
      expect(concept.confidence).toBe(0.9);

      const pattern = db.prepare('SELECT * FROM developer_patterns WHERE id = ?').get('pattern-1') as any;
      expect(pattern.name).toBe('repository');
      expect(pattern.category).toBe('repository');
      expect(pattern.frequency).toBe(5);

      const feature = db.prepare('SELECT * FROM feature_map WHERE id = ?').get('feature-1') as any;
      expect(feature.feature_name).toBe('User Auth');
      expect(JSON.parse(feature.file_paths)).toEqual(['auth.ts']);

      const project = db.prepare('SELECT * FROM project_metadata WHERE project_path = ?').get('/test') as any;
      expect(JSON.parse(project.languages)).toEqual(['typescript']);
      expect(JSON.parse(project.frameworks)).toEqual(['react']);
    });

    it('should drop legacy tables after migration', () => {
      migrator.migrateToSimplifiedSchema();

      // Verify legacy tables are gone
      const tables = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `).all() as Array<{ name: string }>;

      const tableNames = tables.map(t => t.name);
      
      // Should only have the four core tables
      expect(tableNames).toEqual(['developer_patterns', 'feature_map', 'project_metadata', 'semantic_concepts']);

      // Verify legacy tables are not present
      const legacyTables = ['architectural_decisions', 'file_intelligence', 'ai_insights'];
      for (const legacyTable of legacyTables) {
        expect(tableNames).not.toContain(legacyTable);
      }
    });
  });

  describe('Schema Validation', () => {
    it('should validate correct simplified schema', () => {
      migrator.createSimplifiedSchema();
      expect(migrator.validateSimplifiedSchema()).toBe(true);
    });

    it('should reject schema with legacy tables', () => {
      // Create simplified schema
      migrator.createSimplifiedSchema();
      
      // Add a legacy table
      db.exec('CREATE TABLE ai_insights (id TEXT PRIMARY KEY)');
      
      // Should fail validation
      expect(migrator.validateSimplifiedSchema()).toBe(false);
    });

    it('should reject schema with missing core tables', () => {
      // Create only partial schema
      db.exec(`
        CREATE TABLE semantic_concepts (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          confidence REAL NOT NULL,
          context TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      // Should fail validation (missing other tables)
      expect(migrator.validateSimplifiedSchema()).toBe(false);
    });
  });
});