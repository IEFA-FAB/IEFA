/**
 * Plataforma ACI (Etapa 1.8) — fila, processo, triagem, parecer e relatório.
 *
 * Mesmo padrão das demais libs do α: `fetch` direto com o token da sessão a
 * cada chamada, porque o α valida o JWT por request e o token expira.
 */

import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/hooks/useAuth"
import { ALPHA_BASE_URL, alphaRequest } from "./client"
import type { ComplianceRun, Finding, Severity } from "./compliance"

export type Stage = "enviado" | "extraido" | "verificado" | "parecer"

export const STAGE_ORDER: readonly Stage[] = ["enviado", "extraido", "verificado", "parecer"]

export const STAGE_LABEL: Record<Stage, string> = {
	enviado: "Enviado",
	extraido: "Extraído",
	verificado: "Verificado",
	parecer: "Parecer emitido",
}

export type Decision = "aprovado" | "aprovado_com_ressalvas" | "reprovado"

export const DECISIONS: readonly Decision[] = ["aprovado", "aprovado_com_ressalvas", "reprovado"]

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
	submission_id: string
	status: string
	rules_applied: number
	rules_not_assessed: number
	discarded_findings: number
	started_at: string
	finished_at: string | null
}

export interface QueueReview {
	run_id: string
	decision: Decision
	created_at: string
}

export interface QueueItem {
	submission: QueueSubmission
	stage: Stage
	latest_extraction: { id: string; submission_id: string; created_at: string } | null
	latest_run: QueueRun | null
	severity_counts: Record<Severity, number>
	open_critical: number
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

export interface ExtractionSummary {
	id: string
	model: string
	created_at: string
	fields_total: number
	fields_filled: number
}

export interface SubmissionDetail {
	submission: QueueSubmission & { mime_type: string }
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
}

export function aciQueueQueryOptions(token: string | undefined) {
	return queryOptions({
		queryKey: ["alpha", "aci", "queue"],
		queryFn: () => alphaRequest<Queue>("/api/v1/aci/queue", token),
		staleTime: 15_000,
	})
}

export function submissionDetailQueryOptions(token: string | undefined, submissionId: string) {
	return queryOptions({
		queryKey: ["alpha", "submissions", submissionId, "detail"],
		queryFn: () => alphaRequest<SubmissionDetail>(`/api/v1/submissions/${submissionId}`, token),
	})
}

export function finalReportQueryOptions(token: string | undefined, runId: string) {
	return queryOptions({
		queryKey: ["alpha", "compliance", runId, "report"],
		queryFn: () => alphaRequest<FinalReport>(`/api/v1/compliance/runs/${runId}/report`, token),
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

function invalidateProcess(queryClient: ReturnType<typeof useQueryClient>, runId: string, submissionId?: string) {
	queryClient.invalidateQueries({ queryKey: ["alpha", "compliance", runId] })
	queryClient.invalidateQueries({ queryKey: ["alpha", "aci", "queue"] })
	if (submissionId) queryClient.invalidateQueries({ queryKey: ["alpha", "submissions", submissionId, "detail"] })
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
		onSuccess: (_result, { runId, submissionId }) => invalidateProcess(queryClient, runId, submissionId),
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
		onSuccess: (_result, { runId, submissionId }) => {
			invalidateProcess(queryClient, runId, submissionId)
			queryClient.invalidateQueries({ queryKey: ["alpha", "compliance", runId, "report"] })
		},
	})
}
