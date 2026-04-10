create or replace function sisub.catmat_match_candidates(
  p_product_description text,
  p_limit integer default 5
)
returns table (
  codigo_item integer,
  descricao_item text,
  codigo_pdm integer,
  nome_pdm text,
  codigo_classe integer,
  nome_classe text,
  unidades text[],
  score real
)
language sql
stable
as $$
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
    from sisub.compras_material_unidade_fornecimento uf
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
    sisub.catmat_similarity(
      sisub.normalize_catmat_match_text(ci.descricao_item),
      np.description
    )::real as score
  from normalized_product np
  join sisub.compras_material_item ci
    on np.description <> ''
  join sisub.compras_material_pdm p
    on p.codigo_pdm = ci.codigo_pdm
  join sisub.compras_material_classe c
    on c.codigo_classe = p.codigo_classe
  left join unidade_por_pdm u
    on u.codigo_pdm = p.codigo_pdm
  where c.codigo_classe = any (array[8905, 8910, 8915, 8920, 8925, 8930, 8935, 8940, 8945, 8950, 8955, 8960, 8965, 8970]::integer[])
    and c.status_classe = true
    and p.status_pdm = true
    and ci.status_item = true
    and sisub.catmat_similarity(
      sisub.normalize_catmat_match_text(ci.descricao_item),
      np.description
    ) > 0.2
  order by score desc, ci.codigo_item
  limit greatest(coalesce(p_limit, 5), 1);
$$;

comment on function sisub.catmat_match_candidates(text, integer) is
  'Retorna os melhores candidatos CATMAT alimentícios, excluindo a classe 8975 (produtos de tabaco).';
