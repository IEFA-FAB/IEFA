-- Espelho do cadastro de pessoal: o CPF deixa de ser a chave, e os apps leem a identificação
-- militar por uma view sem CPF nem nome completo.
--
-- Change `openspec/changes/lgpd-military-roster-key` (tarefas 2.1 e 2.2). LGPD, art. 6º, I e III
-- (finalidade e necessidade): os apps usam o espelho para achar pelo SARAM quem tem conta e mostrar
-- posto e nome de guerra; o CPF não serve a nenhum uso deles, e o nome completo só à rota restrita
-- da API (`/api/user-military-data`).
--
-- ## A carga (tarefa 1.1, resposta do mantenedor em 2026-09-27)
--
-- `core.user_military_data` é carregada de tempos em tempos a partir de dados de outro sistema: o
-- mantenedor sobe um patch da tabela, manualmente. O patch NÃO muda de formato com esta migration:
--
--   * as sete colunas que ele traz ficam com os mesmos nomes e tipos, na mesma ordem
--     (`"nrOrdem"`, `"nrCpf"`, `"nmGuerra"`, `"nmPessoa"`, `"sgPosto"`, `"sgOrg"`,
--     `"dataAtualizacao"`), inclusive `"nrOrdem"`, que o glossário chama de SARAM só nos objetos
--     nossos (`sisub-ubiquitous-language`, D2 e D3: o espelho guarda o nome do sistema de origem);
--   * a coluna nova, `id`, é a ÚLTIMA e tem default (identity): INSERT com a lista das sete
--     colunas, INSERT posicional com sete valores e `COPY … ("nrOrdem", …) from …` com a lista das
--     sete continuam valendo sem citá-la. `COPY` SEM lista de colunas passa a exigir o `id` (a
--     identity entra na lista padrão do COPY): o patch cita as sete colunas, como já cita no
--     upsert;
--   * a unicidade do CPF é a mesma que a PK impunha, agora por `UNIQUE`: o upsert do patch
--     (`on conflict ("nrCpf") do update …` ou `do nothing`) tem o mesmo árbitro.
--
-- ## O que muda
--
--   * PK física `id` (identity) no lugar do CPF; `"nrCpf"` fica `NOT NULL` + `UNIQUE`. O
--     `"nrOrdem"` mantém o índice que tem e não ganha `UNIQUE`: a carga é de outro sistema, e
--     recusar um patch por SARAM repetido trocaria atraso de carga por carga abortada. Nenhuma FK
--     aponta para o espelho, e continua assim (decisão de `20260910225309_core_person_registry.sql`).
--   * `core.military_identity`: `saram`, `posto`, `nome_guerra`, `sg_org`, `data_atualizacao`, sem
--     CPF e sem nome completo; `security_invoker`, só o servidor (`service_role`) lê.
--   * `core.person_identity` e `core.v_user_identity` passam a ler `core.military_identity`, com as
--     mesmas colunas de saída. `analytics.v_user_identity` continua sobre a tabela, de propósito: ela
--     não é `security_invoker` (o `analytics_reader` a lê sem grant em `core`), e uma view invoker
--     aninhada checa o privilégio de QUEM CONSULTA mesmo dentro da view do dono (aviso de
--     20260921160000). Ela lê só `"nrOrdem"`, `"sgPosto"` e `"nmGuerra"` e publica `id` +
--     `display_name`.
--   * `core.military_masked_cpf(p_saram)`: o CPF do cadastro mais recente do SARAM, mascarado no
--     padrão gov.br (`***.456.789-**`), para o perfil do próprio titular. O documento inteiro não
--     sai do banco; executável só pelo `service_role` (default das funções novas, 20260920210000).
--
-- Todos os apps leem o banco como `service_role`, então grant não separa app de carga: a garantia
-- de que nenhum app lê `"nrCpf"`/`"nmPessoa"` é a regra `military-roster-personal-data` do opengrep
-- (`.opengrep/rules/military-roster.yaml`), com a allowlist e o motivo de cada entrada.

-- ─── 0. Conferência: só as três views conhecidas leem o espelho ─────────────────────

do $$
declare
	offenders text;
