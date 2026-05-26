-- Prevent terminal analytics chat messages with no user-visible payload.
-- NOT VALID avoids failing on historical empty assistant rows; new inserts are still enforced.

ALTER TABLE sisub.analytics_chat_message
  ADD CONSTRAINT analytics_chat_message_has_payload
  CHECK (
    btrim(content) <> ''
    OR chart IS NOT NULL
    OR error IS NOT NULL
  ) NOT VALID;
