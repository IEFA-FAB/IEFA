/**
 * Projeções compartilhadas entre as rotas de conformidade e as da Plataforma ACI.
 *
 * Um lugar só: a triagem entrou em `compliance_finding` e a lista de colunas
 * precisava mudar em duas rotas — manter duas cópias é como uma delas fica
 * para trás e o tipo do portal passa a estar errado para uma das respostas.
 */

export const FINDING_COLUMNS =
	"id, run_id, rule_id, category, status, severity, section_path, message, legal_ref, suggestion, evidence_span, confidence, triage, triage_note, triaged_by, triaged_at"

export const RUN_COLUMNS =
	"id, submission_id, extraction_id, model_document_id, law_document_ids, status, rules_applied, rules_not_assessed, discarded_findings, started_at, finished_at"

export const REVIEW_COLUMNS = "id, run_id, decision, notes, snapshot, reviewer_id, created_at"
