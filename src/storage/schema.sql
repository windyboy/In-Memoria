-- Simplified schema for In-Memoria (Post-refactor)
-- Only four core tables as per the architectural refactor

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

-- Optional feature mapping
CREATE TABLE IF NOT EXISTS feature_map (
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

-- Project metadata and learning state
CREATE TABLE IF NOT EXISTS project_metadata (
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_semantic_concepts_type ON semantic_concepts(type);
CREATE INDEX IF NOT EXISTS idx_semantic_concepts_name ON semantic_concepts(name);
CREATE INDEX IF NOT EXISTS idx_developer_patterns_category ON developer_patterns(category);
CREATE INDEX IF NOT EXISTS idx_developer_patterns_frequency ON developer_patterns(frequency DESC);
CREATE INDEX IF NOT EXISTS idx_feature_map_name ON feature_map(feature_name);
CREATE INDEX IF NOT EXISTS idx_project_metadata_path ON project_metadata(project_path);