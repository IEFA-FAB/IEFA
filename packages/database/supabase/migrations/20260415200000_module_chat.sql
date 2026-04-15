-- Module Chat: per-module agentic chat sessions with tool calling support.
-- Separate from analytics_chat (which has chart-specific columns).

CREATE TABLE sisub.module_chat_session (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module     text        NOT NULL CHECK (module IN ('global', 'kitchen', 'unit')),
  scope_id   integer,    -- kitchen_id or unit_id; null for global
  title      text        NOT NULL DEFAULT 'Novo chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mcs_user ON sisub.module_chat_session(user_id, module, updated_at DESC);

CREATE TABLE sisub.module_chat_message (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid        NOT NULL REFERENCES sisub.module_chat_session(id) ON DELETE CASCADE,
  role          text        NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content       text        NOT NULL DEFAULT '',
  tool_calls    jsonb,       -- [{id, name, arguments}] when role='assistant'
  tool_call_id  text,        -- when role='tool', references the tool_call.id
  tool_name     text,        -- when role='tool', name of the tool that was called
  tool_result   jsonb,       -- when role='tool', structured result
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mcm_session ON sisub.module_chat_message(session_id, created_at);

-- Auto-update session.updated_at on new message
CREATE OR REPLACE FUNCTION sisub.touch_module_chat_session()
RETURNS trigger AS $$
BEGIN
  UPDATE sisub.module_chat_session SET updated_at = now() WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_touch_mcs
  AFTER INSERT ON sisub.module_chat_message
  FOR EACH ROW EXECUTE FUNCTION sisub.touch_module_chat_session();
