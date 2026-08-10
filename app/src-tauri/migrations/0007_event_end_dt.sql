-- SendPalm SQLite schema — multi-day calendar events.
-- Adds optional inclusive end date so week/year views can render cross-day arcs.

ALTER TABLE events ADD COLUMN end_dt TEXT;
CREATE INDEX IF NOT EXISTS idx_events_end_dt ON events(end_dt);
