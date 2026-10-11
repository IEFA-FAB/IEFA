-- Escolha de vaga sem teto (pedido do mantenedor, 2026-10-11).
--
-- Na escolha real, as OMs são perguntadas e preenchidas antes do evento, e no dia o
-- sistema só revela, por classificação. Qualquer militar pode mudar a escolha na hora,
-- e o controle não deve recusar OM que já atingiu `total_vagas`: o teto de
-- `20260921160500` fazia a confirmação falhar com "Sem vaga disponível" no meio da
-- cerimônia. O quadro do telão segue contando só os confirmados (`hide_card`) e mostra
-- a OM acima do total como está.
--
-- Fica a outra metade da função: a OM tem de estar no quadro de vagas da edição (o
-- controle só oferece essas). Sem contagem, a trava `for update` das linhas de vaga não
-- protege mais nada e sai; a do militar continua, porque a escolha lê e grava a linha.
--
-- Mesma assinatura, mesmo SECURITY INVOKER, `search_path` fixo e execução só para
-- service_role.

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

revoke all on function assignment_selection.apply_person_choice(bigint, jsonb) from public, anon, authenticated;
grant execute on function assignment_selection.apply_person_choice(bigint, jsonb) to service_role;

notify pgrst, 'reload schema';
