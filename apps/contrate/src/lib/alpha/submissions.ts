/**
 * Submissão e extração de ETP/TR a partir do console.
 *
 * O upload é multipart; `alphaRequest` deixa o browser definir o Content-Type
 * nesse caso, senão o boundary do FormData se perde.
 */

import { queryOptions, useMutation } from "@tanstack/react-query"
import { useAuth } from "@/hooks/useAuth"
import { alphaPath, alphaRequest } from "./client"

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
	/** OM a que o documento foi atribuído — obrigatória (NOT NULL desde 20260921090000). */
	unit_id: number
	filename: string
	doc_kind: string
	modalidade: string | null
	objeto: string | null
	created_at: string
}

export function submissionTextQueryOptions(token: string | undefined, submissionId: string) {
	return queryOptions({
		queryKey: ["alpha", "submissions", submissionId, "text"],
		queryFn: () => alphaRequest<{ submission_id: string; text: string }>(alphaPath`/api/v1/submissions/${submissionId}/text`, token),
		staleTime: 5 * 60_000,
	})
}

/** Extração como o histórico a devolve — sem `dropped`/`truncated`, que só existem na resposta da criação. */
export interface StoredExtraction {
	id: string
	payload: ExtractionPayload
	spans: Partial<Record<CampoKey, SourceSpan>>
	model: string
	created_at: string
}

export function extractionsQueryOptions(token: string | undefined, submissionId: string) {
	return queryOptions({
		queryKey: ["alpha", "submissions", submissionId, "extractions"],
		queryFn: async () =>
			(await alphaRequest<{ extractions: StoredExtraction[] }>(alphaPath`/api/v1/submissions/${submissionId}/extractions`, token)).extractions,
	})
}

/**
 * Submissões visíveis: as próprias MAIS as das OMs que o usuário cobre como requisitante,
 * licitações ou ACI (o α decide). `unitId` recorta uma OM — fora da cobertura, o α devolve só
 * as próprias daquela OM. `null` é sem recorte.
 */
/**
 * A lista do escopo: a OM (`unit`), tudo o que o papel alcança (`all`) ou só o que a própria
 * pessoa enviou (`personal` — `?mine=true`; sem o filtro o α devolveria também as OMs que ela
 * cobre, e a lista "minhas" mostraria os documentos dos colegas).
 */
export function submissionsQueryOptions(token: string | undefined, scope: { kind: "unit" | "all" | "personal"; unitId: number | null }) {
	const path =
		scope.kind === "personal"
			? "/api/v1/submissions?mine=true"
			: scope.unitId === null
				? "/api/v1/submissions"
				: alphaPath`/api/v1/submissions?unit_id=${scope.unitId}`
	return queryOptions({
		queryKey: ["alpha", "submissions", "list", scope.kind, scope.unitId ?? "all"],
		queryFn: async () => (await alphaRequest<{ submissions: SubmissionResponse[] }>(path, token)).submissions,
		staleTime: 15_000,
	})
}

export function useCreateSubmission() {
	const { session } = useAuth()

	return useMutation({
		mutationFn: async ({ file, doc_kind, objeto, unit_id }: { file: File; doc_kind: string; objeto?: string; unit_id: number }) => {
			const form = new FormData()
			form.append("file", file)
			form.append("doc_kind", doc_kind)
			// Obrigatória no α: é a OM que decide quem mais enxerga o documento.
			form.append("unit_id", String(unit_id))
			if (objeto) form.append("objeto", objeto)

			return alphaRequest<SubmissionResponse>("/api/v1/submissions", session?.access_token, { method: "POST", body: form })
		},
	})
}

export function useRunExtraction() {
	const { session } = useAuth()

	return useMutation({
		mutationFn: (submissionId: string) =>
			alphaRequest<ExtractionResponse>(alphaPath`/api/v1/submissions/${submissionId}/extractions`, session?.access_token, { method: "POST" }),
	})
}
