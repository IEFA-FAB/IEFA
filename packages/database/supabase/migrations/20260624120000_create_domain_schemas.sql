-- ============================================================================
-- Split do schema `sisub` em schemas por domínio — Fase 1 (scaffolding)
-- ============================================================================
-- Cria os 9 schemas de contexto que vão receber, em fases incrementais, as
-- tabelas hoje concentradas em `sisub`. Esta migration é ADITIVA: NÃO move
-- nenhuma tabela. Apenas cria schemas, aplica grants/default-privileges e
-- expõe os schemas via PostgREST.
--
-- Fronteiras de contexto (ERP público):
--   core                     — entidades base compartilhadas (units, mess_halls,
--                              kitchen, user_data, changelog, ...)
--   access_control           — permissões e chaves (user_permissions, mcp_api_keys)
--   kitchen                  — receitas, cardápios, insumos, produção, presenças
--   procurement              — listas/ATA, ARP, pesquisa de preço, purchase_item
--   finance                  — empenho (compromisso financeiro canônico)
--   compras_gov_integration  — staging/sync do Compras.gov (CATMAT/CATSER)
--   inventory                — estoque (vazio por enquanto)
--   siafi_integration        — integração SIAFI (vazio por enquanto)
--   gs1_integration          — integração GS1/GPC (vazio por enquanto)
--
-- Padrão de grants espelha as migrations de `forms`/`rumaer`: leitura pública
-- (anon/authenticated) é decidida por-tabela via policy; service_role bypassa
-- RLS e recebe acesso total. Aqui garantimos USAGE de schema + default
-- privileges para os objetos que serão criados/movidos nesses schemas.
-- ============================================================================

create schema if not exists core;
create schema if not exists access_control;
create schema if not exists kitchen;
create schema if not exists procurement;
create schema if not exists finance;
create schema if not exists compras_gov_integration;
create schema if not exists inventory;
create schema if not exists siafi_integration;
create schema if not exists gs1_integration;

comment on schema core is 'Entidades base compartilhadas do ERP (units, mess_halls, kitchen, users, changelog, ...).';
comment on schema access_control is 'Autorização: permissões finas e chaves de API (user_permissions, mcp_api_keys).';
comment on schema kitchen is 'Domínio cozinha: receitas, cardápios, insumos, produção, presenças.';
comment on schema procurement is 'Aquisições: listas/ATA, ARP, pesquisa de preço, purchase_item, policy_rule.';
comment on schema finance is 'Financeiro: empenho e compromissos orçamentários canônicos.';
comment on schema compras_gov_integration is 'Staging/sync do Compras.gov (CATMAT/CATSER) — dados externos.';
comment on schema inventory is 'Estoque (placeholder — sem tabelas nesta fase).';
comment on schema siafi_integration is 'Integração SIAFI (placeholder — sem tabelas nesta fase).';
comment on schema gs1_integration is 'Integração GS1/GPC (placeholder — sem tabelas nesta fase).';

-- ----------------------------------------------------------------------------
-- Grants de USAGE (gate de schema). RLS + policies seguem por-tabela.
-- ----------------------------------------------------------------------------
grant usage on schema
  core, access_control, kitchen, procurement, finance,
  compras_gov_integration, inventory, siafi_integration, gs1_integration
  to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- service_role: acesso total a objetos existentes e futuros em cada schema.
-- (anon/authenticated recebem SELECT apenas quando uma policy abrir a tabela;
--  default privileges de leitura ficam por-fase, junto com as tabelas movidas.)
-- ----------------------------------------------------------------------------
do $$
declare s text;
begin
  foreach s in array array[
    'core','access_control','kitchen','procurement','finance',
    'compras_gov_integration','inventory','siafi_integration','gs1_integration'
  ]
  loop
    execute format('grant all on all tables in schema %I to service_role', s);
    execute format('grant all on all sequences in schema %I to service_role', s);
    execute format('grant all on all functions in schema %I to service_role', s);
    execute format('alter default privileges in schema %I grant all on tables to service_role', s);
    execute format('alter default privileges in schema %I grant all on sequences to service_role', s);
    execute format('alter default privileges in schema %I grant all on functions to service_role', s);
    execute format('alter default privileges in schema %I grant usage on types to service_role', s);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Expor os 9 schemas via PostgREST (adiciona à lista existente).
-- Consumidores supabase-js/PostgREST remanescentes (worker compras-sync,
-- server fns ainda em supabase-js) precisam dos schemas expostos.
-- ----------------------------------------------------------------------------
alter role authenticator set pgrst.db_schemas to
  'public, graphql_public, sisub, iefa, journal, forms, rumaer, core, access_control, kitchen, procurement, finance, compras_gov_integration, inventory, siafi_integration, gs1_integration';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
