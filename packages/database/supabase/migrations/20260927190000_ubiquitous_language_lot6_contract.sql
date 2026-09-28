-- SARAM: `core.person.saram` e `core.user_data.saram` — fase CONTRACT de 20260927180000.
--
-- Só pode ser aplicada DEPOIS do deploy do código que usa apenas os nomes novos (lote 6 de
-- `sisub-ubiquitous-language`). Aplicada antes, derruba em produção o código que ainda lê ou grava
-- `core.user_data."nrOrdem"` e `core.person.nr_ordem` (o vínculo do SARAM no perfil e no primeiro
-- acesso, as buscas de pessoa do sisub, do sucont, do rumaer e do Contrate, o painel de presença,
-- `/api/user-data`). Conferir no CI/CD da `main` que o deploy do PR do expand terminou.
--
-- Derruba o que o expand manteve só para o código antigo:
--
--   * os triggers e as funções de espelho;
--   * a coluna `nr_ordem` de `core.person_identity` (a view é recriada sem ela, com o grant e a
--     opção de 20260910225309). `sucont.checklist_current` (o cronograma do sucont, com os
--     responsáveis resolvidos) depende dela e é derrubada e recriada junto, com a definição, a
--     opção e o grant de 20260910225309;
--   * as colunas `core.person.nr_ordem` (com o UNIQUE `person_nr_ordem_key`) e
--     `core.user_data."nrOrdem"` (com o índice `user_data_nrOrdem_idx` e, onde existir, o único
--     condicional `user_data_nr_ordem_uniq`, que o expand já passou para `user_data_saram_uniq`).
--
-- NÃO toca o espelho do cadastro de pessoal: `core.user_military_data."nrOrdem"` é o nome do
-- sistema de origem (D2, D3), e o patch manual do mantenedor continua entrando com ele (`LGPD.md`).

-- ─── 0. Conferências ─────────────────────────────────────────────────────────────

-- O expand foi aplicado.
do $$
begin
	if not exists (select 1 from information_schema.columns where table_schema = 'core' and table_name = 'person' and column_name = 'saram')
		or not exists (select 1 from information_schema.columns where table_schema = 'core' and table_name = 'user_data' and column_name = 'saram') then
		raise exception 'o expand 20260927180000 não foi aplicado: falta core.person.saram ou core.user_data.saram';
	end if;
end;
$$;

-- Nada além dos espelhos e de `core.person_identity` (recriada abaixo) pode citar as colunas que
-- caem: função plpgsql não cria dependência de coluna, então o `drop column` passaria e ela
-- quebraria só quando rodasse, em produção. O `"nrOrdem"` do espelho do cadastro fica.
do $$
declare
	offenders text;
