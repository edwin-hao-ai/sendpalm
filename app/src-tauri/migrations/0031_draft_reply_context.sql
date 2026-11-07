-- Scheduled sends lost their reply context.
--
-- `Compose` computed `htmlBody` and `in_reply_to` at send time and passed
-- them straight to the SMTP command. A draft that went through
-- `scheduled_sends` had nowhere to keep them, so the scheduler sent
-- plain-text with no `In-Reply-To` header: the recipient's client started a
-- new conversation instead of threading the reply, and formatting was gone.
--
-- Persist both on the draft row. `html_body` is the rendered plain-text
-- body (Compose derives it from `body`), so the scheduler no longer needs a
-- text→HTML converter in Rust.
ALTER TABLE drafts ADD COLUMN in_reply_to TEXT;
ALTER TABLE drafts ADD COLUMN html_body TEXT;
