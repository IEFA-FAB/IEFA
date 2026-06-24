-- ============================================================================
-- Fix: sisub.catmat_match_candidates após o move de compras_gov_integration
-- ============================================================================
-- A função permanece em `sisub` (é chamada via `.rpc()` por clients de schema
-- sisub: ingredients.fn.ts e catmat-match-orchestrator.ts), mas seu corpo joina
-- 4 tabelas CATMAT que foram movidas para `compras_gov_integration` na migration
-- 20260624130000. `ALTER TABLE ... SET SCHEMA` não reescreve corpos de função,
-- então a função quebrou ("relation sisub.compras_material_item does not exist").
--
-- Re-qualifica as 4 tabelas movidas para `compras_gov_integration.*`; os helpers
-- `sisub.normalize_catmat_match_text` e `sisub.catmat_word_similarity` continuam
-- em sisub (não foram movidos).
-- ============================================================================

create or replace function sisub.catmat_match_candidates(p_product_description text, p_limit integer default 5)
 returns table(codigo_item integer, descricao_item text, codigo_pdm integer, nome_pdm text, codigo_classe integer, nome_classe text, unidades text[], score real, pdm_score real)
 language sql
 stable
as $function$
  with normalized_product as (
    select sisub.normalize_catmat_match_text(p_product_description) as description
  ),
  unidade_por_pdm as (
    select
      uf.codigo_pdm,
      array_remove(
        array_agg(
          distinct nullif(
            upper(
              coalesce(
                uf.sigla_unidade_medida,
                uf.sigla_unidade_fornecimento,
                uf.nome_unidade_fornecimento
              )
            ),
            ''
          )
        ),
        null
      ) as unidades
    from compras_gov_integration.compras_material_unidade_fornecimento uf
    group by uf.codigo_pdm
  )
  select
    ci.codigo_item,
    ci.descricao_item,
    p.codigo_pdm,
    p.nome_pdm,
    c.codigo_classe,
    c.nome_classe,
    coalesce(u.unidades, '{}'::text[]) as unidades,
    sisub.catmat_word_similarity(
      np.description,
      sisub.normalize_catmat_match_text(ci.descricao_item)
    )::real as score,
    sisub.catmat_word_similarity(
      np.description,
      sisub.normalize_catmat_match_text(p.nome_pdm)
    )::real as pdm_score
  from normalized_product np
  join compras_gov_integration.compras_material_item ci
    on np.description <> ''
  join compras_gov_integration.compras_material_pdm p
    on p.codigo_pdm = ci.codigo_pdm
  join compras_gov_integration.compras_material_classe c
    on c.codigo_classe = p.codigo_classe
  left join unidade_por_pdm u
    on u.codigo_pdm = p.codigo_pdm
  where c.codigo_classe = any (array[8905, 8910, 8915, 8920, 8925, 8930, 8935, 8940, 8945, 8950, 8955, 8960, 8965, 8970]::integer[])
    and c.status_classe = true
    and p.status_pdm = true
    and ci.status_item = true
    and sisub.catmat_word_similarity(
      np.description,
      sisub.normalize_catmat_match_text(ci.descricao_item)
    ) > 0.3
  order by score desc, pdm_score desc, ci.codigo_item
  limit greatest(coalesce(p_limit, 5), 1);
$function$;
