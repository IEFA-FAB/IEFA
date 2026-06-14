-- Extend module_chat_session.module CHECK constraint to include 'local-analytics'.

ALTER TABLE sisub.module_chat_session
  DROP CONSTRAINT module_chat_session_module_check;

ALTER TABLE sisub.module_chat_session
  ADD CONSTRAINT module_chat_session_module_check
  CHECK (module IN ('global', 'kitchen', 'unit', 'local-analytics'));
