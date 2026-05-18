-- 1. Add metadata columns to questionnaire_response (idempotent)
ALTER TABLE forms.questionnaire_response
  ADD COLUMN IF NOT EXISTS evaluation_type text,
  ADD COLUMN IF NOT EXISTS om text,
  ADD COLUMN IF NOT EXISTS secao text;

-- 2. Limpar respostas antigas
DELETE FROM forms.questionnaire_response;

-- 3. Publicar questionários 2S e 3S
UPDATE forms.questionnaire SET status = 'sent' WHERE status = 'draft' AND tags @> ARRAY['5s'];

-- 4. Tabela de opções de OM (editável no futuro)
CREATE TABLE IF NOT EXISTS forms.om_option (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0
);

-- 5. Seed com dados do sisub.kitchen
INSERT INTO forms.om_option (name, sort_order) VALUES
  ('AFA', 1), ('BAAN', 2), ('BACG', 3), ('BAFL', 4), ('BAFZ', 5),
  ('BANT', 6), ('BAPV', 7), ('BASC', 8), ('BASM', 9), ('BASV', 10),
  ('CINDACTA 2', 11), ('CLA', 12), ('DIRAD', 13), ('EEAR', 14), ('EPCAR', 15),
  ('GABAER', 16), ('GAP-AF', 17), ('GAP-BE', 18), ('GAP-BR', 19), ('GAP-CO', 20),
  ('GAP-DF', 21), ('GAP-GL', 22), ('GAP-LS', 23), ('GAP-MN', 24), ('GAP-RF', 25),
  ('GAP-RJ', 26), ('GAP-SJ', 27), ('GAP-SP', 28), ('SDAB', 29)
ON CONFLICT (name) DO NOTHING;

-- 6. Permissões
GRANT ALL ON forms.om_option TO service_role;
GRANT USAGE, SELECT ON SEQUENCE forms.om_option_id_seq TO service_role;
