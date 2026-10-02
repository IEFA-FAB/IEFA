-- signup_allowlist — e-mails FORA de @fab.mil.br autorizados a ganhar conta no Auth.
--
-- ── O problema ───────────────────────────────────────────────────────────────
--
-- O cadastro aceitava qualquer domínio: a exigência de @fab.mil.br vivia só nos formulários
-- (sisub, forms, contrate, portal, rumaer, sucont, assignment-selection). `POST /auth/v1/signup`
-- com a publishable key do bundle passa por cima de todos eles — havia 15 contas fora da FAB em
-- auth.users em 2026-10-01. Quem fecha isso no servidor é o hook "Before User Created" do
-- Supabase Auth (20261001100100), que recusa a criação de conta de e-mail que não seja
-- @fab.mil.br NEM esteja autorizado aqui.
--
-- ── Por que uma lista, e não só o domínio ────────────────────────────────────
--
-- O hook dispara em TODA criação de usuário, inclusive `auth.admin.createUser` e
-- `inviteUserByEmail` (o GoTrue passa pelo mesmo `signupNewUser`). Sem uma exceção explícita,
-- o mantenedor perderia o caminho de convidar parceiros (GS1, por exemplo). A exceção é por
-- E-MAIL, nunca por domínio: autorizar `gs1br.org` inteiro reabriria o autocadastro para
-- qualquer pessoa daquele domínio.
--
-- ── É controle de acesso: entra no regime auditado ───────────────────────────
--
-- Autorizar um e-mail é conceder a capacidade de ter conta. Por isso a tabela é VIGIADA como as
-- de 20260921130100 (trigger `enforce_audited_change`: escrita fora de função auditada levanta
-- 42501 ACCESS_CHANGE_UNAUDITED) e só muda por `authorize_external_signup` /
-- `revoke_external_signup`, que gravam a mudança e a linha de
-- `access_control.sensitive_operation_log` na MESMA transação, com o ator que o servidor tirou da
-- sessão (padrão de 20260921130000).
--
-- Revogar NÃO apaga a conta já criada: só impede criação nova. A linha revogada fica (histórico),
-- e uma autorização nova do mesmo e-mail é outra linha — o índice único só vale entre as ativas.
--
-- ── Quem lê ──────────────────────────────────────────────────────────────────
--
--   * o console do sisub (service role / `postgres` do Drizzle), atrás de `admin` nível 2;
--   * o hook, como `supabase_auth_admin` (o role do GoTrue). Ele recebe USAGE no schema e SELECT
--     só nas duas colunas que a decisão usa (`email`, `revoked_at`), com policy de RLS própria —
--     o motivo da autorização e quem a deu não são da conta dele. Nem `anon` nem
--     `authenticated` têm grant (20260920230000): a tabela não aparece no `/rest/v1/`.
--
-- ── Linha sem ator ───────────────────────────────────────────────────────────
--
-- `authorized_by` é nulo SÓ em linha de manutenção aberta pelo bypass explícito
-- (`iefa.audit_bypass`): a fixture de integração do sisub autoriza o e-mail `@example.invalid`
-- do usuário de teste antes de criá-lo, e registrar fixture no log de produção exigiria um ator
-- real que nunca mais poderia ser apagado (`on delete restrict`). A função auditada sempre
-- preenche o ator. Quando há ator, `on delete restrict`: a prova não some com a conta de quem
-- autorizou (mesma razão de `sensitive_operation_log.actor_id`).
--
-- Erros estáveis (os apps traduzem; o SQL cru nunca chega à tela):
--   22023 ACCESS_CHANGE_INVALID              argumento fora do contrato (e-mail malformado, motivo curto)
--   22023 SIGNUP_ALLOWLIST_INSTITUTIONAL     e-mail @fab.mil.br — o cadastro dele já é livre
--   23505 SIGNUP_ALLOWLIST_ALREADY_ACTIVE    o e-mail já tem autorização ativa
--   23503 ACCESS_ACTOR_NOT_FOUND             o ator não existe em auth.users
--   P0002 SIGNUP_ALLOWLIST_NOT_FOUND         autorização inexistente
--
-- Sem `kitchen_id`/`unit_id`/`mess_hall_id`: fora do contrato de reset do treino do sisub. DDL
-- idempotente (reaplicável por db:push ou psql).

