-- Fatores por ingrediente da preparação (ficha técnica) + índice de reidratação no insumo.
--
-- Modelo (decisão de produto):
--   - Fator de Correção (FC = peso bruto / peso líquido) e Índice de Reidratação (IR)
--     passam a ser definíveis POR INGREDIENTE DA PREPARAÇÃO. NULL = herda o valor
--     padrão do insumo; e, na ausência de ambos, o fator vale 1 (não altera).
--   - O Fator de Cocção continua em kitchen.recipes.cooking_factor (por preparação),
--     também opcional (NULL/omitido = 1).
--   - Estes fatores dimensionam peso bruto / compras / rendimento; NÃO entram no
--     cálculo da tabela nutricional, que usa o peso líquido (parte comestível).
--
-- FC já existe em kitchen.ingredient.correction_factor; aqui só falta o IR do insumo
-- (default) e os overrides por ingrediente da preparação.

-- Índice de reidratação padrão do insumo (peso reidratado / peso seco).
ALTER TABLE kitchen.ingredient
  ADD COLUMN IF NOT EXISTS rehydration_index numeric;

-- Overrides por ingrediente da preparação. NULL = herda o valor do insumo.
ALTER TABLE kitchen.recipe_ingredients
  ADD COLUMN IF NOT EXISTS correction_factor numeric,
  ADD COLUMN IF NOT EXISTS rehydration_index numeric;

COMMENT ON COLUMN kitchen.ingredient.rehydration_index IS
  'Índice de reidratação padrão do insumo (peso reidratado / peso seco). NULL = 1 (sem reidratação).';
COMMENT ON COLUMN kitchen.recipe_ingredients.correction_factor IS
  'Fator de Correção específico desta preparação (peso bruto / peso líquido). NULL herda ingredient.correction_factor; na ausência de ambos, 1.';
COMMENT ON COLUMN kitchen.recipe_ingredients.rehydration_index IS
  'Índice de reidratação específico desta preparação. NULL herda ingredient.rehydration_index; na ausência de ambos, 1.';