begin
	select string_agg(p.oid::regprocedure::text, ', ') into offenders
	from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname not in ('pg_catalog', 'information_schema')
		and (
			coalesce(p.prosrc, '') ~* '\muser_military_data\M'
			or coalesce(pg_get_function_sqlbody(p.oid), '') ~* '\muser_military_data\M'
		);
	if offenders is not null then
		raise exception 'funções leem core.user_military_data e precisam passar para core.military_identity: %', offenders;
	end if;

	select string_agg(schemaname || '.' || viewname, ', ') into offenders
	from (
		select schemaname, viewname, definition from pg_views
		union all
		select schemaname, matviewname, definition from pg_matviews
	) v
	where definition ~* '\muser_military_data\M'
		and (schemaname, viewname) not in (('core', 'person_identity'), ('core', 'v_user_identity'), ('analytics', 'v_user_identity'));
	if offenders is not null then
		raise exception 'views leem core.user_military_data fora das três conhecidas: %', offenders;
	end if;

	select string_agg(conrelid::regclass::text || '.' || conname, ', ') into offenders
	from pg_constraint
	where confrelid = 'core.user_military_data'::regclass;
	if offenders is not null then
		raise exception 'FK aponta para o espelho (a proposta mantém o espelho sem FK): %', offenders;
	end if;

	select string_agg(schemaname || '.' || tablename || '.' || policyname, ', ') into offenders
	from pg_policies
	where coalesce(qual, '') || ' ' || coalesce(with_check, '') ~* '\muser_military_data\M';
	if offenders is not null then
		raise exception 'policies leem core.user_military_data: %', offenders;
	end if;

	if to_regclass('cron.job') is not null then
		execute 'select string_agg(jobname, '', '') from cron.job where command ~* ''\muser_military_data\M''' into offenders;
		if offenders is not null then
			raise exception 'jobs do pg_cron leem core.user_military_data: %', offenders;
		end if;
	end if;
end;
$$;

-- ─── 1. Chave física; o CPF vira coluna comum com UNIQUE ─────────────────────────

-- A coluna nova entra no FIM: o INSERT posicional do patch (sete valores, sem lista de colunas)
-- continua casando coluna a coluna, e a identity preenche o resto.
alter table core.user_military_data add column id bigint generated by default as identity;

alter table core.user_military_data drop constraint user_military_data_pkey;
alter table core.user_military_data add constraint user_military_data_pkey primary key (id);
-- A PK impunha NOT NULL e unicidade ao CPF; as duas continuam, agora explícitas.
alter table core.user_military_data alter column "nrCpf" set not null;
alter table core.user_military_data add constraint "user_military_data_nrCpf_key" unique ("nrCpf");

comment on table core.user_military_data is
	'Espelho do cadastro de pessoal da FAB, carregado de tempos em tempos por um patch manual do mantenedor a partir de outro sistema (formato e upsert em LGPD.md). Colunas com os nomes do sistema de origem; "nrOrdem" é o SARAM. Os apps não leem esta tabela: leem core.military_identity (sem CPF e sem nome completo); a regra military-roster-personal-data do opengrep guarda isso no código.';
comment on column core.user_military_data.id is
	'Chave física (identity), gerada no INSERT: o patch não a informa. Não é referência estável (a carga pode apagar e reinserir a linha); nada aponta para ela.';
comment on column core.user_military_data."nrCpf" is
	'CPF, só para a carga: UNIQUE é o árbitro do upsert do patch. Nenhum app lê; o perfil do titular recebe só a máscara (core.military_masked_cpf).';
comment on column core.user_military_data."nrOrdem" is
	'SARAM, com o nome do sistema de origem. Sem UNIQUE e sem FK de fora: atraso de carga não pode virar erro de escrita (20260910225309).';

-- ─── 2. A view dos apps ───────────────────────────────────────────────────────────

create view core.military_identity
with (security_invoker = true) as
select
	m."nrOrdem" as saram,
	m."sgPosto" as posto,
	m."nmGuerra" as nome_guerra,
	m."sgOrg" as sg_org,
	m."dataAtualizacao" as data_atualizacao
from core.user_military_data m;

-- Só o servidor, e só leitura. `security_invoker`: quem lê precisa do SELECT na tabela, que só o
-- `service_role` (e o dono) têm. O default privilege de `core` dá ALL ao `service_role` em relação
-- nova, e a view é auto-updatable (uma tabela só): sem revogar, UPDATE e DELETE por ela chegariam
-- ao espelho, que é da carga.
revoke all on core.military_identity from public, anon, authenticated, service_role;
grant select on core.military_identity to service_role;

comment on view core.military_identity is
	'Identificação militar pelo SARAM, com o mínimo que os apps usam: posto, nome de guerra, OM e data da carga. Sem CPF e sem nome completo (LGPD, art. 6º, III). Um SARAM ainda ausente do espelho continua gravável na conta; ele aparece aqui na próxima carga.';
comment on column core.military_identity.saram is 'SARAM ("nrOrdem" do espelho).';

-- ─── 3. As views do servidor passam a ler core.military_identity ───────────────────
--
-- Mesmas colunas de saída, na mesma ordem (`create or replace` preserva os grants e as opções).
-- `analytics.v_user_identity` fica como está (ver o cabeçalho).

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
	coalesce(nullif(btrim(coalesce(mi.posto, '') || ' ' || coalesce(mi.nome_guerra, '')), ''), ud.email, p.display_name) as label
