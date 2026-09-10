-- ============================================================================
-- Projeto α — Etapa 1.8 (Plataforma ACI): triagem de achado, parecer final e
-- a fila do analista.
--
-- O relatório da Etapa 1.7 é o que a máquina achou. O parecer é o que o ACI
-- decidiu sobre isso — e os dois precisam ficar separados para que reabrir um
-- processo meses depois mostre exatamente o que o analista viu e o que assinou.
--
-- Triagem mora no próprio achado (uma decisão por achado, revisável). Parecer é
-- linha NOVA a cada emissão: a decisão anterior nunca é sobrescrita, porque um
-- parecer emitido é peça do processo, não estado de tela.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- compliance_finding — triagem do analista
-- ----------------------------------------------------------------------------
alter table alpha.compliance_finding
	add column triage      text,
	add column triage_note text,
	add column triaged_by  uuid,
	add column triaged_at  timestamptz,
	add constraint compliance_finding_triage_check check (triage is null or triage in ('acatado', 'descartado'));

comment on column alpha.compliance_finding.triage is
	'Decisão do analista sobre o achado: acatado (vai para o parecer) ou descartado (com motivo). NULL = ainda não triado.';

-- ----------------------------------------------------------------------------
-- compliance_review — parecer do ACI sobre uma execução
-- ----------------------------------------------------------------------------
create table alpha.compliance_review (
	id          uuid primary key default gen_random_uuid(),
	run_id      uuid not null references alpha.compliance_run(id) on delete cascade,
	reviewer_id uuid not null,
	decision    text not null,
	notes       text,
	-- Retrato dos achados no momento da emissão: contagens E a triagem de cada
	-- achado (id, severidade, triagem, motivo). É o que permite ler o parecer sem
	-- depender do estado ATUAL da triagem, que pode ser alterada depois — o
	-- relatório final renderiza a triagem daqui quando há parecer, e aponta
	-- quantos achados foram re-triados desde então.
	snapshot    jsonb not null default '{}'::jsonb,
	created_at  timestamptz not null default now(),
	constraint compliance_review_decision_check check (decision in ('aprovado', 'aprovado_com_ressalvas', 'reprovado'))
);

create index compliance_review_run_ix on alpha.compliance_review (run_id, created_at desc);

comment on table alpha.compliance_review is
	'Parecer do ACI sobre uma execução de conformidade. Append-only: cada emissão é uma linha nova; a mais recente é a vigente.';

alter table alpha.compliance_review enable row level security;

-- ----------------------------------------------------------------------------
-- Guarda de emissão — a regra vive junto do dado
--
-- O α checa a mesma regra antes de inserir, para devolver 409 legível. Mas a
-- checagem no app é ler-depois-gravar em duas requisições: uma triagem
-- concorrente entre as duas passaria. Aqui a regra roda DENTRO do insert, com
-- a execução travada (`for update`), então duas emissões sobre a mesma
-- execução se serializam e nenhuma grava um parecer que os achados contradizem.
--
-- Regra (espelho de apps/alpha/src/aci/review.ts):
--   - reprovar é sempre possível;
--   - qualquer aprovação exige todo BLOQUEANTE/GRAVE triado;
--   - BLOQUEANTE acatado só cabe em reprovação;
--   - GRAVE acatado desce a aprovação para "com ressalvas".
-- ----------------------------------------------------------------------------
create or replace function alpha.compliance_review_guard()
returns trigger
language plpgsql
set search_path = alpha, pg_temp
as $$
declare
	v_status             text;
	v_untriaged_critical int;
	v_blocking_accepted  int;
	v_grave_accepted     int;
begin
	select status into v_status from alpha.compliance_run where id = new.run_id for update;

	if v_status is distinct from 'succeeded' then
		raise exception 'RUN_NOT_SUCCEEDED' using errcode = 'check_violation', detail = coalesce(v_status, 'inexistente');
	end if;

	if new.decision = 'reprovado' then
		return new;
	end if;

	select
		count(*) filter (where severity in ('BLOQUEANTE', 'GRAVE') and triage is null),
		count(*) filter (where severity = 'BLOQUEANTE' and triage = 'acatado'),
		count(*) filter (where severity = 'GRAVE' and triage = 'acatado')
	into v_untriaged_critical, v_blocking_accepted, v_grave_accepted
	from alpha.compliance_finding
	where run_id = new.run_id;

	if v_untriaged_critical > 0 then
		raise exception 'DECISION_BLOCKED' using errcode = 'check_violation',
			detail = v_untriaged_critical || ' achado(s) BLOQUEANTE/GRAVE ainda sem triagem';
	end if;

	if v_blocking_accepted > 0 then
		raise exception 'DECISION_BLOCKED' using errcode = 'check_violation',
			detail = v_blocking_accepted || ' achado(s) BLOQUEANTE acatado(s) — só cabe reprovação';
	end if;

	if new.decision = 'aprovado' and v_grave_accepted > 0 then
		raise exception 'DECISION_BLOCKED' using errcode = 'check_violation',
			detail = v_grave_accepted || ' achado(s) GRAVE acatado(s) — aprovação só com ressalvas';
	end if;

	return new;
