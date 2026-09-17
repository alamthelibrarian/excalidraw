CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  scene_data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_updated_at
  ON projects(updated_at DESC);

