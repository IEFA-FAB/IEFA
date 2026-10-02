-- analytics.v_user_identity deixa de cair no e-mail quando falta posto/nome de guerra.
--
-- A view é a que o assistente de analytics lê (`sisub.execute_analytics_query`, dono
-- `analytics_reader`, migration 20260921160000). O `display_name` vinha do espelho do cadastro
-- de pessoal (`sgPosto` + `nmGuerra`) e, sem ele, do `core.user_data.email`. Quem não tem SARAM
-- vinculado (ou tem e ainda não chegou na carga do efetivo) aparecia ao modelo pelo e-mail: dado
-- pessoal que a resposta do chat, o gráfico e o histórico salvo repetiam, e que um prompt
-- injetado podia pedir em lote (`select display_name from v_meal_presences_with_user`).
--
-- O rótulo de quem não tem nome de guerra passa a ser `Usuário <8 primeiros do uuid>`: distingue
-- as pessoas no gráfico (o que o assistente precisa) sem identificar ninguém fora do sistema.
--
-- `analytics.v_meal_presences_with_user` lê `display_name` desta view, então muda junto sem ser
-- recriada. Conferido em `pg_views` (2026-10-01): as duas são as únicas views do schema
-- `analytics`, e só esta citava `email`. O bloco final confere de novo na hora de aplicar.
--
-- `create or replace view` mantém dono (`postgres`), grants (`analytics_reader=r`) e a ausência
-- de `security_invoker` (de propósito, ver o cabeçalho de 20260921160000). Mesmas colunas e
-- tipos (`id uuid`, `display_name text`): os tipos gerados não mudam.

create or replace view analytics.v_user_identity as
select
	ud.id,
	case
		when nullif(btrim(coalesce(umd."sgPosto", '') || ' ' || coalesce(umd."nmGuerra", '')), '') is not null
			then btrim(coalesce(umd."sgPosto", '') || ' ' || initcap(coalesce(umd."nmGuerra", '')))
		else 'Usuário ' || left(ud.id::text, 8)
	end as display_name
from core.user_data ud
left join core.user_military_data umd on umd."nrOrdem" = ud.saram;

comment on view analytics.v_user_identity is
	'Identidade publicada ao assistente de analytics: id + posto/nome de guerra, ou "Usuário <8 primeiros do id>". Nunca e-mail, SARAM ou CPF (20261001130000).';

do $$
declare
	offenders text;
begin
	-- Nenhuma view do schema do assistente publica e-mail, nem por coluna nem por expressão.
	select string_agg(schemaname || '.' || viewname, ', ') into offenders
	from pg_views
	where schemaname = 'analytics'
		and definition ~* '\memail\M';
	if offenders is not null then
		raise exception 'views do schema analytics ainda leem e-mail: %', offenders;
	end if;

	-- Grants intactos: só o analytics_reader lê, nenhum cliente alcança.
	if not has_table_privilege('analytics_reader', 'analytics.v_user_identity', 'select') then
		raise exception 'analytics_reader perdeu SELECT em analytics.v_user_identity';
	end if;
	if has_table_privilege('anon', 'analytics.v_user_identity', 'select')
		or has_table_privilege('authenticated', 'analytics.v_user_identity', 'select') then
		raise exception 'analytics.v_user_identity alcançável por cliente';
	end if;
end;
$$;
