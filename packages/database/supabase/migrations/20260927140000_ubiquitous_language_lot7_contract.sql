-- Arranchamento com o nome do glossário — fase CONTRACT de 20260927130000.
--
-- Só pode ser aplicada DEPOIS do deploy do código que usa apenas o nome novo
-- (`kitchen.arranchamento`, `arranchamentoInKitchen`, a API `/api/arranchamentos` e o alias
-- `/api/rancho_previsoes`, que passa a ler a tabela nova). Aplicada antes, derruba em produção o
-- código que ainda lê a view de compatibilidade: o arranchamento do comensal, a tela do fiscal,
-- os painéis, o analytics e a API pública. Conferir no CI/CD da `main` que o deploy do PR do
-- expand terminou.
--
-- Derruba o que o expand manteve só para o código antigo: a view `kitchen.meal_forecasts`.
--
-- Não há coluna espelhada para conferir divergência: nenhuma coluna mudou de nome, e a view era
-- uma projeção da tabela (não guarda linha própria). O que se confere é que nada além dela cita
-- o nome antigo.

-- Função plpgsql/SQL e job do pg_cron não criam dependência de view: o `drop view` passaria e
-- eles quebrariam só quando rodassem, em produção. O código do sisub e da API não aparece no
-- catálogo: a garantia dele é o deploy do expand conferido no CI/CD antes de aplicar.
do $$
declare
	old_names constant text := '\mmeal_forecasts\M';
	offenders text;
begin
	if to_regclass('kitchen.arranchamento') is null then
		raise exception 'kitchen.arranchamento não existe: aplique o expand 20260927130000 antes';
	end if;

	select string_agg(p.oid::regprocedure::text, ', ') into offenders
	from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname not in ('pg_catalog', 'information_schema')
		and (
			coalesce(p.prosrc, '') ~ old_names
			or coalesce(pg_get_function_sqlbody(p.oid), '') ~ old_names
		);
	if offenders is not null then
		raise exception 'funções citam a view que este contract derruba: %', offenders;
	end if;

	select string_agg(schemaname || '.' || tablename || '.' || policyname, ', ') into offenders
	from pg_policies
	where coalesce(qual, '') || ' ' || coalesce(with_check, '') ~ old_names;
	if offenders is not null then
		raise exception 'policies citam a view que este contract derruba: %', offenders;
	end if;

	if to_regclass('cron.job') is not null then
		execute 'select string_agg(jobname, '', '') from cron.job where command ~ $1' into offenders using old_names;
		if offenders is not null then
			raise exception 'jobs do pg_cron citam a view que este contract derruba: %', offenders;
		end if;
	end if;
end;
$$;

-- ─── 1. View de compatibilidade ──────────────────────────────────────────────────
--
-- Sem `cascade`: se alguém tiver criado objeto em cima dela, o contract para aqui.

drop view kitchen.meal_forecasts;
