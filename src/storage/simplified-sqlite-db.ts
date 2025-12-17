import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { SchemaMigrator } from './schema-migrator.js';
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

/**
 * Simplified semantic concept interface matching the new schema
 */
export interface SemanticConcept {
  id: string;
  name: string;
  type: string;
  confidence: number;
  context: string;
  createdAt: Date;
}

/**
 * Simplified developer pattern interface matching the new schema
 */
export interface DeveloperPattern {
  id: string;
  name: string;
  category: string;
  frequency: number;
  examples: Record<string, any>[];
  createdAt: Date;
}

/**
 * Simplified feature map interface matching the new schema
 */
export interface FeatureMap {
  id: string;
  featureName: string;
  filePaths: string[];
  confidence: number;
  createdAt: Date;
}

/**
 * Simplified project metadata interface matching the new schema
 */
export interface ProjectMetadata {
  projectPath: string;
  lastLearned: Date;
  version?: string;
  languages: string[];
  frameworks: string[];
  stats: Record<string, any>;
}

/**
 * Simplified SQLite database implementation for the refactored In-Memoria system
 * This class provides access to only the four core tables: semantic_concepts, 
 * developer_patterns, feature_map, and project_metadata
 */
export class SimplifiedSQLiteDatabase {
  private db: Database.Database;
  private migrator: SchemaMigrator;

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
    this.migrator = new SchemaMigrator(this.db);
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    // Check if we need to migrate from legacy schema
    if (this.migrator.needsSimplification()) {
      Logger.info('Legacy schema detected, migrating to simplified schema...');
      this.migrator.migrateToSimplifiedSchema();
    } else {
      // Create simplified schema from scratch
      this.migrator.createSimplifiedSchema();
    }
    
