-- New column: every file records the messages that carried it.
ALTER TABLE files ADD COLUMN source_message_ids TEXT NOT NULL DEFAULT '[]';

-- Backfill: union of message ids whose attachments_json references the file.
-- Only counts non-deleted messages.
UPDATE files
   SET source_message_ids = (
     SELECT COALESCE(json_group_array(DISTINCT messages.id), '[]')
       FROM messages, json_each(messages.attachments_json)
      WHERE json_each.value = files.id
        AND messages.deleted_at IS NULL
   )
 WHERE EXISTS (
   SELECT 1
     FROM messages, json_each(messages.attachments_json)
    WHERE json_each.value = files.id
      AND messages.deleted_at IS NULL
 );
