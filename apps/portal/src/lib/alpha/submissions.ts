/**
 * Submissão e extração de ETP/TR a partir do console.
 *
 * O upload é multipart, então não passa pelo cliente RPC tipado — vai por
 * `fetch` direto na mesma base URL, com o mesmo Bearer.
 */

import { queryOptions, useMutation } from "@tanstack/react-query"
import { useAuth } from "@/hooks/useAuth"

const ALPHA_BASE_URL = (import.meta.env.VITE_ALPHA_API_URL as string | undefined) ?? "https://alpha.iefa.com.br"

export const CAMPO_LABELS = {
	objeto: "Objeto da contratação",
	justificativa_necessidade: "Justificativa da necessidade",
	descricao_solucao: "Descrição da solução como um todo",
	requisitos: "Requisitos da contratação",
	estimativa_quantidades: "Estimativa de quantidades",
	levantamento_mercado: "Levantamento de mercado",
	valor_estimado: "Valor estimado da contratação",
	justificativa_parcelamento: "Justificativa do parcelamento",
	criterios_sustentabilidade: "Critérios de sustentabilidade",
	modelo_execucao: "Modelo de execução do objeto",
	modelo_gestao: "Modelo de gestão do contrato",
	criterios_medicao_pagamento: "Critérios de medição e pagamento",
	criterios_selecao_fornecedor: "Critérios de seleção do fornecedor",
	garantia: "Garantia da contratação",
	sancoes: "Sanções administrativas",
	prazo_vigencia: "Prazo de vigência",
	fiscalizacao: "Fiscalização do contrato",
	modalidade: "Modalidade de licitação",
	objeto_tipo: "Natureza do objeto",
} as const

export type CampoKey = keyof typeof CAMPO_LABELS

export interface ExtractedField {
	value: string
	evidence: string
}

export interface SourceSpan {
	start: number
	end: number
	text: string
}

export interface ExtractionResponse {
	id: string
	submission_id: string
	payload: Record<CampoKey, ExtractedField | null>
	spans: Partial<Record<CampoKey, SourceSpan>>
	model: string
	dropped: Array<{ field: string; reason: string }>
}

export interface SubmissionResponse {
	id: string
	filename: string
	doc_kind: string
	created_at: string
}

async function request<T>(path: string, token: string | undefined, init: RequestInit = {}): Promise<T> {
	const response = await fetch(`${ALPHA_BASE_URL}${path}`, {
		...init,
		headers: { ...(init.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
	})

	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as { message?: string; code?: string } | null
		throw new Error(body?.message ?? body?.code ?? `${path}: ${response.status}`)
	}

	return (await response.json()) as T
}

export function submissionTextQueryOptions(token: string | undefined, submissionId: string) {
	return queryOptions({
		queryKey: ["alpha", "submissions", submissionId, "text"],
		queryFn: () => request<{ submission_id: string; text: string }>(`/api/v1/submissions/${submissionId}/text`, token),
		staleTime: 5 * 60_000,
	})
}

export function submissionsQueryOptions(token: string | undefined) {
	return queryOptions({
		queryKey: ["alpha", "submissions"],
		queryFn: async () => (await request<{ submissions: SubmissionResponse[] }>("/api/v1/submissions", token)).submissions,
	})
}

export function useCreateSubmission() {
	const { session } = useAuth()

	return useMutation({
		mutationFn: async ({ file, doc_kind, objeto }: { file: File; doc_kind: string; objeto?: string }) => {
			const form = new FormData()
			form.append("file", file)
			form.append("doc_kind", doc_kind)
			if (objeto) form.append("objeto", objeto)

			return request<SubmissionResponse>("/api/v1/submissions", session?.access_token, { method: "POST", body: form })
		},
	})
}

export function useRunExtraction() {
	const { session } = useAuth()

	return useMutation({
		mutationFn: (submissionId: string) =>
			request<ExtractionResponse>(`/api/v1/submissions/${submissionId}/extractions`, session?.access_token, { method: "POST" }),
	})
}
