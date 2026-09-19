-- Escolha de vaga com teto aplicado no banco (auditoria de 2026-09-19).
--
-- `updatePersonFn` gravava `localidade`/`hide_card` direto na linha do militar, sem
-- olhar `vacancy.total_vagas` nem se a OM pertence à edição. Resultado: a OM ficava
-- com mais confirmados do que vagas — por erro de operador, por OM fora do quadro da
-- edição (o seletor oferece todas as localidades FAB, não só as da edição) ou por dois
-- controladores confirmando ao mesmo tempo (os dois contavam antes de qualquer um gravar).
--
-- A função trava a linha do militar e as linhas de vaga da OM (`for update`) antes de
-- contar: dois controladores confirmando na mesma OM se enfileiram na trava da vaga, e o
-- segundo conta já com a gravação do primeiro. A ordem de trava é sempre militar → vaga,
-- então duas chamadas não se travam em cruz.
--
-- `p_changes` carrega só os campos de escolha (`localidade`, `estado`, `hide_card`);
-- chave ausente = não mexe. Os demais campos do militar seguem pelo update comum do
-- servidor, que não consome vaga.
--
-- SECURITY INVOKER: quem chama é o servidor com service_role (que já escreve na tabela).
-- Execução só para service_role — `revoke … from public` porque anon/authenticated
-- herdam de PUBLIC, e o schema está exposto no PostgREST.

create or replace function assignment_selection.apply_person_choice(p_person_id bigint, p_changes jsonb)
returns assignment_selection.person
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_person assignment_selection.person;
	v_localidade text;
	v_estado text;
	v_hide_card boolean;
	v_total integer;
	v_confirmed integer;
begin
	if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
		raise exception 'Alteração de escolha inválida' using errcode = 'invalid_parameter_value';
	end if;
	if exists (
		select 1 from jsonb_object_keys(p_changes) as k(key)
		where k.key not in ('localidade', 'estado', 'hide_card')
	) then
		raise exception 'Alteração de escolha inválida' using errcode = 'invalid_parameter_value';
	end if;

	select * into v_person
	from assignment_selection.person
	where id = p_person_id
	for update;
	if not found then
		raise exception 'Militar não encontrado' using errcode = 'no_data_found';
	end if;

	v_localidade := case when p_changes ? 'localidade' then nullif(btrim(p_changes ->> 'localidade'), '') else v_person.localidade end;
	v_estado := case when p_changes ? 'estado' then p_changes ->> 'estado' else v_person.estado end;
	v_hide_card := case when p_changes ? 'hide_card' then coalesce((p_changes ->> 'hide_card')::boolean, v_person.hide_card) else v_person.hide_card end;

	-- OM nova precisa estar no quadro de vagas da edição do militar. Só checa quando a
	-- OM muda, ou quando a escolha passa a ser confirmada — editar outro campo de quem
	-- já estava gravado antes desta função não é bloqueado pelo passado.
	if v_localidade is not null
		and (v_localidade is distinct from v_person.localidade or (v_hide_card and not v_person.hide_card))
	then
		perform 1
		from assignment_selection.vacancy v
		where v.edition_id = v_person.edition_id
			and v.om = v_localidade
		order by v.id
		for update;
		if not found then
			raise exception 'A OM % não tem vaga nesta edição', v_localidade using errcode = 'check_violation';
		end if;

		if v_hide_card then
			select coalesce(sum(v.total_vagas), 0) into v_total
			from assignment_selection.vacancy v
			where v.edition_id = v_person.edition_id
				and v.om = v_localidade;

			select count(*) into v_confirmed
			from assignment_selection.person p
			where p.edition_id = v_person.edition_id
				and p.localidade = v_localidade
				and p.hide_card
				and p.id <> v_person.id;

			if v_confirmed >= v_total then
				raise exception 'Sem vaga disponível em % (% de % já confirmadas)', v_localidade, v_confirmed, v_total
					using errcode = 'check_violation';
			end if;
		end if;
	end if;

	update assignment_selection.person
	set localidade = v_localidade,
		estado = v_estado,
		hide_card = v_hide_card
	where id = v_person.id
	returning * into v_person;

	return v_person;
end;
$$;

revoke all on function assignment_selection.apply_person_choice(bigint, jsonb) from public, anon, authenticated;
grant execute on function assignment_selection.apply_person_choice(bigint, jsonb) to service_role;

notify pgrst, 'reload schema';
