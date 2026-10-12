-- Condução que confere o estado que a tela viu (regra "Edição sem perda", AGENTS.md).
--
-- Duas funções: `apply_person_choice` ganha `p_expected`, e `call_person` nasce para que
-- chamar um militar ao telão seja uma transação só, também com `p_expected`.
--
-- ## apply_person_choice
--
-- O controle novo do telão revela, confirma e desfaz mandando flags absolutas. Com dois
-- controladores abertos, a tela que ficou para trás sobrescrevia o passo que o outro já
-- tinha dado: um "desfazer confirmação" velho reabria um militar confirmado de novo, um
-- "confirmar" velho confirmava a OM que o militar acabara de trocar.
--
-- `p_expected` (opcional) leva as flags e a OM que a tela viu (`localidade`, `show_card`,
-- `show_om`, `hide_card`). Depois da trava do militar (`for update`), cada chave presente
-- é comparada com a linha travada; divergência levanta `serialization_failure` (40001) e
-- nada é gravado. Chave ausente não é conferida; `p_expected` nulo mantém o comportamento
-- de `20261011120000` (sem teto de vagas, OM tem de estar no quadro da edição).
--
-- Assinatura nova: `create or replace` com um parâmetro a mais criaria uma SEGUNDA função
-- (sobrecarga), e o PostgREST passaria a ter duas candidatas para a mesma chamada. Por
-- isso o `drop` da versão de dois parâmetros antes. Mesmo SECURITY INVOKER, `search_path`
-- fixo e execução só para service_role.

drop function assignment_selection.apply_person_choice(bigint, jsonb);

create function assignment_selection.apply_person_choice(p_person_id bigint, p_changes jsonb, p_expected jsonb default null)
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
	if p_expected is not null and (
		jsonb_typeof(p_expected) <> 'object'
		or exists (
			select 1 from jsonb_object_keys(p_expected) as k(key)
			where k.key not in ('localidade', 'show_card', 'show_om', 'hide_card')
		)
	) then
		raise exception 'Estado esperado inválido' using errcode = 'invalid_parameter_value';
	end if;

	select * into v_person
	from assignment_selection.person
	where id = p_person_id
	for update;
	if not found then
		raise exception 'Militar não encontrado' using errcode = 'no_data_found';
	end if;

	-- Com a linha travada, ninguém muda o militar entre esta conferência e o update abaixo.
	-- `->>` devolve NULL para o `null` do JSON, e `is distinct from` compara NULL como valor.
	if p_expected is not null and (
		(p_expected ? 'localidade' and (p_expected ->> 'localidade') is distinct from v_person.localidade)
		or (p_expected ? 'show_card' and (p_expected ->> 'show_card')::boolean is distinct from v_person.show_card)
		or (p_expected ? 'show_om' and (p_expected ->> 'show_om')::boolean is distinct from v_person.show_om)
		or (p_expected ? 'hide_card' and (p_expected ->> 'hide_card')::boolean is distinct from v_person.hide_card)
	) then
		raise exception 'O telão mudou em outro controle' using errcode = 'serialization_failure';
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
			and v.om = v_localidade;
		if not found then
			raise exception 'A OM % não tem vaga nesta edição', v_localidade using errcode = 'check_violation';
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

revoke all on function assignment_selection.apply_person_choice(bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function assignment_selection.apply_person_choice(bigint, jsonb, jsonb) to service_role;

-- ## call_person
--
-- `callPersonFn` chamava em duas instruções (acende o chamado, apaga os demais): entre
-- elas o telão podia ter dois cards, e dois controles chamando ao mesmo tempo terminavam
-- com o card de quem gravou por último em cada linha. Aqui é uma transação só:
--
-- 1. trava as linhas de `person` da edição numa ordem fixa (`order by id`), então duas
--    chamadas simultâneas se enfileiram em vez de se travarem em cruz;
-- 2. confere que o militar é da edição (`no_data_found` se não for) e, com `p_expected`,
--    que ele ainda está como a tela viu (`serialization_failure`, 40001, se não estiver);
-- 3. aplica o efeito de sempre: `show_card` e `show_om` apagados em toda a edição, e
--    `show_card` aceso no chamado (a OM dele espera a revelação). `hide_card`, OM e
--    estado não mudam.
--
-- Devolve a linha do chamado. SECURITY INVOKER, `search_path` fixo, só service_role.

create function assignment_selection.call_person(p_edition_id uuid, p_person_id bigint, p_expected jsonb default null)
returns assignment_selection.person
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_person assignment_selection.person;
begin
	if p_expected is not null and (
		jsonb_typeof(p_expected) <> 'object'
		or exists (
			select 1 from jsonb_object_keys(p_expected) as k(key)
			where k.key not in ('localidade', 'show_card', 'show_om', 'hide_card')
		)
	) then
		raise exception 'Estado esperado inválido' using errcode = 'invalid_parameter_value';
	end if;

	perform 1
	from assignment_selection.person p
	where p.edition_id = p_edition_id
	order by p.id
	for update;

	select * into v_person
	from assignment_selection.person p
	where p.id = p_person_id
		and p.edition_id = p_edition_id;
	if not found then
		raise exception 'Militar não pertence a esta edição' using errcode = 'no_data_found';
	end if;

	if p_expected is not null and (
		(p_expected ? 'localidade' and (p_expected ->> 'localidade') is distinct from v_person.localidade)
		or (p_expected ? 'show_card' and (p_expected ->> 'show_card')::boolean is distinct from v_person.show_card)
		or (p_expected ? 'show_om' and (p_expected ->> 'show_om')::boolean is distinct from v_person.show_om)
		or (p_expected ? 'hide_card' and (p_expected ->> 'hide_card')::boolean is distinct from v_person.hide_card)
	) then
		raise exception 'O telão mudou em outro controle' using errcode = 'serialization_failure';
	end if;

	update assignment_selection.person p
	set show_card = (p.id = p_person_id),
		show_om = false
	where p.edition_id = p_edition_id
		and (p.show_card or p.show_om or p.id = p_person_id);

	select * into v_person
	from assignment_selection.person p
	where p.id = p_person_id;

	return v_person;
end;
$$;

revoke all on function assignment_selection.call_person(uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function assignment_selection.call_person(uuid, bigint, jsonb) to service_role;

notify pgrst, 'reload schema';
