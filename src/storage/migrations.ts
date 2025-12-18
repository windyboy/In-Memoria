import Database from 'better-sqlite3';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface Migration {
  version: number;
  name: string;
  up: string;
  down?: string;
}

export class DatabaseMigrator {
  private db: Database.Database;
  private migrations: Migration[] = [];

  constructor(db: Database.Database) {
    this.db = db;
    this.initializeMigrationsTable();
    this.loadMigrations();
  }

  private initializeMigrationsTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at DATETIME DEFAULT (datetime('now', 'utc'))
      );
    `);
  }

  private loadMigrations(): void {
    // Migration 1: Initial schema (simplified - includes all necessary indexes)
    this.migrations.push({
      version: 1,
      name: 'initial_schema',
      up: this.loadMigrationFile('001_initial_schema.sql')
    });

    // Migration 8: Simplified schema (no-op since we start with simplified schema)
    this.migrations.push({
      version: 8,
      name: 'simplified_schema_noop',
      up: `-- No-op migration: simplified schema is already in place from migration 1`
    });
  }

  private loadMigrationFile(filename: string): string {
    const migrationPath = join(__dirname, 'migrations', filename);
    if (existsSync(migrationPath)) {
      return readFileSync(migrationPath, 'utf-8');
    }
    // Fallback to schema.sql for initial migration
    const schemaPath = join(__dirname, 'schema.sql');
    if (existsSync(schemaPath)) {
      return readFileSync(schemaPath, 'utf-8');
    }
    // If no schema.sql exists, return empty string (will be handled by validation)
    return '';
  }

  getCurrentVersion(): number {
    const result = this.db.prepare(`
      SELECT MAX(version) as version FROM migrations
    `).get() as { version: number | null };
    
    return result?.version ?? 0;
  }

  getLatestVersion(): number {
    return Math.max(...this.migrations.map(m => m.version));
  }

  needsMigration(): boolean {
    return this.getCurrentVersion() < this.getLatestVersion();
  }

  migrate(): void {
    const currentVersion = this.getCurrentVersion();
    const latestVersion = this.getLatestVersion();
    
    if (currentVersion >= latestVersion) {
      console.log('✅ Database is already up to date');
      return;
    }

    console.log(`Migrating database from version ${currentVersion} to ${latestVersion}`);

    // Run migrations in a transaction
    this.db.transaction(() => {
      for (const migration of this.migrations) {
        if (migration.version > currentVersion) {
          console.log(`Applying migration ${migration.version}: ${migration.name}`);
          
          try {
            // Execute the migration
            this.db.exec(migration.up);
            
            // Validate migration success by checking data integrity
            this.validateMigration(migration);
            
            // Record the migration
            this.db.prepare(`
              INSERT INTO migrations (version, name) VALUES (?, ?)
            `).run(migration.version, migration.name);
            
            console.log(`✅ Migration ${migration.version} applied and validated successfully`);
          } catch (error) {
            console.error(`❌ Migration ${migration.version} failed:`, error);
            throw new Error(`Migration ${migration.version} failed: ${error instanceof Error ? error.message : String(error)}. Database integrity may be compromised.`);
          }
        }
      }
    })();

    // Final validation of entire migration process
    this.validateDatabaseIntegrity();
    console.log('✅ All migrations completed and validated successfully');
  }

  /**
   * Validate individual migration success
   */
  private validateMigration(migration: Migration): void {
    try {
      switch (migration.version) {
        case 1: // Initial schema (simplified)
          this.validateTableExists(['semantic_concepts', 'developer_patterns', 'feature_map', 'project_metadata']);
          break;
        case 8: // Simplified schema (no-op)
          // No validation needed for no-op migration
          break;
        default:
          // Generic validation - check migration was recorded
          break;
      }
    } catch (validationError: unknown) {
      throw new Error(`Migration validation failed: ${validationError instanceof Error ? validationError.message : String(validationError)}`);
    }
  }

  /**
   * Validate database integrity after all migrations
   */
  private validateDatabaseIntegrity(): void {
    try {
      // After the refactor, we always use the simplified schema
      const requiredTables = [
        'semantic_concepts', 'developer_patterns', 'feature_map', 'project_metadata', 'migrations'
      ];

      for (const table of requiredTables) {
        this.validateTableExists([table]);
      }

      // Check data consistency
      const conceptCount = this.db.prepare('SELECT COUNT(*) as count FROM semantic_concepts').get() as { count: number };
      const patternCount = this.db.prepare('SELECT COUNT(*) as count FROM developer_patterns').get() as { count: number };
      
      console.log(`📊 Database integrity check: ${conceptCount.count} concepts, ${patternCount.count} patterns`);
      
    } catch (error: unknown) {
      console.error(`❌ Database integrity validation failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private validateTableExists(tables: string[]): void {
    for (const table of tables) {
      const result = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name=?
      `).get(table);
      
      if (!result) {
        throw new Error(`Required table '${table}' does not exist`);
      }
    }
  }

  rollback(targetVersion?: number): void {
    const currentVersion = this.getCurrentVersion();
    const rollbackTo = targetVersion ?? currentVersion - 1;

    if (rollbackTo >= currentVersion) {
      console.log('No rollback needed');
      return;
    }

    console.log(`Rolling back database from version ${currentVersion} to ${rollbackTo}`);

    this.db.transaction(() => {
      // Find migrations to rollback (in reverse order)
      const migrationsToRollback = this.migrations
        .filter(m => m.version > rollbackTo && m.version <= currentVersion)
        .sort((a, b) => b.version - a.version);

      for (const migration of migrationsToRollback) {
        if (migration.down) {
          console.log(`Rolling back migration ${migration.version}: ${migration.name}`);

          try {
            // Execute the rollback
            this.db.exec(migration.down);

            // Remove migration record
            this.db.prepare(`
              DELETE FROM migrations WHERE version = ?
            `).run(migration.version);

            console.log(`✅ Migration ${migration.version} rolled back successfully`);
          } catch (error) {
            console.error(`❌ Rollback ${migration.version} failed:`, error);
            throw error;
          }
        } else {
          console.warn(`⚠️ Migration ${migration.version} has no rollback script`);
          // Remove migration record for consistency
          this.db.prepare(`
            DELETE FROM migrations WHERE version = ?
          `).run(migration.version);
          console.log(`✅ Migration ${migration.version} record removed (no rollback script available)`);
        }
      }
    })();

    console.log('✅ Rollback completed successfully');
  }

  status(): void {
    const currentVersion = this.getCurrentVersion();
    const latestVersion = this.getLatestVersion();
    
    console.log(`Database Status:`);
    console.log(`  Current version: ${currentVersion}`);
    console.log(`  Latest version: ${latestVersion}`);
    console.log(`  Needs migration: ${this.needsMigration()}`);
    
    console.log(`\nApplied migrations:`);
    const appliedMigrations = this.db.prepare(`
      SELECT version, name, applied_at FROM migrations ORDER BY version
    `).all() as Array<{ version: number; name: string; applied_at: string }>;
    
    for (const migration of appliedMigrations) {
      console.log(`  ✅ v${migration.version}: ${migration.name} (${migration.applied_at})`);
    }
    
    console.log(`\nPending migrations:`);
    const pendingMigrations = this.migrations.filter(m => m.version > currentVersion);
    for (const migration of pendingMigrations) {
      console.log(`  ⏳ v${migration.version}: ${migration.name}`);
    }
  }
}