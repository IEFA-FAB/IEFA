-- core_person_registry
-- Cadastro de PESSOA do ERP, no `core` — ao lado de `user_data` e
-- `user_military_data`, não dentro de um app.
--
-- ── Por que uma tabela nova, e não uma das duas que já existem ────────────────
--
--   • `core.user_military_data` (68.316 linhas, PK `nrCpf`) é o efetivo da FAB.
--     Espelho de origem externa, só leitura. Tem TODO militar — inclusive quem
--     nunca abriu o ERP.
--   • `core.user_data` (1.426 linhas, PK = `auth.users.id`, `email NOT NULL`) é a
--     CONTA. A linha só nasce no login.
--
-- Falta o meio: a pessoa que a seção precisa NOMEAR e que pode não ter conta
-- nenhuma. Na SUCONT são três os operadores de UG e nenhum deles é conta — o
-- módulo tem 4 grants, e dois deles nunca logaram. `core.user_data` não comporta
-- essa pessoa: `email` é NOT NULL e o `id` é FK de `auth.users`.
--
-- ── Por que `nr_ordem` é a chave, e o nome NÃO é ─────────────────────────────
--
-- O campo livre dizia "3S VANESSA". No efetivo da FAB, `nmGuerra = 'VANESSA'` com
-- `sgPosto = '3S'` casa com QUATORZE pessoas diferentes; "3S TALITA", com cinco.
-- Nome mais posto não identifica ninguém — por isso o vínculo é feito por SARAM,
-- por um humano, e nunca adivinhado por casamento de nome. O backfill abaixo
-- deliberadamente NÃO tenta resolver SARAM: ele só dá identidade estável ao texto
-- que já existia, e deixa `nr_ordem` nulo para a tela de pessoas preencher.
--
-- `nrOrdem` serve como chave: no espelho ele é único e completo (68.316 valores
-- distintos em 68.316 linhas, zero nulos), mesmo a coluna estando declarada
-- nullable e sem constraint. A unicidade que este cadastro garante é a sua:
-- `core.person.nr_ordem` é UNIQUE, então duas pessoas não reivindicam o mesmo
-- SARAM. Não há FK para `user_military_data` porque a PK de lá é `nrCpf` e o
-- espelho é sincronizado de fora — uma FK transformaria atraso de sincronismo em
-- erro de escrita aqui.
--
-- ── O que esta tabela NÃO guarda ─────────────────────────────────────────────
--
-- Nem e-mail, nem posto, nem nome de guerra: eles têm dono (`user_data` e
-- `user_military_data`) e mudam lá — posto muda com promoção. Aqui ficam só os
-- ponteiros e `display_name`, que é RESERVA: o rótulo que a seção usa enquanto
-- não há SARAM nem conta. A resolução do melhor rótulo mora numa view só.

create or replace function core.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	new.updated_at = now();
	return new;
end;
$$;

/*
 * Chave de comparação de nome: sem posto, sem acento, sem caixa.
 *
 * "3S VANESSA" e "Vanessa" são a mesma pessoa escrita de dois jeitos — as duas
 * formas conviviam no cronograma. Sem uma chave, o cadastro nasceria com a mesma
 * pessoa duas vezes e o sino a notificaria em dobro.
 *
 * IMMUTABLE de propósito, e por isso `translate` em vez de `unaccent`: o
 * `unaccent` é STABLE (depende do dicionário instalado) e não pode entrar em
 * índice. A lista de siglas é literal porque é taxonomia fechada de posto e
 * graduação, não dado de pessoa — as 32 do efetivo mais as coloquiais que o campo
 * livre usava ("SGT" não existe como sigla no espelho).
 */
