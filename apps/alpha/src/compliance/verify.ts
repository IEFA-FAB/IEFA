/**
 * Etapas 1.6 e 1.7 — verificação de conformidade e consolidação do parecer.
 *
 * Ordem das defesas, da mais barata para a mais cara:
 *
 * 1. só regras `active` aplicáveis à submissão são executadas;
 * 2. a regra é julgada contra **trechos recuperados da norma vigente** — sem
 *    trecho acima do limiar, a regra fica "não avaliada", nunca conforme;
 * 3. o achado passa pelo **guard de citação**: referência que não resolve contra
 *    dispositivo real é descartada e contabilizada;
 * 4. o texto do achado passa pela checagem de fundamentação.
 *
 * A execução grava quais versões de modelo e de norma usou — é isso que torna o
 * parecer reproduzível meses depois.
 */

import { supabase } from "../db/supabase.ts"
import type { Contratacao } from "../extraction/schema.ts"
import { CAMPO_LABELS } from "../extraction/schema.ts"
import type { LegalRef } from "../lib/legal-ref.ts"
import { getLLM } from "../lib/llm.ts"
import { radaRetriever } from "../tools/rada-retriever.ts"
import type { LegalRefResolver } from "./resolve-legal-ref.ts"
import type { Severity } from "./severity.ts"

/** Nível mínimo de confiança do juiz para o achado ser considerado. */
const MIN_CONFIDENCE = 0.6

export interface ChecklistRule {
	id: string
	code: string
	kind: "ESTRUTURAL" | "CONTEUDO" | "CRUZADA"
	severity: Severity
	legal_ref: LegalRef[]
	applicability: { modalidade?: string[]; objeto?: string[] }
	target_field: string | null
	statement: string
	prompt: string | null
}

export interface RuleVerdict {
	status: "CONFORME" | "INCONFORME" | "NAO_AVALIADA"
	confidence: number
	evidence: string | null
	legal_ref: LegalRef[]
	suggestion: string | null
	message: string
}

const judgeSchema = {
	name: "verificacao_regra",
	description: "Resultado da verificação de uma regra de conformidade sobre um trecho do documento",
	parameters: {
		type: "object",
		properties: {
			status: { type: "string", enum: ["CONFORME", "INCONFORME", "NAO_AVALIADA"] },
			confidence: { type: "number", minimum: 0, maximum: 1 },
			message: { type: "string", description: "Descrição objetiva do que foi constatado" },
			evidence: { type: ["string", "null"], description: "Trecho do documento que sustenta a constatação" },
			dispositivo: { type: ["string", "null"], description: "Dispositivo citado, ex.: art. 18, § 1º, VIII" },
			norma: { type: ["string", "null"], description: "Norma citada, ex.: Lei nº 14.133/2021" },
			suggestion: { type: ["string", "null"], description: "Correção sugerida, quando inconforme" },
		},
		required: ["status", "confidence", "message"],
	},
}

const SYSTEM_PROMPT = `Você verifica conformidade de documentos de contratação pública brasileira contra a Lei nº 14.133/2021 e suas normas regulamentadoras.

REGRAS ABSOLUTAS:
1. Julgue APENAS com base nos trechos da norma fornecidos e no trecho do documento fornecido.
2. Se os trechos da norma não permitirem concluir, responda NAO_AVALIADA. Nunca responda CONFORME por ausência de informação.
3. Cite exclusivamente dispositivos que apareçam nos trechos da norma fornecidos. Não cite de memória.
4. "evidence" deve ser trecho literal do documento analisado.`

/** Aplicabilidade da regra à submissão. */
export function isApplicable(rule: ChecklistRule, context: { modalidade: string | null; objeto: string | null }): boolean {
	const { modalidade, objeto } = rule.applicability ?? {}

	if (modalidade?.length && context.modalidade && !modalidade.includes(context.modalidade)) return false
	if (objeto?.length && context.objeto && !objeto.includes(context.objeto)) return false

	return true
}

