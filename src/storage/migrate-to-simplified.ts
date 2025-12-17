#!/usr/bin/env node

/**
 * Migration utility to convert existing In-Memoria databases to simplified schema
 * 
 * Usage:
 *   npm run migrate-db [database-path]
 *   
 * If no path is provided, it will migrate the default database location
 */

import { resolve } from 'path';
import { existsSync } from 'fs';
import Database from 'better-sqlite3';
import { SchemaMigrator } from './schema-migrator.js';
import { Logger } from '../utils/logger.js';

function printUsage() {
  console.log(`
Usage: npm run migrate-db [database-path]

Migrates an existing In-Memoria database to the simplified schema.

Arguments:
  database-path    Path to the SQLite database file (optional)
                   Default: ./in-memoria.db

Examples:
  npm run migrate-db
  npm run migrate-db ./my-project/in-memoria.db
  npm run migrate-db /absolute/path/to/database.db

The migration will:
1. Backup existing data from core tables
2. Drop legacy tables (architectural_decisions, ai_insights, etc.)
3. Restructure core tables to simplified schema
4. Preserve essential data (concepts, patterns, features, metadata)
5. Create optimized indexes for the new schema

⚠️  IMPORTANT: This operation modifies your database. 
   Make sure to backup your database before running this migration!
`);
}

function validateDatabasePath(dbPath: string): boolean {
  if (!existsSync(dbPath)) {
    console.error(`❌ Database file not found: ${dbPath}`);
    return false;
  }

  // Try to open the database to ensure it's valid
  try {
    const testDb = new Database(dbPath, { readonly: true });
    testDb.close();
    return true;
  } catch (error) {
    console.error(`❌ Invalid database file: ${dbPath}`);
    console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

function createBackup(dbPath: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${dbPath}.backup-${timestamp}`;
  
  try {
    // Simple file copy for backup
    const fs = require('fs');
    fs.copyFileSync(dbPath, backupPath);
    console.log(`✅ Backup created: ${backupPath}`);
    return backupPath;
  } catch (error) {
    console.error(`❌ Failed to create backup: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

function getTableCounts(db: Database.Database): Record<string, number> {
  const tables = ['semantic_concepts', 'developer_patterns', 'feature_map', 'project_metadata'];
  const counts: Record<string, number> = {};

  for (const table of tables) {
    try {
      const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
      counts[table] = result.count;
    } catch (error) {
      counts[table] = 0; // Table doesn't exist
    }
  }

  return counts;
}

function printMigrationSummary(beforeCounts: Record<string, number>, afterCounts: Record<string, number>) {
  console.log('\n📊 Migration Summary:');
  console.log('┌─────────────────────┬─────────┬────────┬────────────┐');
  console.log('│ Table               │ Before  │ After  │ Status     │');
  console.log('├─────────────────────┼─────────┼────────┼────────────┤');
  
  for (const table of Object.keys(afterCounts)) {
    const before = beforeCounts[table] || 0;
    const after = afterCounts[table] || 0;
    const status = before === after ? '✅ Preserved' : after > before ? '📈 Increased' : '📉 Decreased';
    
    console.log(`│ ${table.padEnd(19)} │ ${String(before).padStart(7)} │ ${String(after).padStart(6)} │ ${status.padEnd(10)} │`);
  }
  
  console.log('└─────────────────────┴─────────┴────────┴────────────┘');
}

async function main() {
  const args = process.argv.slice(2);
  
  // Handle help flag
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  // Determine database path
  const dbPath = args[0] ? resolve(args[0]) : resolve('./in-memoria.db');
  
  console.log(`🔍 Checking database: ${dbPath}`);
  
  // Validate database exists and is accessible
  if (!validateDatabasePath(dbPath)) {
    console.error('\n💡 If you need to create a new database, use the In-Memoria CLI:');
    console.error('   npm run learn /path/to/your/project');
    process.exit(1);
  }

  console.log(`✅ Database found and accessible`);

  // Open database and check if migration is needed
  const db = new Database(dbPath);
  const migrator = new SchemaMigrator(db);

  try {
    if (!migrator.needsSimplification()) {
      console.log('✅ Database already uses simplified schema - no migration needed!');
      
      // Validate schema anyway
      if (migrator.validateSimplifiedSchema()) {
        console.log('✅ Schema validation passed');
      } else {
        console.log('⚠️  Schema validation failed - database may have issues');
      }
      
      db.close();
      process.exit(0);
    }

    console.log('📋 Legacy schema detected - migration required');

    // Get record counts before migration
    const beforeCounts = getTableCounts(db);
    const totalRecords = Object.values(beforeCounts).reduce((sum, count) => sum + count, 0);
    
    console.log(`📊 Found ${totalRecords} total records across core tables`);

    // Create backup
    console.log('\n💾 Creating backup...');
    const backupPath = createBackup(dbPath);

    // Confirm migration
    console.log('\n⚠️  Ready to migrate database to simplified schema');
    console.log('   This will:');
    console.log('   • Drop legacy tables (architectural_decisions, ai_insights, etc.)');
    console.log('   • Restructure core tables with simplified columns');
    console.log('   • Preserve essential data from semantic_concepts, developer_patterns, feature_map, project_metadata');
    console.log('   • Create optimized indexes');
    console.log(`   • Backup saved to: ${backupPath}`);

    // In a real CLI, you'd want to prompt for confirmation
    // For now, we'll proceed automatically
    console.log('\n🚀 Starting migration...');

    // Perform migration
    migrator.migrateToSimplifiedSchema();

    // Validate migration
    if (!migrator.validateSimplifiedSchema()) {
      throw new Error('Migration validation failed - database may be corrupted');
    }

    // Get record counts after migration
    const afterCounts = getTableCounts(db);
    
    console.log('✅ Migration completed successfully!');
    
    // Print summary
    printMigrationSummary(beforeCounts, afterCounts);
    
    console.log('\n🎉 Database successfully migrated to simplified schema');
    console.log(`💾 Original database backed up to: ${backupPath}`);
    console.log('\n📝 Next steps:');
    console.log('   • Test your application with the migrated database');
    console.log('   • If everything works correctly, you can delete the backup file');
    console.log('   • If you encounter issues, restore from backup and report the problem');

  } catch (error) {
    console.error('\n❌ Migration failed!');
    console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    console.error('\n🔧 Recovery options:');
    console.error('   1. Restore from backup if one was created');
    console.error('   2. Check database file permissions');
    console.error('   3. Ensure database is not in use by another process');
    console.error('   4. Report this issue with the error details');
    
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run the migration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}

export { main as migrateDatabaseToSimplified };