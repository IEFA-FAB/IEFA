-- sucont_notifications
-- Sino de notificações do hub SUCONT + o calendário e o registro de execução que
-- o sustentam.
--
-- O desenho separa DOIS papéis que é tentador colapsar num só:
--
--   • FATO — `checklist_occurrence`. Quem marcou a tarefa como feita, em que
--     competência e quando. Nunca é podado: é a resposta a "quem estava
--     responsável em setembro". Mesma lógica de `user_legal_acceptances` — a
--     prova mora na tabela do fato.
--   • CAIXA DE ENTRADA — `notification`. Artefato de ENTREGA, descartável. Some
--     depois de resolvida sem destruir evidência nenhuma, porque a evidência
--     nunca esteve aqui.
--
-- Colapsar os dois obrigaria a guardar notificação para sempre, e aí a bolinha
-- vermelha acumula lembrete de 2027 que ninguém resolve até o usuário aprender a
-- ignorá-la. O que mata a feature é o ruído, não o disco: com 31 usuários no ERP
-- inteiro, dez anos sem purga nenhuma custariam ~140 MB num banco que já tem
-- 1,3 GB.
--
-- O que NÃO é linha: "prazo vencendo". Prazo derivado de `recurrence` é
-- recomputável a qualquer momento — a view `checklist_current` responde certo
-- mesmo se ninguém abriu o app por uma semana, e um job que falhou num dia não
-- deixa buraco. O cron só grava o que NÃO é recomputável: o prazo que passou sem
-- execução (`prazo_perdido`), que é fato novo.

-- ── Calendário: feriados nacionais ────────────────────────────────────────────
-- Existe porque "2º dia útil do mês" errava em janeiro, abril, setembro e
-- novembro: a conta antiga pulava só sábado e domingo. Prazo de SIAFI que cai em
-- feriado sai errado, e errado em silêncio.
create table sucont.holiday (
	date date primary key,
	name text not null,
	movable boolean not null default false
);

-- Fixos (Lei 662/1949, 6.802/1980, 10.607/2002 e 14.759/2024 — 20/11).
insert into sucont.holiday (date, name)
select make_date(anos.ano, fixos.mes, fixos.dia), fixos.nome
from generate_series(2026, 2035) as anos(ano)
cross join (values
	(1, 1, 'Confraternização Universal'),
	(4, 21, 'Tiradentes'),
	(5, 1, 'Dia do Trabalho'),
	(9, 7, 'Independência'),
	(10, 12, 'Nossa Senhora Aparecida'),
	(11, 2, 'Finados'),
	(11, 15, 'Proclamação da República'),
	(11, 20, 'Consciência Negra'),
	(12, 25, 'Natal')
) as fixos(mes, dia, nome)
on conflict (date) do nothing;

-- Móveis, derivadas da Páscoa. Só a Páscoa é número mágico aqui — e é conferível
-- numa efeméride. Carnaval e Corpus Christi não são feriado nacional na letra da
-- lei, mas são dia sem expediente bancário e sem movimento no SIAFI: contá-los
-- como dia útil produziria o mesmo prazo errado que o fim de semana produzia.
insert into sucont.holiday (date, name, movable)
select pascoa + offset_dias, nome, true
from (values
	(date '2026-04-05'), (date '2027-03-28'), (date '2028-04-16'), (date '2029-04-01'),
	(date '2030-04-21'), (date '2031-04-13'), (date '2032-03-28'), (date '2033-04-17'),
	(date '2034-04-09'), (date '2035-03-25')
) as p(pascoa)
cross join (values
	(-48, 'Carnaval (segunda-feira)'),
	(-47, 'Carnaval (terça-feira)'),
	(-2, 'Sexta-feira Santa'),
	(60, 'Corpus Christi')
) as m(offset_dias, nome)
on conflict (date) do nothing;

-- ── Dias úteis ────────────────────────────────────────────────────────────────
-- Fonte ÚNICA da conta de dia útil. O app não recalcula: lê `due_on` da view
-- abaixo. Duas implementações da mesma regra — uma em SQL para o cron e outra em
-- TypeScript para a tela — divergiriam no primeiro feriado móvel.
create or replace function sucont.business_days(p_month date)
returns setof date
language sql
stable
as $$
	select d::date
	from generate_series(
		date_trunc('month', p_month)::date,
		(date_trunc('month', p_month) + interval '1 month' - interval '1 day')::date,
		interval '1 day'
	) as d
	where extract(isodow from d) < 6
	  and not exists (select 1 from sucont.holiday h where h.date = d::date)
	order by d