/** Bloco de texto sobre o qual a regra é avaliada. */
export function blockForRule(rule: ChecklistRule, payload: Contratacao): { label: string; text: string } | null {
	if (!rule.target_field) {
		// Regra sem campo alvo é avaliada contra o conjunto dos campos preenchidos.
		const text = (Object.keys(CAMPO_LABELS) as Array<keyof Contratacao>)
			.map((key) => {
				const field = payload[key]
				return field && typeof field !== "string" ? `${CAMPO_LABELS[key]}: ${field.value}` : null
			})
			.filter(Boolean)
			.join("\n")

		return text ? { label: "documento", text } : null
	}

	const field = payload[rule.target_field as keyof Contratacao]
	if (!field || typeof field === "string") return null

	return { label: CAMPO_LABELS[rule.target_field as keyof Contratacao], text: field.value }
}

export async function loadActiveRules(): Promise<ChecklistRule[]> {
	const { data, error } = await supabase
		.from("checklist_rule")
		.select("id, code, kind, severity, legal_ref, applicability, target_field, statement, prompt")
		.eq("status", "active")

	if (error) throw new Error(`leitura de regras ativas falhou: ${error.message}`)
	return (data ?? []) as ChecklistRule[]
}

/**
 * Julga uma regra contra um bloco do documento.
 *
 * A recuperação é feita sobre a legislação vigente; nenhum trecho acima do
 * limiar significa que a regra não foi avaliada — e não que está conforme.
 */
export async function judgeRule(rule: ChecklistRule, block: { label: string; text: string }): Promise<RuleVerdict> {
	const query = [rule.statement, rule.legal_ref.map((ref) => `${ref.dispositivo} ${ref.norma}`).join(" ")].filter(Boolean).join(" ")

	const retrieval = await radaRetriever({ query, top_k: 6 })

	if (retrieval.documents.length === 0) {
		return {
			status: "NAO_AVALIADA",
			confidence: 0,
			evidence: null,
			legal_ref: [],
			suggestion: null,
			message: "Nenhum trecho da norma foi recuperado acima do limiar de relevância para esta regra.",
		}
	}

	const normaContext = retrieval.documents
		.map((document, index) => `[${index + 1}] ${document.metadata.source} ${document.metadata.article}: ${document.content}`)
		.join("\n\n")

	const judge = getLLM(0).withStructuredOutput(judgeSchema)
	const raw = (await judge.invoke([
		{ role: "system", content: SYSTEM_PROMPT },
		{
			role: "user",
			content: `REGRA A VERIFICAR:\n${rule.statement}\n\nTRECHOS DA NORMA:\n${normaContext}\n\nTRECHO DO DOCUMENTO (${block.label}):\n${block.text}`,
		},
	])) as {
		status: RuleVerdict["status"]
		confidence: number
		message: string
		evidence?: string | null
		dispositivo?: string | null
		norma?: string | null
		suggestion?: string | null
	}

	return {
		status: raw.status,
		confidence: raw.confidence,
		evidence: raw.evidence ?? null,
		suggestion: raw.suggestion ?? null,
		message: raw.message,
		legal_ref: raw.norma && raw.dispositivo ? [{ norma: raw.norma, dispositivo: raw.dispositivo }] : rule.legal_ref,
	}
}

export interface GuardOutcome {
	kept: boolean
	reason?: "sem_referencia" | "referencia_nao_resolvida" | "confianca_insuficiente"
	resolved_refs: LegalRef[]
}

/**
 * Guard de citação.
 *
 * Achado sem referência, com referência que não resolve, ou com confiança
 * abaixo do limiar é descartado. O modo de falha que isso previne não é deixar
 * passar uma inconformidade — é apontar uma inconformidade citando artigo
 * inexistente, que é irrecuperável em termos de confiança.
 */
export async function applyCitationGuard(verdict: RuleVerdict, resolver: LegalRefResolver): Promise<GuardOutcome> {
	if (verdict.status !== "INCONFORME") return { kept: true, resolved_refs: verdict.legal_ref }
	if (verdict.confidence < MIN_CONFIDENCE) return { kept: false, reason: "confianca_insuficiente", resolved_refs: [] }
	if (verdict.legal_ref.length === 0) return { kept: false, reason: "sem_referencia", resolved_refs: [] }

	const resolutions = await resolver.resolveAll(verdict.legal_ref)
	const resolved = resolutions.filter((resolution) => resolution.resolved)

	if (resolved.length === 0) return { kept: false, reason: "referencia_nao_resolvida", resolved_refs: [] }

	return { kept: true, resolved_refs: resolved.map((resolution) => ({ norma: resolution.norma, dispositivo: resolution.dispositivo })) }
}