create table if not exists access_control.signup_allowlist (
	id            uuid primary key default gen_random_uuid(),
	-- Minúsculo e sem espaço nas pontas: o GoTrue compara e-mail sem caixa, e o hook também.
	email         text not null,
	reason        text not null,
	authorized_by uuid references auth.users(id) on delete restrict,
	created_at    timestamptz not null default now(),
	revoked_at    timestamptz,
	revoked_by    uuid references auth.users(id) on delete restrict,
	constraint signup_allowlist_email_normalized check (email = lower(btrim(email))),
	constraint signup_allowlist_email_format check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
	constraint signup_allowlist_reason_length check (char_length(btrim(reason)) between 10 and 500),
	-- Revogada por função auditada tem quem revogou; a de manutenção pode não ter. O inverso
	-- (quem revogou sem quando) não existe.
	constraint signup_allowlist_revoked_pair check (revoked_by is null or revoked_at is not null)
);

-- Uma autorização ATIVA por e-mail; as revogadas ficam como histórico.
create unique index if not exists signup_allowlist_active_email_uniq
	on access_control.signup_allowlist (email) where revoked_at is null;
-- O hook consulta pelo índice acima (só as ativas); o console lista por data.
create index if not exists signup_allowlist_created_at_idx on access_control.signup_allowlist (created_at desc);
-- Índice cheio nas FKs (o gate `fk_without_full_index` do audit:rls).
create index if not exists signup_allowlist_authorized_by_idx on access_control.signup_allowlist (authorized_by);
create index if not exists signup_allowlist_revoked_by_idx on access_control.signup_allowlist (revoked_by);

alter table access_control.signup_allowlist enable row level security;

comment on table access_control.signup_allowlist is
	'E-mails fora de @fab.mil.br autorizados a ganhar conta no Auth (o hook access_control.before_user_created consulta as ativas). Controle de acesso: escrita só por authorize_external_signup/revoke_external_signup, que gravam sensitive_operation_log na mesma transação. Revogar não apaga a conta já criada. Ver 20261001100000.';

-- ── Leitura do hook (supabase_auth_admin) ───────────────────────────────────
-- O GoTrue roda o hook como `supabase_auth_admin`, que não atravessa RLS e não tem nada neste
-- schema. Recebe o mínimo: USAGE, SELECT nas duas colunas da decisão, e uma policy que só deixa
-- ver as ativas. Funções e outras tabelas de `access_control` continuam fora do alcance dele
-- (EXECUTE nasce só para `postgres`/`service_role`, 20260920210000; tabelas, por grant).
grant usage on schema access_control to supabase_auth_admin;
revoke all on table access_control.signup_allowlist from supabase_auth_admin;
grant select (email, revoked_at) on table access_control.signup_allowlist to supabase_auth_admin;

drop policy if exists signup_allowlist_auth_hook_read on access_control.signup_allowlist;
create policy signup_allowlist_auth_hook_read on access_control.signup_allowlist
	for select to supabase_auth_admin
	using (revoked_at is null);

-- ── Vigiada: escrita só por função auditada ─────────────────────────────────
drop trigger if exists enforce_audited_change on access_control.signup_allowlist;
create trigger enforce_audited_change
	before insert or update or delete on access_control.signup_allowlist
	for each row execute function access_control.enforce_audited_access_change();

-- ═════════════════════════════════════════════════════════════════════════════
-- authorize_external_signup — autoriza um e-mail fora da FAB a ganhar conta
-- ═════════════════════════════════════════════════════════════════════════════
--
-- O convite (`auth.admin.inviteUserByEmail`) é do app, DEPOIS desta transação: o hook só enxerga
-- a autorização confirmada. Convite que falha não desfaz a autorização; reenviar é revogar e
-- autorizar de novo (os formulários de cadastro dos apps só aceitam @fab.mil.br).

