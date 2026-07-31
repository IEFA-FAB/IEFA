-- Política gerenciada "Conjunto Treino".
--
-- Escrita em todos os escopos de treino + leitura na SDAB: o usuário navega toda a
-- administração global e não altera nada. A leitura estrita depende do hardening de
-- `global:1` (migrations não impõem isso — o gate vive nas operações de domínio).
--
-- Os IDs de escopo são resolvidos por `is_training`, nunca escritos como literal: são
-- bigserial/identity e diferem entre ambientes. Um literal apontaria para uma unidade REAL
-- noutro ambiente, e o statement daria escrita em produção a todo treinando.
--
-- `managed = true` → a UI recusa editar e remover. Sem isso, alguém poderia trocar o escopo
-- dos statements e transformar o Conjunto Treino num passe de escrita para a FAB inteira.
--
-- Idempotente: reaplicar não duplica política nem statements.

do $$
declare
	v_policy_id    uuid;
	v_unit_id      bigint;
	v_kitchen_id   bigint;
	v_mess_hall_id bigint;
begin
	select id into v_unit_id      from core.units      where is_training;
	select id into v_kitchen_id   from core.kitchen    where is_training;
	select id into v_mess_hall_id from core.mess_halls where is_training;

	if v_unit_id is null or v_kitchen_id is null or v_mess_hall_id is null then
		raise exception 'Escopo de treino ausente — aplique 20260730230000_training_scope_seed.sql antes';
	end if;

	select id into v_policy_id
	from access_control.policy
	where name = 'Conjunto Treino' and deleted_at is null;

	if v_policy_id is null then
		insert into access_control.policy (name, description, managed)
		values (
			'Conjunto Treino',
			'Escrita em todos os escopos do ambiente de treino e leitura na administração global (SDAB). Gerenciada: não editável.',
			true
		)
		returning id into v_policy_id;
	end if;

	-- Substituição idempotente dos statements: se a política já existe, os escopos são
	-- reescritos a partir dos IDs de treino ATUAIS. Cobre o caso de o ambiente de treino
	-- ter sido recriado depois da política.
	delete from access_control.policy_statement where policy_id = v_policy_id;

	insert into access_control.policy_statement (policy_id, module, level, unit_id, kitchen_id, mess_hall_id)
	values
		-- Escrita, escopada nas sentinelas de treino.
		(v_policy_id, 'unit',               2, v_unit_id,   null,         null),
		(v_policy_id, 'local-analytics',    2, v_unit_id,   null,         null),
		(v_policy_id, 'kitchen',            2, null,        v_kitchen_id, null),
		(v_policy_id, 'kitchen-production', 2, null,        v_kitchen_id, null),
		(v_policy_id, 'messhall',           2, null,        null,         v_mess_hall_id),
		-- Leitura na SDAB e na análise sistêmica, sem escopo.
		(v_policy_id, 'global',             1, null,        null,         null),
		(v_policy_id, 'analytics',          1, null,        null,         null);
end $$;
