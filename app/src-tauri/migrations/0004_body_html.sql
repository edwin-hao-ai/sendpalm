-- SendPalm SQLite schema — store parsed HTML body alongside plain text.
ALTER TABLE messages ADD COLUMN body_html TEXT;
