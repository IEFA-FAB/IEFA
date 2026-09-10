/**
 * Fila do analista (Etapa 1.8 — Plataforma ACI).
 *
 * O ACI não olha submissão, extração e execução como três tabelas: olha um
 * PROCESSO e quer saber em que ponto ele está e o que pede atenção. A leitura
 * agregada é da RPC `alpha.aci_queue` (uma linha por submissão); este módulo
 * reduz cada linha ao que a fila mostra — e é puro para que a regra de "em que
 * etapa está" seja testável sem banco.
 */

import { SEVERITY_ORDER, type Severity } from "../compliance/severity.ts"

/** Etapa do processo, na ordem do fluxo. */
export const STAGE_ORDER = ["enviado", "extraido", "verificado", "parecer"] as const

export type Stage = (typeof STAGE_ORDER)[number]

export const DECISIONS = ["aprovado", "aprovado_com_ressalvas", "reprovado"] as const

export type Decision = (typeof DECISIONS)[number]

export type Triage = "acatado" | "descartado" | null

/** O que `compliance/run.ts` grava em `compliance_run.status`. */
export type RunStatus = "running" | "succeeded" | "failed"

/** Uma linha da RPC `alpha.aci_queue`. */
export interface QueueRow {
	submission_id: string
	user_id: string
	filename: string
	doc_kind: string
	modalidade: string | null
	objeto: string | null
	submitted_at: string
	extraction_id: string | null
	extraction_created_at: string | null
	run_id: string | null
	run_status: RunStatus | null
	run_started_at: string | null
	run_finished_at: string | null
	rules_applied: number | null
	rules_not_assessed: number | null
	discarded_findings: number | null
	review_decision: Decision | null
	review_created_at: string | null
	finding_counts: Array<{ severity: Severity; triage: Triage; count: number }>
}

export interface QueueSubmission {
	id: string
	user_id: string
	filename: string
	doc_kind: string
	modalidade: string | null
	objeto: string | null
	created_at: string
}

export interface QueueRun {
	id: string
	status: RunStatus
	rules_applied: number
	rules_not_assessed: number
	discarded_findings: number
	started_at: string
	finished_at: string | null
}

export type SeverityCounts = Record<Severity, number>

export interface QueueItem {
	submission: QueueSubmission
	stage: Stage
	latest_extraction: { id: string; created_at: string } | null
	latest_run: QueueRun | null
	/** Achados da execução mais recente, por severidade — todos, triados ou não. */
	severity_counts: SeverityCounts
	/** Achados BLOQUEANTE ou GRAVE que ainda pedem decisão: acatados ou sem triagem. */
	open_critical: number
	/** Achados sem triagem, de qualquer severidade. */
	untriaged: number
	latest_review: { decision: Decision; created_at: string } | null
}

export interface QueueTotals {
	processes: number
	by_stage: Record<Stage, number>
	awaiting_review: number
	open_critical: number
	reviews: Record<Decision, number>
}

export function emptySeverityCounts(): SeverityCounts {
	return { BLOQUEANTE: 0, GRAVE: 0, MEDIA: 0, INFORMATIVA: 0 }
}

export function isCritical(severity: Severity): boolean {
	return SEVERITY_ORDER[severity] <= SEVERITY_ORDER.GRAVE
}

/**
 * Em que etapa o processo está.
 *
 * A etapa é a do estado MAIS AVANÇADO que se sustenta: execução que falhou não
 * conta como "verificado" — o analista veria um processo pronto para parecer
 * sem nenhum achado para ler. Parecer só existe sobre a execução mais recente;
 * parecer de execução antiga é histórico, não estado.
 */
export function deriveStage(hasExtraction: boolean, runStatus: RunStatus | null, hasReview: boolean): Stage {
	if (runStatus === "succeeded") return hasReview ? "parecer" : "verificado"
	if (hasExtraction) return "extraido"
	return "enviado"
}

export function toQueueItem(row: QueueRow): QueueItem {
	const severity_counts = emptySeverityCounts()
	let open_critical = 0
	let untriaged = 0
	for (const bucket of row.finding_counts) {
		severity_counts[bucket.severity] += bucket.count
		if (bucket.triage === null) untriaged += bucket.count
		if (isCritical(bucket.severity) && bucket.triage !== "descartado") open_critical += bucket.count
	}

	const latest_run: QueueRun | null =
		row.run_id && row.run_status && row.run_started_at
			? {
					id: row.run_id,
					status: row.run_status,
					rules_applied: row.rules_applied ?? 0,
					rules_not_assessed: row.rules_not_assessed ?? 0,
					discarded_findings: row.discarded_findings ?? 0,
					started_at: row.run_started_at,
					finished_at: row.run_finished_at,
				}
			: null

	const latest_review = row.review_decision && row.review_created_at ? { decision: row.review_decision, created_at: row.review_created_at } : null

	return {
		submission: {
			id: row.submission_id,
			user_id: row.user_id,
			filename: row.filename,
			doc_kind: row.doc_kind,
			modalidade: row.modalidade,
			objeto: row.objeto,
			created_at: row.submitted_at,
		},
		stage: deriveStage(Boolean(row.extraction_id), latest_run?.status ?? null, latest_review !== null),
		latest_extraction: row.extraction_id && row.extraction_created_at ? { id: row.extraction_id, created_at: row.extraction_created_at } : null,
		latest_run,
		severity_counts,
		open_critical,
		untriaged,
		latest_review,
	}
}

export function buildQueue(rows: readonly QueueRow[]): QueueItem[] {
	return rows.map(toQueueItem)
}

export function summarizeQueue(items: readonly QueueItem[]): QueueTotals {
	const totals: QueueTotals = {
		processes: items.length,
		by_stage: { enviado: 0, extraido: 0, verificado: 0, parecer: 0 },
		awaiting_review: 0,
		open_critical: 0,
		reviews: { aprovado: 0, aprovado_com_ressalvas: 0, reprovado: 0 },
	}

	for (const item of items) {
		totals.by_stage[item.stage] += 1
		if (item.stage === "verificado") totals.awaiting_review += 1
		// Crítico aberto só conta enquanto o parecer não saiu: depois, a decisão já o absorveu.
		if (item.stage !== "parecer") totals.open_critical += item.open_critical
		if (item.latest_review) totals.reviews[item.latest_review.decision] += 1
	}

	return totals
}