begin
	select string_agg(p.oid::regprocedure::text, ', ') into offenders
	from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	cross join lateral (select coalesce(p.prosrc, '') || ' ' || coalesce(pg_get_function_sqlbody(p.oid), '') as body) b
	where n.nspname not in ('pg_catalog', 'information_schema')
		and p.oid not in ('core.mirror_person_saram()'::regprocedure, 'core.mirror_user_data_saram()'::regprocedure)
		and (b.body ~* '\mnr_ordem\M' or (b.body ~ '"nrOrdem"' and b.body ~* '\m(user_data|person)\M'));
	if offenders is not null then
		raise exception 'funções citam colunas que este contract derruba: %', offenders;
	end if;

	select string_agg(schemaname || '.' || viewname, ', ') into offenders
	from (
		select schemaname, viewname, definition from pg_views
		union all
		select schemaname, matviewname, definition from pg_matviews
	) v
	where (definition ~* '\mnr_ordem\M' or definition ~ 'ud\."nrOrdem"' or (definition ~ '"nrOrdem"' and definition ~* '\m(user_data|person)\M' and definition !~* '\muser_military_data\M'))
		and (schemaname, viewname) <> ('core', 'person_identity');
	if offenders is not null then
		raise exception 'views citam colunas que este contract derruba: %', offenders;
	end if;

	-- Índice e constraint das colunas que caem: os do expand (`person_nr_ordem_key`,
	-- `user_data_nrOrdem_idx`) caem com elas; um criado depois sumiria sem passar para a nova.
	select string_agg(x, ', ') into offenders
	from (
		select i.indexrelid::regclass::text as x
		from pg_index i
		join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
		where ((i.indrelid = 'core.person'::regclass and a.attname = 'nr_ordem') or (i.indrelid = 'core.user_data'::regclass and a.attname = 'nrOrdem'))
			and i.indexrelid not in (
				'core.person_nr_ordem_key'::regclass,
				'core."user_data_nrOrdem_idx"'::regclass,
				coalesce(to_regclass('core.user_data_nr_ordem_uniq')::oid, 0)
			)
		union all
		select c.conname
		from pg_constraint c
		join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
		where ((c.conrelid = 'core.person'::regclass and a.attname = 'nr_ordem') or (c.conrelid = 'core.user_data'::regclass and a.attname = 'nrOrdem'))
			and c.conname <> 'person_nr_ordem_key'
	) d;
	if offenders is not null then
		raise exception 'índices ou constraints usam colunas que este contract derruba: %', offenders;
	end if;

	-- O SARAM exclusivo por conta (índice condicional de 20260921160410) só cai com a coluna antiga
	-- se o expand já o tiver passado para a nova.
	if to_regclass('core.user_data_nr_ordem_uniq') is not null and to_regclass('core.user_data_saram_uniq') is null then
		raise exception 'core.user_data_nr_ordem_uniq existe sem o equivalente em saram (user_data_saram_uniq): o contract o derrubaria';
	end if;

	-- Índice de expressão ou parcial não aparece em `indkey` (a coluna fica em `indexprs`/`indpred`):
	-- confere também pelo texto, que é o formato do único condicional de 20260921160410.
	select string_agg(i.indexrelid::regclass::text, ', ') into offenders
	from pg_index i
	where i.indrelid in ('core.person'::regclass, 'core.user_data'::regclass)
		and pg_get_indexdef(i.indexrelid) ~* '\mnr_ordem\M|"nrOrdem"'
		and i.indexrelid not in (
			'core.person_nr_ordem_key'::regclass,
			'core."user_data_nrOrdem_idx"'::regclass,
			coalesce(to_regclass('core.user_data_nr_ordem_uniq')::oid, 0)
		);
	if offenders is not null then
		raise exception 'índices (de expressão ou parciais) usam colunas que este contract derruba: %', offenders;
	end if;

	select string_agg(schemaname || '.' || tablename || '.' || policyname, ', ') into offenders
	from pg_policies
	where coalesce(qual, '') || ' ' || coalesce(with_check, '') ~* '\mnr_ordem\M|"nrOrdem"';
	if offenders is not null then
		raise exception 'policies citam colunas que este contract derruba: %', offenders;
	end if;

	select string_agg(pubname, ', ') into offenders
	from pg_publication_tables
	where schemaname = 'core' and tablename in ('person', 'user_data');
	if offenders is not null then
		raise exception 'publicações incluem tabelas do lote 6: %', offenders;
	end if;

	-- Job do pg_cron também resolve coluna pelo nome, e em texto livre.
	if to_regclass('cron.job') is not null then
		execute format(
			'select string_agg(jobname, %L) from cron.job where command ~* %L and command !~* %L',
			', ', '\mnr_ordem\M|"nrOrdem"', '\muser_military_data\M'
		) into offenders;
		if offenders is not null then
			raise exception 'jobs do pg_cron citam colunas que este contract derruba: %', offenders;
		end if;
	end if;

	-- `core.person_identity` é recriada: só `sucont.checklist_current`, recriada junto, pode depender
	-- dela.
	select string_agg(distinct c.oid::regclass::text, ', ') into offenders
	from pg_depend d
	join pg_rewrite r on r.oid = d.objid
	join pg_class c on c.oid = r.ev_class
	where d.refobjid = 'core.person_identity'::regclass
		and c.oid not in ('core.person_identity'::regclass, 'sucont.checklist_current'::regclass);
	if offenders is not null then
		raise exception 'objetos dependem de core.person_identity, que este contract recria: %', offenders;
	end if;

	-- E nada depende de `sucont.checklist_current`, que também é recriada.
	select string_agg(distinct c.oid::regclass::text, ', ') into offenders
	from pg_depend d
	join pg_rewrite r on r.oid = d.objid
	join pg_class c on c.oid = r.ev_class
	where d.refobjid = 'sucont.checklist_current'::regclass and c.oid <> 'sucont.checklist_current'::regclass;
	if offenders is not null then
		raise exception 'objetos dependem de sucont.checklist_current, que este contract recria: %', offenders;
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
		select 'core.person.nr_ordem' as t where exists (select 1 from core.person where nr_ordem is distinct from saram)
		union all
		select 'core.user_data."nrOrdem"' where exists (select 1 from core.user_data where "nrOrdem" is distinct from saram)
	) d;
	if diverging is not null then
		raise exception 'coluna antiga e nova divergem em: %', diverging;
	end if;
