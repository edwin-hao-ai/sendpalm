-- 0022_messages_pile_indexes.sql
-- Add the missing SQLite indexes for the per-message pile queries
-- (PERF-1 in the 2026-08-30 audit).
--
-- Background: `listPileMessages` and the bubble-up resurface loop
-- both scan the messages table with `WHERE reply_later = 1 OR
-- set_aside = 1 OR bubble_up_at IS NOT NULL`. With 4 000+ messages
-- the per-tick scan is the single biggest source of CPU in the
-- pile / reply-later / set-aside boards (and the only one of the
-- three queries that runs on every reminder tick).
--
-- Each pile predicate becomes its own partial index. Partial
-- indexes are smaller than full indexes and target exactly the
-- rows each query touches, so they keep the cost of inserts low
-- while making the pile-queries O(log n) instead of O(n).
--
-- thread_id: covered by the new partial index on
-- (ac, thread_id, st DESC) so the threaded-view query in
-- Conversation view stays cheap.

CREATE INDEX IF NOT EXISTS idx_messages_reply_later
  ON messages(st DESC) WHERE reply_later = 1;

CREATE INDEX IF NOT EXISTS idx_messages_set_aside
  ON messages(st DESC) WHERE set_aside = 1;

CREATE INDEX IF NOT EXISTS idx_messages_bubble_up
  ON messages(bubble_up_at) WHERE bubble_up_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_thread
  ON messages(ac, thread_id, st DESC) WHERE thread_id IS NOT NULL;

-- PERF-1: Gate screener scans contacts WHERE first_seen = 1 AND
-- screened = 0 on every render. Without an index it's a full table
-- scan; with 5 000+ contacts (a power user with a large merged
-- address book) it adds 30–60 ms to each sidebar poll.
CREATE INDEX IF NOT EXISTS idx_contacts_first_seen_unscreened
  ON contacts(id) WHERE first_seen = 1 AND screened = 0;
