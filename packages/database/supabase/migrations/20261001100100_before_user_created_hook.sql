-- before_user_created_hook — o domínio @fab.mil.br passa a valer no SERVIDOR do Auth.
--
-- Postgres function hook "Before User Created" do Supabase Auth
-- (https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook). O GoTrue chama a
-- função ANTES de inserir em auth.users, em toda criação de conta: cadastro por senha, OTP/magic
-- link, OAuth/SSO, telefone, anônimo, `auth.admin.createUser` e `inviteUserByEmail`. Login de
-- conta que já existe NÃO passa por aqui — as contas fora da FAB criadas antes continuam entrando.
--
-- Regra (a mesma de `isFabEmail` em `@iefa/auth-kit`, e de `authorize_external_signup`):
--   * permite e-mail que termina em `@fab.mil.br` — sem caixa, domínio EXATO: um único `@`, nada
--     depois de `.br` (`x@fab.mil.br.evil.com` não passa) e nada antes de `fab` (subdomínio
--     `x@evil.fab.mil.br` também não);
--   * permite e-mail com autorização ATIVA em `access_control.signup_allowlist` (20261001100000);
--   * recusa o resto, inclusive conta sem e-mail (só telefone) e anônima, com 403 e mensagem em
--     português. O GoTrue devolve a mensagem ao cliente; `@iefa/auth-kit` (errors.ts) a reconhece.
--
-- ⚠ A migration só CRIA a função. Ligar o hook é passo manual no dashboard
-- (Authentication → Hooks → Before User Created → Postgres → `access_control.before_user_created`).
-- Antes de ligar: a fixture de integração do sisub precisa estar autorizando o e-mail de teste
-- (`seedAuthUser`), senão toda suíte de integração que cria usuário passa a falhar.
--
-- SECURITY INVOKER, como a documentação recomenda: roda como `supabase_auth_admin`, que recebeu
-- em 20261001100000 só o necessário (USAGE no schema, SELECT em `email`/`revoked_at` das
-- autorizações ativas). DEFINER daria ao hook os privilégios do dono (`postgres`) por nada.

create or replace function access_control.before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
	v_user  jsonb := coalesce(event -> 'user', '{}'::jsonb);
	v_email text := lower(btrim(coalesce(v_user ->> 'email', '')));
	v_refusal constant jsonb := jsonb_build_object(
		'error', jsonb_build_object(
			'http_code', 403,
			'message', 'Cadastro restrito a e-mails institucionais @fab.mil.br. Para usar outro e-mail, peça autorização à administração do sistema.'
		)
	);
begin
	-- Conta anônima não tem e-mail a conferir e não tem uso aqui.
	if v_user -> 'is_anonymous' = 'true'::jsonb then
		return v_refusal;
	end if;
	-- Sem e-mail (cadastro só por telefone, provider que não informou): nada a autorizar.
	if v_email = '' then
		return v_refusal;
	end if;

	if v_email ~ '^[^@[:space:]]+@fab\.mil\.br$' then
		return '{}'::jsonb;
	end if;

	if exists (
		select 1 from access_control.signup_allowlist a
			where a.email = v_email and a.revoked_at is null
	) then
		return '{}'::jsonb;
	end if;

	return v_refusal;
end;
$$;

comment on function access_control.before_user_created(jsonb) is
	'Hook "Before User Created" do Supabase Auth: permite criar conta só para e-mail @fab.mil.br (domínio exato) ou autorizado em access_control.signup_allowlist; recusa o resto com 403. Ligado no dashboard (Auth → Hooks). Ver 20261001100100.';

-- O GoTrue (supabase_auth_admin) executa; a service role também, porque o gate `audit:rls`
-- (`service_role_no_execute`) exige que o servidor execute toda função de schema exposto — e o
-- teste de integração chama a função por ela. Cliente nenhum.
revoke all on function access_control.before_user_created(jsonb) from public, anon, authenticated;
grant execute on function access_control.before_user_created(jsonb) to supabase_auth_admin, service_role;
