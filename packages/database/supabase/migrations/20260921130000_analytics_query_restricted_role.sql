-- execute_analytics_query: o SQL gerado pelo modelo deixa de rodar como `postgres`.
--
-- A função é SECURITY DEFINER e executa o texto recebido (`EXECUTE format('%s')`). O
-- dono era o `postgres` — BYPASSRLS, dono de quase todo o banco, com EXECUTE nas funções
-- de escrita. O validador do app (regex) era a única porta: `FROM units, auth.users`
-- passava, e `SELECT access_control.change_module_permission(...)` concedia admin global a
-- quem conseguisse chegar ao endpoint — e o endpoint só exigia sessão.
--
-- Agora a porta é o banco:
-- - dono = `analytics_reader`, papel NOLOGIN que só enxerga as tabelas que o assistente
--   documenta (SELECT) e nada mais: sem `auth`, sem `access_control`, sem EXECUTE em função
--   de aplicação (o default do banco já nega EXECUTE a PUBLIC).
-- - BYPASSRLS continua: as tabelas liberadas têm RLS sem policy (o acesso do app é pelo
--   servidor), e o assistente é uma visão de TODAS as OMs por desenho. O limite do que ele
--   lê é o GRANT, não a policy.
-- - transação somente leitura antes do EXECUTE: nem função volátil chamada de dentro do
--   SELECT, nem `net.http_*` (que enfileira por INSERT), grava coisa alguma.
-- - `statement_timeout` próprio, além do 8 s do authenticator.
--
-- A lista de tabelas é a mesma de `ALLOWED_TABLES` (apps/sisub/src/lib/analytics-sql.ts).
-- Tabela nova no assistente = grant aqui E na lista de lá.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'analytics_reader') then
    create role analytics_reader nologin noinherit bypassrls;
  end if;
end
$$;

-- PG 16+: quem cria o papel não ganha SET nele por padrão, e o ALTER ... OWNER exige.
-- INHERIT FALSE: o postgres não herda nada do papel.
grant analytics_reader to postgres with inherit false, set true;

grant usage on schema core, kitchen, procurement, finance to analytics_reader;

grant select on
  kitchen.meal_forecasts,
  kitchen.meal_presences,
  kitchen.mess_halls,
  kitchen.kitchen,
  kitchen.daily_menu,
  kitchen.menu_items,
  kitchen.recipes,
  kitchen.recipe_ingredients,
  kitchen.ingredient,
  kitchen.production_task,
  kitchen.meal_type,
  kitchen.v_meal_presences_with_user,
  core.units,
  core.kitchen,
  core.mess_halls,
  core.v_user_identity,
  procurement.procurement_list,
  procurement.procurement_list_item,
  procurement.procurement_arp_item,
  finance.empenho
to analytics_reader;

-- `v_user_identity` é security_invoker: quem lê precisa das colunas de base. Só as que a
-- view usa — o resto de `user_data`/`user_military_data` (CPF, telefone…) fica fora.
grant select (id, email, "nrOrdem") on core.user_data to analytics_reader;
grant select ("nrOrdem", "sgPosto", "nmGuerra") on core.user_military_data to analytics_reader;

create or replace function sisub.execute_analytics_query(query text)
returns jsonb
language plpgsql
security definer
set search_path to 'core', 'kitchen', 'procurement', 'finance'
set statement_timeout to '8s'
as $$
declare
  result jsonb;
begin
  if query is null or btrim(query) = '' then
    raise exception 'Query vazia';
  end if;

  -- Ir para somente leitura é permitido a qualquer momento da transação (o inverso não).
  -- Vale até o fim da transação do PostgREST, que termina logo depois desta chamada.
  perform set_config('transaction_read_only', 'on', true);

  execute format(
    'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (%s) t',
    query
  )
  into result;

  return coalesce(result, '[]'::jsonb);
end;
$$;

-- O novo dono precisa de CREATE no schema no instante do ALTER; depois disso, não.
grant create on schema sisub to analytics_reader;
alter function sisub.execute_analytics_query(text) owner to analytics_reader;
revoke create on schema sisub from analytics_reader;

revoke all on function sisub.execute_analytics_query(text) from public, anon, authenticated;
grant execute on function sisub.execute_analytics_query(text) to service_role;
