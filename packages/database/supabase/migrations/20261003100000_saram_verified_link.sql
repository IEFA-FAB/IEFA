-- saram_verified_link — o SARAM da conta só se vincula por verificação; conta pessoal ou institucional.
--
-- Change `openspec/changes/saram-verified-link` (FASE 1). Até aqui o vínculo era write-once e
-- exclusivo (`syncUserSaram` no sisub, `core.link_own_saram` no sucont), mas o número era
-- DIGITADO: quem pedia primeiro levava, e a conta passava a ver posto, nome de guerra, OM e CPF
-- mascarado de quem fosse o dono do número. O dono verdadeiro ficava trancado com SARAM_TAKEN.
--
-- ## Camadas (`core.user_data.saram_verified_by`)
--
--   * `email`  — a chave do e-mail institucional (nome de guerra + iniciais do nome completo, o
--                padrão do Zimbra) bate com o cadastro de pessoal. Homônimo desempata pelos 4
--                últimos dígitos do CPF;
--   * `cpf`    — SARAM + CPF completo conferidos aqui dentro, com tentativas limitadas e
--                persistidas (`core.saram_verification_attempt`);
--   * `admin`  — pedido de vínculo ou contestação decididos por `admin:2`, ou vínculo manual;
--   * `legacy` — vínculo anterior a esta migration que não bate com a chave. Continua valendo
--                (ninguém perde acesso no deploy) e vai para a fila do administrador.
--
-- ## Por que a regra mora aqui (design.md D1)
--
-- A chave usa o nome completo e a conferência usa o CPF: em SQL, nenhum dos dois sai do banco (a
-- regra `military-roster-personal-data` do opengrep segue sem exceção nova). O sisub chama pelo
-- Drizzle, o sucont e o rumaer por RPC — uma regra só, e uma chamada é uma transação (tentativa,
-- lock e gravação juntos).
--
-- ## Gravação fora das funções (D7)
--
-- O trigger `user_data_guard_saram_link` aceita SARAM gravado por fora (o sisub e o sucont em
-- produção até o deploy, as fixtures de teste), mas SEM verificação: não dá acesso a dado
-- militar. Verificação e tipo de conta só mudam com o contexto `iefa.saram_link` aberto por uma
-- função desta migration (`set_config(…, true)`, local à transação). Recusar a gravação em vez de
-- zerar a verificação quebraria a suíte da `main` e o app em produção entre o apply e o merge.
--
-- ## Conta institucional (D8)
--
-- `account_kind = 'institucional'` (conta de seção): sem SARAM (CHECK) e sem arranchamento nem
-- presença própria (triggers em `kitchen.arranchamento` e `kitchen.meal_presences`). Perfil,
-- senha, MFA e permissões não mudam.
--
-- ## Erros estáveis
--
--   22023 SARAM_INVALID / CPF_INVALID / CPF_SUFFIX_INVALID / JUSTIFICATION_INVALID /
--         ACCOUNT_KIND_INVALID / DECISION_INVALID / NOTE_REQUIRED
--   P0001 ACCOUNT_INSTITUTIONAL        conta institucional não tem SARAM
--   P0001 SARAM_ALREADY_LINKED         a conta já tem vínculo (verificado, ou legacy de outro número)
--   P0001 SARAM_LOCKED                 formulário antigo pedindo outro número sobre vínculo existente
--   P0001 REQUEST_PENDING              há pedido pendente: desista dele antes
--   P0001 REQUEST_LIMIT                5 pedidos em 24 h
--   P0001 EMAIL_NOT_ELIGIBLE           e-mail fora de @fab.mil.br, não confirmado ou sem chave
--   P0001 SARAM_TAKEN                  SARAM verificado em outra conta (admin)
--   P0001 SARAM_LINK_CHANGED           o vínculo mudou desde que a tela leu (admin)
--   P0001 ACCOUNT_KIND_CHANGED         o tipo de conta mudou desde que a tela leu (admin)
--   P0001 REQUEST_NOT_PENDING          pedido já decidido ou retirado
--   P0001 ACCOUNT_INSTITUTIONAL_NO_MEALS  arranchamento/presença de conta institucional (trigger)
--   P0002 CANDIDATE_NOT_FOUND / REQUEST_NOT_FOUND / USER_DATA_NOT_FOUND
--   42501 SARAM_LINK_OUTSIDE_FUNCTION  verificação ou tipo de conta mudados fora das funções
--
-- Falha de conferência (CPF ou sufixo) NÃO levanta exceção: a exceção desfaria o registro da
-- tentativa. As funções devolvem `outcome: 'mismatch' | 'locked'`.
--
-- Todas `security invoker`, `search_path = ''`, executáveis só pelo `service_role` (e pelo dono,
-- `postgres`, que é o role do Drizzle do sisub). O usuário, o e-mail e o ator vêm da SESSÃO, no
-- servidor; nunca do payload. Nenhuma tabela nova tem `kitchen_id`/`unit_id`/`mess_hall_id`
-- (o guard do treino não muda). DDL reaplicável.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Colunas de core.user_data
-- ═════════════════════════════════════════════════════════════════════════════

alter table core.user_data add column if not exists account_kind text not null default 'pessoal';
alter table core.user_data add column if not exists saram_verified_by text;
alter table core.user_data add column if not exists saram_verified_at timestamptz;

do $$
begin
	if not exists (select 1 from pg_constraint where conrelid = 'core.user_data'::regclass and conname = 'user_data_account_kind_check') then
		alter table core.user_data add constraint user_data_account_kind_check check (account_kind in ('pessoal', 'institucional'));
	end if;
	if not exists (select 1 from pg_constraint where conrelid = 'core.user_data'::regclass and conname = 'user_data_saram_verified_by_check') then
		alter table core.user_data add constraint user_data_saram_verified_by_check check (saram_verified_by in ('email', 'cpf', 'admin', 'legacy'));
	end if;
	if not exists (select 1 from pg_constraint where conrelid = 'core.user_data'::regclass and conname = 'user_data_saram_verification_needs_saram') then
		alter table core.user_data add constraint user_data_saram_verification_needs_saram check (saram_verified_by is null or saram is not null);
	end if;
	if not exists (select 1 from pg_constraint where conrelid = 'core.user_data'::regclass and conname = 'user_data_institutional_without_saram') then
		alter table core.user_data add constraint user_data_institutional_without_saram check (account_kind = 'pessoal' or saram is null);
	end if;
end;
$$;

comment on column core.user_data.account_kind is
	'pessoal (padrão) ou institucional (conta de seção): institucional não tem SARAM nem arranchamento/presença própria. Muda só por core.set_own_account_kind / core.admin_set_account_kind (20261003100000).';
comment on column core.user_data.saram_verified_by is
	'Como o SARAM foi verificado: email (chave do e-mail institucional), cpf (SARAM + CPF), admin (decisão do administrador), legacy (vínculo anterior a 20261003100000). NULL com SARAM = gravado fora das funções de vínculo, sem verificação: não dá acesso a dado militar.';
comment on column core.user_data.saram_verified_at is 'Quando o vínculo foi verificado (NULL para legacy e sem verificação).';

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Pedidos/contestações e tentativas
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists core.saram_link_request (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users(id) on delete cascade,
	kind text not null constraint saram_link_request_kind_check check (kind in ('link', 'dispute')),
	saram text not null constraint saram_link_request_saram_check check (saram ~ '^[0-9]{6,7}$'),
	justification text not null constraint saram_link_request_justification_check check (char_length(btrim(justification)) between 10 and 1000),
	-- Titular do SARAM quando o pedido abriu (contestação). Informativo: a decisão relê o titular.
	holder_user_id uuid references auth.users(id) on delete set null,
	-- Contestação aberta por quem VERIFICOU (e-mail ou CPF) contra titular verificado.
	claim_verified_by text constraint saram_link_request_claim_check check (claim_verified_by in ('email', 'cpf')),
	status text not null default 'pending' constraint saram_link_request_status_check check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
	decided_by uuid references auth.users(id) on delete set null,
	decided_at timestamptz,
	decision_note text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint saram_link_request_decided_check check ((status = 'pending') = (decided_at is null))
);

-- Um pedido pendente por conta. Índice PARCIAL: está na regra `postgrest-partial-index-upsert`.
create unique index if not exists saram_link_request_one_pending_uniq on core.saram_link_request (user_id) where status = 'pending';
create index if not exists saram_link_request_saram_idx on core.saram_link_request (saram);
create index if not exists saram_link_request_user_created_idx on core.saram_link_request (user_id, created_at desc);

drop trigger if exists set_updated_at on core.saram_link_request;
create trigger set_updated_at before update on core.saram_link_request for each row execute function sisub.set_updated_at();

alter table core.saram_link_request enable row level security;
revoke all on core.saram_link_request from public, anon, authenticated;