    // Validate the schema is correct
    if (!this.migrator.validateSimplifiedSchema()) {
      throw new Error('Failed to create or validate simplified database schema');
    }
  }

  getMigrator(): SchemaMigrator {
    return this.migrator;
  }

  // Semantic Concepts Operations
  insertSemanticConcept(concept: Omit<SemanticConcept, 'createdAt'>): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO semantic_concepts (
        id, name, type, confidence, context
      ) VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      concept.id,
      concept.name,
      concept.type,
      concept.confidence,
      concept.context
    );
  }

  getSemanticConcepts(type?: string): SemanticConcept[] {
    let query = 'SELECT * FROM semantic_concepts';
    let params: QueryParams = [];

    if (type) {
      query += ' WHERE type = ?';
      params = [type];
    }

    query += ' ORDER BY confidence DESC, name';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as DatabaseRow[];

    return rows.map((row: DatabaseRow) => ({
      id: String(row.id),
      name: String(row.name),
      type: String(row.type),
      confidence: Number(row.confidence),
      context: String(row.context || ''),
      createdAt: new Date(String(row.created_at))
    }));
  }

  getSemanticConceptById(id: string): SemanticConcept | null {
    const stmt = this.db.prepare('SELECT * FROM semantic_concepts WHERE id = ?');
    const row = stmt.get(id) as DatabaseRow | undefined;

    if (!row) return null;

    return {
      id: String(row.id),
      name: String(row.name),
      type: String(row.type),
      confidence: Number(row.confidence),
      context: String(row.context || ''),
      createdAt: new Date(String(row.created_at))
    };
  }

  searchSemanticConcepts(query: string): SemanticConcept[] {
    const stmt = this.db.prepare(`
      SELECT * FROM semantic_concepts
      WHERE name LIKE ? OR context LIKE ?
      ORDER BY confidence DESC, name
      LIMIT 50
    `);
    const searchPattern = `%${query}%`;
    const rows = stmt.all(searchPattern, searchPattern) as DatabaseRow[];

    return rows.map((row: DatabaseRow) => ({
      id: String(row.id),
      name: String(row.name),
      type: String(row.type),
      confidence: Number(row.confidence),
      context: String(row.context || ''),
      createdAt: new Date(String(row.created_at))
    }));
  }

  // Developer Patterns Operations
  insertDeveloperPattern(pattern: Omit<DeveloperPattern, 'createdAt'>): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO developer_patterns (
        id, name, category, frequency, examples
      ) VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      pattern.id,
      pattern.name,
      pattern.category,
      pattern.frequency,
      JSON.stringify(pattern.examples)
    );
  }

  getDeveloperPatterns(category?: string, limit?: number): DeveloperPattern[] {
    let query = 'SELECT * FROM developer_patterns';
    let params: QueryParams = [];

    if (category) {
      query += ' WHERE category = ?';
      params = [category];
    }

    query += ' ORDER BY frequency DESC, name';

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
      id: String(row.id),
      name: String(row.name),
      category: String(row.category),
      frequency: Number(row.frequency),
      examples: JSON.parse(String(row.examples || '[]')),
      createdAt: new Date(String(row.created_at))
    }));
  }

  getDeveloperPatternById(id: string): DeveloperPattern | null {
    const stmt = this.db.prepare('SELECT * FROM developer_patterns WHERE id = ?');
    const row = stmt.get(id) as DatabaseRow | undefined;

    if (!row) return null;

    return {
      id: String(row.id),
      name: String(row.name),
      category: String(row.category),
      frequency: Number(row.frequency),
      examples: JSON.parse(String(row.examples || '[]')),
      createdAt: new Date(String(row.created_at))
    };
  }

  searchDeveloperPatterns(query: string): DeveloperPattern[] {
    const stmt = this.db.prepare(`
      SELECT * FROM developer_patterns
      WHERE name LIKE ? OR category LIKE ?
      ORDER BY frequency DESC, name
      LIMIT 50
    `);
    const searchPattern = `%${query}%`;
    const rows = stmt.all(searchPattern, searchPattern) as DatabaseRow[];

    return rows.map((row: DatabaseRow) => ({
      id: String(row.id),
      name: String(row.name),
      category: String(row.category),
      frequency: Number(row.frequency),
      examples: JSON.parse(String(row.examples || '[]')),
      createdAt: new Date(String(row.created_at))
    }));
  }

  // Feature Map Operations
  insertFeatureMap(feature: Omit<FeatureMap, 'createdAt'>): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO feature_map (
        id, feature_name, file_paths, confidence
      ) VALUES (?, ?, ?, ?)
    `);

    stmt.run(
      feature.id,
      feature.featureName,
      JSON.stringify(feature.filePaths),
      feature.confidence
    );
  }

  getFeatureMaps(): FeatureMap[] {
    const stmt = this.db.prepare(`
      SELECT * FROM feature_map
      ORDER BY feature_name
    `);
    const rows = stmt.all() as DatabaseRow[];

    return rows.map((row: DatabaseRow) => ({
      id: String(row.id),
      featureName: String(row.feature_name),
      filePaths: JSON.parse(String(row.file_paths || '[]')),
      confidence: Number(row.confidence),
      createdAt: new Date(String(row.created_at))
    }));
  }

  getFeatureMapById(id: string): FeatureMap | null {
    const stmt = this.db.prepare('SELECT * FROM feature_map WHERE id = ?');
    const row = stmt.get(id) as DatabaseRow | undefined;

    if (!row) return null;

    return {
      id: String(row.id),
      featureName: String(row.feature_name),
      filePaths: JSON.parse(String(row.file_paths || '[]')),
      confidence: Number(row.confidence),
      createdAt: new Date(String(row.created_at))
    };
  }

  getFeatureMapByName(featureName: string): FeatureMap | null {
    const stmt = this.db.prepare('SELECT * FROM feature_map WHERE feature_name = ?');
    const row = stmt.get(featureName) as DatabaseRow | undefined;

    if (!row) return null;

    return {
      id: String(row.id),
      featureName: String(row.feature_name),
      filePaths: JSON.parse(String(row.file_paths || '[]')),
      confidence: Number(row.confidence),
      createdAt: new Date(String(row.created_at))
    };
  }

  searchFeatureMaps(query: string): FeatureMap[] {
    const stmt = this.db.prepare(`
      SELECT * FROM feature_map
      WHERE feature_name LIKE ?
      ORDER BY confidence DESC, feature_name
      LIMIT 50
    `);
    const searchPattern = `%${query}%`;
    const rows = stmt.all(searchPattern) as DatabaseRow[];

    return rows.map((row: DatabaseRow) => ({
      id: String(row.id),
      featureName: String(row.feature_name),
      filePaths: JSON.parse(String(row.file_paths || '[]')),
      confidence: Number(row.confidence),
      createdAt: new Date(String(row.created_at))
    }));
  }

  // Project Metadata Operations
  insertProjectMetadata(metadata: ProjectMetadata): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO project_metadata (
        project_path, last_learned, version, languages, frameworks, stats
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      metadata.projectPath,
      metadata.lastLearned.toISOString(),
      metadata.version || null,
      JSON.stringify(metadata.languages),
      JSON.stringify(metadata.frameworks),
      JSON.stringify(metadata.stats)
    );
  }

  getProjectMetadata(projectPath: string): ProjectMetadata | null {
    const stmt = this.db.prepare(`
      SELECT * FROM project_metadata WHERE project_path = ? LIMIT 1
    `);
    const row = stmt.get(projectPath) as DatabaseRow | undefined;

    if (!row) return null;

    return {
      projectPath: String(row.project_path),
      lastLearned: new Date(String(row.last_learned)),
      version: row.version ? String(row.version) : undefined,
      languages: JSON.parse(String(row.languages || '[]')),
      frameworks: JSON.parse(String(row.frameworks || '[]')),
      stats: JSON.parse(String(row.stats || '{}'))
    };
  }

  getAllProjectMetadata(): ProjectMetadata[] {
    const stmt = this.db.prepare(`
      SELECT * FROM project_metadata
      ORDER BY last_learned DESC
    `);
    const rows = stmt.all() as DatabaseRow[];

    return rows.map((row: DatabaseRow) => ({
      projectPath: String(row.project_path),
      lastLearned: new Date(String(row.last_learned)),
      version: row.version ? String(row.version) : undefined,
      languages: JSON.parse(String(row.languages || '[]')),
      frameworks: JSON.parse(String(row.frameworks || '[]')),
      stats: JSON.parse(String(row.stats || '{}'))
    }));
  }

  // Utility Methods
  getTableCounts(): Record<string, number> {
    const tables = ['semantic_concepts', 'developer_patterns', 'feature_map', 'project_metadata'];
    const counts: Record<string, number> = {};

    for (const table of tables) {
      const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${table}`);
      const result = stmt.get() as { count: number };
      counts[table] = result.count;
    }

    return counts;
  }

  clearAllData(): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM semantic_concepts').run();
      this.db.prepare('DELETE FROM developer_patterns').run();
      this.db.prepare('DELETE FROM feature_map').run();
      this.db.prepare('DELETE FROM project_metadata').run();
    })();
  }

  close(): void {
    this.db.close();
  }
}