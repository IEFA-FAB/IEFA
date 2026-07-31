/**
 * Conformidade e bancada de regras, a partir do console.
 */

import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/hooks/useAuth"

const ALPHA_BASE_URL = (import.meta.env.VITE_ALPHA_API_URL as string | undefined) ?? "https://alpha.iefa.com.br"

export type Severity = "BLOQUEANTE" | "GRAVE" | "MEDIA" | "INFORMATIVA"

export const SEVERITY_ORDER: Severity[] = ["BLOQUEANTE", "GRAVE", "MEDIA", "INFORMATIVA"]

export interface LegalRef {
	norma: string
	dispositivo: string
}

export interface Finding {
	id: string
	rule_id: string | null
	category: "ESTRUTURAL" | "CONTEUDO" | "CRUZADA"
	status: string
	severity: Severity
	section_path: string | null
	message: string
	legal_ref: LegalRef[]
	suggestion: string | null
	evidence_span: { text?: string } | null
	confidence: number | null
}

export interface ComplianceRun {
	id: string
	submission_id: string
	extraction_id: string
	model_document_id: string | null
	law_document_ids: string[]
	status: string
	rules_applied: number
	rules_not_assessed: number
	discarded_findings: number
	started_at: string
	finished_at: string | null
}

export interface Rule {
	id: string
	code: string
	kind: string
	severity: Severity
	status: "draft" | "active" | "needs_review" | "retired"
	origin: string
	legal_ref: LegalRef[]
	target_field: string | null
	statement: string
}

export interface RuleEvaluation {
	rule_id: string
	verdict: {
		status: "CONFORME" | "INCONFORME" | "NAO_AVALIADA"
		confidence: number
		evidence: string | null
		legal_ref: LegalRef[]
		suggestion: string | null
		message: string
	}
	guard: { kept: boolean; reason?: string; resolved_refs: LegalRef[] }
}

async function request<T>(path: string, token: string | undefined, init: RequestInit = {}): Promise<T> {
	const response = await fetch(`${ALPHA_BASE_URL}${path}`, {
		...init,
		headers: {
			"Content-Type": "application/json",
			...(init.headers ?? {}),
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
	})

	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as { message?: string; code?: string } | null
		throw new Error(body?.message ?? body?.code ?? `${path}: ${response.status}`)
	}

	return (await response.json()) as T
}

export function complianceRunQueryOptions(token: string | undefined, runId: string) {
	return queryOptions({
		queryKey: ["alpha", "compliance", runId],
		queryFn: () => request<{ run: ComplianceRun; findings: Finding[] }>(`/api/v1/compliance/runs/${runId}`, token),
	})
}

export function rulesQueryOptions(token: string | undefined, status?: Rule["status"]) {
	return queryOptions({
		queryKey: ["alpha", "rules", status ?? "all"],
		queryFn: async () => (await request<{ rules: Rule[] }>(`/api/v1/rules${status ? `?status=${status}` : ""}`, token)).rules,
	})
}

export function useRunCompliance() {
	const { session } = useAuth()

	return useMutation({
		mutationFn: (input: { submission_id: string; extraction_id: string }) =>
			request<{ run_id: string }>("/api/v1/compliance/runs", session?.access_token, { method: "POST", body: JSON.stringify(input) }),
	})
}

export function useEvaluateRule() {
	const { session } = useAuth()

	return useMutation({
		mutationFn: ({ ruleId, text }: { ruleId: string; text: string }) =>
			request<RuleEvaluation>(`/api/v1/rules/${ruleId}/evaluate`, session?.access_token, { method: "POST", body: JSON.stringify({ text }) }),
	})
}

export function useSetRuleStatus() {
	const { session } = useAuth()
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: ({ ruleId, status }: { ruleId: string; status: Rule["status"] }) =>
			request<Rule>(`/api/v1/rules/${ruleId}`, session?.access_token, { method: "PATCH", body: JSON.stringify({ status }) }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["alpha", "rules"] })
		},
	})
}
