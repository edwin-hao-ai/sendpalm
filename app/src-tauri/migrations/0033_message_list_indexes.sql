-- Indexes for list/count queries at scale.
--
-- Measured on a 100k-message fixture (see tests/scale_100k.rs):
--   imbox page 1                                   72 ms
--   imbox page 1 at OFFSET 50000                17,272 ms   ← OFFSET is O(n)
--   unread COUNT(*) for the sidebar             20,453 ms   ← full scan
--
-- The list query orders by `timeline_at` and filters on
-- `bucket` + `direction` (+ `unread` for the new-mail tab and every badge).
-- `idx_messages_timeline` only covered (bucket, timeline_at), so the planner
-- still had to walk rows to apply `direction`/`unread`, and the counts had no
-- usable index at all.
--
-- After adding these, the same page fetched by keyset is 9 ms and the counts
-- become index-only. Existing indexes are kept: SQLite picks whichever fits.
CREATE INDEX IF NOT EXISTS idx_messages_list
  ON messages(bucket, direction, timeline_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_list_unread
  ON messages(bucket, direction, unread, timeline_at DESC);

-- Per-account tab badges count one mailbox at a time.
CREATE INDEX IF NOT EXISTS idx_messages_account_bucket
  ON messages(ac, bucket, unread);
