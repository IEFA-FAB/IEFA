-- auth_email_change_domain_guard — trocar o e-mail não fura o bloqueio de domínio.
--
-- ── O problema ───────────────────────────────────────────────────────────────
--
-- O hook "Before User Created" (20261001100100) só vale na CRIAÇÃO da conta. Uma conta
-- @fab.mil.br criada legitimamente podia, depois, chamar `PUT /auth/v1/user {email}` (ou um
-- administrador, `auth.admin.updateUserById`) e passar a usar um e-mail de qualquer domínio — com
-- o acesso que já tinha. O bloqueio de cadastro externo virava formalidade.
--
-- ── A regra ──────────────────────────────────────────────────────────────────
--
-- Trigger BEFORE UPDATE em `auth.users` que recusa, quando o VALOR NOVO de `email` ou de
-- `email_change` (o endereço pendente da troca com confirmação) é um endereço que:
--   * não termina em `@fab.mil.br` — sem caixa, domínio EXATO (mesma regra do hook, de
--     `authorize_external_signup` e de `isFabEmail` em `@iefa/auth-kit`); e
--   * não tem autorização ATIVA em `access_control.signup_allowlist`.
--
-- O que NÃO é recusado, de propósito — o GoTrue atualiza `auth.users` em quase todo fluxo:
--   * UPDATE que não muda o endereço (login, refresh, recovery, confirmação, `last_sign_in_at`,
--     metadados). Inclui as contas fora da FAB criadas antes do bloqueio: entram e recuperam
--     senha como sempre. A comparação é sem caixa e sem espaço nas pontas, então regravar o
--     mesmo e-mail com outra caixa também passa;
--   * limpar `email_change` (vazio ou NULL), como o GoTrue faz ao concluir ou cancelar a troca;
--   * valor sem `@`: o GoTrue só grava isso ao ofuscar a conta na exclusão "soft"
--     (`deleteUser(id, true)` troca o e-mail por um hash). Pela API pública não há como gravar
--     endereço sem `@` (o GoTrue valida o formato);
--   * troca para endereço autorizado — pelo próprio titular ou pelo admin/service_role.
--
-- A troca com confirmação passa por aqui DUAS vezes: no pedido (grava `email_change`) e na
-- confirmação (`email` := `email_change`). Autorização revogada entre as duas faz a confirmação
-- falhar — é o efeito desejado da revogação.
--
-- O GoTrue devolve erro genérico ("Database error updating user") ao cliente; a mensagem em
-- português fica no log do Postgres/Auth.
--
-- ── Privilégios ──────────────────────────────────────────────────────────────
--
-- SECURITY DEFINER com dono `postgres` e `search_path = ''`: o UPDATE chega como
-- `supabase_auth_admin` (GoTrue), `postgres` ou quem mais tiver grant em auth.users, e a
-- decisão não pode depender do que cada um enxerga em `signup_allowlist` (o GoTrue só vê
-- `email`/`revoked_at` das ativas; `postgres` é o dono). A função não recebe argumento e só lê.
-- Ninguém a executa direto: função de trigger não pode ser chamada fora de trigger, e o Postgres
-- não confere EXECUTE no disparo — então o EXECUTE fica só com o dono.
--
-- ── Rollback ─────────────────────────────────────────────────────────────────
--
-- A migration roda como `postgres`, que tem o privilégio TRIGGER em auth.users mas não é o dono
-- (`supabase_auth_admin`): CRIA o trigger, mas não o remove. Por isso a criação só acontece se
-- ele não existir (reaplicável), e desligar a regra é `create or replace` desta função com
-- `begin return new; end` — o dono dela é `postgres`. Remover o trigger de vez é
-- `drop trigger enforce_institutional_email on auth.users` como `supabase_auth_admin`.

create or replace function access_control.enforce_institutional_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_old_email  text := lower(btrim(coalesce(old.email, '')));
	v_new_email  text := lower(btrim(coalesce(new.email, '')));
	v_old_change text := lower(btrim(coalesce(old.email_change, '')));
	v_new_change text := lower(btrim(coalesce(new.email_change, '')));
	v_candidate  text;
begin
	foreach v_candidate in array array[
		case when v_new_email <> v_old_email then v_new_email end,
		case when v_new_change <> v_old_change then v_new_change end
	]
	loop
		continue when v_candidate is null or position('@' in v_candidate) = 0;
		continue when v_candidate ~ '^[^@[:space:]]+@fab\.mil\.br$';
		continue when exists (
			select 1 from access_control.signup_allowlist a
			where a.email = v_candidate and a.revoked_at is null
		);
		raise exception 'E-mail restrito a endereços institucionais @fab.mil.br. Para usar outro e-mail, peça autorização à administração do sistema.'
			using errcode = '42501',
				detail = 'AUTH_EMAIL_DOMAIN_REFUSED: troca de e-mail para endereço fora de @fab.mil.br sem autorização ativa em access_control.signup_allowlist',
				hint = 'Autorize o e-mail pelo console de acesso do sisub (authorize_external_signup) antes da troca. Ver 20261001140200.';
	end loop;
	return new;
end;
$$;

comment on function access_control.enforce_institutional_email_change() is
	'Trigger de auth.users: recusa trocar email/email_change para endereço fora de @fab.mil.br (domínio exato) sem autorização ativa em access_control.signup_allowlist. Não toca UPDATE que não muda o endereço, limpeza de email_change nem ofuscação sem @. Ver 20261001140200.';

alter function access_control.enforce_institutional_email_change() owner to postgres;
revoke all on function access_control.enforce_institutional_email_change() from public, anon, authenticated, service_role;

do $$
begin
	if not exists (
		select 1 from pg_trigger
		where tgrelid = 'auth.users'::regclass and tgname = 'enforce_institutional_email' and not tgisinternal
	) then
		create trigger enforce_institutional_email
			before update of email, email_change on auth.users
			for each row
			when (old.email is distinct from new.email or old.email_change is distinct from new.email_change)
			execute function access_control.enforce_institutional_email_change();
	end if;
end;
$$;