end;
$$;

-- ─── 1. Espelhos ─────────────────────────────────────────────────────────────────

drop trigger person_mirror_saram on core.person;
drop function core.mirror_person_saram();
drop trigger user_data_mirror_saram on core.user_data;
drop function core.mirror_user_data_saram();

-- ─── 2. core.person_identity sem nr_ordem ──────────────────────────────────────────
--
-- `create or replace` não remove coluna: drop + create. `sucont.checklist_current` a lê e cai
-- antes; volta no passo 3, igual.

drop view sucont.checklist_current;
drop view core.person_identity;

create view core.person_identity
with (security_invoker = true) as
select
	p.id,
	p.display_name,
	p.saram,
	p.user_id,
	p.active,
	ud.email,
	mi.posto,
	mi.nome_guerra,
	coalesce(nullif(btrim(coalesce(mi.posto, '') || ' ' || coalesce(mi.nome_guerra, '')), ''), ud.email, p.display_name) as label
from core.person p
left join core.user_data ud on ud.id = p.user_id
left join core.military_identity mi on mi.saram = p.saram;

-- Como em 20260910225309: só o servidor.
revoke all on core.person_identity from public, anon, authenticated;
grant select on core.person_identity to service_role;

comment on view core.person_identity is
	'Pessoa com o melhor rótulo já resolvido: posto + nome de guerra (core.military_identity, pelo SARAM), e-mail da conta ou o nome de reserva.';

-- ─── 3. sucont.checklist_current de volta ────────────────────────────────────────────
--
-- Definição de 20260910225309 (a última), sem mudança: o cronograma com o responsável resolvido.

create view sucont.checklist_current
with (security_invoker = true)
as
select
	ci.id,
	ci.task,
	ci.deadline,
	ci.description,
	ci.path,
	ci.recurrence,
	ci.business_day,
	ci.assign_to_all,
	ci.sort_order,
	ci.created_at,
	ci.updated_at,
	p.competencia,
	p.due_on,
	o.done_at,
	o.done_by,
	-- Em jsonb, e não em duas colunas de array: o par (id, rótulo) precisa chegar junto na tela.
	coalesce(
		(
			select jsonb_agg(jsonb_build_object('id', pi.id, 'label', pi.label) order by pi.label)
			from sucont.checklist_item_assignee a
			join core.person_identity pi on pi.id = a.person_id
			where a.item_id = ci.id
		),
		'[]'::jsonb
	) as assignees
from sucont.checklist_item ci
cross join lateral sucont.checklist_period(ci.recurrence, ci.business_day, sucont.today()) p
left join sucont.checklist_occurrence o on o.item_id = ci.id and o.competencia = p.competencia;

revoke all on sucont.checklist_current from public, anon, authenticated;
grant select on sucont.checklist_current to service_role;

-- ─── 4. Colunas antigas ──────────────────────────────────────────────────────────

alter table core.person drop column nr_ordem;
alter table core.user_data drop column "nrOrdem";

-- ─── 5. Conferência ──────────────────────────────────────────────────────────────

do $$
begin
	if exists (
		select 1 from information_schema.columns
		where table_schema = 'core'
			and ((table_name = 'person' and column_name = 'nr_ordem')
				or (table_name = 'user_data' and column_name = 'nrOrdem')
				or (table_name = 'person_identity' and column_name = 'nr_ordem'))
	) then
		raise exception 'sobrou coluna antiga do lote 6';
	end if;

	-- O espelho do cadastro não mudou: o patch do mantenedor continua no mesmo formato.
	if not exists (select 1 from information_schema.columns where table_schema = 'core' and table_name = 'user_military_data' and column_name = 'nrOrdem') then
		raise exception 'core.user_military_data."nrOrdem" sumiu: o patch do cadastro de pessoal depende dele';
	end if;

	if has_table_privilege('anon', 'core.person_identity', 'select') or has_table_privilege('authenticated', 'core.person_identity', 'select')
		or has_table_privilege('anon', 'sucont.checklist_current', 'select') or has_table_privilege('authenticated', 'sucont.checklist_current', 'select') then
		raise exception 'core.person_identity ou sucont.checklist_current ficou legível por anon/authenticated';
	end if;
	if not has_table_privilege('service_role', 'sucont.checklist_current', 'select') then
		raise exception 'sucont.checklist_current ficou sem SELECT do service_role';
	end if;
end;
$$;
