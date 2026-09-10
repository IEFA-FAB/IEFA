-- sucont_overdue_falls_back_to_section
-- Complemento de 20260910234119, encontrado rodando o tick depois da mudança:
-- mirar só os responsáveis derrubou o total de 35 para 20 notificações, e as 15
-- que sumiram eram as das três tarefas cujos responsáveis NÃO TÊM CONTA.
--
-- Ou seja: o prazo de SIAFI vencido de quem ainda não foi vinculado a uma conta
-- passaria despercebido por todo mundo. Trocar ruído por cegueira é pior negócio
-- — o ruído o usuário aprende a filtrar, o prazo perdido em silêncio ninguém
-- recupera.
--
-- A regra final tem três degraus, do mais específico para o mais amplo:
--   1. tem responsável designado com conta  → notifica ELES;
--   2. tem responsável, mas nenhum com conta → cai para a seção, senão ninguém vê;
--   3. `assign_to_all` ou tarefa sem dono    → seção, porque a pendência é de todos.
--
-- O degrau 2 desaparece sozinho conforme as contas forem vinculadas na tela de
-- pessoas: ele é a ponte, não o destino.

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
	entregues integer;
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

		entregues := 0;
		if not r.assign_to_all then
			for a in select person_id from sucont.checklist_item_assignee x where x.item_id = r.id loop
				entregues := entregues + sucont.notify_person(a.person_id, 'prazo_perdido', r.task, corpo, '/workspace', r.id, r.competencia);
			end loop;
		end if;

		-- Zero entregas significa uma de duas coisas — não há responsável, ou
		-- nenhum deles tem conta —, e as duas pedem a mesma saída: a seção.
		if entregues = 0 then
			entregues := sucont.notify_section('prazo_perdido', r.task, corpo, '/workspace', r.id, r.competencia);
		end if;

		notified := notified + entregues;
	end loop;

	purged := sucont.purge_notifications();
	return jsonb_build_object('frozen', frozen, 'notified', notified, 'purged', purged);
end;
$$;

revoke execute on function sucont.run_notification_tick() from public, anon, authenticated;
grant execute on function sucont.run_notification_tick() to service_role;
