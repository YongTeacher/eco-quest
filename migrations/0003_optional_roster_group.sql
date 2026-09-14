CREATE TABLE IF NOT EXISTS student_roster_next (
  id TEXT PRIMARY KEY,
  class_number INTEGER NOT NULL CHECK (class_number BETWEEN 1 AND 9),
  student_number INTEGER NOT NULL CHECK (student_number BETWEEN 1 AND 99),
  student_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  group_number INTEGER CHECK (group_number IS NULL OR group_number BETWEEN 1 AND 20),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (class_number, student_number)
);

INSERT OR REPLACE INTO student_roster_next
  (id, class_number, student_number, student_name, normalized_name, group_number, status, created_at, updated_at)
SELECT
  id, class_number, student_number, student_name, normalized_name, group_number, status, created_at, updated_at
FROM student_roster;

DROP TABLE student_roster;
ALTER TABLE student_roster_next RENAME TO student_roster;

CREATE INDEX IF NOT EXISTS idx_student_roster_class
  ON student_roster(class_number, student_number);

CREATE INDEX IF NOT EXISTS idx_student_roster_status
  ON student_roster(status);
