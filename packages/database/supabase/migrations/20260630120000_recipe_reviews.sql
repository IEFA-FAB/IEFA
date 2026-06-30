-- Revisão de preparações: registro de "conferência" feita pelos nutricionistas.
-- Espelha sisub/kitchen.ingredient_review (20260609155940): cada clique em "Revisado"
-- na tela de detalhe da preparação cria UM evento de revisão (receita + autor + data).
-- Diferente do versionamento, a revisão é uma confirmação explícita de que a preparação
-- foi conferida — mesmo que nada tenha mudado. Serve para acompanhar o progresso da
-- revisão de todo o catálogo (o que já foi conferido e quando).
-- RLS habilitado (service-role only, padrão do projeto).

CREATE TABLE kitchen.recipe_review (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id        uuid        NOT NULL REFERENCES kitchen.recipes(id) ON DELETE CASCADE,
  reviewed_by      uuid,
  reviewed_by_name text,
  note             text,
  reviewed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX recipe_review_recipe_idx
  ON kitchen.recipe_review (recipe_id, reviewed_at DESC);

ALTER TABLE kitchen.recipe_review ENABLE ROW LEVEL SECURITY;

-- View: a última revisão por preparação (1 linha por preparação já revisada).
-- Usada na tela de detalhe para exibir a data da última revisão sem agregação no cliente.
CREATE VIEW kitchen.recipe_last_review AS
SELECT DISTINCT ON (recipe_id)
  recipe_id,
  reviewed_at,
  reviewed_by,
  reviewed_by_name
FROM kitchen.recipe_review
ORDER BY recipe_id, reviewed_at DESC;
