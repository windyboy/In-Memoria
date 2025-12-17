import Database from 'better-sqlite3';
import { Logger } from '../utils/logger.js';

/**
 * Schema migrator specifically for converting existing In-Memoria databases
 * to the simplified four-table schema
 */
export class SchemaMigrator {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Check if the database needs to be migrated to simplified schema
   */
  needsSimplification(): boolean {
    try {
      // Check if we have the old complex schema
      const tables = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `).all() as Array<{ name: string }>;
      
      const tableNames = tables.map(t => t.name);
      
      // If we have legacy tables, we need migration
      const legacyTables = [
        'architectural_decisions', 'shared_patterns', 'ai_insights', 
        'file_intelligence', 'vector_cache', 'entry_points', 
        'key_directories', 'work_sessions', 'project_decisions'
      ];
      
      return legacyTables.some(table => tableNames.includes(table));
    } catch (error) {
      Logger.info('Error checking schema, assuming migration needed');
      return true;
    }
  }

  /**
   * Migrate existing database to simplified schema
   */
  migrateToSimplifiedSchema(): void {
    Logger.info('Starting migration to simplified schema...');
    
    this.db.transaction(() => {
      // Step 1: Create new simplified tables
      this.createSimplifiedTables();
      
      // Step 2: Migrate data from old tables to new tables
      this.migrateData();
      
      // Step 3: Drop legacy tables
      this.dropLegacyTables();
      
      // Step 4: Create indexes
      this.createIndexes();
    })();
    
    Logger.info('Migration to simplified schema completed');
  }

  private createSimplifiedTables(): void {
    // Create simplified semantic_concepts table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS semantic_concepts_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        confidence REAL NOT NULL,
        context TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create simplified developer_patterns table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS developer_patterns_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        frequency INTEGER NOT NULL,
        examples TEXT, -- JSON array
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create simplified feature_map table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS feature_map_new (
        id TEXT PRIMARY KEY,
        feature_name TEXT NOT NULL,
        file_paths TEXT, -- JSON array
        confidence REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create simplified project_metadata table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS project_metadata_new (
        project_path TEXT PRIMARY KEY,
        last_learned DATETIME NOT NULL,
        version TEXT,
        languages TEXT, -- JSON array
        frameworks TEXT, -- JSON array
        stats TEXT -- JSON object
      );
    `);
  }

  private migrateData(): void {
    // Migrate semantic_concepts data
    try {
      this.db.exec(`
        INSERT INTO semantic_concepts_new (id, name, type, confidence, context, created_at)
        SELECT 
          id,
          concept_name,
          concept_type,
          confidence_score,
          COALESCE(file_path, ''),
          created_at
        FROM semantic_concepts
        WHERE id IS NOT NULL AND concept_name IS NOT NULL
      `);
    } catch (error) {
      Logger.info('No semantic_concepts table to migrate or migration failed, creating empty table');
    }

    // Migrate developer_patterns data
    try {
      this.db.exec(`
        INSERT INTO developer_patterns_new (id, name, category, frequency, examples, created_at)
        SELECT 
          pattern_id,
          pattern_type,
          pattern_type, -- Use pattern_type as category
          frequency,
          examples,
          created_at
        FROM developer_patterns
        WHERE pattern_id IS NOT NULL AND pattern_type IS NOT NULL
      `);
    } catch (error) {
      Logger.info('No developer_patterns table to migrate or migration failed, creating empty table');
    }

    // Migrate feature_map data
    try {
      this.db.exec(`
        INSERT INTO feature_map_new (id, feature_name, file_paths, confidence, created_at)
        SELECT 
          id,
          feature_name,
          primary_files, -- Use primary_files as file_paths
          1.0, -- Default confidence
          created_at
        FROM feature_map
        WHERE id IS NOT NULL AND feature_name IS NOT NULL
      `);
    } catch (error) {
      Logger.info('No feature_map table to migrate or migration failed, creating empty table');
    }

    // Migrate project_metadata data
    try {
      this.db.exec(`
        INSERT INTO project_metadata_new (project_path, last_learned, version, languages, frameworks, stats)
        SELECT 
          project_path,
          COALESCE(last_full_scan, datetime('now')),
          intelligence_version,
          languages_detected,
          framework_detected,
          '{}' -- Empty stats object
        FROM project_metadata
        WHERE project_path IS NOT NULL
      `);
    } catch (error) {
      Logger.info('No project_metadata table to migrate or migration failed, creating empty table');
    }
  }

