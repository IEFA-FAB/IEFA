-- sucont_overdue_notifies_assignees
-- Dois achados da revisão do PR #319.
--
-- 1. `prazo_perdido` fazia fan-out para a SEÇÃO INTEIRA, ignorando a tabela de
--    responsáveis que o mesmo PR introduziu. Uma tarefa que responde só ao
--    KLEBSON acendia a bolinha vermelha dos cinco — com uma notificação que os
--    outros quatro não têm como resolver, porque marcar a execução não é deles.
--    É exatamente o ruído que a purga existe para evitar, chegando pela porta da
--    frente.
--
--    A regra agora segue o dado: havendo responsável designado, notifica ELES;
--    `assign_to_all` (o antigo "Cada Responsável") ou tarefa sem dono continuam
--    indo para a seção, porque aí a pendência é de todos mesmo.
--
--    (O degrau que falta — o que fazer quando o responsável não tem conta — é
--    fechado logo depois, em 20260910234731.)
--
-- 2. Recadastrar alguém que saiu da seção batia em 23505. O índice único é sobre
--    `core.person_name_key(display_name)`, uma expressão — e expressão não é
--    filtrável pelo PostgREST, então a server function não tinha como procurar a
--    pessoa existente antes de inserir. A chave vira COLUNA GERADA: mesma fonte
--    (a função), agora consultável.

-- ── A chave de nome vira coluna ──────────────────────────────────────────────
alter table core.person
	add column name_key text generated always as (core.person_name_key(display_name)) stored;

comment on column core.person.name_key is
	'Chave de comparação de nome (sem posto, sem acento, sem caixa), derivada de display_name. Existe como coluna para ser filtrável pelo PostgREST — o índice único sobre a expressão não era.';

drop index core.person_name_key_idx;
create unique index person_name_key_idx on core.person (name_key) where active;

-- ── O tick notifica quem responde pela tarefa ────────────────────────────────
create or replace function sucont.run_notification_tick()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
	hoje date := sucont.today();
	frozen integer := 0;
	notified integer := 0;
	purged integer;
	inserted integer;
	r record;
	a record;
	corpo text;
begin
	for r in
		select distinct on (ci.id, p.competencia)
			ci.id, ci.task, ci.deadline, ci.assign_to_all, p.competencia, p.due_on
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

		corpo := 'Prazo ' || coalesce(r.deadline, 'da tarefa') || ' venceu em ' || to_char(r.due_on, 'DD/MM/YYYY') || ' sem registro de execução.';

		if r.assign_to_all or not exists (select 1 from sucont.checklist_item_assignee x where x.item_id = r.id) then
			notified := notified + sucont.notify_section('prazo_perdido', r.task, corpo, '/workspace', r.id, r.competencia);
		else
			for a in select person_id from sucont.checklist_item_assignee x where x.item_id = r.id loop
				notified := notified + sucont.notify_person(a.person_id, 'prazo_perdido', r.task, corpo, '/workspace', r.id, r.competencia);
			end loop;
		end if;
	end loop;

	purged := sucont.purge_notifications();
	return jsonb_build_object('frozen', frozen, 'notified', notified, 'purged', purged);
end;
$$;

revoke execute on function sucont.run_notification_tick() from public, anon, authenticated;
grant execute on function sucont.run_notification_tick() to service_role;

notify pgrst, 'reload schema';
