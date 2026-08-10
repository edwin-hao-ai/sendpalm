-- Vacation auto-reply deduplication table.
-- Tracks which sender+account pairs have received a vacation response and when,
-- so we only send one reply per sender within the configured window.

CREATE TABLE IF NOT EXISTS vacation_replies (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  UNIQUE(account_id, sender_email)
);

CREATE INDEX IF NOT EXISTS idx_vacation_replies_account ON vacation_replies(account_id);
CREATE INDEX IF NOT EXISTS idx_vacation_replies_sent_at ON vacation_replies(sent_at);
