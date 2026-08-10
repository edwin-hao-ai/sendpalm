-- SendPalm SQLite schema — track whether a message was received or sent.
ALTER TABLE messages ADD COLUMN direction TEXT NOT NULL DEFAULT 'in' CHECK (direction IN ('in', 'out'));
