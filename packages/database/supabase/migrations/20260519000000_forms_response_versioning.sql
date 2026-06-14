-- Response versioning: snapshot de cada submissão para auditoria e revert
CREATE TABLE IF NOT EXISTS forms.response_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_response_id uuid NOT NULL REFERENCES forms.questionnaire_response(id) ON DELETE CASCADE,
  version_number int NOT NULL,
  answers jsonb NOT NULL,
  evaluation_type text,
  om text,
  secao text,
  submitted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (questionnaire_response_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_rv_qr ON forms.response_version(questionnaire_response_id);

ALTER TABLE forms.questionnaire_response
  ADD COLUMN IF NOT EXISTS current_version int;
