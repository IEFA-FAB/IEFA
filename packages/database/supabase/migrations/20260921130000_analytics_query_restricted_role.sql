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
--   documenta (SELECT) e nada mais: sem USAGE em `auth`, `access_control` nem nos demais
--   schemas. EXECUTE em função de aplicação: em produção já não há nenhuma aberta a PUBLIC
--   nestes quatro schemas (default deny, migrations 20260920210000/220000); independente
--   disso, a transação somente leitura abaixo impede qualquer escrita.
-- - BYPASSRLS continua: as tabelas liberadas têm RLS sem policy (o acesso do app é pelo
--   servidor), e o assistente é uma visão de TODAS as OMs por desenho. O limite do que ele
--   lê é o GRANT, não a policy.
-- - transação somente leitura antes do EXECUTE: nem função volátil chamada de dentro do
--   SELECT, nem `net.http_*` (que enfileira por INSERT), grava coisa alguma.
-- - tempo: vale o `statement_timeout` de 8 s do authenticator. O `set statement_timeout`
--   da função fica só como documentação — dentro de uma função ele não rearma o timer do
--   statement em curso.
--
-- - identidade: as duas views com nome de usuário (`v_user_identity`,
--   `v_meal_presences_with_user`) são `security_invoker` em `core`/`kitchen` — lê-las exigiria
--   SELECT nas colunas de base de `core.user_data`, e aí `select email, "nrOrdem" from
--   core.user_data` entregaria o e-mail e o número de ordem de TODOS. No lugar, o schema
--   `analytics` (fora do PostgREST) guarda cópias com o MESMO nome e só as colunas
--   publicadas; ele vem primeiro no `search_path`, então o SQL do modelo continua igual.
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
  core.units,
  core.kitchen,
  core.mess_halls,
  procurement.procurement_list,
  procurement.procurement_list_item,
  procurement.procurement_arp_item,
  finance.empenho
to analytics_reader;

-- Views de identidade SEM `security_invoker`, de propósito: rodam com o privilégio do dono
-- (`postgres`) e publicam só `id` + `display_name`. Ficam num schema que o PostgREST não
-- expõe — nenhum cliente as alcança; só o `analytics_reader` tem USAGE nele.
create schema if not exists analytics;
revoke all on schema analytics from public;
grant usage on schema analytics to analytics_reader;

-- Sobre as tabelas de base, e não sobre `core.v_user_identity`: aquela é `security_invoker`,
-- e view invoker aninhada checa o privilégio de QUEM CONSULTA mesmo dentro de uma view do
-- dono. Mesma expressão de `display_name` de `core.v_user_identity`.
create or replace view analytics.v_user_identity as
  select
    ud.id,
    case
      when nullif(trim(both from (coalesce(umd."sgPosto", '') || ' ' || coalesce(umd."nmGuerra", ''))), '') is not null
        then trim(both from (coalesce(umd."sgPosto", '') || ' ' || initcap(coalesce(umd."nmGuerra", ''))))
      else ud.email
    end as display_name
  from core.user_data ud
  left join core.user_military_data umd on umd."nrOrdem" = ud."nrOrdem";

create or replace view analytics.v_meal_presences_with_user as
  select mp.id, mp.user_id, mp.date, mp.meal, mp.created_at, mp.mess_hall_id, mp.updated_at, vui.display_name
  from kitchen.meal_presences mp
  left join analytics.v_user_identity vui on vui.id = mp.user_id;

revoke all on analytics.v_user_identity, analytics.v_meal_presences_with_user from public, anon, authenticated;
grant select on analytics.v_user_identity, analytics.v_meal_presences_with_user to analytics_reader;

create or replace function sisub.execute_analytics_query(query text)
returns jsonb
language plpgsql
security definer
set search_path to 'analytics', 'core', 'kitchen', 'procurement', 'finance'
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
