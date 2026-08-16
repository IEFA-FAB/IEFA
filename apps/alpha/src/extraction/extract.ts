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
					? { type: "string", enum: ["COMPRAS", "SERVICOS", "OBRAS", "TIC"], description: CAMPO_LABELS[field as keyof Contratacao] }
					: {
							type: "object",
							description: CAMPO_LABELS[field as keyof Contratacao],
							properties: {
								value: { type: "string" },
								evidence: { type: "string", description: "Citação literal do documento" },
							},
							required: ["value", "evidence"],
						},
			])
		),
		// Nenhum campo é obrigatório: campo que o documento não traz deve ser
		// **omitido**. Declará-los todos como `required` (com união `object|null`)
		// empurra o modelo a preencher de qualquer jeito — o gpt-oss devolvia
		// string onde o schema pedia objeto, e a extração inteira falhava.
		required: [] as string[],
	},
}

function truncate(text: string): { text: string; truncated: boolean } {
	const max = env.ALPHA_EXTRACTION_MAX_CHARS
	if (text.length <= max) return { text, truncated: false }

	return { text: `${text.slice(0, max)}\n[...documento truncado para extração...]`, truncated: true }
}

/**
 * Erro que uma nova tentativa pode resolver.
 *
 * Saída fora do schema entra aqui porque o modelo costuma acertar na segunda —
 * e gravar payload inválido não é opção, já que o JSON alimenta todas as etapas
 * seguintes. Throttling e indisponibilidade do Bedrock, idem.
 */
function isRetryable(error: unknown): boolean {
	if (error instanceof z.ZodError) return true

	const name = error instanceof Error ? `${error.name} ${error.message}` : String(error)
	return /throttl|too ?many ?requests|serviceunavailable|internalserver|timeout|timed out|econnreset|socket hang up/i.test(name)
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
			// Só repete o que uma segunda chamada pode consertar. Chave inválida,
			// modelo inexistente ou acesso negado dão o mesmo erro em toda
			// tentativa: insistir só multiplica a latência antes de falhar igual.
			if (!isRetryable(error)) break
		}
	}

	throw new Error(`extração falhou após ${MAX_ATTEMPTS} tentativa(s): ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

export type { ExtractionResult }
export { applySpans }
