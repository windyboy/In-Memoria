import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname, isAbsolute } from 'path';
import { DatabaseMigrator } from './migrations-simple.js';
import { Logger } from '../utils/logger.js';

/**
 * Type-safe database row representation
 */
interface DatabaseRow {
  [key: string]: string | number | boolean | null | Buffer;
}

/**
 * Type-safe database query parameters
 */
type QueryParams = (string | number | boolean | null | Buffer)[];

export interface SemanticConcept {
  id: string;
  conceptName: string;
  conceptType: string;
  confidenceScore: number;
  relationships: Record<string, any>;
  evolutionHistory: Record<string, any>;
  filePath: string;
  lineRange: { start: number; end: number };
  createdAt: Date;
  updatedAt: Date;
}

export interface DeveloperPattern {
  patternId: string;
  patternType: string;
  patternContent: Record<string, any>;
  frequency: number;
  contexts: string[];
  examples: Record<string, any>[];
  confidence: number;
  createdAt: Date;
  lastSeen: Date;
}

// Interfaces for dropped tables - kept for type compatibility with stubbed methods
// These tables were dropped in migration 8, but interfaces remain for backward compatibility

export interface FileIntelligence {
  filePath: string;
  fileHash: string;
  semanticConcepts: string[];
  patternsUsed: string[];
  complexityMetrics: Record<string, number>;
  dependencies: string[];
  lastAnalyzed: Date;
  createdAt: Date;
}

export interface AIInsight {
  insightId: string;
  insightType: string;
  insightContent: Record<string, any>;
  confidenceScore: number;
  sourceAgent: string;
  validationStatus: 'pending' | 'validated' | 'rejected';
  impactPrediction: Record<string, any>;
  createdAt: Date;
}

export interface FeatureMap {
  id: string;
  projectPath: string;
  featureName: string;
  primaryFiles: string[];
  relatedFiles: string[];
  dependencies: string[];
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

// Table dropped in migration 8 - interface kept for type compatibility
export interface EntryPoint {
  id: string;
  projectPath: string;
  entryType: string;
  filePath: string;
  description?: string;
  framework?: string;
  createdAt: Date;
}

// Table dropped in migration 8 - interface kept for type compatibility
export interface KeyDirectory {
  id: string;
  projectPath: string;
  directoryPath: string;
  directoryType: string;
  fileCount: number;
  description?: string;
  createdAt: Date;
}

// Table dropped in migration 8 - interface kept for type compatibility
export interface WorkSession {
  id: string;
  projectPath: string;
  sessionStart: Date;
  sessionEnd?: Date;
  lastFeature?: string;
  currentFiles: string[];
  completedTasks: string[];
  pendingTasks: string[];
  blockers: string[];
  sessionNotes?: string;
  lastUpdated: Date;
}

// Table dropped in migration 8 - interface kept for type compatibility
export interface ProjectDecision {
  id: string;
  projectPath: string;
  decisionKey: string;
  decisionValue: string;
  reasoning?: string;
  madeAt: Date;
}

export class SQLiteDatabase {
  private db: Database.Database;
  private migrator: DatabaseMigrator;

  constructor(dbPath: string = ':memory:') {
    // Ensure parent directory exists for file-based databases
    if (dbPath !== ':memory:') {
      const dir = dirname(dbPath);
      if (!existsSync(dir)) {
        Logger.info(`Creating database directory: ${dir}`);
        mkdirSync(dir, { recursive: true });
      }
    }
    
    this.db = new Database(dbPath);
    this.migrator = new DatabaseMigrator(this.db);
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    // Run migrations if needed
    if (this.migrator.needsMigration()) {
      Logger.info('Running database migrations...');
      this.migrator.migrate();
    } else {
      Logger.info('Database is up to date');
    }
    
    // Check and fix schema integrity (for existing databases)
    this.ensureSchemaIntegrity();
  }

