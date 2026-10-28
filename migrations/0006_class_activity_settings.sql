CREATE TABLE IF NOT EXISTS class_activity_settings (
  class_number INTEGER PRIMARY KEY CHECK (class_number BETWEEN 1 AND 9),
  observations_locked INTEGER NOT NULL DEFAULT 0 CHECK (observations_locked IN (0, 1)),
  guides_locked INTEGER NOT NULL DEFAULT 0 CHECK (guides_locked IN (0, 1)),
  reflections_locked INTEGER NOT NULL DEFAULT 0 CHECK (reflections_locked IN (0, 1)),
  reflection_edits_after_submit INTEGER NOT NULL DEFAULT 0 CHECK (reflection_edits_after_submit IN (0, 1)),
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO class_activity_settings (
  class_number,
  observations_locked,
  guides_locked,
  reflections_locked,
  reflection_edits_after_submit,
  updated_at
)
SELECT
  class_number,
  0,
  0,
  0,
  COALESCE((SELECT CAST(setting_value AS INTEGER) FROM eco_settings WHERE setting_key = 'reflection_edit_after_submit'), 0),
  datetime('now')
FROM (
  SELECT 1 AS class_number UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL
  SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL
  SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9
);
