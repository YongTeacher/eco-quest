PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  class_number INTEGER NOT NULL CHECK (class_number BETWEEN 1 AND 9),
  student_number INTEGER NOT NULL CHECK (student_number BETWEEN 1 AND 99),
  student_name TEXT NOT NULL,
  group_number INTEGER NOT NULL CHECK (group_number BETWEEN 1 AND 20),
  pin_salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  guide_limit INTEGER NOT NULL DEFAULT 3 CHECK (guide_limit IN (3, 5)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL,
  UNIQUE (class_number, student_number)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('student', 'teacher')),
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  class_number INTEGER NOT NULL CHECK (class_number BETWEEN 1 AND 9),
  group_number INTEGER NOT NULL CHECK (group_number BETWEEN 1 AND 20),
  student_id TEXT NOT NULL REFERENCES students(id),
  student_name TEXT NOT NULL,
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  place_name TEXT NOT NULL,
  category TEXT NOT NULL,
  species_name TEXT NOT NULL,
  scientific_name TEXT NOT NULL DEFAULT '',
  features TEXT NOT NULL,
  identification_reason TEXT NOT NULL,
  source TEXT NOT NULL,
  photo_key TEXT NOT NULL,
  photo_mime TEXT NOT NULL,
  identification_status TEXT NOT NULL DEFAULT '학생 동정',
  review_status TEXT NOT NULL DEFAULT '정상',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS field_guides (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  observation_id TEXT NOT NULL REFERENCES observations(id),
  habitat TEXT NOT NULL,
  key_features TEXT NOT NULL,
  ecological_role TEXT NOT NULL,
  report TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '완료' CHECK (status IN ('임시저장', '완료')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (student_id, observation_id)
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  review_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  class_number INTEGER,
  owner_label TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '확인 필요',
  teacher_name TEXT NOT NULL DEFAULT '',
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sheet_sync_queue (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'synced', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_observations_class_created ON observations(class_number, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_observations_category ON observations(category);
CREATE INDEX IF NOT EXISTS idx_guides_student ON field_guides(student_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_status ON sheet_sync_queue(status, updated_at);