  private ensureSchemaIntegrity(): void {
    try {
      // Check if semantic_concepts table exists
      const tableExists = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='semantic_concepts'
      `).get();
      
      if (!tableExists) {
        // Table doesn't exist, migrations will create it
        return;
      }
      
      // Check table structure
      const columns = this.db.prepare(`
        PRAGMA table_info(semantic_concepts)
      `).all() as Array<{ name: string; type: string }>;
      
      const columnNames = columns.map(col => col.name);
      
      // Check if table has old schema (concept_name) or new schema (name)
      const hasOldSchema = columnNames.includes('concept_name') && !columnNames.includes('name');
      const hasNewSchema = columnNames.includes('name');
      
      if (hasOldSchema) {
        // Table has old schema, need to migrate
        Logger.info('Detected old schema in semantic_concepts table (concept_name, concept_type, confidence_score)');
        Logger.info('Migrating to new schema (name, type, confidence)...');
        this.migrateSemanticConceptsTable(columns);
        Logger.info('Schema migration completed successfully');
      }
      
      // Check if context column exists (for both old and new schema)
      const hasContextColumn = columnNames.includes('context');
      
      if (!hasContextColumn) {
        Logger.info('Adding missing context column to semantic_concepts table');
        this.db.exec('ALTER TABLE semantic_concepts ADD COLUMN context TEXT DEFAULT ""');
        Logger.info('Context column added successfully');
      }
    } catch (error) {
      Logger.warn('Schema integrity check failed:', error);
      // Don't throw - allow system to continue, but log the issue
    }
  }

  /**
   * Migrate semantic_concepts table from old schema to new schema
   * Old schema: concept_name, concept_type, confidence_score, file_path
   * New schema: name, type, confidence, context
   */
  private migrateSemanticConceptsTable(oldColumns: Array<{ name: string; type: string }>): void {
    const columnNames = oldColumns.map(col => col.name);
    const hasFilePath = columnNames.includes('file_path');
    const hasCreatedAt = columnNames.includes('created_at');
    
    Logger.info('Starting semantic_concepts table migration...');
    Logger.info(`Detected columns: ${columnNames.join(', ')}`);
    
    // Use transaction to ensure atomicity
    const migrateTransaction = this.db.transaction(() => {
      try {
        // Step 1: Create new table with correct schema
        Logger.info('Creating new table with correct schema...');
        this.db.exec(`
          CREATE TABLE semantic_concepts_new (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            confidence REAL NOT NULL,
            context TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        // Step 2: Copy data from old table, mapping old column names to new ones
        Logger.info('Copying data from old table to new table...');
        const insertQuery = `
          INSERT INTO semantic_concepts_new (id, name, type, confidence, context, created_at)
          SELECT 
            id,
            concept_name as name,
            concept_type as type,
            confidence_score as confidence,
            ${hasFilePath ? 'COALESCE(file_path, \'\')' : '\'\''} as context,
            ${hasCreatedAt ? 'created_at' : 'CURRENT_TIMESTAMP'} as created_at
          FROM semantic_concepts
        `;
        
        this.db.exec(insertQuery);
        
        // Step 3: Get row count for verification
        const oldCount = this.db.prepare('SELECT COUNT(*) as count FROM semantic_concepts').get() as { count: number };
        const newCount = this.db.prepare('SELECT COUNT(*) as count FROM semantic_concepts_new').get() as { count: number };
        
        if (oldCount.count !== newCount.count) {
          throw new Error(`Data migration failed: row count mismatch. Old: ${oldCount.count}, New: ${newCount.count}`);
        }
        
        Logger.info(`Successfully copied ${oldCount.count} rows from old table to new table`);
        
        // Step 4: Drop old table
        Logger.info('Dropping old table...');
        this.db.exec('DROP TABLE semantic_concepts');
        
        // Step 5: Rename new table
        Logger.info('Renaming new table...');
        this.db.exec('ALTER TABLE semantic_concepts_new RENAME TO semantic_concepts');
        
        // Step 6: Recreate indexes
        Logger.info('Recreating indexes...');
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_semantic_concepts_type ON semantic_concepts(type)');
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_semantic_concepts_name ON semantic_concepts(name)');
        
        Logger.info('Table migration completed successfully');
      } catch (error) {
        Logger.error('Error during table migration:', error);
        // Clean up new table if it exists
        try {
          this.db.exec('DROP TABLE IF EXISTS semantic_concepts_new');
        } catch (cleanupError) {
          Logger.warn('Failed to clean up new table during error recovery:', cleanupError);
        }
        throw error;
      }
    });
    
