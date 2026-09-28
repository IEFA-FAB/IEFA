-- SARAM: `core.person.nr_ordem` e `core.user_data."nrOrdem"` → `saram` — fase EXPAND.
--
-- Lote 6 da linguagem ubíqua do sisub (`openspec/changes/sisub-ubiquitous-language`, D1 critério 3,
-- D2, D4 e D9). O número do militar é o SARAM, sigla consagrada: `saram` em todo objeto nosso. O
-- espelho do cadastro de pessoal (`core.user_military_data`) guarda o nome do sistema de origem
-- (`"nrOrdem"`, D2 e D3) e NÃO muda: o patch manual do mantenedor continua entrando com o mesmo
-- formato (`LGPD.md`), e o SARAM dele já sai como `saram` pela view `core.military_identity`
-- (20260927170000, `lgpd-military-roster-key`).
--
--   coluna (tabela fica com o nome)          → coluna
--   core.person.nr_ordem                     → saram (UNIQUE próprio)
--   core.user_data."nrOrdem"                 → saram (índice próprio)
--
--   view                                     → coluna nova no fim
--   core.person_identity.nr_ordem            → saram (a antiga fica até o contract)
--
-- ## Por que expand/contract
--
-- O banco é compartilhado e a `main` roda contra ele o tempo todo; a suíte dela tem de continuar
-- verde enquanto o código novo não sobe. Esta migration só ACRESCENTA caminhos (técnica de
-- 20260927080000 e 20260927150000):
--
--   * Coluna renomeada em tabela que fica: coluna nova ao lado, backfill, UNIQUE/índices próprios
--     (inclusive o único condicional `user_data_nr_ordem_uniq` de 20260921160410, onde ele existe) e
--     um trigger BEFORE INSERT OR UPDATE que espelha os dois sentidos e recusa valores divergentes.
--     As duas já eram anuláveis (o SARAM é opcional na conta e na pessoa) e continuam. A antiga
--     mantém o UNIQUE (`person_nr_ordem_key`) e o índice (`user_data_nrOrdem_idx`) até o contract:
--     o 23505 que o sucont traduz em "Esse SARAM já está vinculado" vem de qualquer um dos dois.
--   * `core.person_identity` ganha `saram` no FIM (`create or replace view` só acrescenta coluna);
--     `nr_ordem` fica até o contract, que recria a view sem ela.
--   * `core.v_user_identity` e `analytics.v_user_identity` passam a juntar pela coluna nova, com as
--     mesmas colunas de saída, para o contract derrubar a antiga sem `cascade`.
--     `analytics.v_user_identity` continua sobre a tabela do espelho (não é `security_invoker`, e a
--     view invoker aninhada negaria o `analytics_reader`; ver 20260927170000).
--   * Nenhuma função, policy, publicação ou job do pg_cron cita as colunas (conferido em `pg_proc`,
--     `pg_policies`, `pg_publication_tables` e `cron.job` em 2026-09-27); `core.military_masked_cpf`
--     cita o `"nrOrdem"` do ESPELHO, que fica. O bloco 0 confere tudo de novo na hora de aplicar.
--   * Os grants são por tabela (sem grant de coluna): só `service_role` alcança as duas tabelas, e
--     a coluna nova herda.
--
-- O CONTRACT (20260927190000) confere que as colunas não divergem, derruba os espelhos, as colunas
-- antigas e o `nr_ordem` da view, e só pode ser aplicado depois do deploy do código que usa só os
-- nomes novos.

-- ─── 0. Conferência: nada além das três views cita as colunas ────────────────────────
--
-- plpgsql e SQL resolvem coluna pelo nome e não criam dependência: uma função esquecida quebraria
-- no contract, em produção. O `"nrOrdem"` do espelho (`core.user_military_data`) é legítimo e fica;
-- por isso o texto só é acusado quando cita `nr_ordem` ou quando cita `"nrOrdem"` junto de
-- `user_data`/`person`.

do $$
declare
	offenders text;
