-- Migration: CATMAT food matching workflow for sisub.product
--
-- Adds control columns for automated CATMAT matching, enables the text search
-- extensions required by the matcher, and exposes an RPC-friendly candidate
-- query so the Bun orchestrator can stay thin.

create extension if not exists pg_trgm schema extensions;
create extension if not exists unaccent schema extensions;

alter table sisub.product
  add column if not exists catmat_match_status text not null default 'pending',
  add column if not exists catmat_match_score numeric null;

comment on column sisub.product.catmat_match_status is
  'Estado do matching CATMAT automático: pending, matched, review, no_match ou skip.';

comment on column sisub.product.catmat_match_score is
  'Score final (0-1) do matching CATMAT automático. Nulo quando o item é ignorado (skip).';

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'sisub'
      and indexname in ('idx_catmat_item_trgm', 'idx_compras_material_item_descricao_trgm')
  ) then
    create index idx_catmat_item_trgm
      on sisub.compras_material_item
      using gin (descricao_item gin_trgm_ops);
  end if;
end $$;

create or replace function sisub.normalize_catmat_match_text(p_text text)
returns text
language plpgsql
stable
as $$
declare
  normalized_text text := coalesce(p_text, '');
begin
  if to_regprocedure('extensions.unaccent(text)') is not null then
    normalized_text := extensions.unaccent(normalized_text);
  elsif to_regprocedure('public.unaccent(text)') is not null then
    normalized_text := public.unaccent(normalized_text);
  end if;

  return trim(
    regexp_replace(
      regexp_replace(
        upper(normalized_text),
        '[^A-Z0-9 ]+',
        ' ',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
end;
$$;

create or replace function sisub.catmat_similarity(p_left text, p_right text)
returns real
language plpgsql
stable
as $$
begin
  if to_regprocedure('extensions.similarity(text,text)') is not null then
    return extensions.similarity(p_left, p_right)::real;
  end if;

  if to_regprocedure('public.similarity(text,text)') is not null then
    return public.similarity(p_left, p_right)::real;
  end if;

  raise exception 'Função similarity(text, text) não está disponível';
end;
$$;

comment on function sisub.normalize_catmat_match_text(text) is
  'Normaliza texto para matching CATMAT: uppercase, sem acentos, sem pontuação e com espaços colapsados.';

comment on function sisub.catmat_similarity(text, text) is
  'Wrapper compatível com instalações de pg_trgm em public ou extensions.';

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
  where c.codigo_grupo = 89
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
  'Retorna os melhores candidatos CATMAT alimentícios (grupo 89) para uma descrição de produto.';
