-- Recreate the full-text search index with a CJK-compatible tokenizer.
-- The original 0009 migration used 'porter', which only stems English and
-- treats CJK text as a single token, breaking Chinese/Japanese/Korean search.
-- 'unicode61' segments CJK characters and is the right default for a
-- Chinese-first email client.
DROP TABLE IF EXISTS search_index;

CREATE VIRTUAL TABLE search_index USING fts5(
  id UNINDEXED,
  kind UNINDEXED,
  title,
  body,
  tokenize = 'unicode61'
);

-- Reindex all entities that may already exist in the database.
INSERT INTO search_index (id, kind, title, body)
SELECT id, 'message', subj, body FROM messages;

INSERT INTO search_index (id, kind, title, body)
SELECT id, 'contact', name, COALESCE(notes, '') FROM contacts;

INSERT INTO search_index (id, kind, title, body)
SELECT id, 'file', name, COALESCE(md, '') FROM files;

INSERT INTO search_index (id, kind, title, body)
SELECT id, 'event', title, COALESCE(notes, '') FROM events;