comment on table core.saram_link_request is
	'Pedido de vínculo de SARAM (kind link) ou contestação de SARAM vinculado a outra conta (kind dispute), decidido por admin:2 (core.decide_saram_request, auditada). Escrita só pelas funções de 20261003100000.';

create table if not exists core.saram_verification_attempt (
	id bigint generated always as identity primary key,
	user_id uuid not null references auth.users(id) on delete cascade,
	-- O SARAM tentado; nunca o CPF digitado.
	saram text not null,
	method text not null constraint saram_verification_attempt_method_check check (method in ('cpf', 'cpf_suffix')),
	succeeded boolean not null,
	created_at timestamptz not null default now()
);

create index if not exists saram_verification_attempt_user_idx on core.saram_verification_attempt (user_id, created_at desc);
create index if not exists saram_verification_attempt_saram_idx on core.saram_verification_attempt (saram, created_at desc);

alter table core.saram_verification_attempt enable row level security;
revoke all on core.saram_verification_attempt from public, anon, authenticated;

comment on table core.saram_verification_attempt is
	'Tentativas de conferência de SARAM por CPF (ou pelos 4 últimos dígitos, no desempate de homônimos). 5 falhas na última hora por conta, ou 20 de outras contas no mesmo SARAM, bloqueiam a verificação até a falha que completou o teto sair da janela. Registro de segurança; o CPF digitado não é guardado.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. A chave
-- ═════════════════════════════════════════════════════════════════════════════

