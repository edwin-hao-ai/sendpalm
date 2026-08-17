-- SendPalm SQLite schema — initial migration.
-- Mirrors the canonical D.* graph from prototype-v11.38.
-- All tables have a string id PRIMARY KEY (we use crypto.randomUUID() in JS).
-- Timestamps are ISO 8601 TEXT (sortable, locale-independent).

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('email', 'im', 'calendar')),
  provider TEXT NOT NULL,
  email TEXT,
  label TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('connected', 'syncing', 'error', 'disconnected')),
  synced INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  privacy TEXT NOT NULL CHECK (privacy IN ('unified', 'isolated')),
  color TEXT NOT NULL,
  avatar TEXT NOT NULL,
  last_sync TEXT NOT NULL,
  error TEXT,
  workspace TEXT,
  settings_json TEXT,  -- JSON-encoded AccountSettings for email accounts
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  emails_json TEXT NOT NULL DEFAULT '[]',
  phones_json TEXT NOT NULL DEFAULT '[]',
  stage TEXT NOT NULL,
  labels_json TEXT NOT NULL DEFAULT '[]',
  topics_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  health INTEGER NOT NULL DEFAULT 0,
  sc INTEGER NOT NULL DEFAULT 0,
  sc_c TEXT NOT NULL DEFAULT '',
  sc_l TEXT NOT NULL DEFAULT '',
  lc TEXT NOT NULL DEFAULT '',
  grp TEXT NOT NULL DEFAULT '',
  trd TEXT NOT NULL DEFAULT 'stable' CHECK (trd IN ('up', 'dn', 'stable')),
  pattern TEXT NOT NULL DEFAULT '',
  accounts_json TEXT NOT NULL DEFAULT '[]',
  stage_history_json TEXT NOT NULL DEFAULT '[]',
  first_contact TEXT,
  milestones_json TEXT NOT NULL DEFAULT '[]',
  merged INTEGER NOT NULL DEFAULT 0,
  blocked INTEGER NOT NULL DEFAULT 0,
  notify INTEGER NOT NULL DEFAULT 1,
  first_seen INTEGER NOT NULL DEFAULT 0,
  screened INTEGER NOT NULL DEFAULT 0,
  default_bucket TEXT NOT NULL DEFAULT 'imbox',
  auto_label_json TEXT NOT NULL DEFAULT '[]',
  recycling INTEGER NOT NULL DEFAULT 0,
  ch_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  pid TEXT NOT NULL,
  subj TEXT NOT NULL,
  prev TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  tm TEXT NOT NULL DEFAULT '',
  st TEXT NOT NULL,
  ac TEXT NOT NULL,
  bucket TEXT NOT NULL CHECK (bucket IN ('imbox', 'feed', 'paperTrail', 'trash', 'spam')),
  unread INTEGER NOT NULL DEFAULT 1,
  labels_json TEXT NOT NULL DEFAULT '[]',
  attachments_json TEXT NOT NULL DEFAULT '[]',
  trackers_json TEXT NOT NULL DEFAULT '[]',
  reply_later INTEGER NOT NULL DEFAULT 0,
  set_aside INTEGER NOT NULL DEFAULT 0,
  bubble_up_at TEXT,
  remind_at TEXT,
  to_addr TEXT,
  cc_json TEXT NOT NULL DEFAULT '[]',
  bcc_json TEXT NOT NULL DEFAULT '[]',
  thread_id TEXT,
  FOREIGN KEY (pid) REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (ac) REFERENCES accounts(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_pid ON messages(pid);
CREATE INDEX IF NOT EXISTS idx_messages_bucket ON messages(bucket);
CREATE INDEX IF NOT EXISTS idx_messages_st ON messages(st DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(unread);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  pid TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('pdf', 'image', 'doc', 'spreadsheet', 'other')),
  mime TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  url TEXT,
  content TEXT,
  st TEXT NOT NULL,
  sender TEXT,
  thumb_url TEXT,
  md TEXT,
  FOREIGN KEY (pid) REFERENCES contacts(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_files_pid ON files(pid);
CREATE INDEX IF NOT EXISTS idx_files_type ON files(type);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  dt TEXT NOT NULL,
  tm TEXT NOT NULL DEFAULT '',
  dur INTEGER,
  pids_json TEXT NOT NULL DEFAULT '[]',
  color TEXT NOT NULL DEFAULT '#0A8F63',
  location TEXT,
  video_link TEXT,
  reminder INTEGER,
  agenda_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  brief TEXT NOT NULL DEFAULT '',
  action_items_json TEXT NOT NULL DEFAULT '[]',
  materials_json TEXT NOT NULL DEFAULT '[]',
  transcript_url TEXT,
  recording_url TEXT,
  habit INTEGER NOT NULL DEFAULT 0,
  sometime_bucket TEXT,
  time_tracking_ms INTEGER NOT NULL DEFAULT 0,
  photo_url TEXT,
  circled INTEGER NOT NULL DEFAULT 0,
  day_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_dt ON events(dt);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  due TEXT,
  status TEXT NOT NULL CHECK (status IN ('todo', 'doing', 'done')),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high')),
  related_contact_id TEXT,
  related_event_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (related_contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (related_event_id) REFERENCES events(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due);

CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  last_edited TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'sent', 'edited', 'discarded')),
  account_id TEXT NOT NULL,
  cc_json TEXT NOT NULL DEFAULT '[]',
  bcc_json TEXT NOT NULL DEFAULT '[]',
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('freeform', 'message', 'contact', 'event', 'file')),
  title TEXT NOT NULL,
  context_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('todo', 'doing', 'done', 'error')),
  steps_json TEXT NOT NULL DEFAULT '[]',
  eta_ms INTEGER,
  confidence INTEGER,
  trigger TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_drafts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'sent', 'edited', 'discarded')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_audit (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  undoable INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_agent_audit_session ON agent_audit(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_audit_created ON agent_audit(created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  ref_json TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);

CREATE TABLE IF NOT EXISTS snippets (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  body TEXT NOT NULL,
  shortcut TEXT
);

CREATE TABLE IF NOT EXISTS stickies (
  id TEXT PRIMARY KEY,
  msg_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (msg_id) REFERENCES messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_stickies_msg ON stickies(msg_id);

CREATE TABLE IF NOT EXISTS contact_notes (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  body TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_contact_notes_contact ON contact_notes(contact_id);

CREATE TABLE IF NOT EXISTS clips (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  msg_id TEXT,
  contact_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (msg_id) REFERENCES messages(id) ON DELETE SET NULL,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_clips_created ON clips(created_at DESC);

CREATE TABLE IF NOT EXISTS follow_ups (
  id TEXT PRIMARY KEY,
  msg_id TEXT NOT NULL,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'todo', 'wait', 'done', 'cancelled')),
  note TEXT,
  FOREIGN KEY (msg_id) REFERENCES messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_follow_ups_due ON follow_ups(due_at);
CREATE INDEX IF NOT EXISTS idx_follow_ups_status ON follow_ups(status);

CREATE TABLE IF NOT EXISTS scheduled_sends (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'sent', 'cancelled')),
  FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_scheduled_sends_at ON scheduled_sends(scheduled_at);

CREATE TABLE IF NOT EXISTS labels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shortcuts (
  id TEXT PRIMARY KEY,
  combo TEXT NOT NULL,
  label TEXT NOT NULL,
  action TEXT NOT NULL,
  editable INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bundle_configs (
  contact_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  label TEXT,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);