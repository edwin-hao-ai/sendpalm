-- SendPalm SQLite schema — iCal UID + RSVP support on the events table.
--
-- Up to now the add_calendar_event command created a fresh evt_<uuid> row
-- for every message that carried a text/calendar part, so an organizer
-- re-sending the same invite (or sending an update with a higher SEQUENCE)
-- produced a duplicate. RSVP was not implemented at all.
--
-- This migration:
--   1. Adds ical_uid (UNIQUE so we can dedup), ical_method, ical_sequence,
--      organizer_email for storing the iTip metadata of the invite.
--   2. Adds attendee_response + attendee_response_at so we can record the
--      user's RSVP locally.
--   3. Backfills organizer_email from the existing pids_json where the
--      first attendee id looks like a contact id that has an email
--      (this is best-effort; new invite rows always populate it).

ALTER TABLE events ADD COLUMN ical_uid TEXT;
ALTER TABLE events ADD COLUMN ical_method TEXT;
ALTER TABLE events ADD COLUMN ical_sequence INTEGER;
ALTER TABLE events ADD COLUMN organizer_email TEXT;
ALTER TABLE events ADD COLUMN attendee_response TEXT;
ALTER TABLE events ADD COLUMN attendee_response_at TEXT;

-- Two events from the same invite series should match by ical_uid.
-- Partial UNIQUE so multiple NULLs (legacy events without UID) don't
-- collide. SQLite supports partial indexes since 3.8.0.
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_ical_uid_unique
  ON events(ical_uid) WHERE ical_uid IS NOT NULL;

-- Common lookup: events in a given date range, optionally filtered by
-- method (e.g. "show only REQUEST events that haven't been RSVP'd").
CREATE INDEX IF NOT EXISTS idx_events_ical_method
  ON events(ical_method) WHERE ical_method IS NOT NULL;
