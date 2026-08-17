-- SendPalm SQLite schema — widen follow_ups status values.
-- The prototype timeline uses a 'todo' → 'wait' → 'done' cycle in addition to
-- the existing 'pending' / 'cancelled' states. SQLite does not support
-- ALTER TABLE DROP CONSTRAINT, so we recreate the table.

PRAGMA foreign_keys = OFF;

CREATE TABLE follow_ups_new (
  id TEXT PRIMARY KEY,
  msg_id TEXT NOT NULL,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'todo', 'wait', 'done', 'cancelled')),
  note TEXT,
  surfaced_at TEXT,
  FOREIGN KEY (msg_id) REFERENCES messages(id) ON DELETE CASCADE
);

INSERT INTO follow_ups_new SELECT * FROM follow_ups;

DROP TABLE follow_ups;

ALTER TABLE follow_ups_new RENAME TO follow_ups;

CREATE INDEX IF NOT EXISTS idx_follow_ups_due ON follow_ups(due_at);
CREATE INDEX IF NOT EXISTS idx_follow_ups_status ON follow_ups(status);

PRAGMA foreign_keys = ON;
