-- Migration 8: Simplify database schema to four core tables
-- This migration consolidates the database to only the essential tables needed for the refactored system

-- Drop unused legacy tables
DROP TABLE IF EXISTS architectural_decisions;
DROP TABLE IF EXISTS shared_patterns;
DROP TABLE IF EXISTS ai_insights;
DROP TABLE IF EXISTS file_intelligence;
DROP TABLE IF EXISTS vector_cache;
DROP TABLE IF EXISTS entry_points;
DROP TABLE IF EXISTS key_directories;
DROP TABLE IF EXISTS work_sessions;
DROP TABLE IF EXISTS project_decisions;

-- Drop related indexes
DROP INDEX IF EXISTS idx_ai_insights_type;
DROP INDEX IF EXISTS idx_ai_insights_confidence;
DROP INDEX IF EXISTS idx_ai_insights_source_agent;
DROP INDEX IF EXISTS idx_file_intelligence_file_path;
DROP INDEX IF EXISTS idx_file_intelligence_analyzed;
DROP INDEX IF EXISTS idx_entry_points_project;
DROP INDEX IF EXISTS idx_key_directories_project;
DROP INDEX IF EXISTS idx_work_sessions_project;
DROP INDEX IF EXISTS idx_work_sessions_updated;
DROP INDEX IF EXISTS idx_project_decisions_key;

-- Update semantic_concepts table to match simplified schema
-- Remove unnecessary columns and standardize naming
CREATE TABLE semantic_concepts_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  confidence REAL NOT NULL,
  context TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Copy data from old table with column mapping
INSERT INTO semantic_concepts_new (id, name, type, confidence, context, created_at)
SELECT 
  id,
  concept_name,
  concept_type,
  confidence_score,
  COALESCE(file_path, ''),
  created_at
FROM semantic_concepts;

-- Replace old table
DROP TABLE semantic_concepts;
ALTER TABLE semantic_concepts_new RENAME TO semantic_concepts;

-- Update developer_patterns table to match simplified schema
CREATE TABLE developer_patterns_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  frequency INTEGER NOT NULL,
  examples TEXT, -- JSON array
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Copy data from old table with column mapping
INSERT INTO developer_patterns_new (id, name, category, frequency, examples, created_at)
SELECT 
  pattern_id,
  pattern_type,
  pattern_type, -- Use pattern_type as category
  frequency,
  examples,
  created_at
FROM developer_patterns;

-- Replace old table
DROP TABLE developer_patterns;
ALTER TABLE developer_patterns_new RENAME TO developer_patterns;

-- Keep feature_map table as is (already matches current schema)
-- Ensure it has the correct structure with project_path, primary_files, etc.
CREATE TABLE IF NOT EXISTS feature_map_new (
  id TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  feature_name TEXT NOT NULL,
  primary_files TEXT, -- JSON array
  related_files TEXT, -- JSON array
  dependencies TEXT, -- JSON array
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Copy data from existing feature_map if it exists, handling both old and new schemas
INSERT INTO feature_map_new (id, project_path, feature_name, primary_files, related_files, dependencies, status, created_at, updated_at)
SELECT 
  id,
  COALESCE(project_path, ''),
  feature_name,
  COALESCE(primary_files, file_paths, '[]'),
  COALESCE(related_files, '[]'),
  COALESCE(dependencies, '[]'),
  COALESCE(status, 'active'),
  created_at,
  COALESCE(updated_at, created_at, datetime('now'))
FROM feature_map;

-- Replace old table
DROP TABLE IF EXISTS feature_map;
ALTER TABLE feature_map_new RENAME TO feature_map;

-- Update project_metadata table - keep current schema structure
-- Ensure it has project_id as PRIMARY KEY (matching schema.sql)
CREATE TABLE IF NOT EXISTS project_metadata_new (
  project_id TEXT PRIMARY KEY,
  project_path TEXT NOT NULL UNIQUE,
  project_name TEXT,
  language_primary TEXT,
  languages_detected TEXT, -- JSON array
  framework_detected TEXT, -- JSON array
  intelligence_version TEXT,
  last_full_scan DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Copy data from old table with column mapping
INSERT INTO project_metadata_new (project_id, project_path, project_name, language_primary, languages_detected, framework_detected, intelligence_version, last_full_scan, created_at, updated_at)
SELECT 
  COALESCE(project_id, project_path), -- Use project_path as project_id if project_id missing
  project_path,
  project_name,
  language_primary,
  COALESCE(languages_detected, languages, '[]'),
  COALESCE(framework_detected, frameworks, '[]'),
  COALESCE(intelligence_version, version),
  COALESCE(last_full_scan, last_learned),
  COALESCE(created_at, datetime('now')),
  COALESCE(updated_at, datetime('now'))
FROM project_metadata;

-- Replace old table
DROP TABLE IF EXISTS project_metadata;
ALTER TABLE project_metadata_new RENAME TO project_metadata;

-- Create indexes for the simplified schema
CREATE INDEX IF NOT EXISTS idx_semantic_concepts_type ON semantic_concepts(type);
CREATE INDEX IF NOT EXISTS idx_semantic_concepts_name ON semantic_concepts(name);
CREATE INDEX IF NOT EXISTS idx_developer_patterns_category ON developer_patterns(category);
CREATE INDEX IF NOT EXISTS idx_developer_patterns_frequency ON developer_patterns(frequency DESC);
CREATE INDEX IF NOT EXISTS idx_feature_map_name ON feature_map(feature_name);
CREATE INDEX IF NOT EXISTS idx_project_metadata_path ON project_metadata(project_path);