-- Minimal schema for the lightweight build
CREATE TABLE IF NOT EXISTS semantic_concepts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  confidence REAL NOT NULL,
  file_path TEXT,
  line_start INTEGER DEFAULT 0,
  line_end INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS developer_patterns (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  description TEXT,
  frequency INTEGER DEFAULT 1,
  examples TEXT DEFAULT '[]',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_metadata (
  project_path TEXT PRIMARY KEY,
  project_name TEXT,
  language_primary TEXT,
  languages_detected TEXT,
  framework_detected TEXT,
  last_full_scan TEXT
);
