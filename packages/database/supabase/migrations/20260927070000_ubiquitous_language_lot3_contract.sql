-- Pesquisa de preços e prefixos redundantes → nomes do glossário — fase CONTRACT de 20260927060000.
--
-- Só pode ser aplicada DEPOIS do deploy do código que usa apenas os nomes novos
-- (`price_research*`, `price_sample`, `price_sample_id`, `arp*`, `segment*`,
-- `upsert_price_samples`, `sisub.price_sample_fingerprint`). Aplicada antes, derruba em produção o
-- código que ainda lê as views de compatibilidade ou chama a RPC antiga (o worker de pesquisa de
-- preços da API). Conferir no CI/CD da `main` que o deploy do PR do expand terminou.
--
-- Derruba o que o expand manteve só para o código antigo:
--
--   * as oito views `procurement.procurement_pesquisa_preco*`, `compras_amostra`,
--     `procurement_arp*` e `procurement_segment*`;
--   * os wrappers `procurement.upsert_compras_amostras(jsonb)` e
--     `sisub.compras_amostra_fingerprint(...)`.
--
-- Não há coluna espelhada para conferir divergência: a única coluna renomeada (`amostra_id` →
-- `price_sample_id`) estava numa tabela renomeada, e a view fazia o alias.

-- Nada além dos wrappers pode citar as views que caem: função plpgsql/SQL e job do pg_cron não
-- criam dependência de view, então o `drop view` passaria e eles quebrariam só quando rodassem,
-- em produção. O código da API e do sisub não aparece no catálogo: a garantia dele é o deploy do
-- expand conferido no CI/CD antes de aplicar.
do $$
declare
	-- Um padrão só para funções, policies e jobs do pg_cron. `upsert_compras_amostras` vai à parte:
	-- `\m` exige início de palavra, e o `_` antes de `compras` é caractere de palavra.
	old_names constant text := '\m(procurement_pesquisa_preco\w*|compras_amostra\w*|upsert_compras_amostras|procurement_arp\w*|procurement_segment\w*|amostra_id)\M';
	offenders text;
begin
	select string_agg(p.oid::regprocedure::text, ', ') into offenders
	from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname not in ('pg_catalog', 'information_schema')
		and p.oid not in (
			'procurement.upsert_compras_amostras(jsonb)'::regprocedure,
			'sisub.compras_amostra_fingerprint(text, integer, text, numeric, numeric, text, text, numeric, text, text, text, text, text, text, numeric, date)'::regprocedure
		)
		and (
			coalesce(p.prosrc, '') ~ old_names
			or coalesce(pg_get_function_sqlbody(p.oid), '') ~ old_names
		);
	if offenders is not null then
		raise exception 'funções citam views ou wrappers que este contract derruba: %', offenders;
	end if;

	select string_agg(schemaname || '.' || tablename || '.' || policyname, ', ') into offenders
	from pg_policies
	where coalesce(qual, '') || ' ' || coalesce(with_check, '') ~ old_names;
	if offenders is not null then
		raise exception 'policies citam views que este contract derruba: %', offenders;
	end if;

	-- Job do pg_cron resolve tabela pelo nome, em texto livre, e não aparece em `pg_depend`.
	if to_regclass('cron.job') is not null then
		execute 'select string_agg(jobname, '', '') from cron.job where command ~ $1' into offenders using old_names;
		if offenders is not null then
			raise exception 'jobs do pg_cron citam views ou wrappers que este contract derruba: %', offenders;
		end if;
	end if;
end;
$$;

-- ─── 1. Views de compatibilidade ─────────────────────────────────────────────────
--
-- Sem `cascade`: se alguém tiver criado objeto em cima de uma delas, o contract para aqui.

drop view procurement.procurement_pesquisa_preco_amostra;
drop view procurement.procurement_pesquisa_preco_item;
drop view procurement.procurement_pesquisa_preco;
drop view procurement.compras_amostra;
drop view procurement.procurement_arp_item;
drop view procurement.procurement_arp;
drop view procurement.procurement_segment_rule;
drop view procurement.procurement_segment;

-- ─── 2. Wrappers das funções renomeadas ──────────────────────────────────────────

drop function procurement.upsert_compras_amostras(jsonb);
drop function sisub.compras_amostra_fingerprint(
	text, integer, text, numeric, numeric, text, text, numeric, text, text, text, text, text, text, numeric, date
);
