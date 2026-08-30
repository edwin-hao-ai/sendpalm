-- P0-4: events.account_id so iTip RSVP can resolve the right SMTP creds.
--
-- Before: respond_to_calendar_invite() in commands/mod.rs called
-- get_creds() which always returned the test-fallback account. Multi-account
-- users had their RSVP reply sent from the wrong address — the organizer
-- would see "from: <test-account>" regardless of which account actually
-- received the invite.
--
-- The new column stores the account_id that imported the event (via the
-- text/calendar MIME part of an IMAP message). respond_to_calendar_invite
-- now resolves SMTP credentials by that account_id. New invites also
-- write the sender's account_id at insert time.
--
-- The column is nullable: locally-created events (no iCal origin) have
-- NULL and the RSVP path returns a "not an iCal invite" error before
-- touching SMTP.
--
-- ON DELETE SET NULL mirrors the existing `messages.ac` FK behavior: if
-- the user removes the account, the historical event row is preserved
-- but marked as orphan.

ALTER TABLE events ADD COLUMN account_id TEXT
  REFERENCES accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_account_id ON events(account_id);
