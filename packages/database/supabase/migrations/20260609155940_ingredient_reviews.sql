-- Revisão de insumos: registro de "conferência" feita pelos nutricionistas.
-- Cada clique em "Revisado" na tela de detalhe do insumo cria UM evento de revisão
-- (insumo + autor + data). Diferente do versionamento (ingredient_version), que captura
-- MUDANÇAS no agregado, a revisão é uma confirmação explícita de que o insumo foi conferido
-- — mesmo que nada tenha mudado. Serve para os nutricionistas acompanharem o progresso da
-- revisão de todo o catálogo (o que já foi conferido e quando).
-- RLS habilitado (service-role only, padrão do projeto desde 20260522).

CREATE TABLE sisub.ingredient_review (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id    uuid        NOT NULL REFERENCES sisub.ingredient(id) ON DELETE CASCADE,
  reviewed_by      uuid,
  reviewed_by_name text,
  note             text,
  reviewed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ingredient_review_ingredient_idx
  ON sisub.ingredient_review (ingredient_id, reviewed_at DESC);

ALTER TABLE sisub.ingredient_review ENABLE ROW LEVEL SECURITY;

-- View: a última revisão por insumo (1 linha por insumo já revisado).
-- Usada na árvore de insumos para exibir a data da última revisão sem agregação no cliente.
CREATE VIEW sisub.ingredient_last_review AS
SELECT DISTINCT ON (ingredient_id)
  ingredient_id,
  reviewed_at,
  reviewed_by,
  reviewed_by_name
FROM sisub.ingredient_review
ORDER BY ingredient_id, reviewed_at DESC;
