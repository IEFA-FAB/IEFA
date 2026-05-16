ALTER TABLE forms.questionnaire
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_questionnaire_tags
  ON forms.questionnaire USING GIN (tags);
