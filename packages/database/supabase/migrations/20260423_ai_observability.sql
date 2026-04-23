-- AI Observability columns for chat message tables
-- Adds LLM metadata (model, latency, tokens, LangSmith run ID) to both
-- module_chat_message and analytics_chat_message tables.
-- All columns are nullable — existing rows are unaffected.

ALTER TABLE sisub.module_chat_message
  ADD COLUMN IF NOT EXISTS langsmith_run_id TEXT,
  ADD COLUMN IF NOT EXISTS model            TEXT,
  ADD COLUMN IF NOT EXISTS latency_ms       INTEGER,
  ADD COLUMN IF NOT EXISTS input_tokens     INTEGER,
  ADD COLUMN IF NOT EXISTS output_tokens    INTEGER;

COMMENT ON COLUMN sisub.module_chat_message.langsmith_run_id IS 'LangSmith trace run ID for LLM observability';
COMMENT ON COLUMN sisub.module_chat_message.model            IS 'LLM model identifier used to generate this message';
COMMENT ON COLUMN sisub.module_chat_message.latency_ms       IS 'Total generation latency in milliseconds';
COMMENT ON COLUMN sisub.module_chat_message.input_tokens     IS 'Number of input/prompt tokens consumed';
COMMENT ON COLUMN sisub.module_chat_message.output_tokens    IS 'Number of output/completion tokens generated';

ALTER TABLE sisub.analytics_chat_message
  ADD COLUMN IF NOT EXISTS langsmith_run_id TEXT,
  ADD COLUMN IF NOT EXISTS model            TEXT,
  ADD COLUMN IF NOT EXISTS latency_ms       INTEGER,
  ADD COLUMN IF NOT EXISTS input_tokens     INTEGER,
  ADD COLUMN IF NOT EXISTS output_tokens    INTEGER;

COMMENT ON COLUMN sisub.analytics_chat_message.langsmith_run_id IS 'LangSmith trace run ID for LLM observability';
COMMENT ON COLUMN sisub.analytics_chat_message.model            IS 'LLM model identifier used to generate this message';
COMMENT ON COLUMN sisub.analytics_chat_message.latency_ms       IS 'Total generation latency in milliseconds';
COMMENT ON COLUMN sisub.analytics_chat_message.input_tokens     IS 'Number of input/prompt tokens consumed';
COMMENT ON COLUMN sisub.analytics_chat_message.output_tokens    IS 'Number of output/completion tokens generated';
