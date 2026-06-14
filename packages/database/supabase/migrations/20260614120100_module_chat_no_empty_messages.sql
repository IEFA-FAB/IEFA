-- Prevent terminal module chat messages with no useful payload.
-- NOT VALID avoids failing on historical empty/tool-calling-only rows; new inserts are enforced.

ALTER TABLE sisub.module_chat_message
  ADD CONSTRAINT module_chat_message_has_payload
  CHECK (
    btrim(content) <> ''
    OR tool_calls IS NOT NULL
    OR tool_result IS NOT NULL
    OR error IS NOT NULL
  ) NOT VALID;
