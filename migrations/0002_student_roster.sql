CREATE TABLE IF NOT EXISTS student_roster (
  id TEXT PRIMARY KEY,
  class_number INTEGER NOT NULL CHECK (class_number BETWEEN 1 AND 9),
  student_number INTEGER NOT NULL CHECK (student_number BETWEEN 1 AND 99),
  student_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  group_number INTEGER NOT NULL CHECK (group_number BETWEEN 1 AND 20),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (class_number, student_number)
);

CREATE INDEX IF NOT EXISTS idx_student_roster_class
  ON student_roster(class_number, student_number);

CREATE INDEX IF NOT EXISTS idx_student_roster_status
  ON student_roster(status);
