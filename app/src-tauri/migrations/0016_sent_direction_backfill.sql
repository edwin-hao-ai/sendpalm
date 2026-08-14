-- Backfill: fix legacy Sent-folder messages that were inserted with
-- direction='in' and bucket='imbox' because the original insert_message did
-- not distinguish folder kind. The self-contact (created by the same buggy
-- path) was also left with first_seen=1, screened=0 so it would surface in
-- the Gate screener. Both issues are fixed for new sync by the
-- folder_kind-aware insert_message + is_self-aware upsert_contact; this
-- migration only repairs rows already on disk.
--
-- The most reliable signal that a row came from a Sent folder is the IMAP
-- folder slug embedded in the message id (insert_message uses
-- `imap_<acct>_<folder_slug>_<uid>`). The slug candidates match the same
-- tables used by mailbox_resolver::folder_kind_for_name.

-- 1. Repaint Sent-folder messages: direction='out', bucket='paperTrail'.
UPDATE messages
   SET direction = 'out',
       bucket    = 'paperTrail',
       unread    = 0
 WHERE direction = 'in'
   AND bucket    = 'imbox'
   AND (
        id LIKE '%\_&XfJT0ZAB-\_%' ESCAPE '\'
     OR id LIKE '%\_Sent\_%' ESCAPE '\'
     OR id LIKE '%\_Sent\_Items\_%' ESCAPE '\'
     OR id LIKE '%\_Sent\_Messages\_%' ESCAPE '\'
     OR id LIKE '%\_%\_已发送\_%' ESCAPE '\'
     OR id LIKE '%\_[Gmail]\_Sent\_Mail\_%' ESCAPE '\'
   );

-- 2. Mark self-contact as already-screened. The id format is
-- c_<local>_<domain> with @→_at_ and .→_, matching upsert_contact.
UPDATE contacts
   SET first_seen     = 0,
       screened       = 1,
       default_bucket = 'paperTrail'
 WHERE EXISTS (
       SELECT 1 FROM accounts a
        WHERE a.email IS NOT NULL
          AND length(a.email) > 0
          AND 'c_' || replace(replace(a.email, '@', '_at_'), '.', '_') = contacts.id
   )
   AND (first_seen = 1 OR default_bucket <> 'paperTrail');

-- 3. Defensive: any contact still flagged first_seen=1 that has at least
-- one outgoing message linked to it is clearly the self-contact and should
-- never have been in the Gate queue. Normalize to screened/paperTrail.
UPDATE contacts
   SET first_seen     = 0,
       screened       = 1,
       default_bucket = 'paperTrail'
 WHERE first_seen = 1
   AND screened   = 0
   AND id IN (
     SELECT DISTINCT pid FROM messages
      WHERE pid IS NOT NULL
        AND direction = 'out'
   );