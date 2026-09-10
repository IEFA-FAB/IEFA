-- sucont_notifications_brasilia_date
-- O banco roda em UTC (`show timezone` = UTC), e `current_date` foi usado como se
-- fosse "hoje" em 20260910190600. Entre 21:00 e 00:00 de Brasília o servidor já
-- está no dia seguinte, e nessas três horas por dia:
--
--   • no último dia do mês, `checklist_current` saltava para a competência do mês
--     QUE VEM — a tela mostrava o prazo de outubro na noite de 30 de setembro;
--   • no domingo à noite, o item semanal pulava para a semana seguinte;
--   • `run_notification_tick` (agendado às 11:00 UTC, fora da janela) escapava
--     hoje, mas herdaria o mesmo erro em qualquer reexecução manual à noite.
--
-- "2º dia útil do mês" é prazo de SIAFI em horário de Brasília. A conversão fica
-- numa função só, para não haver um segundo lugar por onde o UTC volte.

create or replace function sucont.today()
returns date
language sql
stable
as $$
	select (now() at time zone 'America/Sao_Paulo')::date
$$;

revoke execute on function sucont.today() from public, anon, authenticated;
grant execute on function sucont.today() to service_role;

create or replace view sucont.checklist_current
with (security_invoker = true)
as
select
	ci.id,
	ci.task,
	ci.deadline,
	ci.description,
	ci.responsible,
	ci.path,
	ci.recurrence,
	ci.business_day,
	ci.sort_order,
	ci.created_at,
	ci.updated_at,
	p.competencia,
	p.due_on,
	o.done_at,
	o.done_by
from sucont.checklist_item ci
cross join lateral sucont.checklist_period(ci.recurrence, ci.business_day, sucont.today()) p
left join sucont.checklist_occurrence o on o.item_id = ci.id and o.competencia = p.competencia;

create or replace function sucont.run_notification_tick()
returns jsonb
language plpgsql
as $$
declare
	hoje date := sucont.today();
	frozen integer := 0;
	notified integer := 0;
	purged integer;
	r record;
begin
	for r in
		select distinct on (ci.id, p.competencia)
			ci.id, ci.task, ci.deadline, p.competencia, p.due_on
		from sucont.checklist_item ci
		cross join lateral generate_series(hoje - 15, hoje, interval '1 day') as ref(d)
		cross join lateral sucont.checklist_period(ci.recurrence, ci.business_day, ref.d::date) p
		where p.due_on < hoje
		  and p.due_on >= hoje - 10
		  and not exists (
			  select 1 from sucont.checklist_occurrence o
			  where o.item_id = ci.id and o.competencia = p.competencia and o.done_at is not null
		  )
		order by ci.id, p.competencia, p.due_on
	loop
		insert into sucont.checklist_occurrence (item_id, competencia, due_on)
		values (r.id, r.competencia, r.due_on)
		on conflict (item_id, competencia) do nothing;
		frozen := frozen + 1;

		notified := notified + sucont.notify_section(
			'prazo_perdido',
			r.task,
			'Prazo ' || coalesce(r.deadline, 'da tarefa') || ' venceu em ' || to_char(r.due_on, 'DD/MM/YYYY') || ' sem registro de execução.',
			'/workspace',
			r.id,
			r.competencia
		);
	end loop;

	purged := sucont.purge_notifications();
	return jsonb_build_object('frozen', frozen, 'notified', notified, 'purged', purged);
end;
$$;

grant select on sucont.checklist_current to service_role;

notify pgrst, 'reload schema';
