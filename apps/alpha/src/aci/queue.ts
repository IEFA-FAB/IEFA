/**
 * Fila do analista (Etapa 1.8 — Plataforma ACI).
 *
 * O ACI não olha submissão, extração e execução como três tabelas: olha um
 * PROCESSO e quer saber em que ponto ele está e o que pede atenção. Este
 * módulo reduz as linhas ao que a fila mostra — e é puro para que a regra de
 * "em que etapa está" seja testável sem banco.
 */

import { SEVERITY_ORDER, type Severity } from "../compliance/severity.ts"

/** Etapa do processo, na ordem do fluxo. */
export type Stage = "enviado" | "extraido" | "verificado" | "parecer"

export const STAGE_ORDER: readonly Stage[] = ["enviado", "extraido", "verificado", "parecer"]

export type Triage = "acatado" | "descartado" | null

export type Decision = "aprovado" | "aprovado_com_ressalvas" | "reprovado"

export interface QueueSubmission {
	id: string
	user_id: string
	filename: string
	doc_kind: string
	modalidade: string | null
	objeto: string | null
	created_at: string
}

export interface QueueExtraction {
	id: string
	submission_id: string
	created_at: string
}

export interface QueueRun {
	id: string
	submission_id: string
	status: string
	rules_applied: number
	rules_not_assessed: number
	discarded_findings: number
	started_at: string
	finished_at: string | null
}

export interface QueueFinding {
	run_id: string
	severity: Severity
	triage: Triage
}

export interface QueueReview {
	run_id: string
	decision: Decision
	created_at: string
}

export type SeverityCounts = Record<Severity, number>

export interface QueueItem {
	submission: QueueSubmission
	stage: Stage
	latest_extraction: QueueExtraction | null
	latest_run: QueueRun | null
	/** Achados da execução mais recente, por severidade — todos, triados ou não. */
	severity_counts: SeverityCounts
	/** Achados BLOQUEANTE ou GRAVE que ainda pedem decisão: acatados ou sem triagem. */
	open_critical: number
	/** Achados sem triagem, de qualquer severidade. */
	untriaged: number
	latest_review: QueueReview | null
}

export interface QueueTotals {
	processos: number
	por_etapa: Record<Stage, number>
	aguardando_parecer: number
	criticos_abertos: number
	pareceres: Record<Decision, number>
}

export function emptySeverityCounts(): SeverityCounts {
	return { BLOQUEANTE: 0, GRAVE: 0, MEDIA: 0, INFORMATIVA: 0 }
}

/** Mais recente por chave, dado um campo de data ISO. Empate mantém a primeira vista. */
function latestBy<T>(rows: readonly T[], key: (row: T) => string, date: (row: T) => string): Map<string, T> {
	const latest = new Map<string, T>()
	for (const row of rows) {
		const current = latest.get(key(row))
		if (!current || date(row) > date(current)) latest.set(key(row), row)
	}
	return latest
}

/**
 * Em que etapa o processo está.
 *
 * A etapa é a do estado MAIS AVANÇADO que se sustenta: execução que falhou não
 * conta como "verificado" — o analista veria um processo pronto para parecer
 * sem nenhum achado para ler. Parecer só existe sobre a execução mais recente;
 * parecer de execução antiga é histórico, não estado.
 */
export function deriveStage(extraction: QueueExtraction | null, run: QueueRun | null, review: QueueReview | null): Stage {
	if (run?.status === "succeeded") return review ? "parecer" : "verificado"
	if (extraction) return "extraido"
	return "enviado"
}

export function isCritical(severity: Severity): boolean {
	return SEVERITY_ORDER[severity] <= SEVERITY_ORDER.GRAVE
}

export function buildQueue(input: {
	submissions: readonly QueueSubmission[]
	extractions: readonly QueueExtraction[]
	runs: readonly QueueRun[]
	findings: readonly QueueFinding[]
	reviews: readonly QueueReview[]
}): QueueItem[] {
	const latestExtraction = latestBy(
		input.extractions,
		(row) => row.submission_id,
		(row) => row.created_at
	)
	const latestRun = latestBy(
		input.runs,
		(row) => row.submission_id,
		(row) => row.started_at
	)
	const latestReview = latestBy(
		input.reviews,
		(row) => row.run_id,
		(row) => row.created_at
	)

	const findingsByRun = new Map<string, QueueFinding[]>()
	for (const finding of input.findings) {
		const list = findingsByRun.get(finding.run_id) ?? []
		list.push(finding)
		findingsByRun.set(finding.run_id, list)
	}

	return input.submissions.map((submission) => {
		const extraction = latestExtraction.get(submission.id) ?? null
		const run = latestRun.get(submission.id) ?? null
		const review = run ? (latestReview.get(run.id) ?? null) : null
		const findings = run ? (findingsByRun.get(run.id) ?? []) : []

		const severity_counts = emptySeverityCounts()
		let open_critical = 0
		let untriaged = 0
		for (const finding of findings) {
			severity_counts[finding.severity] += 1
			if (finding.triage === null) untriaged += 1
			if (isCritical(finding.severity) && finding.triage !== "descartado") open_critical += 1
		}

		return {
			submission,
			stage: deriveStage(extraction, run, review),
			latest_extraction: extraction,
			latest_run: run,
			severity_counts,
			open_critical,
			untriaged,
			latest_review: review,
		}
	})
}

export function summarizeQueue(items: readonly QueueItem[]): QueueTotals {
	const totals: QueueTotals = {
		processos: items.length,
		por_etapa: { enviado: 0, extraido: 0, verificado: 0, parecer: 0 },
		aguardando_parecer: 0,
		criticos_abertos: 0,
		pareceres: { aprovado: 0, aprovado_com_ressalvas: 0, reprovado: 0 },
	}

	for (const item of items) {
		totals.por_etapa[item.stage] += 1
		if (item.stage === "verificado") totals.aguardando_parecer += 1
		// Crítico aberto só conta enquanto o parecer não saiu: depois, a decisão já o absorveu.
		if (item.stage !== "parecer") totals.criticos_abertos += item.open_critical
		if (item.latest_review) totals.pareceres[item.latest_review.decision] += 1
	}

	return totals
}
