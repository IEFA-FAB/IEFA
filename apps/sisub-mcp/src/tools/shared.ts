/**
 * Utilitários MCP — formatação de respostas e tipos de tool.
 *
 * safeInt, safePositiveNumber, validateDate, requireValidDates e
 * requireKitchenPermission foram removidos — migrados para @iefa/sisub-domain.
 *
 * toolResult e toolError são formatação MCP (não domínio) — mantidos aqui.
 */

import { MAX_TOOL_RESULT_CHARS, PayloadTooLargeError } from "@iefa/sisub-domain/agent"

// ---------------------------------------------------------------------------
// toolResult — helper para formatar respostas de tool
// ---------------------------------------------------------------------------

/** Formata um valor qualquer como conteúdo de texto JSON para MCP. */
export function toolResult(data: unknown) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
	}
}

/**
 * Orçamento de payload no despacho — o mesmo teto que o chat dos módulos aplica, vindo de
 * `@iefa/sisub-domain/agent`.
 *
 * O texto de uma tool vai INTEIRO para o prompt do cliente MCP. `list_recipes` devolvia
 * 10,9 MB (as ~2.000 receitas com ficha técnica): nenhum turno acontecia depois disso.
 * Aqui, em vez de estourar o cliente, a tool devolve um erro que o modelo lê e corrige.
 *
 * Fica no despacho, e não em `toolResult`, por dois motivos: o nome da tool está
 * disponível (a mensagem diz o que estreitar) e toda tool — inclusive as que forem
 * escritas depois, sem lembrar deste teto — passa por aqui.
 */
export function enforceToolResultBudget(toolName: string, result: ToolCallResult): ToolCallResult {
	if (result.isError) return result
	const chars = result.content.reduce((total, part) => total + part.text.length, 0)
	if (chars <= MAX_TOOL_RESULT_CHARS) return result
	return toolError(new PayloadTooLargeError(toolName, chars, MAX_TOOL_RESULT_CHARS).message)
}

/** Formata um erro como resposta de tool (não lança exceção — retorna isError). */
export function toolError(message: string) {
	return {
		content: [{ type: "text" as const, text: message }],
		isError: true as const,
	}
}

// ---------------------------------------------------------------------------
// ToolDefinition — tipo para organizar as tools em módulos separados
// ---------------------------------------------------------------------------

export interface ToolSchema {
	name: string
	description: string
	inputSchema: {
		type: "object"
		properties: Record<string, unknown>
		required?: string[]
	}
}

// `type`, não `interface`: o SDK do MCP tipa o retorno do handler com index signature, e
// só um alias ganha a index signature implícita que torna o objeto atribuível.
export type ToolCallResult = {
	content: { type: "text"; text: string }[]
	isError?: true
}

export interface ToolDefinition {
	schema: ToolSchema
	// biome-ignore lint/suspicious/noExplicitAny: args variam por tool
	handler: (args: any, credential: string) => Promise<ToolCallResult>
}
