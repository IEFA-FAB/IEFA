-- Arranchamento com o nome do glossário — fase EXPAND.
--
-- Lote 7 da linguagem ubíqua do sisub (`openspec/changes/sisub-ubiquitous-language`, D2, D4 e
-- D11). O militar se ARRANCHA: declara que vai comer numa data, refeição e refeitório; a presença
-- é o comparecimento. "Meal forecast" é a estimativa agregada de comensais
-- (`kitchen.daily_menu.forecasted_headcount`, que fica), não o ato individual, e a tabela levava o
-- nome da estimativa. A tabela fica no singular, como `finance.empenho`.
--
--   tabela                                   → tabela
--   kitchen.meal_forecasts                   → kitchen.arranchamento
--
--   constraint / índice                      → constraint / índice
--   meal_forecasts_pkey                      → arranchamento_pkey
--   meal_forecasts_user_id_date_meal_key     → arranchamento_user_id_date_meal_key
--   meal_forecasts_meal_check                → arranchamento_meal_check
--   meal_forecasts_mess_hall_id_fkey         → arranchamento_mess_hall_id_fkey
--   meal_forecasts_user_id_fkey              → arranchamento_user_id_fkey
--   meal_forecasts_date_idx                  → arranchamento_date_idx
--   meal_forecasts_mess_hall_id_idx          → arranchamento_mess_hall_id_idx
--
-- Nenhuma coluna muda de nome (`id`, `date`, `user_id`, `meal`, `will_eat`, `mess_hall_id`,
-- `created_at`, `updated_at`): `will_eat` é "vai comer" (`false` = desarranchado). As contagens
-- dos painéis que D11 renomeia (`forecast_count`, `total_forecast`...) só existem no TypeScript.
--
-- ## Por que expand/contract
--
-- O banco é compartilhado e a `main` roda contra ele o tempo todo; a suíte dela tem de continuar
-- verde enquanto o código novo não sobe. Esta migration só ACRESCENTA caminhos (técnica de
-- 20260927060000):
--
--   * Tabela renomeada: o nome antigo vira view de compatibilidade (`security_invoker`) de uma
--     tabela só, com as mesmas colunas, na mesma ordem, e os mesmos defaults. É auto-updatable:
--     o upsert do comensal (`on conflict (user_id, date, meal)`), o delete e as leituras da `main`
--     (sisub, API pública e o reset de treino) passam direto para a tabela, e o trigger
--     `set_updated_at` da tabela dispara.
--   * Mesmos grants da tabela: só o servidor (`service_role`) escreve; o leitor do analytics
--     (`analytics_reader`) lê, como já lia pela tabela. Cliente (`anon`/`authenticated`) não
--     alcança nem uma nem outra.
--   * Constraint e índice: rename direto. O trigger `set_updated_at` e a função genérica
--     `sisub.set_updated_at()` não citam a tabela e seguem pelo OID.
--
-- O que cita a tabela no banco vivo (conferido em 2026-09-27 por `pg_proc.prosrc`/`prosqlbody`,
-- `pg_views`, `pg_matviews`, `pg_policies`, `pg_depend`, `pg_publication_tables` e `cron.job`):
-- nada. Nenhuma função, view, policy (a RLS está ligada sem policy: o navegador não lê),
-- publicação do Realtime nem job do pg_cron; nenhuma FK de fora aponta para ela. O bloco 0 e o
-- bloco 5 conferem de novo na hora de aplicar.
--
-- O CONTRACT (20260927140000) derruba a view e só pode ser aplicado depois do deploy do código
-- que usa só o nome novo.

-- ─── 0. Conferência: nada no banco cita a tabela pelo nome ─────────────────────────
--
-- plpgsql e SQL resolvem tabela pelo nome, não pelo OID: uma função que citasse `meal_forecasts`
-- passaria pela view de compatibilidade (que não dispara os triggers da tabela como o código
-- espera) e quebraria no contract. Se aparecer alguma, ela tem de ser recriada neste expand.

do $$
declare
	old_names constant text := '\mmeal_forecasts\M';
	offenders text;
begin
	select string_agg(p.oid::regprocedure::text, ', ') into offenders
	from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname not in ('pg_catalog', 'information_schema')
		and (
			coalesce(p.prosrc, '') ~ old_names
			or coalesce(pg_get_function_sqlbody(p.oid), '') ~ old_names
		);
	if offenders is not null then
		raise exception 'funções citam kitchen.meal_forecasts e precisam ser recriadas neste expand: %', offenders;
	end if;

	select string_agg(schemaname || '.' || viewname, ', ') into offenders
	from (
		select schemaname, viewname, definition from pg_views
		union all
		select schemaname, matviewname, definition from pg_matviews
	) v
	where definition ~ old_names;
	if offenders is not null then
		raise exception 'views citam kitchen.meal_forecasts e precisam ser recriadas neste expand: %', offenders;
	end if;

	select string_agg(schemaname || '.' || tablename || '.' || policyname, ', ') into offenders
	from pg_policies
	where coalesce(qual, '') || ' ' || coalesce(with_check, '') ~ old_names;
	if offenders is not null then
		raise exception 'policies citam kitchen.meal_forecasts: %', offenders;
	end if;

	-- Job do pg_cron resolve tabela pelo nome, em texto livre, e não aparece em `pg_depend`.
	if to_regclass('cron.job') is not null then
		execute 'select string_agg(jobname, '', '') from cron.job where command ~ $1' into offenders using old_names;
		if offenders is not null then
			raise exception 'jobs do pg_cron citam kitchen.meal_forecasts: %', offenders;
		end if;
	end if;
