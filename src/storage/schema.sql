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

-- Embedding configuration for version control
CREATE TABLE IF NOT EXISTS embedding_configs (
  id TEXT PRIMARY KEY DEFAULT 'current',
  model TEXT NOT NULL,
  dimension INTEGER NOT NULL,
  normalize BOOLEAN DEFAULT TRUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Chunks table for two-phase search (System of Record)
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  chunk_type TEXT NOT NULL,
  embedding_config_id TEXT DEFAULT 'current',
  line_start INTEGER DEFAULT 0,
  line_end INTEGER DEFAULT 0,
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Vector storage (derived from chunks, can be rebuilt)
CREATE TABLE IF NOT EXISTS chunk_vectors (
  chunk_id TEXT PRIMARY KEY,
  embedding BLOB NOT NULL
);

-- sqlite-vss virtual table for ANN search
-- Note: This table is created dynamically when sqlite-vss extension is loaded
-- CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vectors_vss USING vss0(embedding(384));

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chunks_file_path ON chunks(file_path);
CREATE INDEX IF NOT EXISTS idx_chunks_type ON chunks(chunk_type);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_config ON chunks(embedding_config_id);