-- Nome de guerra (só letras) + iniciais das palavras do nome completo, sem acento, minúsculas,
-- sem as preposições de/da/do/das/dos/e. Acento sai por `translate`, não por `unaccent`: o
-- `unaccent` é `stable` (lê o dicionário) e mora em `public` aqui mas em `extensions` num banco
-- recriado das migrations (20260414120000); `translate` é imutável e não depende de extensão, o
-- que permite o índice de expressão (mesmo motivo de `core.person`, 20260910225309). Conferido no
-- espelho em 2026-10-03: as 68.317 chaves saem iguais às do `unaccent` (o mapa cobre todo acento
-- que o cadastro tem, maiúsculo e minúsculo: o `lower` de letra acentuada depende do locale).
create or replace function core.military_name_key(p_nome_guerra text, p_nome text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
	select nullif(
		regexp_replace(lower(translate(coalesce(p_nome_guerra, ''), 'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ', 'aaaaaaaaaaaaeeeeeeeeiiiiiiiioooooooooouuuuuuuuccnnyyy')), '[^a-z]', '', 'g')
		|| coalesce((
			select string_agg(left(w.word, 1), '' order by w.ord)
			from unnest(regexp_split_to_array(
				regexp_replace(lower(translate(coalesce(p_nome, ''), 'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ', 'aaaaaaaaaaaaeeeeeeeeiiiiiiiioooooooooouuuuuuuuccnnyyy')), '[^a-z ]', '', 'g'),
				'\s+'
			)) with ordinality as w(word, ord)
			where w.word <> '' and w.word not in ('de', 'da', 'do', 'das', 'dos', 'e')
		), ''),
		''
	);
$$;

comment on function core.military_name_key(text, text) is
	'Chave do militar no padrão do e-mail Zimbra: nome de guerra (só letras) + iniciais do nome completo sem de/da/do/das/dos/e, sem acento. Indexada no espelho. Ver 20261003100000.';

-- Parte local do e-mail @fab.mil.br (domínio exato), minúscula, sem o prefixo `tp.` e sem os
-- dígitos finais (o Zimbra numera homônimos). Só letras; senão, sem chave.
create or replace function core.email_name_key(p_email text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
	select case when l.local ~ '^[a-z]+$' then l.local end
	from (
		select regexp_replace(regexp_replace(split_part(e.email, '@', 1), '^tp\.', ''), '[0-9]+$', '') as local
		from (select lower(btrim(coalesce(p_email, ''))) as email) e
		where e.email ~ '^[^@[:space:]]+@fab\.mil\.br$'
	) l;
$$;

comment on function core.email_name_key(text) is
	'Chave do e-mail institucional: só @fab.mil.br exato, sem o prefixo tp. e sem os dígitos finais de homônimo. Ver 20261003100000.';

-- O e-mail tem o dígito final de homônimo do Zimbra?
create or replace function core.email_has_homonym_suffix(p_email text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
	select split_part(lower(btrim(coalesce(p_email, ''))), '@', 1) ~ '[0-9]$';
$$;

-- Índice de expressão no espelho: a busca de candidatos é por igualdade de chave. Índice não muda
-- as colunas que o patch de carga traz (formato de 20260927170000).
create index if not exists user_military_data_name_key_idx on core.user_military_data (core.military_name_key("nmGuerra", "nmPessoa"));

-- Candidatos da chave do e-mail: um por SARAM, a carga mais recente. Uso interno (o SARAM do
-- candidato nunca sai para a tela: `core.saram_link_status` publica só a referência opaca `id`).
create or replace function core.saram_email_candidates(p_email text)
returns table (roster_id bigint, saram text, posto text, nome_guerra text, sg_org text)
language sql
stable
set search_path = ''
as $$
	select distinct on (m."nrOrdem") m.id, m."nrOrdem", m."sgPosto", m."nmGuerra", m."sgOrg"
	from core.user_military_data m
	where core.email_name_key(p_email) is not null
		and core.military_name_key(m."nmGuerra", m."nmPessoa") = core.email_name_key(p_email)
		and nullif(btrim(coalesce(m."nrOrdem", '')), '') is not null
	order by m."nrOrdem", m."dataAtualizacao" desc nulls last, m.id desc;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Tentativas
-- ═════════════════════════════════════════════════════════════════════════════

-- Até quando a verificação está bloqueada. Por conta: 5 falhas na última hora (libera quando a 5ª
-- falha mais recente sai da janela). Por SARAM: 20 falhas na última hora vindas de OUTRAS contas —
-- teto alto de propósito: ele só existe contra força bruta distribuída, e um teto baixo deixaria
-- qualquer um trancar a verificação do dono verdadeiro (a sugestão por e-mail sem homônimo não
-- passa por aqui). NULL = livre.
create or replace function core.saram_attempt_locked_until(p_user uuid, p_saram text)
returns timestamptz
language sql
stable
set search_path = ''
as $$
	select max(x.until) from (
		(select a.created_at + interval '1 hour' as until
			from core.saram_verification_attempt a
			where a.user_id = p_user and not a.succeeded and a.created_at > now() - interval '1 hour'
			order by a.created_at desc offset 4 limit 1)
		union all
		(select a.created_at + interval '1 hour'
			from core.saram_verification_attempt a
			where p_saram is not null and a.saram = p_saram and a.user_id <> p_user and not a.succeeded and a.created_at > now() - interval '1 hour'
			order by a.created_at desc offset 19 limit 1)
	) x;
$$;

create or replace function core.saram_attempts_left(p_user uuid)
returns integer
language sql
stable
set search_path = ''
as $$
	select greatest(0, 5 - count(*))::integer
	from core.saram_verification_attempt a
	where a.user_id = p_user and not a.succeeded and a.created_at > now() - interval '1 hour';
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. Guarda de core.user_data
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function core.guard_user_data_saram_link()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
	v_inside boolean := coalesce(current_setting('iefa.saram_link', true), '') <> '';
	v_saram_changed boolean;
begin
	if v_inside then
		return new;
	end if;

	v_saram_changed := case when tg_op = 'INSERT' then new.saram is not null else new.saram is distinct from old.saram end;

	-- Tipo de conta só pelas funções.
	if (tg_op = 'INSERT' and new.account_kind is distinct from 'pessoal')
		or (tg_op = 'UPDATE' and new.account_kind is distinct from old.account_kind) then
		raise exception 'SARAM_LINK_OUTSIDE_FUNCTION' using errcode = '42501', detail = 'account_kind só muda por core.set_own_account_kind / core.admin_set_account_kind';
	end if;

	if v_saram_changed then
		-- SARAM gravado por fora: aceito, mas sem verificação (D7).
		new.saram_verified_by := null;
		new.saram_verified_at := null;
		return new;
	end if;

	if (tg_op = 'INSERT' and (new.saram_verified_by is not null or new.saram_verified_at is not null))
		or (tg_op = 'UPDATE' and (new.saram_verified_by is distinct from old.saram_verified_by or new.saram_verified_at is distinct from old.saram_verified_at)) then
		raise exception 'SARAM_LINK_OUTSIDE_FUNCTION' using errcode = '42501', detail = 'a verificação do SARAM só muda pelas funções de vínculo';
	end if;

	return new;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Backfill (antes do trigger e do índice único)
-- ═════════════════════════════════════════════════════════════════════════════

select set_config('iefa.saram_link', 'backfill', true);

-- Branco não é vínculo.
update core.user_data set saram = null where saram is not null and btrim(saram) = '';

-- Bate com a chave (com ou sem dígito de homônimo) → email; o resto → legacy. Num SARAM repetido
-- em contas diferentes, só a primeira conta que bate vira email (o índice único abaixo exige).
with keyed as (
	select
		ud.id,
		ud.saram,
		ud.created_at,
		exists (
			select 1 from core.user_military_data m
			where m."nrOrdem" = ud.saram
				and core.military_name_key(m."nmGuerra", m."nmPessoa") = core.email_name_key(ud.email)
		) as matches
	from core.user_data ud
	where ud.saram is not null and ud.saram_verified_by is null
),
ranked as (
	select k.id, k.matches, row_number() over (partition by k.saram, k.matches order by k.created_at, k.id) as rn
	from keyed k
)
update core.user_data ud
set
	saram_verified_by = case when r.matches and r.rn = 1 then 'email' else 'legacy' end,
	saram_verified_at = case when r.matches and r.rn = 1 then now() end
from ranked r
where r.id = ud.id;

select set_config('iefa.saram_link', '', true);

drop trigger if exists user_data_guard_saram_link on core.user_data;
create trigger user_data_guard_saram_link
	before insert or update on core.user_data
	for each row execute function core.guard_user_data_saram_link();

-- Um SARAM verificado pertence a uma conta só. Índice PARCIAL: está na regra
-- `postgrest-partial-index-upsert`.
create unique index if not exists user_data_saram_verified_uniq on core.user_data (saram)
	where saram_verified_by in ('email', 'cpf', 'admin');

-- ── 6b. Nome de exibição só pelo SARAM que vale ──────────────────────────────
--
-- `core.v_user_identity` (contrate, sucont, sisub) e `analytics.v_user_identity` (assistente de
-- análises) montam "posto + nome de guerra" de TODA conta. Pela coluna crua, a conta que gravou o
-- SARAM de outra pessoa (legacy repetido de um verificado, ou SARAM gravado fora das funções) seria
-- exibida aos outros com o posto e o nome do dono real. A condição é a de `core.visible_saram`,
-- escrita por extenso: `analytics.v_user_identity` não é `security_invoker` (o `analytics_reader`
-- a lê sem grant em `core`), e chamar uma função ali checaria o EXECUTE de quem consulta. Mesmas
-- colunas de saída; `create or replace` preserva dono, grants e opções.

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
left join core.military_identity mi on mi.saram = ud.saram
	and ud.account_kind = 'pessoal'
	and (
		ud.saram_verified_by in ('email', 'cpf', 'admin')
		or (ud.saram_verified_by = 'legacy' and not exists (
			select 1 from core.user_data o
			where o.saram = ud.saram and o.id <> ud.id and o.saram_verified_by in ('email', 'cpf', 'admin')
		))
	);

create or replace view analytics.v_user_identity as
select
	ud.id,
	case
		when nullif(btrim(coalesce(umd."sgPosto", '') || ' ' || coalesce(umd."nmGuerra", '')), '') is not null
			then btrim(coalesce(umd."sgPosto", '') || ' ' || initcap(coalesce(umd."nmGuerra", '')))
		else 'Usuário ' || left(ud.id::text, 8)
	end as display_name
from core.user_data ud
left join core.user_military_data umd on umd."nrOrdem" = ud.saram
	and ud.account_kind = 'pessoal'
	and (
		ud.saram_verified_by in ('email', 'cpf', 'admin')
		or (ud.saram_verified_by = 'legacy' and not exists (
			select 1 from core.user_data o
			where o.saram = ud.saram and o.id <> ud.id and o.saram_verified_by in ('email', 'cpf', 'admin')
		))
	);

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. Conta institucional não come (arranchamento e presença)
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function kitchen.refuse_institutional_account_meal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if tg_table_name = 'arranchamento' then
		-- Desmarcar (will_eat = false) e editar linha antiga continuam livres.
		if not new.will_eat then
			return new;
		end if;
		if tg_op = 'UPDATE' and old.will_eat and new.user_id = old.user_id then
			return new;
		end if;
	elsif tg_op = 'UPDATE' and new.user_id = old.user_id then
		return new;
	end if;

	if exists (select 1 from core.user_data ud where ud.id = new.user_id and ud.account_kind = 'institucional') then
		raise exception 'ACCOUNT_INSTITUTIONAL_NO_MEALS' using errcode = 'P0001', detail = 'conta institucional não tem arranchamento nem presença própria';
	end if;
	return new;
end;
$$;

drop trigger if exists refuse_institutional_account_meal on kitchen.arranchamento;
create trigger refuse_institutional_account_meal
	before insert or update on kitchen.arranchamento
	for each row execute function kitchen.refuse_institutional_account_meal();

drop trigger if exists refuse_institutional_account_meal on kitchen.meal_presences;
create trigger refuse_institutional_account_meal
	before insert or update on kitchen.meal_presences
	for each row execute function kitchen.refuse_institutional_account_meal();

-- ═════════════════════════════════════════════════════════════════════════════
-- 8. Peças internas do vínculo
-- ═════════════════════════════════════════════════════════════════════════════

-- Grava o SARAM na conta, tirando-o de quem mais o tiver. Exige o contexto aberto pelo chamador
-- com o MESMO `p_via` (as funções públicas abrem; chamada solta pelo servidor é recusada).
-- O chamador já tem o advisory lock do SARAM. Devolve o vínculo anterior e de quem saiu.
create or replace function core.assign_saram(p_user uuid, p_email text, p_saram text, p_via text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_previous_saram text;
	v_previous_by text;
	v_exists boolean := false;
	v_removed jsonb := '[]'::jsonb;
	v_holder record;
	v_email text := nullif(btrim(coalesce(p_email, '')), '');
begin
	if coalesce(current_setting('iefa.saram_link', true), '') is distinct from p_via or p_via not in ('email', 'cpf', 'admin') then
		raise exception 'SARAM_LINK_OUTSIDE_FUNCTION' using errcode = '42501', detail = 'core.assign_saram fora de função de vínculo';
	end if;

	for v_holder in
		select ud.id, ud.saram_verified_by from core.user_data ud
		where ud.saram = p_saram and ud.id <> p_user
		order by ud.id
		for update
	loop
		update core.user_data set saram = null, saram_verified_by = null, saram_verified_at = null where id = v_holder.id;
		v_removed := v_removed || jsonb_build_array(jsonb_build_object('user_id', v_holder.id, 'verified_by', v_holder.saram_verified_by));
	end loop;

	select true, ud.saram, ud.saram_verified_by into v_exists, v_previous_saram, v_previous_by
		from core.user_data ud where ud.id = p_user for update;

	if coalesce(v_exists, false) then
		update core.user_data set saram = p_saram, saram_verified_by = p_via, saram_verified_at = now() where id = p_user;
	else
		if v_email is null and has_table_privilege('auth.users', 'select') then
			-- Caminho do administrador (Drizzle como `postgres`): a conta existe no Auth e ainda não
			-- tem linha. O comensal sempre chega com o e-mail da sessão; o `service_role` (RPC do
			-- sucont) não lê auth.users e cai no USER_DATA_NOT_FOUND abaixo.
			select u.email into v_email from auth.users u where u.id = p_user;
		end if;
		if v_email is null then
			raise exception 'USER_DATA_NOT_FOUND' using errcode = 'P0002', detail = 'conta sem e-mail e sem cadastro';
		end if;
		insert into core.user_data (id, email, saram, saram_verified_by, saram_verified_at)
			values (p_user, v_email, p_saram, p_via, now());
	end if;

	return jsonb_build_object(
		'previous', jsonb_build_object('saram', v_previous_saram, 'verified_by', v_previous_by),
		'removed_from', v_removed
	);
end;
$$;

-- Vínculo por verificação do próprio usuário (e-mail ou CPF). Titular verificado → contestação
-- para o administrador; titular legacy ou sem verificação → transfere, com log (D5).
create or replace function core.apply_saram_link(p_user uuid, p_email text, p_saram text, p_via text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_verified_holder uuid;
	v_request uuid;
	v_assigned jsonb;
	v_log uuid;
begin
	if coalesce(current_setting('iefa.saram_link', true), '') is distinct from p_via or p_via not in ('email', 'cpf') then
		raise exception 'SARAM_LINK_OUTSIDE_FUNCTION' using errcode = '42501', detail = 'core.apply_saram_link fora de função de vínculo';
	end if;

	select ud.id into v_verified_holder
		from core.user_data ud
		where ud.saram = p_saram and ud.id <> p_user and ud.saram_verified_by in ('email', 'cpf', 'admin')
		limit 1;

	if v_verified_holder is not null then
		insert into core.saram_link_request (user_id, kind, saram, justification, holder_user_id, claim_verified_by)
			values (
				p_user, 'dispute', p_saram,
				'Verificado por ' || case p_via when 'email' then 'e-mail' else 'CPF' end || ', mas o SARAM está verificado em outra conta.',
				v_verified_holder, p_via
			)
			returning id into v_request;
		return jsonb_build_object('outcome', 'disputed', 'request_id', v_request);
	end if;

	v_assigned := core.assign_saram(p_user, p_email, p_saram, p_via);

	if jsonb_array_length(v_assigned -> 'removed_from') > 0 then
		perform access_control.audit_context('claimSaramFromUnverifiedHolder');
		v_log := access_control.record_access_change(
			p_user, 'claimSaramFromUnverifiedHolder', 'session',
			jsonb_build_object(
				'action', 'saram_transfer',
				'target_user_id', p_user,
				'saram', p_saram,
				'via', p_via,
				'previous', v_assigned -> 'previous',
				'removed_from', v_assigned -> 'removed_from'
			)
		);
	end if;

	return jsonb_build_object('outcome', 'linked', 'saram', p_saram, 'verified_by', p_via, 'log_id', v_log,
		'removed_from', v_assigned -> 'removed_from');
end;
$$;

-- Efeitos de virar institucional: sem SARAM, sem pedido pendente, sem arranchamento de hoje em
-- diante (data civil de Brasília). Exige o contexto aberto pelo chamador.
create or replace function core.apply_institutional_account(p_user uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_saram text;
	v_by text;
	v_requests integer;
	v_meals integer;
begin
	if coalesce(current_setting('iefa.saram_link', true), '') = '' then
		raise exception 'SARAM_LINK_OUTSIDE_FUNCTION' using errcode = '42501', detail = 'core.apply_institutional_account fora de função de vínculo';
	end if;

	select ud.saram, ud.saram_verified_by into v_saram, v_by from core.user_data ud where ud.id = p_user for update;
	update core.user_data set saram = null, saram_verified_by = null, saram_verified_at = null where id = p_user and saram is not null;

	update core.saram_link_request
		set status = 'withdrawn', decided_at = now(), decision_note = 'Conta marcada como institucional.'
		where user_id = p_user and status = 'pending';
	get diagnostics v_requests = row_count;

	update kitchen.arranchamento
		set will_eat = false
		where user_id = p_user and will_eat and date >= (now() at time zone 'America/Sao_Paulo')::date;
	get diagnostics v_meals = row_count;

	return jsonb_build_object(
		'previous', jsonb_build_object('saram', v_saram, 'verified_by', v_by),
		'withdrawn_requests', v_requests,
		'cancelled_arranchamentos', v_meals
	);
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 9. Leitura: estado e visibilidade
-- ═════════════════════════════════════════════════════════════════════════════

-- O SARAM cujos dados militares a conta pode ver: vínculo verificado, ou legacy sem verificado
-- concorrente; conta pessoal. NULL nos demais casos (D12).
create or replace function core.visible_saram(p_user uuid)
returns text
language sql
stable
set search_path = ''
as $$
	select ud.saram
	from core.user_data ud
	where ud.id = p_user
		and ud.account_kind = 'pessoal'
		and ud.saram is not null
		and (
			ud.saram_verified_by in ('email', 'cpf', 'admin')
			or (ud.saram_verified_by = 'legacy' and not exists (
				select 1 from core.user_data o
				where o.saram = ud.saram and o.id <> ud.id and o.saram_verified_by in ('email', 'cpf', 'admin')
			))
		);
$$;

comment on function core.visible_saram(uuid) is
	'SARAM cujos dados militares a própria conta vê: verificado (email/cpf/admin) ou legacy sem verificado concorrente. Usada por sisub, rumaer e sucont. Ver 20261003100000.';

-- Estado do vínculo e a próxima ação possível — a tela da FASE 2 é montada só a partir disto.
-- Nunca publica SARAM de candidato, CPF ou nome completo.
create or replace function core.saram_link_status(p_user uuid, p_email text, p_email_confirmed boolean)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
	v_kind text;
	v_saram text;
	v_by text;
	v_at timestamptz;
	v_req_id uuid;
	v_req_kind text;
	v_req_saram text;
	v_req_justification text;
	v_req_created timestamptz;
	v_req_claim text;
	v_eligibility text;
	v_candidates jsonb := '[]'::jsonb;
	v_count integer := 0;
	v_suffix boolean := core.email_has_homonym_suffix(p_email);
	v_locked timestamptz := core.saram_attempt_locked_until(p_user, null);
	v_status text;
	v_actions text[] := '{}';
	v_visible boolean := false;
	v_identity jsonb;
begin
	if p_user is null then
		raise exception 'SARAM_INVALID' using errcode = '22023', detail = 'usuário obrigatório';
	end if;

	select ud.account_kind, ud.saram, ud.saram_verified_by, ud.saram_verified_at
		into v_kind, v_saram, v_by, v_at
		from core.user_data ud where ud.id = p_user;
	v_kind := coalesce(v_kind, 'pessoal');

	select r.id, r.kind, r.saram, r.justification, r.created_at, r.claim_verified_by
		into v_req_id, v_req_kind, v_req_saram, v_req_justification, v_req_created, v_req_claim
		from core.saram_link_request r where r.user_id = p_user and r.status = 'pending' limit 1;

	v_eligibility := case
		when lower(btrim(coalesce(p_email, ''))) !~ '^[^@[:space:]]+@fab\.mil\.br$' then 'domain'
		when not coalesce(p_email_confirmed, false) then 'unconfirmed'
		when core.email_name_key(p_email) is null then 'no_key'
		else 'eligible'
	end;

	-- Candidatos da chave do e-mail: para quem não tem vínculo e para o legacy (provar outra
	-- identidade troca o legacy).
	if v_eligibility = 'eligible' and v_kind = 'pessoal' and v_req_id is null and (v_by is null or v_by = 'legacy') then
		select
			coalesce(jsonb_agg(jsonb_build_object(
				'ref', c.roster_id,
				'posto', c.posto,
				'nome_guerra', c.nome_guerra,
				'sg_org', c.sg_org,
				'held_by_other', exists (select 1 from core.user_data o where o.saram = c.saram and o.id <> p_user),
				'holder_verified', exists (
					select 1 from core.user_data o
					where o.saram = c.saram and o.id <> p_user and o.saram_verified_by in ('email', 'cpf', 'admin')
				)
			) order by c.nome_guerra, c.roster_id), '[]'::jsonb),
			count(*)
			into v_candidates, v_count
			from core.saram_email_candidates(p_email) c;
	end if;

	if v_kind = 'institucional' then
		v_status := 'institutional';
		v_actions := array['set_personal'];
	elsif v_by in ('email', 'cpf', 'admin') then
		v_status := 'verified';
		v_visible := true;
	elsif v_req_id is not null then
		-- Antes do legacy: o legacy que verificou contra titular verificado tem contestação aberta,
		-- e a tela precisa mostrá-la e oferecer a desistência.
		v_status := case v_req_kind when 'dispute' then 'contested' else 'pending_request' end;
		v_visible := v_by = 'legacy' and core.visible_saram(p_user) is not null;
		v_actions := array['withdraw_request'];
	elsif v_by = 'legacy' then
		v_status := 'legacy';
		v_visible := core.visible_saram(p_user) is not null;
		-- Provar outra identidade (e-mail ou CPF) troca o legacy; pedir sem prova, só quando o
		-- legacy não localiza ninguém no cadastro (número digitado errado).
		v_actions := array['verify_cpf'];
		if v_count >= 1 then
			v_actions := array['confirm_candidate'] || v_actions;
		end if;
		if not exists (select 1 from core.military_identity mi where mi.saram = v_saram) then
			v_actions := v_actions || array['request_link'];
		end if;
	else
		if v_count = 1 and not v_suffix then
			v_status := 'suggestion';
			v_actions := array['confirm_candidate', 'verify_cpf', 'request_link', 'set_institutional'];
		elsif v_locked is not null then
			v_status := 'locked_out';
			v_actions := array['request_link', 'set_institutional'];
		elsif v_count >= 1 then
			v_status := 'homonyms';
			v_actions := array['confirm_candidate', 'verify_cpf', 'request_link', 'set_institutional'];
		else
			v_status := 'no_match';
			v_actions := array['verify_cpf', 'request_link', 'set_institutional'];
		end if;
	end if;

	if v_visible then
		select jsonb_build_object('posto', mi.posto, 'nome_guerra', mi.nome_guerra, 'sg_org', mi.sg_org)
			into v_identity
			from core.military_identity mi where mi.saram = v_saram
			order by mi.data_atualizacao desc nulls last limit 1;
	end if;

	return jsonb_build_object(
		'status', v_status,
		'account_kind', v_kind,
		'saram', case when v_by is not null then v_saram end,
		'verified_by', v_by,
		'verified_at', v_at,
		'visible', v_visible,
		'identity', v_identity,
		'has_unverified_saram', v_saram is not null and v_by is null,
		'request', case when v_req_id is not null then jsonb_build_object(
			'id', v_req_id, 'kind', v_req_kind, 'saram', v_req_saram, 'justification', v_req_justification,
			'created_at', v_req_created, 'claim_verified_by', v_req_claim
		) end,
		'candidates', v_candidates,
		'requires_cpf_suffix', v_count > 1 or (v_count = 1 and v_suffix),
		'email_eligibility', v_eligibility,
		'locked_until', v_locked,
		'attempts_left', core.saram_attempts_left(p_user),
		'actions', to_jsonb(v_actions)
	);
end;
$$;

comment on function core.saram_link_status(uuid, text, boolean) is
	'Estado do vínculo de SARAM da PRÓPRIA conta (id, e-mail e e-mail confirmado da sessão) e as ações possíveis: verified, legacy, institutional, pending_request, contested, suggestion, homonyms, locked_out, no_match. Ver 20261003100000.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 10. Mutações do próprio usuário
-- ═════════════════════════════════════════════════════════════════════════════

-- Pré-condições comuns às verificações: pessoal, sem pedido pendente, sem vínculo verificado.
-- Legacy: `p_proof` (e-mail ou CPF conferidos) pode trocá-lo — verificado prevalece sobre legacy;
-- sem prova (pedido), só o legacy que não localiza ninguém no cadastro (número digitado errado,
-- que era corrigível antes desta migration). Devolve o vínculo atual.
create or replace function core.saram_assert_can_link(p_user uuid, p_saram text, p_proof boolean)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_kind text;
	v_saram text;
	v_by text;
begin
	select ud.account_kind, ud.saram, ud.saram_verified_by into v_kind, v_saram, v_by
		from core.user_data ud where ud.id = p_user for update;
	if v_kind = 'institucional' then
		raise exception 'ACCOUNT_INSTITUTIONAL' using errcode = 'P0001', detail = 'conta institucional não tem SARAM';
	end if;
	if v_by in ('email', 'cpf', 'admin') then
		raise exception 'SARAM_ALREADY_LINKED' using errcode = 'P0001', detail = 'a conta já tem SARAM verificado';
	end if;
	if v_by = 'legacy' and not p_proof and v_saram is distinct from p_saram
		and exists (select 1 from core.military_identity mi where mi.saram = v_saram) then
		raise exception 'SARAM_ALREADY_LINKED' using errcode = 'P0001', detail = 'a conta tem vínculo anterior que localiza cadastro; o administrador revisa';
	end if;
	if exists (select 1 from core.saram_link_request r where r.user_id = p_user and r.status = 'pending') then
		raise exception 'REQUEST_PENDING' using errcode = 'P0001', detail = 'há pedido de vínculo pendente';
	end if;
	return v_saram;
end;
$$;

create or replace function core.confirm_saram_candidate(p_user uuid, p_email text, p_email_confirmed boolean, p_candidate bigint, p_cpf_suffix text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_suffix text := nullif(regexp_replace(coalesce(p_cpf_suffix, ''), '\D', '', 'g'), '');
	v_saram text;
	v_count integer;
	v_locked timestamptz;
	v_ok boolean;
	v_result jsonb;
begin
	if p_user is null or p_candidate is null then
		raise exception 'CANDIDATE_NOT_FOUND' using errcode = 'P0002', detail = 'usuário e candidato obrigatórios';
	end if;
	if lower(btrim(coalesce(p_email, ''))) !~ '^[^@[:space:]]+@fab\.mil\.br$' or not coalesce(p_email_confirmed, false) or core.email_name_key(p_email) is null then
		raise exception 'EMAIL_NOT_ELIGIBLE' using errcode = 'P0001', detail = 'e-mail fora de @fab.mil.br, não confirmado ou sem chave';
	end if;

	select c.saram into v_saram from core.saram_email_candidates(p_email) c where c.roster_id = p_candidate;
	if v_saram is null then
		raise exception 'CANDIDATE_NOT_FOUND' using errcode = 'P0002', detail = 'o candidato não é da chave do e-mail';
	end if;
	select count(*) into v_count from core.saram_email_candidates(p_email);

	perform pg_advisory_xact_lock(hashtext('saram:' || v_saram));
	perform core.saram_assert_can_link(p_user, v_saram, true);

	if v_count > 1 or core.email_has_homonym_suffix(p_email) then
		if v_suffix is null or v_suffix !~ '^[0-9]{4}$' then
			raise exception 'CPF_SUFFIX_INVALID' using errcode = '22023', detail = 'informe os 4 últimos dígitos do CPF';
		end if;
		v_locked := core.saram_attempt_locked_until(p_user, v_saram);
		if v_locked is not null then
			return jsonb_build_object('outcome', 'locked', 'locked_until', v_locked,
				'status', core.saram_link_status(p_user, p_email, p_email_confirmed));
		end if;
		select exists (
			select 1 from core.user_military_data m
			where m.id = p_candidate and right(regexp_replace(m."nrCpf", '\D', '', 'g'), 4) = v_suffix
		) into v_ok;
		insert into core.saram_verification_attempt (user_id, saram, method, succeeded) values (p_user, v_saram, 'cpf_suffix', v_ok);
		if not v_ok then
			return jsonb_build_object('outcome', 'mismatch', 'attempts_left', core.saram_attempts_left(p_user),
				'locked_until', core.saram_attempt_locked_until(p_user, v_saram),
				'status', core.saram_link_status(p_user, p_email, p_email_confirmed));
		end if;
	end if;

	perform set_config('iefa.saram_link', 'email', true);
	v_result := core.apply_saram_link(p_user, p_email, v_saram, 'email');
	perform set_config('iefa.saram_link', '', true);

	return v_result || jsonb_build_object('status', core.saram_link_status(p_user, p_email, p_email_confirmed));
end;
$$;

comment on function core.confirm_saram_candidate(uuid, text, boolean, bigint, text) is
	'Confirma o candidato (referência opaca de core.saram_link_status) da chave do e-mail da sessão. Homônimo ou e-mail com dígito: exige os 4 últimos dígitos do CPF, com tentativas limitadas. Ver 20261003100000.';

create or replace function core.verify_saram_by_cpf(p_user uuid, p_email text, p_email_confirmed boolean, p_saram text, p_cpf text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_saram text := btrim(coalesce(p_saram, ''));
	v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
	v_current text;
	v_current_by text;
	v_locked timestamptz;
	v_ok boolean;
	v_result jsonb;
begin
	if p_user is null or v_saram !~ '^[0-9]{6,7}$' then
		raise exception 'SARAM_INVALID' using errcode = '22023', detail = 'o SARAM tem 6 ou 7 dígitos';
	end if;
	if v_cpf !~ '^[0-9]{11}$' then
		raise exception 'CPF_INVALID' using errcode = '22023', detail = 'o CPF tem 11 dígitos';
	end if;

	perform pg_advisory_xact_lock(hashtext('saram:' || v_saram));
	v_current := core.saram_assert_can_link(p_user, v_saram, true);
	select ud.saram_verified_by into v_current_by from core.user_data ud where ud.id = p_user;

	v_locked := core.saram_attempt_locked_until(p_user, v_saram);
	if v_locked is not null then
		return jsonb_build_object('outcome', 'locked', 'locked_until', v_locked,
			'status', core.saram_link_status(p_user, p_email, p_email_confirmed));
	end if;

	select exists (
		select 1 from core.user_military_data m
		where m."nrOrdem" = v_saram and regexp_replace(m."nrCpf", '\D', '', 'g') = v_cpf
	) into v_ok;
	insert into core.saram_verification_attempt (user_id, saram, method, succeeded) values (p_user, v_saram, 'cpf', v_ok);

	if not v_ok then
		-- Mesma resposta para SARAM inexistente e CPF errado.
		return jsonb_build_object('outcome', 'mismatch', 'attempts_left', core.saram_attempts_left(p_user),
			'locked_until', core.saram_attempt_locked_until(p_user, v_saram),
			'status', core.saram_link_status(p_user, p_email, p_email_confirmed));
	end if;

	perform set_config('iefa.saram_link', 'cpf', true);
	v_result := core.apply_saram_link(p_user, p_email, v_saram, 'cpf');
	perform set_config('iefa.saram_link', '', true);

	-- `upgraded`: o legacy conferiu o PRÓPRIO número e subiu para cpf (não vale para contestação nem
	-- para troca de um SARAM sem verificação).
	return v_result || jsonb_build_object(
		'upgraded', v_result ->> 'outcome' = 'linked' and v_current_by = 'legacy' and v_current = v_saram,
		'status', core.saram_link_status(p_user, p_email, p_email_confirmed)
	);
end;
$$;

comment on function core.verify_saram_by_cpf(uuid, text, boolean, text, text) is
	'Vincula pelo SARAM + CPF completo conferidos no banco (o CPF não sai dele). 5 falhas/hora por conta ou por SARAM bloqueiam; resposta única para SARAM inexistente e CPF errado. Ver 20261003100000.';

create or replace function core.request_saram_link(p_user uuid, p_email text, p_email_confirmed boolean, p_saram text, p_justification text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_saram text := btrim(coalesce(p_saram, ''));
	v_justification text := btrim(coalesce(p_justification, ''));
	v_holder uuid;
	v_request uuid;
	v_kind text;
begin
	if p_user is null or v_saram !~ '^[0-9]{6,7}$' then
		raise exception 'SARAM_INVALID' using errcode = '22023', detail = 'o SARAM tem 6 ou 7 dígitos';
	end if;
	if char_length(v_justification) not between 10 and 1000 then
		raise exception 'JUSTIFICATION_INVALID' using errcode = '22023', detail = 'justificativa de 10 a 1000 caracteres';
	end if;

	perform pg_advisory_xact_lock(hashtext('saram:' || v_saram));
	perform core.saram_assert_can_link(p_user, v_saram, false);

	-- Pedido revela se o SARAM tem conta (contestação): teto por conta.
	if (select count(*) from core.saram_link_request r where r.user_id = p_user and r.created_at > now() - interval '24 hours') >= 5 then
		raise exception 'REQUEST_LIMIT' using errcode = 'P0001', detail = '5 pedidos em 24 horas';
	end if;

	select ud.id into v_holder from core.user_data ud
		where ud.saram = v_saram and ud.id <> p_user
		order by (ud.saram_verified_by in ('email', 'cpf', 'admin')) desc nulls last, ud.id
		limit 1;
	v_kind := case when v_holder is null then 'link' else 'dispute' end;

	insert into core.saram_link_request (user_id, kind, saram, justification, holder_user_id)
		values (p_user, v_kind, v_saram, v_justification, v_holder)
		returning id into v_request;

	return jsonb_build_object('outcome', 'requested', 'request_id', v_request, 'kind', v_kind,
		'status', core.saram_link_status(p_user, p_email, p_email_confirmed));
end;
$$;

comment on function core.request_saram_link(uuid, text, boolean, text, text) is
	'Pedido de vínculo (ou contestação, se o SARAM está em outra conta) para o administrador decidir. Um pendente por conta, 5 em 24 h. Ver 20261003100000.';

create or replace function core.withdraw_saram_request(p_user uuid, p_email text, p_email_confirmed boolean, p_request uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
	update core.saram_link_request
		set status = 'withdrawn', decided_at = now()
		where id = p_request and user_id = p_user and status = 'pending';
	if not found then
		raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0002', detail = 'pedido pendente da própria conta não encontrado';
	end if;
	return jsonb_build_object('outcome', 'withdrawn', 'request_id', p_request,
		'status', core.saram_link_status(p_user, p_email, p_email_confirmed));
end;
$$;

-- O formulário antigo (sisub e sucont): o SARAM digitado só vincula se for o candidato único da
-- chave do e-mail (sem dígito de homônimo); senão vira pedido para o administrador (D11).
create or replace function core.claim_saram(p_user uuid, p_email text, p_email_confirmed boolean, p_saram text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_saram text := btrim(coalesce(p_saram, ''));
	v_kind text;
	v_current text;
	v_by text;
	v_pending_saram text;
	v_candidate text;
	v_count integer := 0;
	v_result jsonb;
begin
	if p_user is null or v_saram !~ '^[0-9]{6,7}$' then
		raise exception 'SARAM_INVALID' using errcode = '22023', detail = 'o SARAM tem 6 ou 7 dígitos';
	end if;

	perform pg_advisory_xact_lock(hashtext('saram:' || v_saram));

	select ud.account_kind, ud.saram, ud.saram_verified_by into v_kind, v_current, v_by
		from core.user_data ud where ud.id = p_user for update;
	if v_kind = 'institucional' then
		raise exception 'ACCOUNT_INSTITUTIONAL' using errcode = 'P0001', detail = 'conta institucional não tem SARAM';
	end if;
	if v_by is not null then
		if v_current = v_saram then
			return jsonb_build_object('outcome', 'unchanged', 'status', core.saram_link_status(p_user, p_email, p_email_confirmed));
		end if;
		-- Só o legacy que não localiza ninguém (número digitado errado) segue corrigível por aqui,
		-- como era antes desta migration; o resto é do administrador.
		if v_by <> 'legacy' or exists (select 1 from core.military_identity mi where mi.saram = v_current) then
			raise exception 'SARAM_LOCKED' using errcode = 'P0001', detail = 'a conta já tem SARAM vinculado';
		end if;
	end if;

	select r.saram into v_pending_saram from core.saram_link_request r where r.user_id = p_user and r.status = 'pending';
	if v_pending_saram is not null then
		if v_pending_saram = v_saram then
			return jsonb_build_object('outcome', 'pending', 'status', core.saram_link_status(p_user, p_email, p_email_confirmed));
		end if;
		raise exception 'REQUEST_PENDING' using errcode = 'P0001', detail = 'há pedido de vínculo pendente';
	end if;

	if lower(btrim(coalesce(p_email, ''))) ~ '^[^@[:space:]]+@fab\.mil\.br$' and coalesce(p_email_confirmed, false)
		and not core.email_has_homonym_suffix(p_email) then
		select max(c.saram), count(*) into v_candidate, v_count from core.saram_email_candidates(p_email) c;
	end if;

	if v_count = 1 and v_candidate = v_saram then
		perform set_config('iefa.saram_link', 'email', true);
		v_result := core.apply_saram_link(p_user, p_email, v_saram, 'email');
		perform set_config('iefa.saram_link', '', true);
		return v_result || jsonb_build_object('status', core.saram_link_status(p_user, p_email, p_email_confirmed));
	end if;

	return core.request_saram_link(p_user, p_email, p_email_confirmed, v_saram, 'Informado no formulário de SARAM, sem verificação automática.');
end;
$$;

comment on function core.claim_saram(uuid, text, boolean, text) is
	'Formulário de SARAM digitado (sisub syncUserSaram, sucont saveMySaramFn): vincula por e-mail só o candidato único da chave do e-mail; senão abre pedido para o administrador. Nunca grava SARAM sem verificação. Ver 20261003100000.';

create or replace function core.set_own_account_kind(p_user uuid, p_email text, p_email_confirmed boolean, p_kind text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_current text;
	v_exists boolean := false;
	v_effects jsonb;
	v_email text := nullif(btrim(coalesce(p_email, '')), '');
begin
	if p_user is null or p_kind is null or p_kind not in ('pessoal', 'institucional') then
		raise exception 'ACCOUNT_KIND_INVALID' using errcode = '22023', detail = 'tipo de conta: pessoal ou institucional';
	end if;

	select true, ud.account_kind into v_exists, v_current from core.user_data ud where ud.id = p_user for update;
	v_current := coalesce(v_current, 'pessoal');
	if v_current = p_kind then
		return jsonb_build_object('outcome', 'unchanged', 'account_kind', p_kind,
			'status', core.saram_link_status(p_user, p_email, p_email_confirmed));
	end if;

	perform set_config('iefa.saram_link', 'account_kind', true);
	if not coalesce(v_exists, false) then
		if v_email is null then
			raise exception 'USER_DATA_NOT_FOUND' using errcode = 'P0002', detail = 'conta sem e-mail e sem cadastro';
		end if;
		insert into core.user_data (id, email, account_kind) values (p_user, v_email, p_kind);
		v_effects := jsonb_build_object('previous', null, 'withdrawn_requests', 0, 'cancelled_arranchamentos', 0);
		if p_kind = 'institucional' then
			v_effects := core.apply_institutional_account(p_user);
		end if;
	elsif p_kind = 'institucional' then
		v_effects := core.apply_institutional_account(p_user);
		update core.user_data set account_kind = 'institucional' where id = p_user;
	else
		update core.user_data set account_kind = 'pessoal' where id = p_user;
	end if;
	perform set_config('iefa.saram_link', '', true);

	return jsonb_build_object('outcome', 'changed', 'account_kind', p_kind, 'effects', v_effects,
		'status', core.saram_link_status(p_user, p_email, p_email_confirmed));
end;
$$;

comment on function core.set_own_account_kind(uuid, text, boolean, text) is
	'A própria conta se declara institucional (perde o SARAM, o pedido pendente e os arranchamentos de hoje em diante) ou volta a pessoal (e verifica de novo). Ver 20261003100000.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 11. Administrador (admin:2; auditado na mesma transação)
-- ═════════════════════════════════════════════════════════════════════════════

-- Fila do console: pedidos e contestações pendentes, legacy a revisar, vínculos gravados fora
-- das funções, candidatas a institucional (pessoais sem vínculo cujo e-mail não bate com
-- ninguém) e as institucionais. O admin vê posto/nome de guerra/OM do SARAM pedido; CPF e nome
-- completo não saem.
create or replace function core.saram_review_queue()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
	select jsonb_build_object(
		'requests', coalesce((
			select jsonb_agg(row_data order by created_at) from (
				select r.created_at, jsonb_build_object(
					'id', r.id,
					'kind', r.kind,
					'saram', r.saram,
					'justification', r.justification,
					'claim_verified_by', r.claim_verified_by,
					'created_at', r.created_at,
					'updated_at', r.updated_at,
					'requester', jsonb_build_object('user_id', r.user_id, 'email', req.email, 'account_kind', coalesce(req.account_kind, 'pessoal'),
						'saram', req.saram, 'verified_by', req.saram_verified_by),
					'holders', coalesce((
						select jsonb_agg(jsonb_build_object('user_id', h.id, 'email', h.email, 'verified_by', h.saram_verified_by) order by h.id)
						from core.user_data h where h.saram = r.saram and h.id <> r.user_id
					), '[]'::jsonb),
					'identity', (
						select jsonb_build_object('posto', mi.posto, 'nome_guerra', mi.nome_guerra, 'sg_org', mi.sg_org)
						from core.military_identity mi where mi.saram = r.saram
						order by mi.data_atualizacao desc nulls last limit 1
					)
				) as row_data
				from core.saram_link_request r
				left join core.user_data req on req.id = r.user_id
				where r.status = 'pending'
				order by r.created_at
				limit 500
			) q
		), '[]'::jsonb),
		'legacy', coalesce((
			select jsonb_agg(row_data order by email) from (
				select ud.email, jsonb_build_object(
					'user_id', ud.id,
					'email', ud.email,
					'saram', ud.saram,
					'created_at', ud.created_at,
					'verified_elsewhere', exists (
						select 1 from core.user_data o where o.saram = ud.saram and o.id <> ud.id and o.saram_verified_by in ('email', 'cpf', 'admin')
					),
					'shared_with', (select count(*) from core.user_data o where o.saram = ud.saram and o.id <> ud.id),
					'identity', (
						select jsonb_build_object('posto', mi.posto, 'nome_guerra', mi.nome_guerra, 'sg_org', mi.sg_org)
						from core.military_identity mi where mi.saram = ud.saram
						order by mi.data_atualizacao desc nulls last limit 1
					)
				) as row_data
				from core.user_data ud
				where ud.saram_verified_by = 'legacy'
				order by ud.email
				limit 500
			) q
		), '[]'::jsonb),
		'unverified', coalesce((
			select jsonb_agg(jsonb_build_object('user_id', ud.id, 'email', ud.email, 'saram', ud.saram) order by ud.email)
			from (select * from core.user_data u where u.saram is not null and u.saram_verified_by is null order by u.email limit 500) ud
		), '[]'::jsonb),
		'institutional_candidates', coalesce((
			select jsonb_agg(jsonb_build_object('user_id', ud.id, 'email', ud.email, 'created_at', ud.created_at) order by ud.email)
			from (
				select u.* from core.user_data u
				where u.account_kind = 'pessoal'
					-- Conta de seção costuma ter hífen no e-mail (sem chave): o domínio basta.
					and lower(btrim(u.email)) ~ '^[^@[:space:]]+@fab\.mil\.br$'
					and (u.saram is null or u.saram_verified_by is null)
					and not exists (select 1 from core.saram_link_request r where r.user_id = u.id and r.status = 'pending')
					-- Inline (não a função de candidatos): usa o índice de expressão do espelho.
					and not exists (
						select 1 from core.user_military_data m
						where core.military_name_key(m."nmGuerra", m."nmPessoa") = core.email_name_key(u.email)
					)
				order by u.email
				limit 500
			) ud
		), '[]'::jsonb),
		'institutional', coalesce((
			select jsonb_agg(jsonb_build_object('user_id', ud.id, 'email', ud.email) order by ud.email)
			from (select * from core.user_data u where u.account_kind = 'institucional' order by u.email limit 500) ud
		), '[]'::jsonb)
	);
$$;

comment on function core.saram_review_queue() is
	'Fila do console de vínculos de SARAM (admin:2): pedidos/contestações pendentes, legacy a revisar, vínculos sem verificação, candidatas a institucional e institucionais. Ver 20261003100000.';

create or replace function core.decide_saram_request(p_actor uuid, p_operation text, p_request uuid, p_decision text, p_note text, p_assurance text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	r core.saram_link_request;
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
	v_kind text;
	v_by text;
	v_assigned jsonb;
	v_log uuid;
begin
	perform access_control.audit_context(p_operation);
	if p_decision is null or p_decision not in ('approve', 'reject') then
		raise exception 'DECISION_INVALID' using errcode = '22023', detail = 'decisão: approve ou reject';
	end if;
	if p_decision = 'reject' and char_length(coalesce(v_note, '')) < 10 then
		raise exception 'NOTE_REQUIRED' using errcode = '22023', detail = 'motivo da recusa com 10 caracteres ou mais';
	end if;

	select * into r from core.saram_link_request where id = p_request for update;
	if not found then
		raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0002', detail = 'pedido inexistente';
	end if;
	if r.status <> 'pending' then
		raise exception 'REQUEST_NOT_PENDING' using errcode = 'P0001', detail = 'pedido já decidido ou retirado';
	end if;

	if p_decision = 'reject' then
		update core.saram_link_request set status = 'rejected', decided_by = p_actor, decided_at = now(), decision_note = v_note where id = r.id;
		v_log := access_control.record_access_change(p_actor, p_operation, p_assurance, jsonb_build_object(
			'action', 'saram_request_reject', 'request_id', r.id, 'kind', r.kind, 'target_user_id', r.user_id, 'saram', r.saram, 'note', v_note
		));
		return jsonb_build_object('outcome', 'rejected', 'request_id', r.id, 'log_id', v_log);
	end if;

	perform pg_advisory_xact_lock(hashtext('saram:' || r.saram));

	select ud.account_kind, ud.saram_verified_by into v_kind, v_by from core.user_data ud where ud.id = r.user_id for update;
	if v_kind = 'institucional' then
		raise exception 'ACCOUNT_INSTITUTIONAL' using errcode = 'P0001', detail = 'conta institucional não tem SARAM';
	end if;
	if v_by in ('email', 'cpf', 'admin') then
		raise exception 'SARAM_ALREADY_LINKED' using errcode = 'P0001', detail = 'o solicitante já tem SARAM verificado; desvincule antes';
	end if;
	-- Pedido de vínculo que, desde que abriu, ganhou titular verificado: é contestação agora, e o
	-- administrador decide olhando os dois.
	if r.kind = 'link' and exists (
		select 1 from core.user_data o where o.saram = r.saram and o.id <> r.user_id and o.saram_verified_by in ('email', 'cpf', 'admin')
	) then
		raise exception 'SARAM_TAKEN' using errcode = 'P0001', detail = 'o SARAM foi verificado em outra conta depois do pedido';
	end if;

	perform set_config('iefa.saram_link', 'admin', true);
	v_assigned := core.assign_saram(r.user_id, null, r.saram, 'admin');
	perform set_config('iefa.saram_link', '', true);

	update core.saram_link_request set status = 'approved', decided_by = p_actor, decided_at = now(), decision_note = v_note where id = r.id;

	v_log := access_control.record_access_change(p_actor, p_operation, p_assurance, jsonb_build_object(
		'action', 'saram_request_approve', 'request_id', r.id, 'kind', r.kind, 'target_user_id', r.user_id, 'saram', r.saram,
		'previous', v_assigned -> 'previous', 'removed_from', v_assigned -> 'removed_from', 'note', v_note
	));
	return jsonb_build_object('outcome', 'approved', 'request_id', r.id, 'log_id', v_log, 'removed_from', v_assigned -> 'removed_from');
end;
$$;

comment on function core.decide_saram_request(uuid, text, uuid, text, text, text) is
	'Aprova (vincula com verified_by admin, tirando o SARAM de quem o tiver) ou recusa um pedido/contestação pendente. Auditada na mesma transação. Ver 20261003100000.';

create or replace function core.admin_link_saram(p_actor uuid, p_operation text, p_user uuid, p_saram text, p_expected_saram text, p_reason text, p_assurance text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_saram text := btrim(coalesce(p_saram, ''));
	v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
	v_kind text;
	v_current text;
	v_assigned jsonb;
	v_closed integer;
	v_log uuid;
begin
	perform access_control.audit_context(p_operation);
	if p_user is null or v_saram !~ '^[0-9]{6,7}$' then
		raise exception 'SARAM_INVALID' using errcode = '22023', detail = 'o SARAM tem 6 ou 7 dígitos';
	end if;
	if char_length(coalesce(v_reason, '')) < 10 then
		raise exception 'NOTE_REQUIRED' using errcode = '22023', detail = 'motivo com 10 caracteres ou mais';
	end if;

	perform pg_advisory_xact_lock(hashtext('saram:' || v_saram));

	select ud.account_kind, ud.saram into v_kind, v_current from core.user_data ud where ud.id = p_user for update;
	if v_current is distinct from nullif(btrim(coalesce(p_expected_saram, '')), '') then
		raise exception 'SARAM_LINK_CHANGED' using errcode = 'P0001', detail = 'o vínculo mudou desde a leitura';
	end if;
	if v_kind = 'institucional' then
		raise exception 'ACCOUNT_INSTITUTIONAL' using errcode = 'P0001', detail = 'conta institucional não tem SARAM';
	end if;
	if exists (
		select 1 from core.user_data o where o.saram = v_saram and o.id <> p_user and o.saram_verified_by in ('email', 'cpf', 'admin')
	) then
		raise exception 'SARAM_TAKEN' using errcode = 'P0001', detail = 'SARAM verificado em outra conta; desvincule lá antes';
	end if;

	perform set_config('iefa.saram_link', 'admin', true);
	v_assigned := core.assign_saram(p_user, null, v_saram, 'admin');
	perform set_config('iefa.saram_link', '', true);

	update core.saram_link_request
		set status = case when saram = v_saram then 'approved' else 'rejected' end,
			decided_by = p_actor, decided_at = now(), decision_note = 'Resolvido por vínculo manual do administrador.'
		where user_id = p_user and status = 'pending';
	get diagnostics v_closed = row_count;

	v_log := access_control.record_access_change(p_actor, p_operation, p_assurance, jsonb_build_object(
		'action', 'saram_link', 'target_user_id', p_user, 'saram', v_saram,
		'previous', v_assigned -> 'previous', 'removed_from', v_assigned -> 'removed_from',
		'closed_requests', v_closed, 'reason', v_reason
	));
	return jsonb_build_object('outcome', 'linked', 'log_id', v_log, 'removed_from', v_assigned -> 'removed_from');
end;
$$;

comment on function core.admin_link_saram(uuid, text, uuid, text, text, text, text) is
	'Vínculo manual pelo administrador (também confirma um legacy: mesmo SARAM). Confere o SARAM que a tela viu; recusa SARAM verificado em outra conta. Auditada. Ver 20261003100000.';

create or replace function core.admin_unlink_saram(p_actor uuid, p_operation text, p_user uuid, p_expected_saram text, p_reason text, p_assurance text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
	v_current text;
	v_by text;
	v_log uuid;
begin
	perform access_control.audit_context(p_operation);
	if char_length(coalesce(v_reason, '')) < 10 then
		raise exception 'NOTE_REQUIRED' using errcode = '22023', detail = 'motivo com 10 caracteres ou mais';
	end if;

	select ud.saram, ud.saram_verified_by into v_current, v_by from core.user_data ud where ud.id = p_user for update;
	if v_current is null or v_current is distinct from nullif(btrim(coalesce(p_expected_saram, '')), '') then
		raise exception 'SARAM_LINK_CHANGED' using errcode = 'P0001', detail = 'o vínculo mudou desde a leitura';
	end if;

	perform set_config('iefa.saram_link', 'admin', true);
	update core.user_data set saram = null, saram_verified_by = null, saram_verified_at = null where id = p_user;
	perform set_config('iefa.saram_link', '', true);

	v_log := access_control.record_access_change(p_actor, p_operation, p_assurance, jsonb_build_object(
		'action', 'saram_unlink', 'target_user_id', p_user, 'saram', v_current, 'previous_verified_by', v_by, 'reason', v_reason
	));
	return jsonb_build_object('outcome', 'unlinked', 'log_id', v_log);
end;
$$;

comment on function core.admin_unlink_saram(uuid, text, uuid, text, text, text) is
	'Desvincula o SARAM de uma conta (confere o SARAM que a tela viu). Auditada. Ver 20261003100000.';

create or replace function core.admin_set_account_kind(p_actor uuid, p_operation text, p_user uuid, p_kind text, p_expected_kind text, p_reason text, p_assurance text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
	v_exists boolean := false;
	v_current text;
	v_email text;
	v_effects jsonb;
	v_log uuid;
begin
	perform access_control.audit_context(p_operation);
	if p_user is null or p_kind is null or p_kind not in ('pessoal', 'institucional') then
		raise exception 'ACCOUNT_KIND_INVALID' using errcode = '22023', detail = 'tipo de conta: pessoal ou institucional';
	end if;
	if char_length(coalesce(v_reason, '')) < 10 then
		raise exception 'NOTE_REQUIRED' using errcode = '22023', detail = 'motivo com 10 caracteres ou mais';
	end if;

	select true, ud.account_kind into v_exists, v_current from core.user_data ud where ud.id = p_user for update;
	v_current := coalesce(v_current, 'pessoal');
	if v_current is distinct from p_expected_kind then
		raise exception 'ACCOUNT_KIND_CHANGED' using errcode = 'P0001', detail = 'o tipo de conta mudou desde a leitura';
	end if;
	if v_current = p_kind then
		return jsonb_build_object('outcome', 'unchanged', 'account_kind', p_kind, 'log_id', null);
	end if;

	perform set_config('iefa.saram_link', 'account_kind', true);
	if not coalesce(v_exists, false) then
		if has_table_privilege('auth.users', 'select') then
			select u.email into v_email from auth.users u where u.id = p_user;
		end if;
		if v_email is null then
			raise exception 'USER_DATA_NOT_FOUND' using errcode = 'P0002', detail = 'conta inexistente';
		end if;
		insert into core.user_data (id, email, account_kind) values (p_user, v_email, p_kind);
	end if;
	if p_kind = 'institucional' then
		v_effects := core.apply_institutional_account(p_user);
	end if;
	update core.user_data set account_kind = p_kind where id = p_user;
	perform set_config('iefa.saram_link', '', true);

	v_log := access_control.record_access_change(p_actor, p_operation, p_assurance, jsonb_build_object(
		'action', 'account_kind', 'target_user_id', p_user, 'previous', v_current, 'account_kind', p_kind, 'effects', v_effects, 'reason', v_reason
	));
	return jsonb_build_object('outcome', 'changed', 'account_kind', p_kind, 'effects', v_effects, 'log_id', v_log);
end;
$$;

comment on function core.admin_set_account_kind(uuid, text, uuid, text, text, text, text) is
	'O administrador marca/desmarca a conta como institucional (confere o tipo que a tela viu). Auditada. Ver 20261003100000.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 12. Privilégios: só o servidor
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare
	f regprocedure;
begin
	foreach f in array array[
		'core.military_name_key(text, text)',
		'core.email_name_key(text)',
		'core.email_has_homonym_suffix(text)',
		'core.saram_email_candidates(text)',
		'core.saram_attempt_locked_until(uuid, text)',
		'core.saram_attempts_left(uuid)',
		'core.assign_saram(uuid, text, text, text)',
		'core.apply_saram_link(uuid, text, text, text)',
		'core.apply_institutional_account(uuid)',
		'core.visible_saram(uuid)',
		'core.saram_link_status(uuid, text, boolean)',
		'core.saram_assert_can_link(uuid, text, boolean)',
		'core.confirm_saram_candidate(uuid, text, boolean, bigint, text)',
		'core.verify_saram_by_cpf(uuid, text, boolean, text, text)',
		'core.request_saram_link(uuid, text, boolean, text, text)',
		'core.withdraw_saram_request(uuid, text, boolean, uuid)',
		'core.claim_saram(uuid, text, boolean, text)',
		'core.set_own_account_kind(uuid, text, boolean, text)',
		'core.saram_review_queue()',
		'core.decide_saram_request(uuid, text, uuid, text, text, text)',
		'core.admin_link_saram(uuid, text, uuid, text, text, text, text)',
		'core.admin_unlink_saram(uuid, text, uuid, text, text, text)',
		'core.admin_set_account_kind(uuid, text, uuid, text, text, text, text)'
	]::regprocedure[]
	loop
		execute format('revoke all on function %s from public, anon, authenticated', f);
		execute format('grant execute on function %s to service_role', f);
	end loop;
	revoke all on function core.guard_user_data_saram_link() from public, anon, authenticated;
	revoke all on function kitchen.refuse_institutional_account_meal() from public, anon, authenticated;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 13. Conferência
-- ═════════════════════════════════════════════════════════════════════════════

do $$
begin
	if exists (select 1 from core.user_data where account_kind = 'institucional' and saram is not null) then
		raise exception 'conta institucional com SARAM';
	end if;
	if has_table_privilege('anon', 'core.saram_link_request', 'select') or has_table_privilege('authenticated', 'core.saram_link_request', 'select')
		or has_table_privilege('anon', 'core.saram_verification_attempt', 'select') or has_table_privilege('authenticated', 'core.saram_verification_attempt', 'select') then
		raise exception 'tabelas do vínculo de SARAM legíveis por cliente';
	end if;
	if has_function_privilege('anon', 'core.saram_link_status(uuid, text, boolean)', 'execute')
		or has_function_privilege('authenticated', 'core.verify_saram_by_cpf(uuid, text, boolean, text, text)', 'execute') then
		raise exception 'função do vínculo de SARAM executável por cliente';
	end if;
end;
$$;

notify pgrst, 'reload schema';
