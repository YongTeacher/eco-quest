CREATE TABLE IF NOT EXISTS observation_trash (
  id TEXT PRIMARY KEY,
  class_number INTEGER NOT NULL,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  species_name TEXT NOT NULL,
  observation_json TEXT NOT NULL,
  guides_json TEXT NOT NULL,
  reviews_json TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  purge_after TEXT NOT NULL,
  cleanup_event_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_observation_trash_expiry ON observation_trash(purge_after);