$$;

create or replace function sucont.nth_business_day(p_month date, p_n integer)
returns date
language sql
stable
as $$
	select d
	from sucont.business_days(p_month) d
	where p_n is not null
	offset greatest(coalesce(p_n, 1) - 1, 0)
	limit 1
$$;

create or replace function sucont.last_business_day(p_month date)
returns date
language sql
stable
as $$
	select max(d) from sucont.business_days(p_month) d
$$;

-- ── Recorrência do checklist: coluna, não texto livre ─────────────────────────
-- `deadline` era a única fonte, e a tela extraía o número dele com /(\d+)/. Isso
-- lia o "1" de "1x por semana" e anunciava, para uma tarefa SEMANAL, a data do 1º
-- dia útil do mês. O texto segue existindo como RÓTULO — é o que o operador
-- escreveu e reconhece —, mas quem manda na data passa a ser a coluna.
alter table sucont.checklist_item
	add column recurrence text not null default 'monthly'
		check (recurrence in ('monthly_business_day', 'monthly', 'weekly')),
	add column business_day integer
		check (business_day is null or business_day between 1 and 23);

update sucont.checklist_item
set recurrence = 'monthly_business_day',
    business_day = (regexp_match(deadline, '(\d+)\s*[º°o]?\s*dia'))[1]::integer
where deadline ~* 'dia\s+[uú]til';

update sucont.checklist_item
set recurrence = 'weekly'
where recurrence = 'monthly' and deadline ~* 'semana';

-- Só depois do backfill: a checagem cruzada reprovaria as linhas do seed.
alter table sucont.checklist_item
	add constraint checklist_item_business_day_matches_recurrence
	check ((recurrence = 'monthly_business_day') = (business_day is not null));

-- `done` nasceu no schema e nunca foi lido nem escrito por linha de código
-- nenhuma — um booleano único para uma tarefa que se repete todo mês não tem como
-- significar nada. A execução por competência é `checklist_occurrence`.
alter table sucont.checklist_item drop column done;

-- ── FATO: execução do checklist por competência ───────────────────────────────
-- Nunca podada. `due_on` fica CONGELADO na linha: mudar a recorrência do item
-- depois não pode reescrever o prazo que valia em setembro.
create table sucont.checklist_occurrence (
	item_id uuid not null references sucont.checklist_item (id) on delete cascade,
	competencia date not null,
	due_on date not null,
	done_at timestamptz,
	done_by uuid,
	created_at timestamptz not null default now(),
	primary key (item_id, competencia)
);
create index checklist_occurrence_due_idx on sucont.checklist_occurrence (due_on desc);

-- ── Período corrente de um item ───────────────────────────────────────────────
create or replace function sucont.checklist_period(p_recurrence text, p_business_day integer, p_on date)
returns table (competencia date, due_on date)
language sql
stable
as $$
	select
		c.competencia,
		case p_recurrence
			when 'weekly' then coalesce(
				(
					select max(d)::date
					from generate_series(c.competencia, c.competencia + 4, interval '1 day') d
					where extract(isodow from d) < 6
					  and not exists (select 1 from sucont.holiday h where h.date = d::date)
				),
				c.competencia + 4
			)
			when 'monthly_business_day' then coalesce(
				sucont.nth_business_day(c.competencia, p_business_day),
				sucont.last_business_day(c.competencia)
			)
			else sucont.last_business_day(c.competencia)
		end
	from (
		select case p_recurrence
			when 'weekly' then date_trunc('week', p_on)::date
			else date_trunc('month', p_on)::date
		end as competencia
	) c
$$;

-- Checklist com o período corrente resolvido — o que a tela e o sino leem.
-- `security_invoker` é obrigatório: sem ele a view roda como o dono (postgres) e
-- devolve linha que a RLS do chamador negaria.
create view sucont.checklist_current
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
cross join lateral sucont.checklist_period(ci.recurrence, ci.business_day, current_date) p
left join sucont.checklist_occurrence o on o.item_id = ci.id and o.competencia = p.competencia;

