-- Efetivo por refeitório: `kitchen.rancho` → `kitchen.mess_hall_workforce` — fase CONTRACT de
-- 20260927150000.
--
-- Só pode ser aplicada DEPOIS do deploy do código que usa apenas os nomes novos
-- (`kitchen.mess_hall_workforce`, `kitchen.workforce_submission.mess_hall_workforce_id`). Aplicada
-- antes, derruba em produção a matriz de efetivo (`/local-analytics/$unitId/workforce`,
-- `/analytics/workforce`) e o passo do reset do treino que ainda leem `kitchen.rancho` e
-- `rancho_id`. Conferir no CI/CD da `main` que o deploy do PR do expand terminou.
--
-- Derruba o que o expand manteve só para o código antigo:
--
--   * a view de compatibilidade `kitchen.rancho`;
--   * o trigger e a função de espelho de `kitchen.workforce_submission`;
--   * a coluna `workforce_submission.rancho_id`, com a FK, o índice e o unique `(survey_id,
--     rancho_id)` dela (o unique `(survey_id, mess_hall_workforce_id)` já é o árbitro do código
--     novo);
--   * as views `core.rancho` e `core.workforce_submission` da promoção do núcleo (20260901120400),
--     que não têm leitor no código e citam o nome descartado (D3, D10). As outras views
--     `core.workforce_*` não citam "rancho" e ficam com o contract da promoção do núcleo.
--
-- Tudo sem `cascade`: um objeto construído por cima de uma view ou coluna que cai para o contract
-- em vez de sumir em silêncio.

-- ─── 0. Conferência: só a camada de compatibilidade cita os nomes que caem ────────
--
-- Função plpgsql não cria dependência de coluna nem de tabela: o `drop` passaria e ela quebraria
-- só quando rodasse, em produção.

do $$
declare
	-- Qualquer "rancho" (caixa ignorada pelo `~*`), menos o nome da função "Fiscal de rancho".
	old_names constant text := '(?<![Ff]iscal de )(?<![Ff]iscais de )\m(rancho\w*)\M';
	offenders text;
begin
	select string_agg(p.oid::regprocedure::text, ', ') into offenders
	from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname not in ('pg_catalog', 'information_schema')
		and p.oid <> 'kitchen.mirror_workforce_submission_mess_hall_workforce()'::regprocedure
		and (
			coalesce(p.prosrc, '') ~* old_names
			or coalesce(pg_get_function_sqlbody(p.oid), '') ~* old_names
		);
	if offenders is not null then
		raise exception 'funções citam os nomes que este contract derruba: %', offenders;
	end if;

	select string_agg(schemaname || '.' || viewname, ', ') into offenders
	from (
		select schemaname, viewname, definition from pg_views
		union all
		select schemaname, matviewname, definition from pg_matviews
	) v
	where definition ~* old_names
		and (schemaname, viewname) not in (('kitchen', 'rancho'), ('core', 'rancho'), ('core', 'workforce_submission'));
	if offenders is not null then
		raise exception 'views citam os nomes que este contract derruba: %', offenders;
	end if;

	select string_agg(schemaname || '.' || tablename || '.' || policyname, ', ') into offenders
	from pg_policies
	where coalesce(qual, '') || ' ' || coalesce(with_check, '') ~* old_names;
	if offenders is not null then
		raise exception 'policies citam os nomes que este contract derruba: %', offenders;
	end if;

	if to_regclass('cron.job') is not null then
		execute 'select string_agg(jobname, '', '') from cron.job where command ~* $1' into offenders using old_names;
		if offenders is not null then
			raise exception 'jobs do pg_cron citam os nomes que este contract derruba: %', offenders;
		end if;
	end if;

	-- Índice e constraint da coluna antiga caem com ela sem `cascade` e sem aviso: um criado entre o
	-- expand e o contract sumiria sem passar para a coluna nova. Só os três que o expand conhecia.
	-- O índice de expressão ou parcial cita a coluna em `indexprs`/`indpred` (o `indkey` guarda 0),
	-- e a comparação é por OID, que não depende do `search_path` da sessão.
	select string_agg(x, ', ') into offenders
	from (
		select i.indexrelid::regclass::text as x
		from pg_index i
		where i.indrelid = 'kitchen.workforce_submission'::regclass
			and i.indexrelid not in ('kitchen.workforce_submission_rancho_idx'::regclass, 'kitchen.workforce_submission_uniq'::regclass)
			and (
				exists (
					select 1 from pg_attribute a
					where a.attrelid = i.indrelid and a.attnum = any (i.indkey) and a.attname = 'rancho_id'
				)
				or coalesce(pg_get_expr(i.indexprs, i.indrelid), '') ~ '\mrancho_id\M'
				or coalesce(pg_get_expr(i.indpred, i.indrelid), '') ~ '\mrancho_id\M'
			)
		union all
		select c.conname
		from pg_constraint c
		join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
		where c.conrelid = 'kitchen.workforce_submission'::regclass
			and a.attname = 'rancho_id'
			and c.conname <> 'workforce_submission_rancho_id_fkey'
	) d;
	if offenders is not null then
		raise exception 'índices ou constraints usam a coluna que este contract derruba: %', offenders;
	end if;

	-- O espelho garante colunas iguais; se não estiverem, algo escreveu por fora dele (com o trigger
	-- desligado) e a coluna antiga tem dado que a nova não tem. Para, em vez de perder o valor. A
	-- antiga NULL não perde nada (a nova é NOT NULL): só valor diferente conta.
	if exists (select 1 from kitchen.workforce_submission where rancho_id is not null and rancho_id <> mess_hall_workforce_id) then
		raise exception 'kitchen.workforce_submission: rancho_id e mess_hall_workforce_id divergem';
	end if;
