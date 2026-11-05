-- The sender's RFC 5322 Message-ID, persisted at sync time. Replies set
-- In-Reply-To to it so recipients' clients (Gmail threads on
-- References/In-Reply-To) can thread the conversation.
ALTER TABLE messages ADD COLUMN rfc_message_id TEXT;