    // Execute the transaction
    try {
      migrateTransaction();
    } catch (error) {
      Logger.error('Transaction failed during semantic_concepts migration:', error);
      throw error;
    }
  }

  getMigrator(): DatabaseMigrator {
    return this.migrator;
  }

  // Semantic Concepts
  insertSemanticConcept(concept: Omit<SemanticConcept, 'createdAt' | 'updatedAt'>): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO semantic_concepts (
        id, name, type, confidence, context
      ) VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      concept.id,
      concept.conceptName,
      concept.conceptType,
      concept.confidenceScore,
      concept.filePath || ''
    );
  }

  getSemanticConcepts(filePath?: string): SemanticConcept[] {
    let query = 'SELECT * FROM semantic_concepts';
    let params: QueryParams = [];

    // If filePath is provided, try to use context column
    // If context column doesn't exist, fall back to no filtering
    if (filePath) {
      try {
        // Check if context column exists by trying to prepare the query
        const testQuery = 'SELECT * FROM semantic_concepts WHERE context = ? LIMIT 1';
        const testStmt = this.db.prepare(testQuery);
        // Try to execute with a dummy value to see if column exists
        testStmt.get(filePath);
        // If we get here, context column exists, use it
        query += ' WHERE context = ?';
        params = [filePath];
      } catch (error) {
        // Context column doesn't exist, query without filter
        Logger.debug('Context column not available, querying all concepts');
        query = 'SELECT * FROM semantic_concepts';
        params = [];
      }
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as DatabaseRow[];

    return rows.map((row: DatabaseRow) => ({
      id: String(row.id),
      conceptName: String(row.name),
      conceptType: String(row.type),
      confidenceScore: Number(row.confidence),
      relationships: {},
      evolutionHistory: {},
      filePath: String(row.context || row.file_path || ''), // Fallback to file_path if context missing
      lineRange: { start: 0, end: 0 },
      createdAt: new Date(String(row.created_at)),
      updatedAt: new Date(String(row.created_at)) // Use created_at as updated_at for simplified schema
    }));
  }

  // Developer Patterns
  insertDeveloperPattern(pattern: Omit<DeveloperPattern, 'createdAt' | 'lastSeen'>): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO developer_patterns (
        id, category, name, frequency, examples
      ) VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      pattern.patternId,
      pattern.patternType,
      JSON.stringify(pattern.patternContent),
      pattern.frequency,
      JSON.stringify(pattern.examples)
    );
  }

  getDeveloperPatterns(patternType?: string, limit?: number): DeveloperPattern[] {
    let query = 'SELECT * FROM developer_patterns';
    let params: QueryParams = [];

    if (patternType) {
      query += ' WHERE category = ?';
      params = [patternType];
    }

    query += ' ORDER BY frequency DESC';

    // Apply limit to prevent token overflow (default: 50 patterns max)
    if (limit !== undefined && limit > 0) {
      query += ' LIMIT ?';
      params.push(limit);
    } else if (limit === undefined) {
      // Default limit to prevent unbounded queries
      query += ' LIMIT 50';
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as DatabaseRow[];

    return rows.map((row: DatabaseRow) => ({
      patternId: String(row.id),
      patternType: String(row.category),
      patternContent: JSON.parse(String(row.name || '{}')), // Parse name as JSON content
      frequency: Number(row.frequency),
      contexts: [],
      examples: JSON.parse(String(row.examples || '[]')),
      confidence: 0.5, // Default confidence for simplified schema
      createdAt: new Date(String(row.created_at)),
      lastSeen: new Date(String(row.created_at)) // Use created_at as lastSeen for simplified schema
    }));
  }

  // AI Insights - table dropped in migration 8, methods stubbed as no-ops
  insertAIInsight(insight: Omit<AIInsight, 'createdAt'>): void {
    Logger.warn('insertAIInsight called but ai_insights table was dropped in migration 8. Operation ignored.');
  }

  getAIInsights(insightType?: string): AIInsight[] {
    Logger.warn('getAIInsights called but ai_insights table was dropped in migration 8. Returning empty array.');
    return [];
  }

  insertFeatureMap(feature: Omit<FeatureMap, 'createdAt' | 'updatedAt'>): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO feature_map (
        id, project_path, feature_name, primary_files, related_files,
        dependencies, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      feature.id,
      feature.projectPath,
      feature.featureName,
      JSON.stringify(feature.primaryFiles),
      JSON.stringify(feature.relatedFiles),
      JSON.stringify(feature.dependencies),
      feature.status
    );
  }

  getFeatureMaps(projectPath: string): FeatureMap[] {
    // Normalize path - try both absolute and relative (.) paths
    const paths = [projectPath];

    // If absolute path, also try relative "."
    if (isAbsolute(projectPath)) {
      paths.push('.');
    }

    // Try to find feature maps with any of the path variants
    let rows: DatabaseRow[] = [];
    for (const path of paths) {
      const stmt = this.db.prepare(`
        SELECT * FROM feature_map WHERE project_path = ? AND status = 'active'
        ORDER BY feature_name
      `);
      rows = stmt.all(path) as DatabaseRow[];
      if (rows.length > 0) break;
    }

    return rows.map((row: DatabaseRow) => ({
      id: String(row.id),
      projectPath: String(row.project_path),
      featureName: String(row.feature_name),
      primaryFiles: JSON.parse(String(row.primary_files || '[]')),
      relatedFiles: JSON.parse(String(row.related_files || '[]')),
      dependencies: JSON.parse(String(row.dependencies || '[]')),
      status: String(row.status),
      createdAt: new Date(String(row.created_at) + ' UTC'),
      updatedAt: new Date(String(row.updated_at) + ' UTC')
    }));
  }

  searchFeatureMaps(projectPath: string, query: string): FeatureMap[] {
    const stmt = this.db.prepare(`
      SELECT * FROM feature_map
      WHERE project_path = ? AND status = 'active'
        AND (feature_name LIKE ? OR feature_name LIKE ? OR feature_name LIKE ?)
      ORDER BY feature_name
    `);
    const searchPattern = `%${query}%`;
    const rows = stmt.all(projectPath, searchPattern, searchPattern.toLowerCase(), searchPattern.toUpperCase()) as DatabaseRow[];

    return rows.map((row: DatabaseRow) => ({
      id: String(row.id),
      projectPath: String(row.project_path),
      featureName: String(row.feature_name),
      primaryFiles: JSON.parse(String(row.primary_files || '[]')),
      relatedFiles: JSON.parse(String(row.related_files || '[]')),
      dependencies: JSON.parse(String(row.dependencies || '[]')),
      status: String(row.status),
      createdAt: new Date(String(row.created_at) + ' UTC'),
      updatedAt: new Date(String(row.updated_at) + ' UTC')
    }));
  }

  getFeatureByName(projectPath: string, featureName: string): FeatureMap | null {
    const stmt = this.db.prepare(`
      SELECT * FROM feature_map
      WHERE project_path = ? AND feature_name = ? AND status = 'active'
      LIMIT 1
    `);
    const row = stmt.get(projectPath, featureName) as any;

    if (!row) return null;

    return {
      id: row.id,
      projectPath: row.project_path,
      featureName: row.feature_name,
      primaryFiles: JSON.parse(row.primary_files || '[]'),
      relatedFiles: JSON.parse(row.related_files || '[]'),
      dependencies: JSON.parse(row.dependencies || '[]'),
      status: row.status,
      createdAt: new Date(row.created_at + ' UTC'),
      updatedAt: new Date(row.updated_at + ' UTC')
    };
  }

  // Entry Points - table dropped in migration 8, methods stubbed as no-ops
  insertEntryPoint(entryPoint: Omit<EntryPoint, 'createdAt'>): void {
    Logger.warn('insertEntryPoint called but entry_points table was dropped in migration 8. Operation ignored.');
  }

  getEntryPoints(projectPath: string): EntryPoint[] {
    Logger.warn('getEntryPoints called but entry_points table was dropped in migration 8. Returning empty array.');
    return [];
  }

  // Key Directories - table dropped in migration 8, methods stubbed as no-ops
  insertKeyDirectory(directory: Omit<KeyDirectory, 'createdAt'>): void {
    Logger.warn('insertKeyDirectory called but key_directories table was dropped in migration 8. Operation ignored.');
  }

  getKeyDirectories(projectPath: string): KeyDirectory[] {
    Logger.warn('getKeyDirectories called but key_directories table was dropped in migration 8. Returning empty array.');
    return [];
  }

  insertProjectMetadata(metadata: {
    projectId: string;
    projectPath: string;
    projectName?: string;
    languagePrimary?: string;
    languagesDetected?: string[];
    frameworkDetected?: string[];
    intelligenceVersion?: string;
    lastFullScan?: Date;
  }): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO project_metadata (
        project_id, project_path, project_name, language_primary,
        languages_detected, framework_detected, intelligence_version, last_full_scan
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      metadata.projectId,
      metadata.projectPath,
      metadata.projectName || null,
      metadata.languagePrimary || null,
      metadata.languagesDetected ? JSON.stringify(metadata.languagesDetected) : null,
      metadata.frameworkDetected ? JSON.stringify(metadata.frameworkDetected) : null,
      metadata.intelligenceVersion || null,
      metadata.lastFullScan ? metadata.lastFullScan.toISOString() : null
    );
  }

  getProjectMetadata(projectPath: string): {
    projectId: string;
    projectPath: string;
    projectName?: string;
    languagePrimary?: string;
    languagesDetected: string[];
    frameworkDetected: string[];
    intelligenceVersion?: string;
    lastFullScan?: Date;
    createdAt: Date;
    updatedAt: Date;
  } | null {
    const stmt = this.db.prepare(`
      SELECT * FROM project_metadata WHERE project_path = ? LIMIT 1
    `);
    const row = stmt.get(projectPath) as any;

    if (!row) return null;

    return {
      projectId: row.project_id,
      projectPath: row.project_path,
      projectName: row.project_name,
      languagePrimary: row.language_primary,
      languagesDetected: JSON.parse(row.languages_detected || '[]'),
      frameworkDetected: JSON.parse(row.framework_detected || '[]'),
      intelligenceVersion: row.intelligence_version,
      // last_full_scan is stored as an ISO timestamp string via insertProjectMetadata,
      // so we should parse it directly rather than appending an extra timezone suffix.
      lastFullScan: row.last_full_scan ? new Date(row.last_full_scan) : undefined,
      createdAt: new Date(row.created_at + ' UTC'),
      updatedAt: new Date(row.updated_at + ' UTC')
    };
  }

  // Work Sessions - table dropped in migration 8, methods stubbed as no-ops
  createWorkSession(session: Omit<WorkSession, 'sessionStart' | 'lastUpdated'>): void {
    Logger.warn('createWorkSession called but work_sessions table was dropped in migration 8. Operation ignored.');
  }

  updateWorkSession(sessionId: string, updates: Partial<Omit<WorkSession, 'id' | 'projectPath' | 'sessionStart' | 'lastUpdated'>>): void {
    Logger.warn('updateWorkSession called but work_sessions table was dropped in migration 8. Operation ignored.');
  }

  getCurrentWorkSession(projectPath: string): WorkSession | null {
    Logger.warn('getCurrentWorkSession called but work_sessions table was dropped in migration 8. Returning null.');
    return null;
  }

  getWorkSessions(projectPath: string, limit = 10): WorkSession[] {
    Logger.warn('getWorkSessions called but work_sessions table was dropped in migration 8. Returning empty array.');
    return [];
  }

  // Project Decisions - table dropped in migration 8, methods stubbed as no-ops
  upsertProjectDecision(decision: Omit<ProjectDecision, 'madeAt'>): void {
    Logger.warn('upsertProjectDecision called but project_decisions table was dropped in migration 8. Operation ignored.');
  }

  getProjectDecisions(projectPath: string, limit = 20): ProjectDecision[] {
    Logger.warn('getProjectDecisions called but project_decisions table was dropped in migration 8. Returning empty array.');
    return [];
  }

  getProjectDecision(projectPath: string, decisionKey: string): ProjectDecision | null {
    Logger.warn('getProjectDecision called but project_decisions table was dropped in migration 8. Returning null.');
    return null;
  }

  close(): void {
    this.db.close();
  }
}