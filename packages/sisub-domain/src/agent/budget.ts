/**
 * Orçamento de payload das ferramentas de IA — regra única para os dois consumidores
 * (chat dos módulos do sisub e servidor MCP).
 *
 * O resultado de uma tool não é lido por um humano: ele volta INTEIRO no prompt do
 * turno seguinte. Uma listagem que cresce com o catálogo, portanto, não degrada — ela
 * quebra. Foi exatamente isso que aconteceu: `list_recipes` devolvia as 2.083 receitas
 * com os ingredientes aninhados (10,6 MB no chat, 10,9 MB no MCP), o provider recusava
 * o turno seguinte com 413 Request Entity Too Large e a conversa morria sem mensagem.
 *
 * Falhar aqui é melhor que deixar passar: o erro volta como resultado da tool, o modelo
 * lê, estreita a chamada e continua. O 413 mata a run inteira.
 */

import { DomainError } from "../types/errors.ts"

/** ~24 mil caracteres ≈ 6 mil tokens: cabe em qualquer modelo e sobra espaço p/ histórico. */
export const MAX_TOOL_RESULT_CHARS = 24_000

/** Padrão e teto de qualquer listagem exposta a um agente. */
export const AGENT_LIST_DEFAULT = 30
export const AGENT_LIST_MAX = 100

export class PayloadTooLargeError extends DomainError {
	constructor(
		public readonly toolName: string,
		public readonly chars: number,
		public readonly max: number
	) {
		super(
			"PAYLOAD_TOO_LARGE",
			`Resultado de ${toolName} grande demais (${Math.round(chars / 1000)} mil caracteres; teto ${Math.round(max / 1000)} mil). ` +
				"Refaça a chamada mais estreita: filtre por busca/data/escopo ou reduza o limit."
		)
		this.name = "PayloadTooLargeError"
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

/**
 * Normaliza o `limit` que o modelo mandou: ausente vira o padrão, fora da faixa é grampeado.
 * Modelo manda `limit: 0`, `limit: "muitos"` e `limit: 5000` — nenhum desses pode passar.
 */
export function clampLimit(value: unknown, fallback: number = AGENT_LIST_DEFAULT, max: number = AGENT_LIST_MAX): number {
	if (value == null) return fallback
	const num = Number(value)
	if (!Number.isFinite(num)) return fallback
	return Math.min(Math.max(Math.trunc(num), 1), max)
}

/**
 * Verifica o resultado de uma tool contra o teto. Lança `PayloadTooLargeError` — que os
 * dois consumidores já traduzem em erro de tool legível pelo modelo.
 */
export function enforcePayloadBudget<T>(toolName: string, data: T, max: number = MAX_TOOL_RESULT_CHARS): T {
	const chars = JSON.stringify(data ?? null).length
	if (chars > max) throw new PayloadTooLargeError(toolName, chars, max)
	return data
}
