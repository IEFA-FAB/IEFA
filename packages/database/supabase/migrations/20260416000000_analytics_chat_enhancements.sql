-- Analytics chat enhancements
-- A: nothing schema-side (save reliability is code-only)
-- B: persist user-selected chart type override per message
-- C: persist validated SQL for data replay / refresh

ALTER TABLE sisub.analytics_chat_message
  ADD COLUMN IF NOT EXISTS chart_type_override text
    CHECK (chart_type_override IN ('bar', 'line', 'area', 'pie', 'table'));

-- No need to store sql separately: it is embedded inside chart JSONB as chart.sql
-- The JSONB column already exists; the LLM already emits sql inside the spec.
