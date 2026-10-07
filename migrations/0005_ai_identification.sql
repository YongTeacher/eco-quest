CREATE TABLE IF NOT EXISTS ai_identification_requests (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  usage_date TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  result_json TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(student_id, request_hash)
);

CREATE INDEX IF NOT EXISTS idx_ai_identification_daily
  ON ai_identification_requests(usage_date, status);

CREATE INDEX IF NOT EXISTS idx_ai_identification_student_daily
  ON ai_identification_requests(student_id, usage_date, status);
