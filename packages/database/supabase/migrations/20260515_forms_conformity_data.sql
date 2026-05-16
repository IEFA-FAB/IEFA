-- Data migration: convert existing 5S boolean questions → conformity type.
-- Must run AFTER 20260515_forms_conformity_type.sql (separate transaction).

UPDATE forms.question
SET type = 'conformity', options = '{"weight":1,"weightLabel":"Desejável"}'::jsonb
WHERE type = 'boolean'
  AND section_id IN (
    SELECT s.id FROM forms.section s
    JOIN forms.questionnaire q ON q.id = s.questionnaire_id
    WHERE q.tags @> ARRAY['5s']
  );

UPDATE forms.response r
SET value = CASE
  WHEN r.value = 'true'::jsonb  THEN '"A"'::jsonb
  WHEN r.value = 'false'::jsonb THEN '"NA"'::jsonb
  ELSE r.value
END
WHERE r.question_id IN (
  SELECT id FROM forms.question WHERE type = 'conformity'
);
