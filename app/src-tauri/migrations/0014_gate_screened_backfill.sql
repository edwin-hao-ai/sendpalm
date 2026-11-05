-- Defensive normalization, historical.
--
-- READ THIS BEFORE COPYING THE PATTERN: `first_seen = 1 AND screened = 1` is
-- NOT an inconsistent state any more. Since the first-import transition
-- (2026-11-05, see docs/superpowers/plans/2026-11-05-import-transition.md) it
-- is the NORMAL state for every historical sender: the first sync pass
-- writes them straight to `screened = 1` so a five-year mailbox does not
-- become 3,000 Screener decisions.
--
-- This migration only made sense for a schema where `screened` had not been
-- populated on insert. It has already run on every existing install (the
-- migration runner is version-keyed and does not re-run it), so it stays as
-- written. Do NOT add a new migration with this rule, and do not "normalise"
-- this state in code — it would silently undo every user's import.
UPDATE contacts
   SET screened = 0
 WHERE first_seen = 1
   AND screened = 1;
