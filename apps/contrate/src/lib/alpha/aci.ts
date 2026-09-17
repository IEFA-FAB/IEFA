/**
 * Plataforma ACI (Etapa 1.8) — fila, processo, triagem, parecer e relatório.
 *
 * Mesmo padrão das demais libs do α: `fetch` direto com o token da sessão a
 * cada chamada, porque o α valida o JWT por request e o token expira.
 *
 * O que é REGRA (em que etapa o processo está, se a decisão pode ser emitida)
 * vem calculado do α. A tela renderiza — não redecide: uma cópia da regra aqui
 * discordaria do 409 do servidor no primeiro ajuste que o α recebesse.
 */

import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/hooks/useAuth"
import { ALPHA_BASE_URL, alphaRequest } from "./client"
import type { ComplianceRun, Finding, Severity } from "./compliance"

export const STAGE_ORDER = ["enviado", "extraido", "verificado", "parecer"] as const

export type Stage = (typeof STAGE_ORDER)[number]

export const STAGE_LABEL: Record<Stage, string> = {
	enviado: "Enviado",
	extraido: "Extraído",
	verificado: "Verificado",
	parecer: "Parecer emitido",
}

export const DECISIONS = ["aprovado", "aprovado_com_ressalvas", "reprovado"] as const

export type Decision = (typeof DECISIONS)[number]

export const DECISION_LABEL: Record<Decision, string> = {
	aprovado: "Aprovado",
	aprovado_com_ressalvas: "Aprovado com ressalvas",
	reprovado: "Reprovado",
}

export type Triage = "acatado" | "descartado" | null

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
	status: string
	rules_applied: number
	rules_not_assessed: number
	discarded_findings: number
	started_at: string
	finished_at: string | null
}

