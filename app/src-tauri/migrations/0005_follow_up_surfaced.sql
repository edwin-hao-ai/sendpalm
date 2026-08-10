-- SendPalm SQLite schema — track when a follow-up has already resurfaced.
ALTER TABLE follow_ups ADD COLUMN surfaced_at TEXT;