create or replace function core.person_name_key(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
	select translate(
		upper(btrim(
			case
				when upper(split_part(btrim(p_name), ' ', 1)) = any (array[
					'1S','1T','2S','2T','3S','A1','A2','A3','AP','BR','C1','C2','C3','C4','CB','CL','CP',
					'G1','G2','G3','G4','GS','I1','I2','MB','MJ','S1','S2','SO','T1','TB','TC',
					'SGT','SGTO','SD','TEN','CAP','MAJ','CEL','BRIG'
				]) and strpos(btrim(p_name), ' ') > 0
					then btrim(substr(btrim(p_name), strpos(btrim(p_name), ' ') + 1))
				else btrim(p_name)
			end
		)),
		'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
		'AAAAAEEEEIIIIOOOOOUUUUCN'
	)
$$;

create table core.person (
	id uuid primary key default gen_random_uuid(),
	-- Sempre existe: é o que a tela mostra quando não há SARAM nem conta. Pessoa
	-- sem nome nenhum seria uma linha que não identifica ninguém.
	display_name text not null check (btrim(display_name) <> ''),
	nr_ordem text unique,
	user_id uuid unique references auth.users (id) on delete set null,
	-- Deixou de ser alguém que o ERP precisa nomear. Não apaga: as atribuições
	-- históricas continuam apontando para cá.
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create trigger person_updated_at before update on core.person
	for each row execute function core.set_updated_at();

-- Só entre as ativas: desativar alguém tem que liberar o nome para um homônimo
-- que chegue depois.
create unique index person_name_key_idx on core.person (core.person_name_key(display_name)) where active;

comment on table core.person is
	'Pessoa que o ERP precisa nomear, com ou sem conta. `nr_ordem` liga ao efetivo (core.user_military_data) e `user_id` à conta (auth.users); os dois são opcionais. E-mail, posto e nome de guerra NÃO moram aqui — têm dono e mudam lá.';

/*
 * Resolução do rótulo, num lugar só.
 *
 * A ordem é militar → e-mail → o nome que a seção digitou, e ela importa: o nome
 * militar é o ATUAL (muda com promoção), enquanto `display_name` congela o que
 * alguém escreveu um dia. Depois de vincular o SARAM, "SGT KLEBSON" passa a
 * aparecer com a graduação de verdade — "SGT" nem é sigla do efetivo.
 *
 * `security_invoker` é obrigatório: sem ele a view roda como o dono e devolve
 * linha que a RLS do chamador negaria.
 */
create view core.person_identity
with (security_invoker = true)
as
select
	p.id,
	p.display_name,
	p.nr_ordem,
	p.user_id,
	p.active,
	ud.email,
	umd."sgPosto" as posto,
	umd."nmGuerra" as nome_guerra,
	coalesce(
		nullif(btrim(coalesce(umd."sgPosto", '') || ' ' || coalesce(umd."nmGuerra", '')), ''),
		ud.email,
		p.display_name
	) as label
from core.person p
left join core.user_data ud on ud.id = p.user_id
left join core.user_military_data umd on umd."nrOrdem" = p.nr_ordem;

alter table core.person enable row level security;
grant all on core.person to service_role;
grant select on core.person_identity to service_role;

-- ── Quem trabalha na seção ───────────────────────────────────────────────────
-- `core.person` é do ERP inteiro; esta tabela é a fronteira do sucont. Sem ela o
-- seletor de responsável listaria toda pessoa cadastrada por qualquer app.
--
-- Sair da seção é apagar a linha daqui — e as atribuições ficam, porque elas são
-- histórico: quem era responsável em setembro segue tendo sido.
create table sucont.section_member (
	person_id uuid primary key references core.person (id) on delete cascade,
	created_at timestamptz not null default now()
);
alter table sucont.section_member enable row level security;
grant all on sucont.section_member to service_role;

-- ── Responsável do cronograma: linha, não string ─────────────────────────────
-- `checklist_item.responsible` era texto livre, e uma linha dele empacotava TRÊS
-- pessoas ("SGT KLEBSON, 3S VANESSA, SGT IARA"). Nenhuma consulta conseguia
-- responder "o que é meu", que é a pergunta que o sino precisa fazer.
create table sucont.checklist_item_assignee (
	item_id uuid not null references sucont.checklist_item (id) on delete cascade,
	-- `restrict`, não `cascade`: apagar uma pessoa que ainda responde por tarefa
	-- tem que doer. O caminho normal é desativar.
	person_id uuid not null references core.person (id) on delete restrict,
	created_at timestamptz not null default now(),
	primary key (item_id, person_id)
);
create index checklist_item_assignee_person_idx on sucont.checklist_item_assignee (person_id);
alter table sucont.checklist_item_assignee enable row level security;
grant all on sucont.checklist_item_assignee to service_role;

-- "Cada Responsável" aparecia em quatro linhas do cronograma e NÃO é uma pessoa:
-- é "vale para todo mundo". Vinculá-lo a uma pessoa fantasma faria o sino
-- notificar um cadastro que não corresponde a ninguém.
alter table sucont.checklist_item add column assign_to_all boolean not null default false;

alter table sucont.unidade_gestora add column operator_person_id uuid references core.person (id) on delete set null;
create index unidade_gestora_operator_idx on sucont.unidade_gestora (operator_person_id);

-- ── Backfill ─────────────────────────────────────────────────────────────────
-- Sem NENHUM literal de nome: tudo sai do que já está gravado. O repositório é
-- público, e mesmo os nomes já publicados não precisam de mais uma cópia.
with bruto as (
	select btrim(t) as nome
	from sucont.checklist_item, lateral unnest(string_to_array(responsible, ',')) as t
	union all
	select operador from sucont.unidade_gestora where operador is not null
),
nomes as (
	select nome
	from bruto
	where btrim(coalesce(nome, '')) <> ''
	  -- Marcador de "todo mundo", não pessoa. Reconhecido pela forma normalizada
	  -- para não depender do acento nem da caixa com que foi digitado.
	  and core.person_name_key(nome) <> 'CADA RESPONSAVEL'
),
canonico as (
	-- Entre "3S VANESSA" e "Vanessa", fica a forma com posto: é a que a seção
	-- reconhece na tela até o SARAM ser vinculado.
	select distinct on (core.person_name_key(nome)) nome as display_name
	from nomes
	order by core.person_name_key(nome), length(nome) desc, nome
)
insert into core.person (display_name)
select display_name from canonico
on conflict do nothing;

insert into sucont.section_member (person_id)
select id from core.person
on conflict do nothing;

update sucont.checklist_item ci
set assign_to_all = true
where exists (
	select 1
	from unnest(string_to_array(ci.responsible, ',')) as t
	where core.person_name_key(t) = 'CADA RESPONSAVEL'
);

insert into sucont.checklist_item_assignee (item_id, person_id)
select distinct ci.id, p.id
from sucont.checklist_item ci
cross join lateral unnest(string_to_array(ci.responsible, ',')) as t
join core.person p on core.person_name_key(p.display_name) = core.person_name_key(t)
on conflict do nothing;

update sucont.unidade_gestora ug
set operator_person_id = p.id
from core.person p
where core.person_name_key(p.display_name) = core.person_name_key(ug.operador)
  and ug.operador is not null;

-- ── Prova de não-vacuidade ───────────────────────────────────────────────────
-- Um backfill que casa zero linha é indistinguível de um que casou todas, e o
-- passo seguinte APAGA a coluna de origem. Estas checagens são a diferença entre
-- migrar e perder dado.
do $$
declare
	orfaos integer;
begin
	select count(*) into orfaos
	from sucont.checklist_item ci
	where btrim(coalesce(ci.responsible, '')) <> ''
	  and not ci.assign_to_all
	  and not exists (select 1 from sucont.checklist_item_assignee a where a.item_id = ci.id);
	if orfaos > 0 then
		raise exception 'backfill incompleto: % itens do cronograma sem responsável resolvido', orfaos;
	end if;

	select count(*) into orfaos
	from sucont.unidade_gestora
	where operador is not null and operator_person_id is null;
	if orfaos > 0 then
		raise exception 'backfill incompleto: % UGs sem operador resolvido', orfaos;
	end if;

	if (select count(*) from core.person) = 0 then
		raise exception 'backfill vazio: nenhuma pessoa cadastrada';
	end if;
	if (select count(*) from sucont.checklist_item_assignee) = 0 then
		raise exception 'backfill vazio: nenhuma atribuição de cronograma';
	end if;
end;
$$;

-- A view tem de sair ANTES: ela seleciona `responsible`, e `create or replace
-- view` não remove coluna — só recriando. Sem isto o `drop column` para em
-- "other objects depend on it" e a migration inteira volta atrás.
drop view sucont.checklist_current;

-- As colunas de origem saem: com o backfill provado total, mantê-las criaria uma
-- segunda resposta para "quem é o responsável" — e foi exatamente assim que o
-- conferente da SUCONT-3 acabou vivendo num arquivo TypeScript enquanto o
-- operador da SUCONT-4 vivia no banco.
alter table sucont.checklist_item drop column responsible;
alter table sucont.unidade_gestora drop column operador;

-- ── Cronograma com o responsável resolvido ───────────────────────────────────
create view sucont.checklist_current
with (security_invoker = true)
as
select
	ci.id,
	ci.task,
	ci.deadline,
	ci.description,
	ci.path,
	ci.recurrence,
	ci.business_day,
	ci.assign_to_all,
	ci.sort_order,
	ci.created_at,
	ci.updated_at,
	p.competencia,
	p.due_on,
	o.done_at,
	o.done_by,
	-- Em jsonb, e não em duas colunas de array: o par (id, rótulo) precisa chegar
	-- junto na tela, e um `uuid[]` alinhado a um `text[]` é convite a
	-- desalinhamento silencioso.
	coalesce(
		(
			select jsonb_agg(jsonb_build_object('id', pi.id, 'label', pi.label) order by pi.label)
			from sucont.checklist_item_assignee a
			join core.person_identity pi on pi.id = a.person_id
			where a.item_id = ci.id
		),
		'[]'::jsonb
	) as assignees
from sucont.checklist_item ci
cross join lateral sucont.checklist_period(ci.recurrence, ci.business_day, sucont.today()) p
left join sucont.checklist_occurrence o on o.item_id = ci.id and o.competencia = p.competencia;

grant select on sucont.checklist_current to service_role;

-- ── Sino: notificação de atribuição ──────────────────────────────────────────
alter table sucont.notification drop constraint notification_kind_check;
alter table sucont.notification add constraint notification_kind_check
	check (kind in ('aviso', 'prazo_perdido', 'atribuicao'));

-- O índice de deduplicação passa a ignorar linha RESOLVIDA.
--
-- Sem isso, desatribuir e reatribuir a mesma pessoa ao mesmo item nunca mais
-- notificaria: a linha antiga continuaria ocupando a chave `(user_id, kind,
-- subject_id, occurrence_on)` mesmo depois de resolvida. A idempotência que
-- importa — duas execuções do cron no mesmo dia, um fan-out repetido — continua,
-- porque a linha recém-criada está aberta.
drop index sucont.notification_dedup_idx;
create unique index notification_dedup_idx
	on sucont.notification (user_id, kind, subject_id, occurrence_on)
	nulls not distinct
	where subject_id is not null and resolved_at is null;

-- Notifica UMA pessoa. Silenciosa quando ela não tem conta: caixa de entrada só
-- existe para quem pode abrir o sino, e três dos operadores de UG nunca logaram.
-- Devolver 0 em vez de falhar é o comportamento certo — atribuir tarefa a quem
-- ainda não tem conta é legítimo.
create or replace function sucont.notify_person(
	p_person_id uuid,
	p_kind text,
	p_title text,
	p_body text,
	p_href text,
	p_subject_id uuid,
	p_occurrence_on date
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
	inserted integer;
begin
	insert into sucont.notification (user_id, kind, title, body, href, subject_id, occurrence_on)
	select p.user_id, p_kind, p_title, p_body, p_href, p_subject_id, p_occurrence_on
	from core.person p
	where p.id = p_person_id and p.user_id is not null and p.active
	on conflict do nothing;
	get diagnostics inserted = row_count;
	return inserted;
end;
$$;

create or replace function sucont.assignee_notify()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
	item record;
begin
	select ci.task, ci.deadline into item from sucont.checklist_item ci where ci.id = new.item_id;
	perform sucont.notify_person(
		new.person_id,
		'atribuicao',
		coalesce(item.task, 'Tarefa do cronograma'),
		'Você passou a ser responsável por esta tarefa' || coalesce(' (' || item.deadline || ')', '') || '.',
		'/workspace',
		new.item_id,
		null
	);
	return new;
end;
$$;
create trigger assignee_notify_ai after insert on sucont.checklist_item_assignee
	for each row execute function sucont.assignee_notify();

-- Desatribuir resolve. Como o índice agora ignora resolvida, reatribuir a mesma
-- pessoa volta a notificar — que é o comportamento esperado.
create or replace function sucont.assignee_resolve()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	update sucont.notification n
	set resolved_at = now()
	from core.person p
	where p.id = old.person_id
	  and n.user_id = p.user_id
	  and n.kind = 'atribuicao'
	  and n.subject_id = old.item_id
	  and n.resolved_at is null;
	return old;
end;
$$;
create trigger assignee_resolve_ad after delete on sucont.checklist_item_assignee
	for each row execute function sucont.assignee_resolve();

revoke execute on function
	core.set_updated_at(),
	core.person_name_key(text),
	sucont.notify_person(uuid, text, text, text, text, uuid, date),
	sucont.assignee_notify(),
	sucont.assignee_resolve()
from public, anon, authenticated;

grant execute on function
	core.person_name_key(text),
	sucont.notify_person(uuid, text, text, text, text, uuid, date)
to service_role;

notify pgrst, 'reload schema';
