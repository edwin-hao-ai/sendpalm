-- User automation rules: explicit user instructions beat everything else
-- in the routing order (rule > gate default). Folders/labels + buckets
-- can both be actions, so "发票 → 发票文件夹(标签) + Records" is one rule.
CREATE TABLE IF NOT EXISTS mail_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  match_field TEXT NOT NULL CHECK(match_field IN ('from','subject','body')),
  match_pattern TEXT NOT NULL,
  action_bucket TEXT CHECK(action_bucket IN ('imbox','feed','paperTrail','trash','spam')),
  action_label TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
