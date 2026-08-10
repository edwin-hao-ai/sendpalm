-- Add all-day flag to calendar events.
ALTER TABLE events ADD COLUMN all_day INTEGER NOT NULL DEFAULT 0;