end;
$$;

-- ─── 1. Tabela ───────────────────────────────────────────────────────────────────

alter table kitchen.meal_forecasts rename to arranchamento;

-- ─── 2. Constraints e índices (só nome) ─────────────────────────────────────────────

alter table kitchen.arranchamento rename constraint meal_forecasts_pkey to arranchamento_pkey;
alter table kitchen.arranchamento rename constraint meal_forecasts_user_id_date_meal_key to arranchamento_user_id_date_meal_key;
alter table kitchen.arranchamento rename constraint meal_forecasts_meal_check to arranchamento_meal_check;
alter table kitchen.arranchamento rename constraint meal_forecasts_mess_hall_id_fkey to arranchamento_mess_hall_id_fkey;
alter table kitchen.arranchamento rename constraint meal_forecasts_user_id_fkey to arranchamento_user_id_fkey;
alter index kitchen.meal_forecasts_date_idx rename to arranchamento_date_idx;
alter index kitchen.meal_forecasts_mess_hall_id_idx rename to arranchamento_mess_hall_id_idx;

-- ─── 3. Comentário ───────────────────────────────────────────────────────────────

comment on table kitchen.arranchamento is
	'Arranchamento: o comensal declara que vai comer (will_eat) numa data, refeição e refeitório; uma linha por comensal, data e refeição. A presença é o comparecimento (kitchen.meal_presences); a previsão agregada de comensais é kitchen.daily_menu.forecasted_headcount.';

-- ─── 4. View de compatibilidade com o nome antigo ──────────────────────────────────
--
-- Mesma ordem de colunas da tabela. Os defaults são repetidos na view para quem insere sem a
-- coluna (o INSERT pela view não herda o default da tabela).

create view kitchen.meal_forecasts
with (security_invoker = true) as
select
	id,
	date,
	user_id,
	meal,
	will_eat,
	created_at,
	updated_at,
	mess_hall_id
from kitchen.arranchamento;

alter view kitchen.meal_forecasts alter column id set default gen_random_uuid();
alter view kitchen.meal_forecasts alter column created_at set default now();
alter view kitchen.meal_forecasts alter column updated_at set default now();

-- Mesmos grants da tabela: só o servidor escreve; o leitor do analytics lê, como já lia.
revoke all on kitchen.meal_forecasts from public, anon, authenticated;
grant all on kitchen.meal_forecasts to service_role;
grant select on kitchen.meal_forecasts to analytics_reader;

comment on view kitchen.meal_forecasts is
	'Compatibilidade do rename 20260927130000 (→ kitchen.arranchamento) para o código antigo em produção. Removida em 20260927140000.';

-- ─── 5. Conferência final ─────────────────────────────────────────────────────────
--
-- A tabela e a view têm os mesmos grants (nenhum cliente alcança nenhuma das duas), e nada
-- além da própria view cita o nome antigo.

do $$
declare
	offenders text;
begin
	-- `has_table_privilege` com a lista separada por vírgula é verdadeiro se QUALQUER um vale.
	select string_agg(rel || '/' || grantee, ', ') into offenders
	from unnest(array['kitchen.arranchamento', 'kitchen.meal_forecasts']) rel
	cross join unnest(array['anon', 'authenticated']) grantee
	where has_table_privilege(grantee, rel, 'select, insert, update, delete');
	if offenders is not null then
		raise exception 'cliente alcança o arranchamento: %', offenders;
	end if;

	if not has_table_privilege('analytics_reader', 'kitchen.arranchamento', 'select')
		or not has_table_privilege('analytics_reader', 'kitchen.meal_forecasts', 'select') then
		raise exception 'analytics_reader perdeu a leitura do arranchamento';
	end if;

	select string_agg(p.oid::regprocedure::text, ', ') into offenders
	from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname not in ('pg_catalog', 'information_schema')
		and (
			coalesce(p.prosrc, '') ~ '\mmeal_forecasts\M'
			or coalesce(pg_get_function_sqlbody(p.oid), '') ~ '\mmeal_forecasts\M'
		);
	if offenders is not null then
		raise exception 'funções citam kitchen.meal_forecasts: %', offenders;
	end if;
end;
$$;
