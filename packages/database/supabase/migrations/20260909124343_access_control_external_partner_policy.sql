-- Política gerenciada "Conjunto Parceiro Externo" — leitura do catálogo global, nada além.
--
-- Motivo: parceiros institucionais fora da FAB (GS1 Brasil, no primeiro caso) precisam
-- CONSULTAR o catálogo de insumos e receitas sem qualquer poder de escrita. O "Conjunto
-- Treino" não serve para isso: ele concede unit:2, kitchen:2, kitchen-production:2,
-- messhall:2 e local-analytics:2 — é um sandbox de escrita, não um acesso de leitura.
--
-- `global` nível 1 é a fronteira certa: todas as telas de escrita do catálogo (receita
-- nova, edição de receita, plano semanal, equipamentos, locais, política de revisão)
-- exigem `global` nível 2 no `beforeLoad`, e as operações de domínio exigem o mesmo no
-- servidor.
--
-- `managed = true` → a UI recusa editar e remover (`assertPolicyEditable`). Sem isso,
-- alguém elevaria o statement para nível 2 no console e transformaria o acesso de consulta
-- num passe de escrita no catálogo de produção.
--
-- QUEM é anexado NÃO está aqui: anexar é operação de console (/admin/permissions), e nome
-- e e-mail de pessoa externa não entram num repositório público. A migration cria a
-- política; a administração escolhe os principais.
--
-- Idempotente: reaplicar não duplica política nem statements, e reafirma as duas
-- invariantes de segurança (`managed` e o statement único de nível 1) mesmo que uma
-- política de mesmo nome já exista — uma criada pelo console nasce com `managed = false` e
-- statements arbitrários.

do $$
declare
	v_policy_id uuid;
begin
	select id into v_policy_id
	from access_control.policy
	where name = 'Conjunto Parceiro Externo' and deleted_at is null;

	if v_policy_id is null then
		insert into access_control.policy (name, description, managed)
		values (
			'Conjunto Parceiro Externo',
			'Parceiro institucional externo à FAB: leitura do catálogo global (insumos, receitas, planos semanais, preparações congeladas e filas de revisão). Nenhuma escrita, nenhum escopo de unidade, cozinha ou refeitório. Gerenciada: não editável.',
			true
		)
		returning id into v_policy_id;
	else
		update access_control.policy
		set managed = true, updated_at = now()
		where id = v_policy_id and managed is distinct from true;
	end if;

	-- Substituição idempotente: o conjunto de statements é EXATAMENTE um, e o nível é 1.
	-- Verificar só a existência da política deixaria passar uma homônima com `global:2`.
	delete from access_control.policy_statement where policy_id = v_policy_id;

	insert into access_control.policy_statement (policy_id, module, level, unit_id, kitchen_id, mess_hall_id)
	values (v_policy_id, 'global', 1, null, null, null);
end $$;
