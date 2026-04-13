-- Chat history: sessions and messages per user
-- Enables persistent memory within sessions and cross-session navigation

CREATE TABLE sisub.analytics_chat_session (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      text        NOT NULL DEFAULT 'Novo chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_analytics_chat_session_user
  ON sisub.analytics_chat_session(user_id, updated_at DESC);

CREATE TABLE sisub.analytics_chat_message (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid        NOT NULL REFERENCES sisub.analytics_chat_session(id) ON DELETE CASCADE,
  role       text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content    text        NOT NULL DEFAULT '',
  chart      jsonb,
  error      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_analytics_chat_message_session
  ON sisub.analytics_chat_message(session_id, created_at);

-- Auto-update updated_at on session when messages change
CREATE OR REPLACE FUNCTION sisub.touch_chat_session_updated_at()
RETURNS trigger AS $$
BEGIN
  UPDATE sisub.analytics_chat_session
     SET updated_at = now()
   WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_touch_chat_session
  AFTER INSERT ON sisub.analytics_chat_message
  FOR EACH ROW
  EXECUTE FUNCTION sisub.touch_chat_session_updated_at();