  private dropLegacyTables(): void {
    const legacyTables = [
      'architectural_decisions', 'shared_patterns', 'ai_insights', 
      'file_intelligence', 'vector_cache', 'entry_points', 
      'key_directories', 'work_sessions', 'project_decisions'
    ];

    // Drop legacy tables
    for (const table of legacyTables) {
      try {
        this.db.exec(`DROP TABLE IF EXISTS ${table}`);
      } catch (error) {
        Logger.info(`Failed to drop table ${table}, continuing...`);
      }
    }

    // Replace old tables with new ones
    const coreTables = ['semantic_concepts', 'developer_patterns', 'feature_map', 'project_metadata'];
    
    for (const table of coreTables) {
      try {
        this.db.exec(`DROP TABLE IF EXISTS ${table}`);
        this.db.exec(`ALTER TABLE ${table}_new RENAME TO ${table}`);
      } catch (error) {
        Logger.info(`Failed to replace table ${table}, continuing...`);
      }
    }
  }

  private createIndexes(): void {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_semantic_concepts_type ON semantic_concepts(type)',
      'CREATE INDEX IF NOT EXISTS idx_semantic_concepts_name ON semantic_concepts(name)',
      'CREATE INDEX IF NOT EXISTS idx_developer_patterns_category ON developer_patterns(category)',
      'CREATE INDEX IF NOT EXISTS idx_developer_patterns_frequency ON developer_patterns(frequency DESC)',
      'CREATE INDEX IF NOT EXISTS idx_feature_map_name ON feature_map(feature_name)',
      'CREATE INDEX IF NOT EXISTS idx_project_metadata_learned ON project_metadata(last_learned)'
    ];

    for (const indexSql of indexes) {
      try {
        this.db.exec(indexSql);
      } catch (error) {
        Logger.info(`Failed to create index: ${indexSql}`);
      }
    }
  }

  /**
   * Create simplified schema from scratch (for new databases)
   */
  createSimplifiedSchema(): void {
    Logger.info('Creating simplified schema from scratch...');
    
    this.db.exec(`
      -- Core semantic concepts discovered in the codebase
      CREATE TABLE IF NOT EXISTS semantic_concepts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        confidence REAL NOT NULL,
        context TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Developer patterns and conventions
      CREATE TABLE IF NOT EXISTS developer_patterns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        frequency INTEGER NOT NULL,
        examples TEXT, -- JSON array
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Feature mapping
      CREATE TABLE IF NOT EXISTS feature_map (
        id TEXT PRIMARY KEY,
        feature_name TEXT NOT NULL,
        file_paths TEXT, -- JSON array
        confidence REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Project metadata and learning state
      CREATE TABLE IF NOT EXISTS project_metadata (
        project_path TEXT PRIMARY KEY,
        last_learned DATETIME NOT NULL,
        version TEXT,
        languages TEXT, -- JSON array
        frameworks TEXT, -- JSON array
        stats TEXT -- JSON object
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_semantic_concepts_type ON semantic_concepts(type);
      CREATE INDEX IF NOT EXISTS idx_semantic_concepts_name ON semantic_concepts(name);
      CREATE INDEX IF NOT EXISTS idx_developer_patterns_category ON developer_patterns(category);
      CREATE INDEX IF NOT EXISTS idx_developer_patterns_frequency ON developer_patterns(frequency DESC);
      CREATE INDEX IF NOT EXISTS idx_feature_map_name ON feature_map(feature_name);
      CREATE INDEX IF NOT EXISTS idx_project_metadata_learned ON project_metadata(last_learned);
    `);
    
    Logger.info('Simplified schema created');
  }

  /**
   * Validate that the simplified schema is correct
   */
  validateSimplifiedSchema(): boolean {
    try {
      // Check that only the four core tables exist (plus migrations if present)
      const tables = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'
        ORDER BY name
      `).all() as Array<{ name: string }>;
      
      const tableNames = tables.map(t => t.name);
      const expectedTables = ['developer_patterns', 'feature_map', 'project_metadata', 'semantic_concepts'];
      
      // Check that we have exactly the expected tables
      if (tableNames.length !== expectedTables.length) {
        Logger.info(`Expected ${expectedTables.length} tables, found ${tableNames.length}`);
        return false;
      }
      
      for (const expectedTable of expectedTables) {
        if (!tableNames.includes(expectedTable)) {
          Logger.info(`Missing expected table: ${expectedTable}`);
          return false;
        }
      }
      
      // Check that no legacy tables exist
      const legacyTables = [
        'architectural_decisions', 'shared_patterns', 'ai_insights', 
        'file_intelligence', 'vector_cache', 'entry_points', 
        'key_directories', 'work_sessions', 'project_decisions'
      ];
      
      for (const legacyTable of legacyTables) {
        if (tableNames.includes(legacyTable)) {
          Logger.info(`Found legacy table that should be removed: ${legacyTable}`);
          return false;
        }
      }
      
      Logger.info('Simplified schema validation passed');
      return true;
    } catch (error) {
      Logger.info(`Schema validation failed: ${error}`);
      return false;
    }
  }
}