end;
$$;

-- ─── 1. Views de compatibilidade ────────────────────────────────────────────────

drop view kitchen.rancho;
drop view core.rancho;
drop view core.workforce_submission;

-- ─── 2. Espelho e coluna antiga ─────────────────────────────────────────────────

drop trigger workforce_submission_mirror_mess_hall_workforce on kitchen.workforce_submission;
drop function kitchen.mirror_workforce_submission_mess_hall_workforce();

alter table kitchen.workforce_submission drop constraint workforce_submission_rancho_id_fkey;
drop index kitchen.workforce_submission_rancho_idx;
drop index kitchen.workforce_submission_uniq;
alter table kitchen.workforce_submission drop column rancho_id;

-- ─── 3. Conferência final ───────────────────────────────────────────────────────

do $$
declare
	offenders text;
begin
	select string_agg(n.nspname || '.' || c.relname, ', ') into offenders
	from pg_class c
	join pg_namespace n on n.oid = c.relnamespace
	where n.nspname in ('core', 'kitchen') and c.relname ~* 'rancho';
	if offenders is not null then
		raise exception 'relações com "rancho" no nome sobraram depois do contract: %', offenders;
	end if;

	-- A coluna nova é agora a única integridade da resposta: NOT NULL, FK para o roster, índice da FK
	-- e o unique que o upsert usa como árbitro.
	if not exists (
		select 1 from pg_index i
		where i.indrelid = 'kitchen.workforce_submission'::regclass
			and i.indexrelid = 'kitchen.workforce_submission_mess_hall_workforce_uniq'::regclass
			and i.indisunique
	) then
		raise exception 'kitchen.workforce_submission perdeu o unique (survey_id, mess_hall_workforce_id)';
	end if;
	if not exists (
		select 1 from pg_attribute
		where attrelid = 'kitchen.workforce_submission'::regclass and attname = 'mess_hall_workforce_id' and attnotnull
	) then
		raise exception 'kitchen.workforce_submission.mess_hall_workforce_id deixou de ser NOT NULL';
	end if;
	if not exists (
		select 1 from pg_constraint
		where conrelid = 'kitchen.workforce_submission'::regclass
			and conname = 'workforce_submission_mess_hall_workforce_id_fkey'
			and contype = 'f'
			and confrelid = 'kitchen.mess_hall_workforce'::regclass
	) then
		raise exception 'kitchen.workforce_submission perdeu a FK de mess_hall_workforce_id';
	end if;
	if to_regclass('kitchen.workforce_submission_mess_hall_workforce_idx') is null then
		raise exception 'kitchen.workforce_submission perdeu o índice da FK de mess_hall_workforce_id';
	end if;
end;
$$;
