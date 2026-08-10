-- Trash/Spam 30-day expiry.
-- Messages moved to trash or spam get a `deleted_at` timestamp; after 30 days
-- they are purged automatically by the background sync loop.
ALTER TABLE messages ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_deleted_at ON messages(deleted_at);
