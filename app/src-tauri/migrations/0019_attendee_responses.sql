-- SendPalm SQLite schema — per-attendee RSVP tracking.
--
-- Up to 0018 we had only `attendee_response` (the LOCAL user's response
-- to an invite they received) and `attendee_response_at`. That covers
-- "I clicked Accept" but not "Bob accepted my invite" — the
-- organizer's view of who attended.
--
-- The new `attendee_responses_json` column stores a JSON map keyed by
-- attendee email, each value being { "partstat": "ACCEPTED|DECLINED|
-- TENTATIVE|NEEDS-ACTION", "at": "<ISO timestamp>" }.
--
-- The sync loop writes here when an incoming message carries
-- `method=REPLY` and its ATTENDEE lines carry a PARTSTAT (RFC 5546
-- §3.2.5). The local user flow continues to write attendee_response.

ALTER TABLE events ADD COLUMN attendee_responses_json TEXT NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_events_attendee_responses
  ON events(attendee_responses_json)
  WHERE attendee_responses_json != '{}';
