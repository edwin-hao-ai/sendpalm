-- SendPalm SQLite schema — M10 calendar invites.
-- Stores parsed iCalendar VEVENT data from incoming mail so the
-- message detail panel can render an "Add to calendar" action.

ALTER TABLE messages ADD COLUMN calendar_json TEXT;