-- ── CAIXA DE ENTRADA: notificações ────────────────────────────────────────────
-- Uma linha por DESTINATÁRIO (fan-out na escrita). Endereçada por `user_id`
-- porque caixa de entrada só existe para quem tem conta — a pessoa sem conta
-- (`3S TALITA` e `SGT IARA` operam UG e checklist sem nunca ter logado) aparece
-- no `responsible` do item, não aqui. Notificação de atribuição depende do
-- cadastro `sucont.person`, que ainda não existe.
--
-- Dois carimbos, e eles NÃO são a mesma coisa:
--   • `read_at`     — a pessoa viu.
--   • `resolved_at` — o fato deixou de ser verdade (aviso apagado, tarefa feita).
-- Notificação resolve sem ser lida o tempo todo. Um carimbo só faria o contador
-- mentir e a purga apagar cedo demais.
create table sucont.notification (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	kind text not null check (kind in ('aviso', 'prazo_perdido')),
	title text not null,
	body text,
	href text,
	subject_id uuid,
	occurrence_on date,
	created_at timestamptz not null default now(),
	read_at timestamptz,
	resolved_at timestamptz
);

-- Idempotência do fan-out e do cron. `nulls not distinct` é o ponto: sem ele o
-- `occurrence_on` nulo do aviso escapa do índice e o job que roda duas vezes —
-- ou que é reexecutado à mão para testar — duplica tudo. Limpar duplicata em
-- produção é caro; o índice é de graça.
create unique index notification_dedup_idx
	on sucont.notification (user_id, kind, subject_id, occurrence_on)
	nulls not distinct
	where subject_id is not null;

-- O teto de itens é da CONSULTA (limit no select do sino), não do storage.
create index notification_inbox_idx on sucont.notification (user_id, created_at desc);

-- Audiência: quem tem grant vivo em alguma divisão do SUCONT. Fica em função
-- para que o gatilho de aviso e o cron usem a MESMA definição de "a seção".
-- `security invoker` de propósito: os dois chamadores (service role e o cron, que
-- roda como postgres) já enxergam a tabela, e uma definer numa schema exposta ao
-- PostgREST viraria enumeração de usuários por RPC.
create or replace function sucont.notification_audience()
returns setof uuid
language sql
stable
as $$
	select distinct p.user_id
	from access_control.user_permissions p
	where p.module in ('sucont-1', 'sucont-3', 'sucont-4')
	  and p.level >= 1
	  and (p.expires_at is null or p.expires_at > now())
$$;

create or replace function sucont.notify_section(
	p_kind text,
	p_title text,
	p_body text,
	p_href text,
	p_subject_id uuid,
	p_occurrence_on date
)
returns integer
language plpgsql
as $$
declare
	inserted integer;
begin
	insert into sucont.notification (user_id, kind, title, body, href, subject_id, occurrence_on)
	select u, p_kind, p_title, p_body, p_href, p_subject_id, p_occurrence_on
	from sucont.notification_audience() u
	on conflict do nothing;
	get diagnostics inserted = row_count;
	return inserted;
end;
$$;

-- ── Gatilhos: quem escreve e quem resolve ─────────────────────────────────────
-- Em gatilho, e não na server function, porque `resolved_at` só é confiável se
-- for verdade por QUALQUER caminho de escrita — inclusive um UPDATE feito pelo
-- MCP ou pelo console. Um `resolved_at` que depende de alguém lembrar de chamar
-- vira contador mentiroso, e é o contador que a purga usa.
create or replace function sucont.notice_notify()
returns trigger
language plpgsql
as $$
begin
	perform sucont.notify_section(
		'aviso',
		case new.type when 'alert' then 'Novo alerta da seção' else 'Novo aviso da seção' end,
		new.content,
		'/workspace',
		new.id,
		null
	);
	return new;
end;
$$;
create trigger notice_notify_ai after insert on sucont.notice
	for each row execute function sucont.notice_notify();

create or replace function sucont.notice_resolve()
returns trigger
language plpgsql
as $$
begin
	update sucont.notification
	set resolved_at = now()
	where kind = 'aviso' and subject_id = old.id and resolved_at is null;
	return old;
end;
$$;
create trigger notice_resolve_ad after delete on sucont.notice
	for each row execute function sucont.notice_resolve();

create or replace function sucont.occurrence_resolve()
returns trigger
language plpgsql
as $$
begin
	if new.done_at is null then
		return new;
	end if;
	update sucont.notification
	set resolved_at = now()
	where kind = 'prazo_perdido'
	  and subject_id = new.item_id
	  and occurrence_on = new.competencia
	  and resolved_at is null;
	return new;
end;
$$;
create trigger occurrence_resolve_aiu after insert or update on sucont.checklist_occurrence
	for each row execute function sucont.occurrence_resolve();

