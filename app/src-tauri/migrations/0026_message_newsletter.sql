-- Newsletter detection: senders that include List-Id / List-Unsubscribe /
-- List-Post headers are mailing lists, not people. Surfacing the flag lets
-- the Gate suggest "Stream" and lets notifications stay silent for bulk
-- mail so the OS notification center doesn't drown in promos.
ALTER TABLE messages ADD COLUMN is_newsletter INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_messages_newsletter ON messages(is_newsletter);