export interface QueueItem {
	submission: QueueSubmission
	stage: Stage
	latest_extraction: { id: string; created_at: string } | null
	latest_run: QueueRun | null
	severity_counts: Record<Severity, number>
	open_critical: number
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

export interface Queue {
	items: QueueItem[]
	totals: QueueTotals
}

export interface Review {
	id: string
	run_id: string
	decision: Decision
	notes: string | null
	reviewer_id: string
	created_at: string
}

/** Retrato dos achados — contagens; a lista por achado fica no α, para o relatório. */
export interface ReviewSnapshot {
	total: number
	accepted: number
	discarded: number
	untriaged: number
	accepted_by_severity: Record<Severity, number>
	untriaged_by_severity: Record<Severity, number>
}

export interface ReviewsResponse {
	run_id: string
	reviews: Review[]
	/** O que a emissão checaria agora: retrato atual e bloqueios por decisão. */
	current: { snapshot: ReviewSnapshot; blockers: Record<Decision, string[]> }
}

export interface ExtractionSummary {
	id: string
	model: string
	created_at: string
}

export interface ProcessDetail {
	submission: QueueSubmission & { mime_type: string }
	/** Derivada no α pela mesma função da fila. */
	stage: Stage
	extractions: ExtractionSummary[]
	runs: ComplianceRun[]
	reviews: Review[]
}

export interface ReportDocument {
	id: string
	title: string
	document_type: string
	version_label: string | null
}

export interface FinalReport {
	run: ComplianceRun
	submission: { id: string; filename: string; doc_kind: string; modalidade: string | null; objeto: string | null; created_at: string }
	extraction: { id: string; model: string; created_at: string } | null
	model_document: ReportDocument | null
	law_documents: ReportDocument[]
	findings: Finding[]
	reviews: Review[]
	/** Achados re-triados depois do parecer: o relatório mostra a triagem assinada. */
	retriaged_after_review: number
}

export function aciQueueQueryOptions(token: string | undefined) {
	return queryOptions({
		queryKey: ["alpha", "aci", "queue"],
		queryFn: () => alphaRequest<Queue>("/api/v1/aci/queue", token),
		staleTime: 15_000,
	})
}

export function processDetailQueryOptions(token: string | undefined, submissionId: string) {
	return queryOptions({
		queryKey: ["alpha", "aci", "process", submissionId],
		queryFn: () => alphaRequest<ProcessDetail>(`/api/v1/aci/processes/${submissionId}`, token),
		staleTime: 30_000,
	})
}

export function reviewsQueryOptions(token: string | undefined, runId: string) {
	return queryOptions({
		queryKey: ["alpha", "compliance", runId, "reviews"],
		queryFn: () => alphaRequest<ReviewsResponse>(`/api/v1/compliance/runs/${runId}/reviews`, token),
		staleTime: 30_000,
	})
}

export function finalReportQueryOptions(token: string | undefined, runId: string) {
	return queryOptions({
		queryKey: ["alpha", "compliance", runId, "report"],
		queryFn: () => alphaRequest<FinalReport>(`/api/v1/compliance/runs/${runId}/report`, token),
		// O relatório junta seis leituras no α; ele só muda por triagem ou parecer,
		// e as duas mutações já invalidam esta chave.
		staleTime: 60_000,
	})
}

/**
 * Baixa o relatório em Markdown.
 *
 * Não é um link: o α exige o Bearer, e um `<a href>` não o leva. O corpo vem
 * como texto e vira um download no cliente.
 */
export async function downloadReportMarkdown(token: string | undefined, runId: string): Promise<void> {
	const response = await fetch(`${ALPHA_BASE_URL}/api/v1/compliance/runs/${runId}/report?format=md`, {
		headers: token ? { Authorization: `Bearer ${token}` } : {},
	})
	if (!response.ok) throw new Error(`relatório: ${response.status}`)

	const blob = await response.blob()
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement("a")
	anchor.href = url
	anchor.download = `relatorio-conformidade-${runId}.md`
	anchor.click()
	URL.revokeObjectURL(url)
}

export function useTriageFinding() {
	const { session } = useAuth()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: ({ findingId, triage, note }: { findingId: string; runId: string; submissionId?: string; triage: Triage; note?: string }) =>
			alphaRequest<Finding>(`/api/v1/compliance/findings/${findingId}`, session?.access_token, {
				method: "PATCH",
				body: JSON.stringify({ triage, note }),
			}),
		onSuccess: (updated, { runId, submissionId }) => {
			// A resposta do PATCH já é o achado atualizado: escrever no cache evita
			// refazer a leitura mais cara do α a cada clique de triagem.
			queryClient.setQueryData<{ run: ComplianceRun; findings: Finding[] }>(["alpha", "compliance", runId], (current) =>
				current ? { ...current, findings: current.findings.map((finding) => (finding.id === updated.id ? updated : finding)) } : current
			)
			// Os bloqueios do parecer dependem da triagem — esses precisam vir do α.
			queryClient.invalidateQueries({ queryKey: ["alpha", "compliance", runId, "reviews"] })
			queryClient.invalidateQueries({ queryKey: ["alpha", "compliance", runId, "report"], refetchType: "none" })
			// Fila e processo: marcados como velhos, buscados na próxima visita. Não
			// há tela deles montada durante a triagem.
			queryClient.invalidateQueries({ queryKey: ["alpha", "aci", "queue"], refetchType: "none" })
			if (submissionId) queryClient.invalidateQueries({ queryKey: ["alpha", "aci", "process", submissionId], refetchType: "none" })
		},
	})
}

export function useIssueReview() {
	const { session } = useAuth()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: ({ runId, decision, notes }: { runId: string; submissionId?: string; decision: Decision; notes?: string }) =>
			alphaRequest<Review>(`/api/v1/compliance/runs/${runId}/reviews`, session?.access_token, {
				method: "POST",
				body: JSON.stringify({ decision, notes }),
			}),
		onSuccess: (_review, { runId, submissionId }) => {
			queryClient.invalidateQueries({ queryKey: ["alpha", "compliance", runId, "reviews"] })
			queryClient.invalidateQueries({ queryKey: ["alpha", "compliance", runId, "report"], refetchType: "none" })
			queryClient.invalidateQueries({ queryKey: ["alpha", "aci", "queue"], refetchType: "none" })
			if (submissionId) queryClient.invalidateQueries({ queryKey: ["alpha", "aci", "process", submissionId] })
		},
	})
}