end;
$$;

create trigger compliance_review_guard
	before insert on alpha.compliance_review
	for each row execute function alpha.compliance_review_guard();

-- ----------------------------------------------------------------------------
-- Fila do analista — uma linha por submissão
--
-- Extração e execução MAIS RECENTES, o parecer vigente sobre essa execução e
-- as contagens de achado por severidade × triagem. Fica em SQL porque a versão
-- em app (cinco selects com `in (...)` e junção em memória) transferia todos
-- os achados de todas as execuções e esbarrava no teto de 1000 linhas do
-- PostgREST sem erro nenhum — a fila mostrava processo com BLOQUEANTE como
-- limpo. Aqui o volume é N linhas para N submissões, sempre.
-- ----------------------------------------------------------------------------
create or replace function alpha.aci_queue(p_limit int default 200)
returns table (
	submission_id        uuid,
	user_id              uuid,
	filename             text,
	doc_kind             text,
	modalidade           text,
	objeto               text,
	submitted_at         timestamptz,
	extraction_id        uuid,
	extraction_created_at timestamptz,
	run_id               uuid,
	run_status           text,
	run_started_at       timestamptz,
	run_finished_at      timestamptz,
	rules_applied        int,
	rules_not_assessed   int,
	discarded_findings   int,
	review_decision      text,
	review_created_at    timestamptz,
	finding_counts       jsonb
)
language sql
stable
set search_path = alpha, pg_temp
as $$
	with s as (
		select sub.id, sub.user_id, sub.filename, sub.doc_kind, sub.modalidade, sub.objeto, sub.created_at
		from alpha.submission sub
		order by sub.created_at desc
		limit p_limit
	),
	e as (
		select distinct on (ext.submission_id) ext.submission_id, ext.id, ext.created_at
		from alpha.extraction ext
		where ext.submission_id in (select s.id from s)
		order by ext.submission_id, ext.created_at desc
	),
	r as (
		select distinct on (run.submission_id)
			run.submission_id, run.id, run.status, run.started_at, run.finished_at,
			run.rules_applied, run.rules_not_assessed, run.discarded_findings
		from alpha.compliance_run run
		where run.submission_id in (select s.id from s)
		order by run.submission_id, run.started_at desc
	),
	rv as (
		select distinct on (rev.run_id) rev.run_id, rev.decision, rev.created_at
		from alpha.compliance_review rev
		where rev.run_id in (select r.id from r)
		order by rev.run_id, rev.created_at desc
	),
	fc as (
		select g.run_id, jsonb_agg(jsonb_build_object('severity', g.severity, 'triage', g.triage, 'count', g.n)) as counts
		from (
			select f.run_id, f.severity, f.triage, count(*) as n
			from alpha.compliance_finding f
			where f.run_id in (select r.id from r)
			group by f.run_id, f.severity, f.triage
		) g
		group by g.run_id
	)
	select
		s.id, s.user_id, s.filename, s.doc_kind, s.modalidade, s.objeto, s.created_at,
		e.id, e.created_at,
		r.id, r.status, r.started_at, r.finished_at, r.rules_applied, r.rules_not_assessed, r.discarded_findings,
		rv.decision, rv.created_at,
		coalesce(fc.counts, '[]'::jsonb)
	from s
	left join e  on e.submission_id = s.id
	left join r  on r.submission_id = s.id
	left join rv on rv.run_id = r.id
	left join fc on fc.run_id = r.id
	order by s.created_at desc
$$;

-- Os grants para service_role vêm dos default privileges do schema (migration
-- 20260811130000). anon/authenticated seguem sem acesso: o α é o único cliente.
