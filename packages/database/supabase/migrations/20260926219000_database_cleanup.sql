-- Limpeza da auditoria do banco de 2026-09-26 (pg_stat_statements desde 2025-07-10).
--
-- 1. Matcher CATMAT sem chamador. `sisub.catmat_match_candidates` respondia por ~44% de todo o
--    tempo de execução acumulado (74 mil chamadas, média de 1,3 s: aplica uma função PL/pgSQL a
--    cada um dos 312 mil itens e não usa o índice trigram). O script que a chamava saiu no #453.
--    `sisub.catmat_similarity` fica: `inventory.suggest_purchase_items` a usa.
-- 2. Funções de trigger de views que já não existem (`rancho_presencas`, `others_presence`) e
--    normalizadores sem uso em função, view, default ou índice.
-- 3. Índices idênticos (advisor `duplicate_index`) e índice não único contido no único de mesmas
--    colunas. `profiles_admin` fica para o PR que remove a tabela (tabela de acesso).
-- 4. (Os índices das FKs estão em 20260926219500_foreign_key_indexes, separados para as travas
--    de cada migration durarem menos.)
-- 5. `inventory.stock_cost` ganha PK (advisor `no_primary_key`).
-- 6. Legado do SISUBWEB. As 14 tabelas cruas em `public` estão 100% refletidas em
--    `kitchen.ingredient.legacy_id` / `kitchen.recipes.legacy_id` / `kitchen.ceafa` /
--    `kitchen.nutrient`, e nada no banco ou no código as lê. Saem de `public` (exposto pelo
--    PostgREST) para `legacy_sisubweb`, que não está em `pgrst.db_schemas` e não concede nada
--    (as tabelas já têm ACL só de postgres e service_role). O DROP fica para depois de um
--    ciclo sem ninguém sentir falta. As tabelas de lookup da migração
--    (`kitchen.migration_*_lookup`) e as views `core.migration_*_lookup` saem: o `legacy_id` já
--    guarda a rastreabilidade, e o lookup de pastas tinha 106 de 232 linhas apontando para pasta
--    que não existe mais.

-- 1 e 2 ─────────────────────────────────────────────────────────────────────────────────────
drop function if exists sisub.catmat_match_candidates(text, integer);
drop function if exists sisub.catmat_word_similarity(text, text);
drop function if exists sisub.normalize_catmat_match_text(text);
drop function if exists sisub.normalize_label_text(text);
drop function if exists sisub.normalize_recipe_name(text);
drop function if exists sisub.others_presence_del();
drop function if exists sisub.others_presence_ins();
drop function if exists sisub.others_presence_upd();
drop function if exists sisub.rancho_presencas_view_del();
drop function if exists sisub.rancho_presencas_view_ins();

-- 3 ─────────────────────────────────────────────────────────────────────────────────────────
alter table kitchen.meal_forecasts drop constraint if exists rancho_previsoes_user_data_refeicao_key;
drop index if exists kitchen.rancho_presencas_date_meal_idx;
alter table kitchen.super_admin_controller drop constraint if exists super_admin_controller_key_key;
drop index if exists journal.idx_review_assignments_token;
-- O único (ingredient_id, version_number) atende a leitura "última versão" em varredura reversa.
drop index if exists kitchen.ingredient_version_ingredient_idx;
drop index if exists inventory.monthly_closing_kitchen_idx;
-- (user_id, date) é prefixo do único (user_id, date, meal): o único atende as mesmas leituras.
drop index if exists kitchen.meal_forecasts_user_date_idx;
drop index if exists kitchen.meal_presences_user_date_idx;

-- 5 ─────────────────────────────────────────────────────────────────────────────────────────
-- A identidade de negócio continua nos dois únicos parciais (cozinha + insumo | preparação
-- congelada); a PK é só a chave física que o advisor e a replicação lógica esperam.
alter table inventory.stock_cost add column if not exists id uuid not null default gen_random_uuid();
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'inventory.stock_cost'::regclass and contype = 'p') then
    alter table inventory.stock_cost add constraint stock_cost_pkey primary key (id);
  end if;
end $$;

-- 6 ─────────────────────────────────────────────────────────────────────────────────────────
drop view if exists core.migration_folder_lookup;
drop view if exists core.migration_nutrient_lookup;
drop view if exists core.migration_product_lookup;
drop view if exists core.migration_recipe_lookup;
drop table if exists kitchen.migration_folder_lookup;
drop table if exists kitchen.migration_nutrient_lookup;
drop table if exists kitchen.migration_product_lookup;
drop table if exists kitchen.migration_recipe_lookup;
drop view if exists kitchen.v_ingredient_kg_lt_items;

create schema if not exists legacy_sisubweb;
comment on schema legacy_sisubweb is
  'Cópia crua do SISUBWEB, já migrada para kitchen.* (legacy_id). Fora do PostgREST e sem acesso de cliente. Candidata a DROP a partir de 2026-12.';

alter table if exists public.ingrediente_preparacao set schema legacy_sisubweb;
alter table if exists public.ingrediente_preparacao_original set schema legacy_sisubweb;
alter table if exists public.produto_nutriente set schema legacy_sisubweb;
alter table if exists public.item_produto set schema legacy_sisubweb;
alter table if exists public.embalagem set schema legacy_sisubweb;
alter table if exists public.insumo set schema legacy_sisubweb;
alter table if exists public.insumo_original set schema legacy_sisubweb;
alter table if exists public.preparacao_base set schema legacy_sisubweb;
alter table if exists public.preparacao_original set schema legacy_sisubweb;
alter table if exists public.produto set schema legacy_sisubweb;
alter table if exists public.grupo_produto set schema legacy_sisubweb;
alter table if exists public.nutriente set schema legacy_sisubweb;
alter table if exists public.unidade_medida set schema legacy_sisubweb;
alter table if exists public.ceafa set schema legacy_sisubweb;


-- 7 ─────────────────────────────────────────────────────────────────────────────────────────
-- Características do CATMAT sem valor codificado. O único (item, característica, valor) é
-- NULLS DISTINCT: com `codigo_valor_caracteristica` nulo nunca havia conflito, e cada sync
-- inseria uma cópia nova. Em 2026-09-26: 219.191 linhas com valor nulo em 15.900 chaves, ou
-- seja, 203.291 cópias — todas de conteúdo idêntico ao da chave (conferido: nenhuma chave com
-- nome, valor, número, unidade ou status divergentes). Fica a mais recente de cada chave, e o
-- único passa a tratar nulo como igual, o que o `onConflict` do sync já espera.
delete from compras_gov_integration.compras_material_caracteristica c
using (
  select id,
         row_number() over (
           partition by codigo_item, codigo_caracteristica
           order by synced_at desc nulls last, id desc
         ) as rn
  from compras_gov_integration.compras_material_caracteristica
  where codigo_valor_caracteristica is null
) d
where c.id = d.id
  and d.rn > 1;

alter table compras_gov_integration.compras_material_caracteristica
  drop constraint if exists compras_material_caracteristi_codigo_item_codigo_caracteris_key;
alter table compras_gov_integration.compras_material_caracteristica
  add constraint compras_material_caracteristica_item_caracteristica_valor_key
  unique nulls not distinct (codigo_item, codigo_caracteristica, codigo_valor_caracteristica);
