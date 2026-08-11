/**
 * Etapa 1.4 — extração do ETP/TR para o JSON canônico da contratação.
 *
 * Duas regras governam este módulo:
 *
 * 1. **Nada sem origem.** Todo campo preenchido carrega uma citação literal, que
 *    é reencontrada no texto para virar `source_span`. Citação que não é
 *    localizada faz o campo virar ausente — não "provavelmente certo".
 * 2. **Ausente é ausente.** Campo que o documento não traz é gravado como nulo,
 *    nunca inferido. Um ETP sem justificativa de parcelamento precisa aparecer
 *    como inconformidade na Etapa 1.6, e não como texto inventado aqui.
 */

import { z } from "zod"
import { env } from "../env.ts"
import { structuredLLM } from "../lib/llm.ts"
import { applySpans, type ExtractionResult } from "./apply-spans.ts"
import { CAMPO_LABELS, type Contratacao } from "./schema.ts"

/** Tentativas de extração antes de declarar falha. */
const MAX_ATTEMPTS = 2

const SYSTEM_PROMPT = `Você extrai dados estruturados de documentos de contratação pública brasileira (ETP, Termo de Referência, Edital) regidos pela Lei nº 14.133/2021.

REGRAS ABSOLUTAS:
1. Para cada campo, "evidence" DEVE ser uma citação literal e contínua do documento, copiada exatamente como aparece, com no mínimo 12 caracteres.
2. Se o documento não tratar de um campo, retorne null para esse campo. NUNCA invente, deduza ou complete informação ausente.
3. "value" é um resumo fiel do que o documento diz naquele ponto; "evidence" é o trecho original que o sustenta.
4. Não normalize, corrija nem traduza o texto da evidência.`

const extractionJsonSchema = {
	name: "contratacao",
	description: "Atributos da contratação extraídos do documento",
	parameters: {
		type: "object",
		properties: Object.fromEntries(
			Object.keys(CAMPO_LABELS).map((field) => [
				field,
				field === "objeto_tipo"
					? { type: ["string", "null"], enum: ["COMPRAS", "SERVICOS", "OBRAS", "TIC", null], description: CAMPO_LABELS[field as keyof Contratacao] }
					: {
							type: ["object", "null"],
							description: CAMPO_LABELS[field as keyof Contratacao],
							properties: {
								value: { type: "string" },
								evidence: { type: "string", description: "Citação literal do documento" },
							},
							required: ["value", "evidence"],
						},
			])
		),
		required: Object.keys(CAMPO_LABELS),
	},
}

function truncate(text: string): { text: string; truncated: boolean } {
	const max = env.ALPHA_EXTRACTION_MAX_CHARS
	if (text.length <= max) return { text, truncated: false }

	return { text: `${text.slice(0, max)}\n[...documento truncado para extração...]`, truncated: true }
}

export async function extractContratacao(documentText: string, docKind: string): Promise<ExtractionResult> {
	const model = structuredLLM(extractionJsonSchema)
	const modelName = env.ALPHA_AI_MODEL
	const { text, truncated } = truncate(documentText)

	let lastError: unknown

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			const raw = await model.invoke([
				{ role: "system", content: SYSTEM_PROMPT },
				{ role: "user", content: `TIPO DE DOCUMENTO: ${docKind}\n\nDOCUMENTO:\n${text}` },
			])

			return { ...applySpans(raw, documentText), model: modelName, truncated }
		} catch (error) {
			lastError = error
			// Saída fora do schema é motivo de nova tentativa, não de gravar
			// payload inválido: o JSON alimenta todas as etapas seguintes.
			if (!(error instanceof z.ZodError) && attempt === MAX_ATTEMPTS) break
		}
	}

	throw new Error(`extração falhou após ${MAX_ATTEMPTS} tentativa(s): ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

export type { ExtractionResult }
export { applySpans }
