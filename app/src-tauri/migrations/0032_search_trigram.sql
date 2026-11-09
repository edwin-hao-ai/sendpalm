-- Rebuild the search index with the trigram tokenizer.
--
-- `unicode61` (migration 0012) does NOT segment CJK: a run of Chinese
-- characters with no spaces is one token, so only a prefix of the whole run
-- could ever match. Measured on a real mailbox: the subject
-- 「郝亚伟先生的拒付资料」 matched `郝亚伟` but not `拒付`, and not even `拒`.
--
-- `trigram` indexes every 3-character substring, so substring search works
-- for any script. Queries shorter than 3 characters fall back to LIKE in
-- `searchIndex()` (see stores/data.ts) — 2-character Chinese words like 「拒付」
-- are too common to leave unsearchable.
--
-- Cost: the index is roughly 2-3x the indexed text instead of ~1x. Accepted:
-- search that cannot find your own mail is a release blocker for a
-- Chinese-first client.
DROP TABLE IF EXISTS search_index;

CREATE VIRTUAL TABLE search_index USING fts5(
  id UNINDEXED,
  kind UNINDEXED,
  title,
  body,
  tokenize = 'trigram'
);

-- Reindex everything that already exists.
INSERT INTO search_index (id, kind, title, body)
SELECT id, 'message', subj, body FROM messages;

INSERT INTO search_index (id, kind, title, body)
SELECT id, 'contact', name, COALESCE(notes, '') FROM contacts;

INSERT INTO search_index (id, kind, title, body)
SELECT id, 'file', name, COALESCE(md, '') FROM files;

INSERT INTO search_index (id, kind, title, body)
SELECT id, 'event', title, COALESCE(notes, '') FROM events;
