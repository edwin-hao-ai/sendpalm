-- SendPalm SQLite schema — drafts can carry staged attachments.
ALTER TABLE drafts ADD COLUMN attachments_json TEXT NOT NULL DEFAULT '[]';
