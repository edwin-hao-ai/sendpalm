-- M11 — Calendar recurrence + timezone columns
--
-- Two columns added to events so the calendar view can show recurring
-- meetings (Outlook / Google / Feishu all emit RRULE) and render
-- start times in the user's local zone (Outlook/Fly emit TZID).
--
-- The columns are nullable: existing single-shot events without
-- recurrence / timezone are unchanged. We intentionally do NOT
-- pre-expand RRULEs into N separate event rows — the canonical
-- event row stays as the "master", and the calendar view computes
-- the concrete occurrences in a bounded window (default 90 days,
-- cached in-memory) at render time. This avoids a write storm on
-- import and keeps RSVP / update semantics sane (a single CANCEL
-- revokes every future occurrence, not N rows).

ALTER TABLE events ADD COLUMN recurrence_rule TEXT;        -- RFC 5545 RRULE (raw, e.g. "FREQ=WEEKLY;BYDAY=MO")
ALTER TABLE events ADD COLUMN recurrence_dates_json TEXT;  -- JSON array of RDATE start times
ALTER TABLE events ADD COLUMN excluded_dates_json TEXT;   -- JSON array of EXDATE start times
ALTER TABLE events ADD COLUMN timezones_json TEXT;         -- JSON array of VTIMEZONE definitions
ALTER TABLE events ADD COLUMN original_tzid TEXT;          -- The DTSTART;TZID=... value (if any)
