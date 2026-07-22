-- Efetivo base por (template, dia da semana, refeição) no cardápio semanal.
--
-- Contexto: o efetivo (comensais) tem grão natural de (dia + refeição) — "quantos
-- almoçam na terça". Até aqui o template só carregava kitchen.menu_template_items.
-- headcount_override (por-item), que nasceu como EXCEÇÃO ("frango = 450 num cardápio
-- de 400") mas, sem um efetivo base, acabou virando o único portador do número. Isso
-- forçava a conta da ATA a varrer item-a-item e PULAR itens com override nulo (que
-- então não contribuíam para a compra).
--
-- Esta tabela dá ao template um efetivo BASE por refeição; o headcount_override volta
-- a ser exceção por-item. Aquisição (calculateAtaNeeds) e produção (applyTemplate)
-- passam a derivar a demanda como `override ?? base`.
--
-- DDL idempotente (reaplicável por db:push ou MCP apply_migration).

-- ─── Tabela ───────────────────────────────────────────────────────────────────

create table if not exists kitchen.menu_template_meal (
	id                 uuid primary key default gen_random_uuid(),
	menu_template_id   uuid not null references kitchen.menu_template (id) on delete cascade,
	day_of_week        smallint not null,
	meal_type_id       uuid not null references kitchen.meal_type (id),
	base_headcount     integer,             -- comensais base da refeição; null = não informado
	created_at         timestamptz not null default now(),
	constraint menu_template_meal_day_check
		check (day_of_week between 1 and 7),
	constraint menu_template_meal_headcount_check
		check (base_headcount is null or base_headcount > 0),
	constraint menu_template_meal_unique
		unique (menu_template_id, day_of_week, meal_type_id)
);

create index if not exists menu_template_meal_template_idx
	on kitchen.menu_template_meal (menu_template_id);

-- ─── Backfill ─────────────────────────────────────────────────────────────────
-- Base = média arredondada dos headcount_override preenchidos por célula (template +
-- dia + refeição). É a MESMA derivação da ponte applyTemplate, então os números
-- concordam com o que a produção já materializa. `on conflict do nothing` garante
-- reaplicação idempotente (o group by já dedup dentro do próprio insert).
insert into kitchen.menu_template_meal (menu_template_id, day_of_week, meal_type_id, base_headcount)
select menu_template_id, day_of_week, meal_type_id, round(avg(headcount_override))::int
from kitchen.menu_template_items
where day_of_week is not null
	and meal_type_id is not null
	and headcount_override is not null
group by menu_template_id, day_of_week, meal_type_id
on conflict (menu_template_id, day_of_week, meal_type_id) do nothing;

-- ─── Exposição PostgREST / realtime ───────────────────────────────────────────
-- Espelha as demais tabelas de kitchen. Acesso principal é via Drizzle (server fn,
-- conexão direta que ignora RLS); as grants abaixo servem PostgREST/realtime.
alter table kitchen.menu_template_meal enable row level security;
do $$
begin
	if not exists (
		select 1 from pg_policies
		where schemaname = 'kitchen' and tablename = 'menu_template_meal' and policyname = 'realtime_select'
	) then
		create policy "realtime_select" on kitchen.menu_template_meal
			as permissive for select to authenticated using (true);
	end if;
end $$;

grant select on kitchen.menu_template_meal to authenticated, anon;
grant all on kitchen.menu_template_meal to service_role;

notify pgrst, 'reload schema';
