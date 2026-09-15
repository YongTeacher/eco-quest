CREATE TABLE IF NOT EXISTS reflections (
  student_id TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  memorable_species TEXT NOT NULL DEFAULT '',
  contribution TEXT NOT NULL DEFAULT '',
  problem_solving TEXT NOT NULL DEFAULT '',
  ecological_learning TEXT NOT NULL DEFAULT '',
  perspective_change TEXT NOT NULL DEFAULT '',
  further_question TEXT NOT NULL DEFAULT '',
  free_reflection TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  created_at TEXT NOT NULL,
  submitted_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS eco_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO eco_settings (setting_key, setting_value, updated_at)
VALUES ('reflection_edit_after_submit', '0', datetime('now'));
