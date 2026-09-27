-- Finanças: crédito recebido, crédito disponível e UG emitente — fase CONTRACT de 20260927080000.
--
-- Só pode ser aplicada DEPOIS do deploy do código que usa apenas os nomes novos
-- (`finance.budget_credit.received_credit`, `available_credit_siafi`, `finance.empenho.issuer_ug`).
-- Aplicada antes, derruba em produção o código que ainda lê ou grava `dotacao`, `saldo_siafi` e
-- `ug_emitente` (o painel de crédito, o upsert do lote de crédito do SIAFI, o registro e a
-- classificação da NE). Conferir no CI/CD da `main` que o deploy do PR do expand terminou.
--
-- Derruba o que o expand manteve só para o código antigo:
--
--   * os triggers e as funções de espelho;
--   * as colunas `dotacao` e `saldo_siafi` de `finance.budget_credit` e `ug_emitente` de
--     `finance.empenho` (nenhuma tinha índice, FK ou constraint);
--
-- e devolve a `received_credit` e `available_credit_siafi` o default 0 que as antigas tinham, que
-- o expand deixou de fora para o espelho distinguir "não informado" de zero.

-- Nada além do espelho pode citar as colunas que caem: função plpgsql não cria dependência de
-- coluna, então o `drop column` passaria e ela quebraria só quando rodasse, em produção.
do $$
declare
	offenders text;
begin
	select string_agg(p.oid::regprocedure::text, ', ') into offenders
	from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname not in ('pg_catalog', 'information_schema')
		and p.oid not in ('finance.mirror_budget_credit_naming()'::regprocedure, 'finance.mirror_empenho_issuer_ug()'::regprocedure)
		and (
			coalesce(p.prosrc, '') ~ '\m(dotacao|saldo_siafi|ug_emitente)\M'
			or coalesce(pg_get_function_sqlbody(p.oid), '') ~ '\m(dotacao|saldo_siafi|ug_emitente)\M'
		);
	if offenders is not null then
		raise exception 'funções citam colunas que este contract derruba: %', offenders;
	end if;

	select string_agg(schemaname || '.' || viewname, ', ') into offenders
	from (
		select schemaname, viewname, definition from pg_views
		union all
		select schemaname, matviewname, definition from pg_matviews
	) v
	where definition ~ '\m(dotacao|saldo_siafi|ug_emitente)\M';
	if offenders is not null then
		raise exception 'views citam colunas que este contract derruba: %', offenders;
	end if;

	-- Índice e constraint de uma coluna só caem com ela sem `cascade` e sem aviso: um criado entre o
	-- expand e o contract sumiria sem passar para a coluna nova.
	select string_agg(x, ', ') into offenders
	from (
		select i.indexrelid::regclass::text as x
		from pg_index i
		join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
		where i.indrelid in ('finance.budget_credit'::regclass, 'finance.empenho'::regclass)
			and a.attname in ('dotacao', 'saldo_siafi', 'ug_emitente')
		union all
		select c.conname
		from pg_constraint c
		join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
		where c.conrelid in ('finance.budget_credit'::regclass, 'finance.empenho'::regclass)
			and a.attname in ('dotacao', 'saldo_siafi', 'ug_emitente')
	) d;
	if offenders is not null then
		raise exception 'índices ou constraints usam colunas que este contract derruba: %', offenders;
	end if;

	select string_agg(schemaname || '.' || tablename || '.' || policyname, ', ') into offenders
	from pg_policies
	where coalesce(qual, '') || coalesce(with_check, '') ~ '\m(dotacao|saldo_siafi|ug_emitente)\M';
	if offenders is not null then
		raise exception 'policies citam colunas que este contract derruba: %', offenders;
	end if;
end;
$$;

-- O espelho garante colunas iguais; se não estiverem, algo escreveu por fora dele (com o trigger
-- desligado) e a coluna antiga tem dado que a nova não tem. Para, em vez de perder o valor.
do $$
declare
	diverging text;
begin
	select string_agg(t, ', ') into diverging
	from (
		select 'finance.budget_credit.dotacao' as t
		where exists (select 1 from finance.budget_credit where dotacao is distinct from received_credit)
		union all
		select 'finance.budget_credit.saldo_siafi'
		where exists (select 1 from finance.budget_credit where saldo_siafi is distinct from available_credit_siafi)
		union all
		select 'finance.empenho.ug_emitente' where exists (select 1 from finance.empenho where ug_emitente is distinct from issuer_ug)
	) d;
	if diverging is not null then
		raise exception 'coluna antiga e nova divergem em: %', diverging;
	end if;
end;
$$;

-- ─── 1. Espelhos ─────────────────────────────────────────────────────────────────

drop trigger budget_credit_mirror_naming on finance.budget_credit;
drop function finance.mirror_budget_credit_naming();
drop trigger empenho_mirror_issuer_ug on finance.empenho;
drop function finance.mirror_empenho_issuer_ug();

-- ─── 2. Colunas antigas ──────────────────────────────────────────────────────────

alter table finance.budget_credit drop column dotacao;
alter table finance.budget_credit drop column saldo_siafi;
alter table finance.empenho drop column ug_emitente;

-- ─── 3. Default das novas ────────────────────────────────────────────────────────

alter table finance.budget_credit alter column received_credit set default 0;
alter table finance.budget_credit alter column available_credit_siafi set default 0;
