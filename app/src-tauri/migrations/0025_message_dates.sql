-- Mail date integrity: keep the sender-declared Date header and the mail
-- server's INTERNALDATE as separate, nullable values.
--
-- `st`/`tm` stay in place for wire compatibility (`tm` is a preformatted UTC
-- string that must never be treated as a local timestamp). Existing rows are
-- NOT rewritten: they simply have no server receipt time until the bounded
-- metadata backfill repairs them.
ALTER TABLE messages ADD COLUMN sent_at TEXT;
ALTER TABLE messages ADD COLUMN received_at TEXT;

-- Denormalized sort/group key: received_at ?? sent_at ?? st. Kept as a real
-- column (not an expression index) so every list query treats it as a plain
-- indexed column and the in-browser mock database can order by it too.
ALTER TABLE messages ADD COLUMN timeline_at TEXT NOT NULL DEFAULT '';

-- Legacy rows fall back to their existing ISO `st` value, which is the honest
-- "message date we know" until INTERNALDATE is fetched.
UPDATE messages SET timeline_at = st WHERE timeline_at = '';

CREATE INDEX IF NOT EXISTS idx_messages_timeline ON messages(bucket, timeline_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON messages(sent_at);
