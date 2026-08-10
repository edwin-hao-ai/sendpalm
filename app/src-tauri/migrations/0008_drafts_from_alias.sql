-- SendPalm SQLite schema — drafts can remember the alias used in the From field.
ALTER TABLE drafts ADD COLUMN from_alias TEXT;
