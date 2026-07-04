-- ============================================================================
-- Expor o schema nutrition_reference via PostgREST + grants
-- ============================================================================
-- A migration 20260702120000_nutrition_reference.sql criou o schema mas só rodou
-- `notify pgrst, 'reload schema'` — nunca adicionou nutrition_reference ao
-- pgrst.db_schemas nem concedeu grants. Resultado: o worker de sync (api, via
-- PostgREST + service_role) falhava com "The schema must be one of the following".
-- Reads do frontend (linking ingrediente↔nutrição) usam Drizzle direto e não eram
-- afetados. Idempotente; aplicado em ambientes novos via db:push.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Grants (RLS gate de linhas; grants são gate de tabela)
-- ----------------------------------------------------------------------------
grant usage on schema nutrition_reference to anon, authenticated, service_role;

grant select on all tables in schema nutrition_reference to anon, authenticated;
grant all on all tables in schema nutrition_reference to service_role;

alter default privileges in schema nutrition_reference
	grant select on tables to anon, authenticated;
alter default privileges in schema nutrition_reference
	grant all on tables to service_role;

-- Sequences das PKs bigserial (nutrition_sync_log / nutrition_sync_step)
grant usage, select on all sequences in schema nutrition_reference to service_role;
alter default privileges in schema nutrition_reference
	grant usage, select on sequences to service_role;

-- RPCs de contabilização de steps chamadas pelo worker como service_role
grant execute on function
	nutrition_reference.nutrition_sync_step_success(bigint, integer),
	nutrition_reference.nutrition_sync_step_failure(bigint)
	to service_role;

-- ----------------------------------------------------------------------------
-- Expor o schema nutrition_reference via PostgREST (adiciona à lista existente).
-- ----------------------------------------------------------------------------
alter role authenticator set pgrst.db_schemas to 'public, graphql_public, sisub, iefa, journal, forms, rumaer, core, access_control, kitchen, procurement, finance, compras_gov_integration, inventory, siafi_integration, gs1_integration, nutrition_reference';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
