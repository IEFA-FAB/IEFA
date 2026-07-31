/**
 * Validação da saída do modelo e conversão de citação em span.
 *
 * Separado de `extract.ts` porque é lógica pura — é aqui que mora a regra de
 * descarte ("valor sem origem localizável não é persistido"), e ela precisa ser
 * exercitável em teste sem chamar modelo nem ler variável de ambiente.
 */

import { locateSpan } from "./locate-span.ts"
import { CAMPO_LABELS, type Contratacao, ContratacaoSchema, type ExtractionSpans } from "./schema.ts"

export interface ExtractionResult {
	payload: Contratacao
	spans: ExtractionSpans
	model: string
	/** Campos descartados por não ter trecho de origem localizável. */
	dropped: Array<{ field: keyof Contratacao; reason: "evidencia_nao_localizada" }>
}

/**
 * Valida a saída do modelo e converte cada citação em span.
 *
 * Exportada à parte da chamada ao modelo para ser testável sem rede — é aqui
 * que mora a regra de descarte, e é ela que precisa de cobertura.
 */
export function applySpans(raw: unknown, documentText: string): Omit<ExtractionResult, "model"> {
	const parsed = ContratacaoSchema.parse(raw)
	const spans: ExtractionSpans = {}
	const dropped: ExtractionResult["dropped"] = []
	const payload = { ...parsed }

	for (const key of Object.keys(CAMPO_LABELS) as Array<keyof Contratacao>) {
		if (key === "objeto_tipo") continue

		const field = parsed[key]
		if (!field || typeof field === "string") continue

		const span = locateSpan(documentText, field.evidence)
		if (!span) {
			// Sem origem localizável o campo não existe para efeito de análise.
			;(payload[key] as unknown) = null
			dropped.push({ field: key, reason: "evidencia_nao_localizada" })
			continue
		}

		spans[key] = span
	}

	return { payload, spans, dropped }
}
