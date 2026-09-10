-- sucont_notification_tick_honest_counters
-- Duas correções em `sucont.run_notification_tick`, as duas encontradas rodando o
-- job de verdade contra o cronograma real:
--
--   1. `frozen` contava VOLTAS DO LOOP, não linhas gravadas. Na segunda execução do
--      mesmo dia o job devolvia `{"frozen": 7, "notified": 0}` — o `notified` já
--      dizia a verdade (o índice único barrou tudo), mas o `frozen` afirmava ter
--      congelado sete competências que já estavam congeladas. É o único retorno que
--      o operador vê em `cron.job_run_details`; um contador que mente ali manda
--      investigar duplicata que não existe.
--
--   2. Tarefa NOVA recebia prazo perdido de antes de existir. A janela olha dez
--      dias para trás e o período era calculado só a partir da recorrência: uma
--      tarefa semanal cadastrada hoje ganhava, no tick de amanhã, um "venceu sem
--      registro de execução" da semana passada — sobre uma tarefa que ninguém tinha
--      como ter cumprido. O corte é a data de criação do item.

create or replace function sucont.run_notification_tick()
returns jsonb
language plpgsql
as $$
declare
	hoje date := sucont.today();
	frozen integer := 0;
	notified integer := 0;
	purged integer;
	inserted integer;
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
		  -- Prazo anterior ao cadastro da tarefa não é prazo perdido: é prazo que
		  -- não existiu.
		  and p.due_on >= ci.created_at::date
		  and not exists (
			  select 1 from sucont.checklist_occurrence o
			  where o.item_id = ci.id and o.competencia = p.competencia and o.done_at is not null
		  )
		order by ci.id, p.competencia, p.due_on
	loop
		insert into sucont.checklist_occurrence (item_id, competencia, due_on)
		values (r.id, r.competencia, r.due_on)
		on conflict (item_id, competencia) do nothing;
		get diagnostics inserted = row_count;
		frozen := frozen + inserted;

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

revoke execute on function sucont.run_notification_tick() from public, anon, authenticated;
grant execute on function sucont.run_notification_tick() to service_role;
