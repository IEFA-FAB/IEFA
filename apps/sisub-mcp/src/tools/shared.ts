/**
 * Utilitários MCP — formatação de respostas e tipos de tool.
 *
 * safeInt, safePositiveNumber, validateDate, requireValidDates e
 * requireKitchenPermission foram removidos — migrados para @iefa/sisub-domain.
 *
 * toolResult e toolError são formatação MCP (não domínio) — mantidos aqui.
 */

// ---------------------------------------------------------------------------
// toolResult — helper para formatar respostas de tool
// ---------------------------------------------------------------------------

/** Formata um valor qualquer como conteúdo de texto JSON para MCP. */
export function toolResult(data: unknown) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
	}
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

export interface ToolDefinition {
	schema: ToolSchema
	// biome-ignore lint/suspicious/noExplicitAny: args variam por tool
	handler: (args: any, credential: string) => Promise<{ content: { type: "text"; text: string }[]; isError?: true }>
}
