-- ============================================================================
-- kitchen.nutrient: align the ingredient nutrition table with RDC 429/2020
-- ============================================================================
-- The table still carried the RDC 360/2003 label (plus colesterol/cálcio/ferro,
-- which were never mandatory). RDC 429/2020 art. 5 + IN 75/2020 require ten
-- nutrients; three were missing: açúcares totais, açúcares adicionados and
-- gorduras trans.
--
-- Also refreshes the reference daily values, which changed with IN 75/2020
-- (proteínas 75→50 g, gorduras totais 55→65 g, saturadas 22→20 g, sódio
-- 2400→2000 mg). Açúcares totais and gorduras trans have no established VD —
-- daily_value stays null so the UI renders "**" instead of a percentage.
--
-- Optional nutrients (colesterol, cálcio, ferro) are kept as voluntary
-- declarations and pushed below the mandatory block via display_order.
--
-- Idempotent: inserts guard on enum_name, updates are absolute, mappings use
-- ON CONFLICT DO NOTHING.
-- ============================================================================

-- 1. The three missing mandatory nutrients ----------------------------------
-- minimum_value carries the IN 75/2020 "não significativo" threshold, below
-- which the label may declare zero. Not consumed by the app yet; stored so the
-- rounding rules live next to the nutrient they belong to.

insert into kitchen.nutrient (name, enum_name, daily_value, minimum_value, is_energy_value, display_order)
select v.name, v.enum_name, v.daily_value, v.minimum_value, false, v.display_order
from (
  values
    ('Açúcares totais (g)',      'ACUCARES_TOTAIS',       null::numeric, 0.5::numeric, 3),
    ('Açúcares adicionados (g)', 'ACUCARES_ADICIONADOS',  50::numeric,   0.5::numeric, 4),
    ('Gorduras trans (g)',       'GORDURAS_TRANS',        null::numeric, 0.1::numeric, 8)
) as v(name, enum_name, daily_value, minimum_value, display_order)
where not exists (
  select 1 from kitchen.nutrient n where n.enum_name = v.enum_name and n.deleted_at is null
);

-- 2. Reference daily values and label order ---------------------------------
-- daily_value is set explicitly (including to null) so a stale RDC 360 value
-- cannot survive. minimum_value is left alone for pre-existing rows.

update kitchen.nutrient n
set daily_value = v.daily_value,
    display_order = v.display_order
from (
  values
    ('VALOR_ENERGETICO',     2000::numeric,  1),
    ('CARBOIDRATOS',         300::numeric,   2),
    ('ACUCARES_TOTAIS',      null::numeric,  3),
    ('ACUCARES_ADICIONADOS', 50::numeric,    4),
    ('PROTEINAS',            50::numeric,    5),
    ('GORDURAS_TOTAIS',      65::numeric,    6),
    ('GORDURAS_SATURADAS',   20::numeric,    7),
    ('GORDURAS_TRANS',       null::numeric,  8),
    ('FIBRA_ALIMENTAR',      25::numeric,    9),
    ('SODIO',                2000::numeric, 10),
    -- Voluntary declarations, below the mandatory block.
    ('COLESTEROL',           null::numeric, 11),
    ('CALCIO',               1000::numeric, 12),
    ('FERRO',                14::numeric,   13)
) as v(enum_name, daily_value, display_order)
where n.enum_name = v.enum_name;

-- 3. Map the new nutrients to the reference sources --------------------------
-- TACO 4ª ed. carries no sugar column and only the 18:1t / 18:2t isomers (which
-- cannot be summed through a 1:1 mapping), so it is deliberately absent here:
-- ingredients linked to TACO render "—" for these three nutrients.

insert into nutrition_reference.nutrient_component_mapping
  (component_id, nutrient_id, conversion_multiplier, conversion_offset, is_preferred, confidence)
select nc.id, kn.id, 1, 0, true, 'seeded'
from (
  values
    -- Açúcares totais
    ('ibge_pof_2008_2009', 'acucar_total', 'ACUCARES_TOTAIS'),
    ('usda_fdc', '2000', 'ACUCARES_TOTAIS'),
    -- Açúcares adicionados
    ('ibge_pof_2008_2009', 'acucar_adicao', 'ACUCARES_ADICIONADOS'),
    ('usda_fdc', '1235', 'ACUCARES_ADICIONADOS'),
    -- Gorduras trans
    ('ibge_pof_2008_2009', 'ag_trans', 'GORDURAS_TRANS'),
    ('usda_fdc', '1257', 'GORDURAS_TRANS')
) as m(source_id, external_code, enum_name)
join nutrition_reference.nutrient_component nc
  on nc.source_id = m.source_id and nc.external_code = m.external_code
join kitchen.nutrient kn
  on kn.enum_name = m.enum_name and kn.deleted_at is null
on conflict (component_id, nutrient_id) do nothing;

-- 4. Report what actually landed ---------------------------------------------
-- The mapping seed inner-joins nutrient_component, so a source that was never
-- imported silently contributes nothing. Surface the counts instead of letting
-- the migration look successful while mapping zero components.

do $$
declare
  v_nutrients integer;
  v_mappings  integer;
begin
  select count(*) into v_nutrients
  from kitchen.nutrient
  where deleted_at is null
    and enum_name in ('ACUCARES_TOTAIS', 'ACUCARES_ADICIONADOS', 'GORDURAS_TRANS');

  select count(*) into v_mappings
  from nutrition_reference.nutrient_component_mapping m
  join kitchen.nutrient n on n.id = m.nutrient_id
  where n.enum_name in ('ACUCARES_TOTAIS', 'ACUCARES_ADICIONADOS', 'GORDURAS_TRANS');

  raise notice 'RDC 429/2020: % of 3 nutrients present, % source mappings (expect 6 with IBGE + USDA imported, 0 with neither)', v_nutrients, v_mappings;

  if v_nutrients <> 3 then
    raise exception 'expected the 3 RDC 429/2020 nutrients in kitchen.nutrient, found %', v_nutrients;
  end if;
end $$;