begin
	select string_agg(p.oid::regprocedure::text, ', ') into offenders
	from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	cross join lateral (select coalesce(p.prosrc, '') || ' ' || coalesce(pg_get_function_sqlbody(p.oid), '') as body) b
	where n.nspname not in ('pg_catalog', 'information_schema')
		and (b.body ~* '\mnr_ordem\M' or (b.body ~ '"nrOrdem"' and b.body ~* '\m(user_data|person)\M'));
	if offenders is not null then
		raise exception 'funções citam as colunas antigas do lote 6 e precisam ser recriadas neste expand: %', offenders;
	end if;

	select string_agg(schemaname || '.' || viewname, ', ') into offenders
	from (
		select schemaname, viewname, definition from pg_views
		union all
		select schemaname, matviewname, definition from pg_matviews
	) v
	where (definition ~* '\mnr_ordem\M' or (definition ~ '"nrOrdem"' and definition ~* '\m(user_data|person)\M'))
		and (schemaname, viewname) not in (('core', 'person_identity'), ('core', 'v_user_identity'), ('analytics', 'v_user_identity'));
	if offenders is not null then
		raise exception 'views citam as colunas antigas do lote 6: %', offenders;
	end if;

	select string_agg(schemaname || '.' || tablename || '.' || policyname, ', ') into offenders
	from pg_policies
	where coalesce(qual, '') || ' ' || coalesce(with_check, '') ~* '\mnr_ordem\M|"nrOrdem"';
	if offenders is not null then
		raise exception 'policies citam as colunas antigas do lote 6: %', offenders;
	end if;

	select string_agg(pubname, ', ') into offenders
	from pg_publication_tables
	where schemaname = 'core' and tablename in ('person', 'user_data');
	if offenders is not null then
		raise exception 'publicações incluem tabelas do lote 6: %', offenders;
	end if;

	if to_regclass('cron.job') is not null then
		execute 'select string_agg(jobname, '', '') from cron.job where command ~* ''\mnr_ordem\M|"nrOrdem"''' into offenders;
		if offenders is not null then
			raise exception 'jobs do pg_cron citam as colunas antigas do lote 6: %', offenders;
		end if;
	end if;
end;
$$;

-- ─── 1. core.person.saram ────────────────────────────────────────────────────────

alter table core.person add column saram text;
update core.person set saram = nr_ordem where nr_ordem is not null;
alter table core.person add constraint person_saram_key unique (saram);

-- INSERT: aceita qualquer uma das duas e recusa as duas divergentes. UPDATE: vale a que mudou; as
-- duas mudadas para valores diferentes são recusadas. No fim a antiga sempre copia a nova. Limpar
-- (NULL) é um valor como outro: limpar uma limpa a outra.
create function core.mirror_person_saram()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if tg_op = 'INSERT' then
		if new.saram is not null and new.nr_ordem is not null and new.saram <> new.nr_ordem then
			raise exception using
				errcode = '23514',
				message = format('core.person: nr_ordem e saram divergem (%s ≠ %s)', new.nr_ordem, new.saram);
		end if;
		new.saram := coalesce(new.saram, new.nr_ordem);
	elsif new.saram is distinct from old.saram then
		if new.nr_ordem is distinct from old.nr_ordem and new.nr_ordem is distinct from new.saram then
			raise exception using
				errcode = '23514',
				message = format('core.person: nr_ordem e saram divergem (%s ≠ %s)', new.nr_ordem, new.saram);
		end if;
	elsif new.nr_ordem is distinct from old.nr_ordem then
		new.saram := new.nr_ordem;
	end if;
	new.nr_ordem := new.saram;
	return new;
end;
$$;

create trigger person_mirror_saram
before insert or update of nr_ordem, saram on core.person
for each row execute function core.mirror_person_saram();

comment on function core.mirror_person_saram() is
	'Expand de 20260927180000: mantém a coluna antiga igual a saram enquanto o código antigo a escreve. Removida em 20260927190000.';

-- ─── 2. core.user_data.saram ─────────────────────────────────────────────────────

alter table core.user_data add column saram text;
update core.user_data set saram = "nrOrdem" where "nrOrdem" is not null;
create index user_data_saram_idx on core.user_data using btree (saram);

-- O SARAM exclusivo por conta (20260921160410) é um índice único CONDICIONAL: a migration só o cria
-- onde não há SARAM repetido entre contas. No banco compartilhado ele não existe (3 repetidos em
-- 2026-09-27); onde existe (banco recriado do zero), a coluna nova ganha o equivalente, senão o
-- contract o derrubaria com a antiga e a corrida que ele fecha voltaria.
do $$
begin
	if to_regclass('core.user_data_nr_ordem_uniq') is not null then
		create unique index user_data_saram_uniq on core.user_data (btrim(saram))
			where saram is not null and btrim(saram) <> '';
	end if;
end;
$$;

create function core.mirror_user_data_saram()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if tg_op = 'INSERT' then
		if new.saram is not null and new."nrOrdem" is not null and new.saram <> new."nrOrdem" then
			raise exception using
				errcode = '23514',
				message = format('core.user_data: "nrOrdem" e saram divergem (%s ≠ %s)', new."nrOrdem", new.saram);
		end if;
		new.saram := coalesce(new.saram, new."nrOrdem");
	elsif new.saram is distinct from old.saram then
		if new."nrOrdem" is distinct from old."nrOrdem" and new."nrOrdem" is distinct from new.saram then
			raise exception using
				errcode = '23514',
				message = format('core.user_data: "nrOrdem" e saram divergem (%s ≠ %s)', new."nrOrdem", new.saram);
		end if;
	elsif new."nrOrdem" is distinct from old."nrOrdem" then
		new.saram := new."nrOrdem";
	end if;
	new."nrOrdem" := new.saram;
	return new;
end;
$$;

