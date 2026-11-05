-- IMAP identity per message: which folder/UID this row mirrors on the
-- server. Enables two-way flag sync (read state written back via
-- UID STORE). Nullable: locally-created rows and legacy mail (synced
-- before this column existed) simply don't sync flags until re-fetched.
ALTER TABLE messages ADD COLUMN imap_folder TEXT;
ALTER TABLE messages ADD COLUMN imap_uid INTEGER;
CREATE INDEX IF NOT EXISTS idx_messages_imap_uid ON messages(imap_folder, imap_uid);
