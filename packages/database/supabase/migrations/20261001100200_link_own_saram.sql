-- link_own_saram — o vínculo de SARAM write-once e exclusivo, para quem não tem Drizzle.
--
-- O sucont gravava o SARAM direto em `core.user_data` (upsert pelo PostgREST), sem as travas que
-- o sisub aplica em `syncUserSaram` (`packages/sisub-domain/src/operations/user.ts`):
--
--   * write-once: SARAM que JÁ LOCALIZA um cadastro militar (`core.military_identity`) não muda
--     pela própria pessoa — só o mesmo valor passa. Livre para reescrever, o vínculo virava
--     enumeração: gravar o SARAM de outra pessoa, ler posto e nome de guerra dela, trocar de novo
--     (LGPD). O que não localiza ninguém (erro de digitação) segue corrigível;
--   * exclusivo: SARAM já vinculado a OUTRA conta é recusado;
--   * lock: checar e gravar sob `pg_advisory_xact_lock(hashtext('saram:<saram>'))`. A CHAVE é a
--     mesma de `syncUserSaram`, então sisub e sucont disputando o mesmo número se serializam
--     entre si — o índice único que fecharia a corrida no banco não existe enquanto houver
--     duplicata antiga em `core.user_data` (20260921160410).
--
-- O sucont não tem conexão Postgres direta (só os clients do supabase-js, sem transação entre
-- chamadas), então a regra vem para uma função: uma chamada RPC é uma transação. O sisub segue
-- pelo Drizzle; a regra é a MESMA e as duas mudam juntas (`packages/database/src/
-- link-own-saram.sql-contract.test.ts` amarra os tokens e a chave do lock).
--
-- Diferença deliberada: o conflito de E-MAIL (outra linha detém o endereço) é recusado com
-- EMAIL_TAKEN, sem apagar a linha rival. O sisub reivindica o e-mail apagando a linha órfã; o
-- sucont decidiu não ter um segundo caminho destrutivo sobre o cadastro de outra pessoa
-- (`apps/sucont/src/server/user.fn.ts`).
--
-- O `p_user` e o `p_email` vêm da SESSÃO, no servidor; nunca do payload. Executável só pela
-- service role.
--
-- Erros estáveis:
--   22023 SARAM_INVALID          SARAM fora de 6–7 dígitos (vazio limpa, se não estiver travado)
--   P0001 SARAM_LOCKED           o SARAM atual localiza cadastro militar e o pedido o troca/limpa
--   P0001 SARAM_TAKEN            o SARAM pedido já está vinculado a outra conta
--   23505 EMAIL_TAKEN            outra linha de core.user_data detém o e-mail da sessão
--   P0002 USER_DATA_NOT_FOUND    conta sem e-mail e sem linha: não há o que atualizar

create or replace function core.link_own_saram(p_user uuid, p_email text, p_saram text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_requested text := btrim(coalesce(p_saram, ''));
	v_email     text := nullif(btrim(coalesce(p_email, '')), '');
	v_exists    boolean;
	v_current   text;
	v_changes   boolean;
	v_conflict  text;
begin
	if p_user is null then
		raise exception 'SARAM_INVALID' using errcode = '22023', detail = 'usuário obrigatório';
	end if;
	if v_requested <> '' and v_requested !~ '^[0-9]{6,7}$' then
		raise exception 'SARAM_INVALID' using errcode = '22023', detail = 'o SARAM tem 6 ou 7 dígitos';
	end if;

	-- Mesma chave de `syncUserSaram` (sisub-domain): os dois apps se serializam no mesmo número.
	if v_requested <> '' then
		perform pg_advisory_xact_lock(hashtext('saram:' || v_requested));
	end if;

	select true, nullif(btrim(coalesce(ud.saram, '')), '')
		into v_exists, v_current
		from core.user_data ud
		where ud.id = p_user
		for update;
	v_exists := coalesce(v_exists, false);
	v_changes := coalesce(v_current, '') <> v_requested;

	if v_changes and v_current is not null
		and exists (select 1 from core.military_identity mi where mi.saram = v_current)
	then
		raise exception 'SARAM_LOCKED' using errcode = 'P0001', detail = 'o SARAM vinculado localiza cadastro militar';
	end if;

	if v_changes and v_requested <> ''
		and exists (select 1 from core.user_data ud where ud.saram = v_requested and ud.id <> p_user)
	then
		raise exception 'SARAM_TAKEN' using errcode = 'P0001', detail = 'SARAM vinculado a outra conta';
	end if;

	begin
		if v_exists then
			-- Sem mudança, só o e-mail é sincronizado. Vazio grava `null`: branco não é vínculo.
			update core.user_data
				set email = coalesce(v_email, email),
					saram = case when v_changes then nullif(v_requested, '') else saram end
				where id = p_user;
		elsif v_email is null then
			-- `core.user_data.email` é NOT NULL: sem e-mail não há como inserir.
			raise exception 'USER_DATA_NOT_FOUND' using errcode = 'P0002', detail = 'conta sem e-mail e sem cadastro';
		else
			insert into core.user_data (id, email, saram) values (p_user, v_email, nullif(v_requested, ''));
		end if;
	exception
		when unique_violation then
			-- O índice único de SARAM existe onde a base não tem duplicata antiga (20260921160410):
			-- lá, a corrida que o lock não cobre (gravação fora desta função) cai aqui.
			get stacked diagnostics v_conflict = constraint_name;
			if v_conflict like '%saram%' then
				raise exception 'SARAM_TAKEN' using errcode = 'P0001', detail = 'SARAM vinculado a outra conta';
			end if;
			raise exception 'EMAIL_TAKEN' using errcode = '23505', detail = 'outra linha de core.user_data detém este e-mail';
	end;

	return jsonb_build_object('saram', nullif(v_requested, ''), 'changed', v_changes);
end;
$$;

comment on function core.link_own_saram(uuid, text, text) is
	'Vincula o SARAM à PRÓPRIA conta (id e e-mail da sessão), write-once e exclusivo, sob o mesmo advisory lock de syncUserSaram (sisub-domain). Caminho do sucont, que não tem conexão Postgres direta. Ver 20261001100200.';

revoke all on function core.link_own_saram(uuid, text, text) from public, anon, authenticated;
grant execute on function core.link_own_saram(uuid, text, text) to service_role;

notify pgrst, 'reload schema';
