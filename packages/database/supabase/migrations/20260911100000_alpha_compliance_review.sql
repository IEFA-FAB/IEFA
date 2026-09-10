-- ============================================================================
-- Projeto α — Etapa 1.8 (Plataforma ACI): triagem de achado e parecer final.
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
	-- Retrato dos achados no momento da emissão: quantos foram acatados, descartados e
	-- quantos ficaram sem triagem. É o que permite ler o parecer sem depender do estado
	-- ATUAL dos achados, que pode ter mudado numa triagem posterior.
	snapshot    jsonb not null default '{}'::jsonb,
	created_at  timestamptz not null default now(),
	constraint compliance_review_decision_check check (decision in ('aprovado', 'aprovado_com_ressalvas', 'reprovado'))
);

create index compliance_review_run_ix on alpha.compliance_review (run_id, created_at desc);

comment on table alpha.compliance_review is
	'Parecer do ACI sobre uma execução de conformidade. Append-only: cada emissão é uma linha nova; a mais recente é a vigente.';

alter table alpha.compliance_review enable row level security;

-- Os grants para service_role vêm dos default privileges do schema (migration
-- 20260811130000). anon/authenticated seguem sem acesso: o α é o único cliente.