create or replace function access_control.authorize_external_signup(
	p_actor     uuid,
	p_operation text,
	p_email     text,
	p_reason    text,
	p_assurance text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_email  text := lower(btrim(coalesce(p_email, '')));
	v_reason text := btrim(coalesce(p_reason, ''));
	v_row    access_control.signup_allowlist;
	v_log_id uuid;
begin
	if p_actor is null then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'ator obrigatório';
	end if;
	if char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'e-mail inválido';
	end if;
	if char_length(v_reason) not between 10 and 500 then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'o motivo tem de 10 a 500 caracteres';
	end if;
	-- Mesma regra do hook (20261001100100): domínio exato, sem subdomínio.
	if v_email ~ '^[^@[:space:]]+@fab\.mil\.br$' then
		raise exception 'SIGNUP_ALLOWLIST_INSTITUTIONAL' using errcode = '22023', detail = 'e-mail @fab.mil.br não precisa de autorização';
	end if;

	perform access_control.audit_context(p_operation);

	begin
		insert into access_control.signup_allowlist (email, reason, authorized_by)
			values (v_email, v_reason, p_actor)
			returning * into v_row;
	exception
		when unique_violation then
			raise exception 'SIGNUP_ALLOWLIST_ALREADY_ACTIVE' using errcode = '23505', detail = 'o e-mail já tem autorização ativa';
		when foreign_key_violation then
			raise exception 'ACCESS_ACTOR_NOT_FOUND' using errcode = '23503', detail = 'o ator não é um usuário cadastrado';
	end;

	v_log_id := access_control.record_access_change(
		p_actor, p_operation, p_assurance,
		jsonb_build_object('action', 'grant', 'allowlist_id', v_row.id, 'email', v_row.email, 'reason', v_row.reason)
	);

	return jsonb_build_object(
		'log_id', v_log_id,
		'id', v_row.id,
		'email', v_row.email,
		'reason', v_row.reason,
		'authorized_by', v_row.authorized_by,
		'created_at', v_row.created_at,
		'revoked_at', v_row.revoked_at,
		'revoked_by', v_row.revoked_by
	);
end;
$$;

comment on function access_control.authorize_external_signup(uuid, text, text, text, text) is
	'Autoriza um e-mail fora de @fab.mil.br a ganhar conta no Auth e grava sensitive_operation_log na mesma transação. O ator vem da sessão (servidor). Ver 20261001100000.';

-- ═════════════════════════════════════════════════════════════════════════════
-- revoke_external_signup — retira a autorização (a conta já criada fica)
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function access_control.revoke_external_signup(
	p_actor     uuid,
	p_operation text,
	p_id        uuid,
	p_assurance text default 'session'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_row    access_control.signup_allowlist;
	v_log_id uuid;
begin
	if p_actor is null or p_id is null then
		raise exception 'ACCESS_CHANGE_INVALID' using errcode = '22023', detail = 'ator e autorização são obrigatórios';
	end if;

	perform access_control.audit_context(p_operation);

	select * into v_row from access_control.signup_allowlist where id = p_id for update;
	if not found then
		raise exception 'SIGNUP_ALLOWLIST_NOT_FOUND' using errcode = 'P0002', detail = 'autorização inexistente';
	end if;
	-- Já revogada: nada acontece, nada é registrado (revogar o revogado não é um fato).
	if v_row.revoked_at is not null then
		return jsonb_build_object('log_id', null, 'id', v_row.id, 'changed', false);
	end if;

	begin
		update access_control.signup_allowlist set revoked_at = now(), revoked_by = p_actor where id = p_id;
	exception
		when foreign_key_violation then
			raise exception 'ACCESS_ACTOR_NOT_FOUND' using errcode = '23503', detail = 'o ator não é um usuário cadastrado';
	end;

	v_log_id := access_control.record_access_change(
		p_actor, p_operation, p_assurance,
		jsonb_build_object(
			'action', 'revoke', 'allowlist_id', v_row.id, 'email', v_row.email,
			'previous', jsonb_build_object('reason', v_row.reason, 'authorized_by', v_row.authorized_by, 'created_at', v_row.created_at)
		)
	);

	return jsonb_build_object('log_id', v_log_id, 'id', v_row.id, 'changed', true);
end;
$$;

comment on function access_control.revoke_external_signup(uuid, text, uuid, text) is
	'Revoga a autorização de cadastro de um e-mail externo e grava sensitive_operation_log na mesma transação. NÃO apaga a conta já criada: só impede criação nova. Ver 20261001100000.';

-- Só a service role (e o dono, `postgres`, role do Drizzle do sisub). O default global já nasce
-- assim desde 20260920210000; o revoke explícito protege contra um default que volte a abrir.
revoke all on function access_control.authorize_external_signup(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function access_control.revoke_external_signup(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function access_control.authorize_external_signup(uuid, text, text, text, text) to service_role;
grant execute on function access_control.revoke_external_signup(uuid, text, uuid, text) to service_role;

notify pgrst, 'reload schema';
