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

/**
 * Teto de caracteres de UM resultado de tool, em JSON compacto.
 *
 * É um freio contra patologia, não o controle de tamanho do dia a dia — quem dimensiona a
 * resposta normal é o `limit` de cada listagem (teto de 100 itens ≈ 17 KB). Por isso o
 * valor é folgado: a leitura de detalhe legítima não tem como estreitar a chamada. A
 * receita mais pesada do catálogo ("Cozido à Pernambucana", 31 ingredientes) dá 24 KB
 * compactos; barrá-la mandaria o modelo "reduzir o limit" de uma tool que não tem limit.
 *
 * 60 mil caracteres ≈ 15 mil tokens: cabe com folga num contexto de 128k e ainda pega o
 * caso que motivou tudo isto — os 10,6 MB de `list_recipes`.
 */
export const MAX_TOOL_RESULT_CHARS = 60_000

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
				"Refaça a chamada mais estreita — filtre por busca, período ou escopo, reduza o limit se a tool tiver um, " +
				"ou peça o recurso em partes."
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
