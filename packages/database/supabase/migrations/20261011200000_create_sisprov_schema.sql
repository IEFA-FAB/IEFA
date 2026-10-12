-- create_sisprov_schema
-- App: sisprov — Sistema de Provisões (fardamento gratuito), frente do Projeto SIA
-- (Convênio 001/IEFA/2025). Decisão de plataforma e desenho em
-- `openspec/changes/sisprov-foundation`.
--
-- O que esta migration faz: cria o schema, os grants e o helper de `updated_at`, e expõe o
-- schema no PostgREST e na lista de schemas tipados. NADA MAIS.
--
-- O que ela NÃO faz, de propósito:
--   - Nenhuma tabela. O guard de reset de treino do sisub
--     (`apps/sisub/src/test/operations/training.operations.test.ts`) é default-deny e varre o
--     banco vivo atrás de toda tabela com `unit_id`: tabela aplicada antes de declarada ali
--     derruba o `check-sisub` de todo PR. As tabelas do SISPROV chegam uma a uma nos changes
--     seguintes (catálogo, grupos de demanda, ficha de tamanhos, curva), cada uma declarada
--     antes de aplicada. O schema nasce vazio para o trilho (app, módulos PBAC, deploy) existir
--     antes do primeiro dado.
--   - Nenhum módulo PBAC em DDL: `access_control.user_permissions.module` é texto sem CHECK;
--     `sisprov-planning`, `sisprov-supply` e `sisprov-admin` entram só no `AppModule` de
--     `@iefa/pbac` (precedente: `20260918123000_alpha_role_modules_unit_scope.sql`).
--   - Nenhuma função executável por cliente: função nova nasce só para `postgres` e
--     `service_role` desde `20260920210000`; o navegador não chama função nenhuma.
--
-- Autorização: PBAC nas server functions (service role), por papel escopado por OM:
--   sisprov-planning  1 consulta / 2 informa a previsão da OM
--   sisprov-supply    1 consulta / 2 recebe OF, distribui
--   sisprov-admin     2 gestão sistêmica (SDAB) / 3 gerencia grants
-- RLS: leitura a autenticados nas tabelas futuras (default privileges), escrita só por
-- service role, como no sucont e no rumaer. Tabela com dado pessoal (ficha de tamanhos por
-- SARAM) decide a própria policy na migration que a cria.

create schema if not exists sisprov;
grant usage on schema sisprov to anon, authenticated, service_role;

-- ── Helper: trigger updated_at ────────────────────────────────────────────────
-- `set search_path = ''`: função nova fixa o search_path (regra
-- `migration-function-without-search-path`); aqui nada é qualificado porque nada é lido.
create or replace function sisprov.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	new.updated_at = now();
	return new;
end;
$$;

-- ── Default privileges para as tabelas e sequências futuras do schema ─────────
-- Gate a nível de tabela; RLS a nível de linha; PBAC nas server functions.
alter default privileges in schema sisprov grant select on tables to authenticated;
alter default privileges in schema sisprov grant all    on tables to service_role;
alter default privileges in schema sisprov grant usage, select on sequences to service_role;

-- ── Expor schema no PostgREST (append à lista existente) ──────────────────────
-- A lista é a de `20260705180000_create_sucont_schema.sql` mais os schemas que entraram depois
-- (`alpha`, `documents`); conferida contra `SUPABASE_SCHEMAS` de
-- `packages/database/scripts/supabase-schemas.ts`, que esta migration também atualiza.
alter role authenticator set pgrst.db_schemas to 'public, graphql_public, sisub, iefa, journal, forms, rumaer, core, access_control, kitchen, procurement, finance, compras_gov_integration, inventory, siafi_integration, gs1_integration, nutrition_reference, assignment_selection, sucont, alpha, documents, sisprov';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
