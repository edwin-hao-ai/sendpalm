-- SendPalm SQLite schema — full-text search index across messages, contacts, and files.
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  id UNINDEXED,
  kind UNINDEXED,
  title,
  body,
  tokenize = 'unicode61'
);

-- Backfill existing messages so they are searchable immediately after upgrade.
INSERT INTO search_index (id, kind, title, body)
SELECT id, 'message', subj, body FROM messages;
