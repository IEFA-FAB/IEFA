-- Add 'conformity' question type for 5S A/AP/NA/NO scale with weighted scoring.
-- NOTE: ALTER TYPE ADD VALUE cannot be used in the same transaction as the UPDATE below.
-- When applying manually, run the ALTER first (separate transaction), then the UPDATEs.

ALTER TYPE forms.question_type ADD VALUE IF NOT EXISTS 'conformity';

-- Convert 5S boolean questions → conformity with weight 1 (Desejável)
UPDATE forms.question SET type = 'conformity', options = '{"weight":1,"weightLabel":"Desejável"}'
WHERE type = 'boolean' AND section_id IN (
  SELECT s.id FROM forms.section s
  JOIN forms.questionnaire q ON q.id = s.questionnaire_id
  WHERE q.tags @> ARRAY['5s']
);

-- Convert existing boolean responses: true→"A", false→"NA"
UPDATE forms.response r SET value = CASE
  WHEN r.value = 'true'::jsonb THEN '"A"'::jsonb
  WHEN r.value = 'false'::jsonb THEN '"NA"'::jsonb
  ELSE r.value END
WHERE r.question_id IN (SELECT id FROM forms.question WHERE type = 'conformity');
