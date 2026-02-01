CREATE TABLE IF NOT EXISTS user_sessions (
  chat_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  project_path TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_whitelist (
  user_id TEXT PRIMARY KEY,
  added_by TEXT NOT NULL,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_mappings (
  chat_id TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event_dedup (
  event_id TEXT PRIMARY KEY,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS message_mappings (
  user_message_id TEXT PRIMARY KEY,
  bot_message_id TEXT,
  chat_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 会话群：每个群对应一个独立的 OpenCode 会话
CREATE TABLE IF NOT EXISTS session_chats (
  chat_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  project_path TEXT NOT NULL,
  model TEXT,
  title TEXT,
  title_set BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);



CREATE INDEX IF NOT EXISTS idx_event_dedup_processed_at ON event_dedup(processed_at);
CREATE INDEX IF NOT EXISTS idx_message_mappings_chat_id ON message_mappings(chat_id);
CREATE INDEX IF NOT EXISTS idx_message_mappings_created_at ON message_mappings(created_at);
CREATE INDEX IF NOT EXISTS idx_session_chats_owner_id ON session_chats(owner_id);
CREATE INDEX IF NOT EXISTS idx_session_chats_session_id ON session_chats(session_id);

-- 待处理问题：存储问题卡片状态，支持服务重启后恢复
CREATE TABLE IF NOT EXISTS pending_questions (
  chat_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  questions TEXT NOT NULL,  -- JSON 格式的问题数组
  answers TEXT NOT NULL,    -- JSON 格式的答案数组
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pending_questions_request_id ON pending_questions(request_id);
