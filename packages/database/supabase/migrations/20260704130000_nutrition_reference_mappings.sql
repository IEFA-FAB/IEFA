-- ============================================================================
-- Seed nutrient_component_mapping: source components → kitchen.nutrient
-- ============================================================================
-- The ingredient nutrition table (kitchen.nutrient) is the 10-nutrient Brazilian
-- mandatory label. This maps each source's matching component to those nutrients
-- so a linked ingredient resolves real values via listIngredientEffectiveNutrients
-- (which inner-joins nutrient_component_mapping). Units already align 1:1, so
-- conversion_multiplier = 1 and conversion_offset = 0.
--
-- Idempotent: re-runnable via ON CONFLICT DO NOTHING. Joins by (source_id,
-- external_code) and enum_name, so it works regardless of generated UUIDs.
-- ============================================================================

insert into nutrition_reference.nutrient_component_mapping
  (component_id, nutrient_id, conversion_multiplier, conversion_offset, is_preferred, confidence)
select nc.id, kn.id, 1, 0, true, 'seeded'
from (
  values
    -- Valor energético (kcal)
    ('taco', 'energia_kcal', 'VALOR_ENERGETICO'),
    ('ibge_pof_2008_2009', 'energia_kcal', 'VALOR_ENERGETICO'),
    ('usda_fdc', '1008', 'VALOR_ENERGETICO'),
    -- Proteínas
    ('taco', 'proteina', 'PROTEINAS'),
    ('ibge_pof_2008_2009', 'proteina', 'PROTEINAS'),
    ('usda_fdc', '1003', 'PROTEINAS'),
    -- Gorduras totais
    ('taco', 'lipideos', 'GORDURAS_TOTAIS'),
    ('ibge_pof_2008_2009', 'lipideos_totais', 'GORDURAS_TOTAIS'),
    ('usda_fdc', '1004', 'GORDURAS_TOTAIS'),
    -- Gorduras saturadas
    ('taco', 'ag_saturados', 'GORDURAS_SATURADAS'),
    ('ibge_pof_2008_2009', 'ag_saturados', 'GORDURAS_SATURADAS'),
    ('usda_fdc', '1258', 'GORDURAS_SATURADAS'),
    -- Carboidratos
    ('taco', 'carboidrato', 'CARBOIDRATOS'),
    ('ibge_pof_2008_2009', 'carboidrato', 'CARBOIDRATOS'),
    ('usda_fdc', '1005', 'CARBOIDRATOS'),
    -- Fibra alimentar
    ('taco', 'fibra_alimentar', 'FIBRA_ALIMENTAR'),
    ('ibge_pof_2008_2009', 'fibra_alimentar', 'FIBRA_ALIMENTAR'),
    ('usda_fdc', '1079', 'FIBRA_ALIMENTAR'),
    -- Colesterol
    ('taco', 'colesterol', 'COLESTEROL'),
    ('ibge_pof_2008_2009', 'colesterol', 'COLESTEROL'),
    ('usda_fdc', '1253', 'COLESTEROL'),
    -- Sódio
    ('taco', 'sodio', 'SODIO'),
    ('ibge_pof_2008_2009', 'sodio', 'SODIO'),
    ('usda_fdc', '1093', 'SODIO'),
    -- Cálcio
    ('taco', 'calcio', 'CALCIO'),
    ('ibge_pof_2008_2009', 'calcio', 'CALCIO'),
    ('usda_fdc', '1087', 'CALCIO'),
    -- Ferro
    ('taco', 'ferro', 'FERRO'),
    ('ibge_pof_2008_2009', 'ferro', 'FERRO'),
    ('usda_fdc', '1089', 'FERRO')
) as m(source_id, external_code, enum_name)
join nutrition_reference.nutrient_component nc
  on nc.source_id = m.source_id and nc.external_code = m.external_code
join kitchen.nutrient kn
  on kn.enum_name = m.enum_name
on conflict (component_id, nutrient_id) do nothing;
