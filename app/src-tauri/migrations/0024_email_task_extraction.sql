ALTER TABLE tasks ADD COLUMN related_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN direction TEXT CHECK(direction IN ('mine','theirs'));

CREATE TABLE task_extraction_runs (
  source_message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK(state IN ('queued','processing','pending_review','no_tasks','failed','reviewed','skipped')),
  mode TEXT NOT NULL CHECK(mode IN ('automatic','manual')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX task_extraction_queue ON task_extraction_runs(state, created_at);
CREATE TABLE task_suggestions (
  id TEXT PRIMARY KEY,
  source_message_id TEXT NOT NULL REFERENCES task_extraction_runs(source_message_id) ON DELETE CASCADE,
  related_contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  due TEXT,
  priority TEXT NOT NULL CHECK(priority IN ('low','normal','high')),
  direction TEXT NOT NULL CHECK(direction IN ('mine','theirs','unclear')),
  status TEXT NOT NULL CHECK(status IN ('pending','accepted','dismissed')),
  accepted_task_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX task_suggestions_review ON task_suggestions(status, created_at);
