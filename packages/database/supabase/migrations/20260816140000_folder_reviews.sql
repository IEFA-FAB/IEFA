-- Revisão de pastas: registro de "conferência" feita pelos nutricionistas.
-- Espelha kitchen.ingredient_review (20260609155940) e kitchen.recipe_review
-- (20260630120000): cada clique em "Revisado" numa pasta da árvore de insumos cria
-- UM evento de revisão (pasta + autor + data). A revisão é uma confirmação explícita
-- de que a pasta foi conferida — serve para acompanhar o progresso da revisão de todo
-- o catálogo (o que já foi conferido e quando).
-- RLS habilitado (service-role only, padrão do projeto).

CREATE TABLE kitchen.folder_review (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id        uuid        NOT NULL REFERENCES kitchen.folder(id) ON DELETE CASCADE,
  reviewed_by      uuid,
  reviewed_by_name text,
  note             text,
  reviewed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX folder_review_folder_idx
  ON kitchen.folder_review (folder_id, reviewed_at DESC);

ALTER TABLE kitchen.folder_review ENABLE ROW LEVEL SECURITY;

-- View: a última revisão por pasta (1 linha por pasta já revisada).
-- Usada na árvore de insumos para exibir a data da última revisão sem agregação no cliente.
CREATE VIEW kitchen.folder_last_review AS
SELECT DISTINCT ON (folder_id)
  folder_id,
  reviewed_at,
  reviewed_by,
  reviewed_by_name
FROM kitchen.folder_review
ORDER BY folder_id, reviewed_at DESC;