from core.person p
left join core.user_data ud on ud.id = p.user_id
left join core.military_identity mi on mi.saram = p.nr_ordem;

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
left join core.military_identity mi on mi.saram = ud."nrOrdem";

-- ─── 4. CPF mascarado para o perfil do titular ───────────────────────────────────

-- Máscara do gov.br: os seis dígitos do meio bastam para a pessoa reconhecer o próprio documento
-- e não bastam para identificar ninguém. CPF que não tem 11 dígitos devolve NULL (a tela mostra
-- "—"). O cadastro mais recente vence, como na leitura do perfil.
create function core.military_masked_cpf(p_saram text)
returns text
language sql
stable
set search_path = ''
as $$
	select case
		when length(d.digits) = 11 then '***.' || substr(d.digits, 4, 3) || '.' || substr(d.digits, 7, 3) || '-**'
	end
	from (
		select regexp_replace(m."nrCpf", '\D', '', 'g') as digits
		from core.user_military_data m
		where m."nrOrdem" = p_saram
		order by m."dataAtualizacao" desc nulls last, m.id desc
		limit 1
	) d;
$$;

comment on function core.military_masked_cpf(text) is
	'CPF do SARAM mascarado (***.456.789-**) para o perfil do próprio titular; o documento inteiro não sai do banco. Só service_role executa; o servidor passa o SARAM da sessão, nunca o do payload.';

-- ─── 5. Conferência do que esta migration criou ───────────────────────────────────

do $$
declare
	offenders text;
begin
	if (select pg_get_constraintdef(oid) from pg_constraint where conname = 'user_military_data_pkey' and conrelid = 'core.user_military_data'::regclass)
		is distinct from 'PRIMARY KEY (id)' then
		raise exception 'core.user_military_data: a PK não ficou em id';
	end if;

	if not exists (
		select 1 from pg_constraint
		where conrelid = 'core.user_military_data'::regclass and contype = 'u' and pg_get_constraintdef(oid) = 'UNIQUE ("nrCpf")'
	) then
		raise exception 'core.user_military_data: o CPF ficou sem UNIQUE (o upsert do patch perderia o árbitro)';
	end if;

	-- A ordem das colunas que o patch traz não mudou, e a nova é a última.
	select string_agg(attname, ',' order by attnum) into offenders
	from pg_attribute
	where attrelid = 'core.user_military_data'::regclass and attnum > 0 and not attisdropped;
	if offenders is distinct from 'nrOrdem,nrCpf,nmGuerra,nmPessoa,sgPosto,sgOrg,dataAtualizacao,id' then
		raise exception 'core.user_military_data: colunas fora do formato do patch: %', offenders;
	end if;

	select string_agg(schemaname || '.' || viewname, ', ') into offenders
	from pg_views
	where definition ~* '\muser_military_data\M'
		and (schemaname, viewname) not in (('core', 'military_identity'), ('analytics', 'v_user_identity'));
	if offenders is not null then
		raise exception 'views do servidor ainda leem core.user_military_data direto: %', offenders;
	end if;

	-- A view do analytics lê a tabela, e não a view invoker: por esta, o `analytics_reader` levaria
	-- permission denied.
	if (select pg_get_viewdef('analytics.v_user_identity'::regclass)) ~* '\mmilitary_identity\M' then
		raise exception 'analytics.v_user_identity não pode ler core.military_identity (security_invoker aninhada)';
	end if;

	if has_table_privilege('anon', 'core.military_identity', 'select')
		or has_table_privilege('authenticated', 'core.military_identity', 'select') then
		raise exception 'core.military_identity ficou legível por anon/authenticated';
	end if;
	if not has_table_privilege('service_role', 'core.military_identity', 'select')
		or has_table_privilege('service_role', 'core.military_identity', 'insert')
		or has_table_privilege('service_role', 'core.military_identity', 'update')
		or has_table_privilege('service_role', 'core.military_identity', 'delete') then
		raise exception 'core.military_identity tem de ser só SELECT para o service_role';
	end if;

	if not coalesce((select proconfig from pg_proc where oid = 'core.military_masked_cpf(text)'::regprocedure), '{}') @> array['search_path=""'] then
		raise exception 'core.military_masked_cpf sem search_path vazio';
	end if;
	if has_function_privilege('anon', 'core.military_masked_cpf(text)', 'execute')
		or has_function_privilege('authenticated', 'core.military_masked_cpf(text)', 'execute') then
		raise exception 'core.military_masked_cpf ficou executável por anon/authenticated';
	end if;
end;
$$;