-- ── Purga ─────────────────────────────────────────────────────────────────────
-- Não é economia de disco — o disco não é problema aqui. É higiene do sino (a
-- bolinha vermelha precisa significar algo) e é LGPD: linha de notificação é
-- trilha de atividade de pessoa identificada, e prazo fixo é declarável na
-- Política de Privacidade de um jeito que "guardamos as últimas 100" não é.
--
-- `coalesce(resolved_at, read_at)` e não só `read_at`: notificação resolvida sem
-- ser lida (o aviso foi apagado antes de a pessoa abrir o sino) não tem por que
-- esperar 180 dias.
create or replace function sucont.purge_notifications()
returns integer
language plpgsql
as $$
declare
	removed integer;
begin
	delete from sucont.notification
	where coalesce(resolved_at, read_at) < now() - interval '30 days'
	   or created_at < now() - interval '180 days';
	get diagnostics removed = row_count;
	return removed;
end;
$$;

-- ── O tick diário ─────────────────────────────────────────────────────────────
-- Congela o vencido e purga. A janela de 10 dias tem dois papéis: cobre a semana
-- e o começo de mês inteiros mesmo se o job falhar alguns dias seguidos, e impede
-- que a PRIMEIRA execução desenterre meses de prazo perdido histórico e entregue
-- um sino com 40 itens no dia da estreia.
create or replace function sucont.run_notification_tick()
returns jsonb
language plpgsql
as $$
declare
	frozen integer := 0;
	notified integer := 0;
	purged integer;
	r record;
begin
	for r in
		select distinct on (ci.id, p.competencia)
			ci.id, ci.task, ci.deadline, p.competencia, p.due_on
		from sucont.checklist_item ci
		cross join lateral generate_series(current_date - 15, current_date, interval '1 day') as ref(d)
		cross join lateral sucont.checklist_period(ci.recurrence, ci.business_day, ref.d::date) p
		where p.due_on < current_date
		  and p.due_on >= current_date - 10
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

-- ── RLS e grants ──────────────────────────────────────────────────────────────
-- RLS ligada e NENHUMA policy, nenhum grant a anon/authenticated: é a postura do
-- schema desde 20260825160953, que removeu as dez policies `auth read *` do
-- sucont justamente porque davam leitura destes dados a qualquer usuário logado
-- de qualquer app do monorepo. Todo acesso passa por server function com service
-- key, e a autorização mora no PBAC.
--
-- Vale em dobro para `notification`: caixa de entrada é pessoal, e uma policy
-- `using (true)` copiada do padrão antigo entregaria a de todo mundo.
alter table sucont.holiday               enable row level security;
alter table sucont.checklist_occurrence  enable row level security;
alter table sucont.notification          enable row level security;

grant all on sucont.holiday, sucont.checklist_occurrence, sucont.notification to service_role;
grant select on sucont.checklist_current to service_role;

-- Função em schema exposta ao PostgREST nasce com EXECUTE para PUBLIC — o
-- `alter default privileges` não alcança isso (ver 20260825160953, limite "b").
-- Nenhuma destas pode ser chamável pelo browser: `notify_section` posta na caixa
-- de entrada de toda a seção e `run_notification_tick` grava o fato.
revoke execute on function
	sucont.business_days(date),
	sucont.nth_business_day(date, integer),
	sucont.last_business_day(date),
	sucont.checklist_period(text, integer, date),
	sucont.notification_audience(),
	sucont.notify_section(text, text, text, text, uuid, date),
	sucont.purge_notifications(),
	sucont.run_notification_tick()
from public, anon, authenticated;

grant execute on function
	sucont.business_days(date),
	sucont.nth_business_day(date, integer),
	sucont.last_business_day(date),
	sucont.checklist_period(text, integer, date),
	sucont.notification_audience(),
	sucont.notify_section(text, text, text, text, uuid, date),
	sucont.purge_notifications(),
	sucont.run_notification_tick()
to service_role;

-- ── Agendamento ───────────────────────────────────────────────────────────────
-- O job mora AQUI, na migration, e não no console do Supabase: agendado pela
-- interface ele vira estado de banco fora do git, que é exatamente a armadilha
-- do `terraform apply` do alpha e do histórico de migration aplicado por MCP.
--
-- 11:00 UTC = 08:00 em Brasília. O pg_cron roda em UTC e "2º dia útil" é horário
-- de Brasília.
do $$
begin
	perform cron.unschedule('sucont-notification-tick')
	where exists (select 1 from cron.job where jobname = 'sucont-notification-tick');

	perform cron.schedule('sucont-notification-tick', '0 11 * * *', $cron$select sucont.run_notification_tick()$cron$);
end;
$$;

notify pgrst, 'reload schema';
