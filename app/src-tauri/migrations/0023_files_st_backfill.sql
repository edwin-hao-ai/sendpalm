-- Files persisted during the IMAP backfill stored the *sync* time in `st`
-- instead of the source message's sent date, so the Files view showed every
-- attachment as "刚刚" (just now) regardless of how old the mail was.
--
-- Re-derive `st` from the first source message. `st` is NOT NULL, so the
-- UPDATE is guarded by an EXISTS on a real message row — files with no
-- resolvable source keep their existing value.
UPDATE files
   SET st = (
     SELECT m.st
       FROM messages m
      WHERE m.id = json_extract(files.source_message_ids, '$[0]')
   )
 WHERE json_extract(files.source_message_ids, '$[0]') IS NOT NULL
   AND EXISTS (
     SELECT 1
       FROM messages m
      WHERE m.id = json_extract(files.source_message_ids, '$[0]')
        AND m.st IS NOT NULL
   );
