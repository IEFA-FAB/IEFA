/**
 * Submissão e extração de ETP/TR a partir do console.
 *
 * O upload é multipart; `alphaRequest` deixa o browser definir o Content-Type
 * nesse caso, senão o boundary do FormData se perde.
 */

import { queryOptions, useMutation } from "@tanstack/react-query"
import { useAuth } from "@/hooks/useAuth"
import { alphaRequest } from "./client"

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

/** Naturezas de objeto aceitas pelo α — espelha `ObjetoTipoSchema` da extração. */
export const OBJETO_TIPOS = ["COMPRAS", "SERVICOS", "OBRAS", "TIC"] as const

export type ObjetoTipo = (typeof OBJETO_TIPOS)[number]

/**
 * Extração canônica.
 *
 * `objeto_tipo` é a exceção da forma: enum puro, sem trecho de origem, porque é
 * classificação do documento inteiro e não um trecho dele. Tratá-lo como os
 * demais campos fazia a tela ler `.value` de uma string e renderizar vazio.
 */
export type ExtractionPayload = { [K in Exclude<CampoKey, "objeto_tipo">]: ExtractedField | null } & { objeto_tipo: ObjetoTipo | null }

/** Texto exibível de um campo extraído, independente da forma. */
export function campoTexto(value: ExtractedField | ObjetoTipo | null): string | null {
	if (value === null) return null

	return typeof value === "string" ? value : value.value
}

export interface SourceSpan {
	start: number
	end: number
	text: string
}

export interface ExtractionResponse {
	id: string
	submission_id: string
	payload: ExtractionPayload
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

export function submissionTextQueryOptions(token: string | undefined, submissionId: string) {
	return queryOptions({
		queryKey: ["alpha", "submissions", submissionId, "text"],
		queryFn: () => alphaRequest<{ submission_id: string; text: string }>(`/api/v1/submissions/${submissionId}/text`, token),
		staleTime: 5 * 60_000,
	})
}

export function submissionsQueryOptions(token: string | undefined) {
	return queryOptions({
		queryKey: ["alpha", "submissions"],
		queryFn: async () => (await alphaRequest<{ submissions: SubmissionResponse[] }>("/api/v1/submissions", token)).submissions,
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

			return alphaRequest<SubmissionResponse>("/api/v1/submissions", session?.access_token, { method: "POST", body: form })
		},
	})
}

export function useRunExtraction() {
	const { session } = useAuth()

	return useMutation({
		mutationFn: (submissionId: string) =>
			alphaRequest<ExtractionResponse>(`/api/v1/submissions/${submissionId}/extractions`, session?.access_token, { method: "POST" }),
	})
}