-- `update of` as duas: o upsert do sync de e-mail (`on conflict (id) do update set email = …`) não
-- cita nenhuma delas e não tem o que espelhar.
create trigger user_data_mirror_saram
before insert or update of "nrOrdem", saram on core.user_data
for each row execute function core.mirror_user_data_saram();

comment on function core.mirror_user_data_saram() is
	'Expand de 20260927180000: mantém a coluna antiga igual a saram enquanto o código antigo a escreve. Removida em 20260927190000.';

-- ─── 3. Views ────────────────────────────────────────────────────────────────────

-- `saram` no fim (`create or replace` não reordena nem renomeia). A junção passa à coluna nova.
create or replace view core.person_identity
with (security_invoker = true) as
select
	p.id,
	p.display_name,
	p.nr_ordem,
	p.user_id,
	p.active,
	ud.email,
	mi.posto,
	mi.nome_guerra,
	coalesce(nullif(btrim(coalesce(mi.posto, '') || ' ' || coalesce(mi.nome_guerra, '')), ''), ud.email, p.display_name) as label,
	p.saram
from core.person p
left join core.user_data ud on ud.id = p.user_id
left join core.military_identity mi on mi.saram = p.saram;

create or replace view core.v_user_identity
with (security_invoker = true) as
select
	ud.id,
	case
		when nullif(btrim(coalesce(mi.posto, '') || ' ' || coalesce(mi.nome_guerra, '')), '') is not null
			then btrim(coalesce(mi.posto, '') || ' ' || initcap(coalesce(mi.nome_guerra, '')))
		else ud.email
	end as display_name
from core.user_data ud
left join core.military_identity mi on mi.saram = ud.saram;

-- Sobre a tabela do espelho, sem `security_invoker`, como era (ver o cabeçalho).
create or replace view analytics.v_user_identity as
select
	ud.id,
	case
		when nullif(btrim(coalesce(umd."sgPosto", '') || ' ' || coalesce(umd."nmGuerra", '')), '') is not null
			then btrim(coalesce(umd."sgPosto", '') || ' ' || initcap(coalesce(umd."nmGuerra", '')))
		else ud.email
	end as display_name
from core.user_data ud
left join core.user_military_data umd on umd."nrOrdem" = ud.saram;

-- ─── 4. Comentários ──────────────────────────────────────────────────────────────

comment on table core.person is
	'Pessoa que o ERP precisa nomear, com ou sem conta. `saram` liga ao efetivo (core.military_identity) e `user_id` à conta (auth.users); os dois são opcionais. E-mail, posto e nome de guerra NÃO moram aqui — têm dono e mudam lá.';
comment on column core.person.saram is
	'SARAM do militar (UNIQUE). Sem FK para o espelho do cadastro de pessoal: quem chegou depois da última carga continua cadastrável (20260910225309).';
comment on column core.person.nr_ordem is 'Obsoleta: espelho de saram até o contract 20260927190000.';
comment on column core.user_data.saram is
	'SARAM da conta, gravado pelo próprio usuário (write-once quando já localiza cadastro) ou pelo administrador. Sem FK para o espelho: SARAM ausente da carga continua gravável.';
comment on column core.user_data."nrOrdem" is 'Obsoleta: espelho de saram até o contract 20260927190000.';

-- ─── 5. Conferência do que este expand criou ──────────────────────────────────────

do $$
declare
	offenders text;
begin
	select string_agg(p.oid::regprocedure::text, ', ') into offenders
	from pg_proc p
	where p.oid in ('core.mirror_person_saram()'::regprocedure, 'core.mirror_user_data_saram()'::regprocedure)
		and not coalesce(p.proconfig, '{}') @> array['search_path=""'];
	if offenders is not null then
		raise exception 'funções do lote 6 sem search_path vazio: %', offenders;
	end if;

	-- O backfill cobriu todas as linhas e os espelhos começam sem divergência.
	if exists (select 1 from core.person where saram is distinct from nr_ordem) then
		raise exception 'core.person: nr_ordem e saram divergem depois do backfill';
	end if;
	if exists (select 1 from core.user_data where saram is distinct from "nrOrdem") then
		raise exception 'core.user_data: "nrOrdem" e saram divergem depois do backfill';
	end if;

	if to_regclass('core.user_data_nr_ordem_uniq') is not null and to_regclass('core.user_data_saram_uniq') is null then
		raise exception 'core.user_data: o SARAM exclusivo por conta (user_data_nr_ordem_uniq) não passou para a coluna nova';
	end if;

	-- As views do servidor já juntam pela coluna nova (o contract derruba a antiga sem cascade).
	select string_agg(schemaname || '.' || viewname, ', ') into offenders
	from pg_views
	where (schemaname, viewname) in (('core', 'v_user_identity'), ('analytics', 'v_user_identity'))
		and definition ~ 'ud\."nrOrdem"';
	if offenders is not null then
		raise exception 'views ainda juntam pela coluna antiga: %', offenders;
	end if;
end;
$$;
