-- Defensive normalization: any contact that arrived via IMAP (`first_seen=1`)
-- but is also marked `screened=1` (an inconsistent state from earlier
-- migrations) is flipped back to `screened=0` so it appears in the Gate
-- screener. No-op on a healthy database.
UPDATE contacts
   SET screened = 0
 WHERE first_seen = 1
   AND screened = 1;