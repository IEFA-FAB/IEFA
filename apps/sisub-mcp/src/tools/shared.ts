/**
 * Utilitários compartilhados entre todos os módulos de tools.
 *
 * hasPermission() — cópia literal da lógica em apps/sisub/src/auth/pbac.ts
 *   sem nenhuma dependência React ou TanStack.
 *
 * requireKitchenPermission() — helper para verificar acesso ao módulo "kitchen"
 *   e lançar McpError padronizado se negado.
 */

import { hasPermission } from "@iefa/pbac"
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js"
import type { PermissionScope, UserContext } from "../types.ts"

// hasPermission re-exportado de @iefa/pbac — fonte canônica
export { hasPermission }

// ---------------------------------------------------------------------------
// requireKitchenPermission — guarda para tools do módulo kitchen
// ---------------------------------------------------------------------------

/**
 * Lança McpError se o usuário não tiver permissão kitchen no nível exigido.
 * Use em todas as tools que operam sobre dados de cozinha.
 *
 * @param ctx      - Contexto do usuário (userId + permissions)
 * @param minLevel - 1 = leitura, 2 = escrita
 * @param scope    - Escopo opcional { type: "kitchen", id: kitchenId }
 */
export function requireKitchenPermission(ctx: UserContext, minLevel: 1 | 2 = 1, scope?: PermissionScope): void {
	if (!hasPermission(ctx.permissions, "kitchen", minLevel, scope)) {
		const action = minLevel === 2 ? "escrita" : "leitura"
		const scopeDesc = scope ? ` na cozinha ${scope.id}` : ""
		throw new McpError(ErrorCode.InvalidRequest, `Permissão insuficiente: requer kitchen nível ${minLevel} (${action})${scopeDesc}`)
	}
}

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
// sanitizeDbError — M3: evita vazamento de detalhes internos do banco
// ---------------------------------------------------------------------------

/**
 * Loga o erro real em stderr e retorna uma mensagem genérica segura para o cliente.
 * Impede que nomes de tabelas, colunas e constraints do banco sejam expostos.
 *
 * @param error   - Erro original (Supabase PostgrestError ou Error genérico)
 * @param context - Descrição da operação que falhou (para o log interno)
 * @returns Mensagem sanitizada segura para exibir ao cliente MCP
 */
export function sanitizeDbError(error: unknown, context: string): string {
	const detail = error instanceof Error ? error.message : String(error)
	process.stderr.write(`[sisub-mcp] DB error (${context}): ${detail}\n`)
	return `Erro interno ao executar "${context}". Tente novamente.`
}

// ---------------------------------------------------------------------------
// validateDate — M4: valida formato ISO 8601 antes de enviar ao Supabase
// ---------------------------------------------------------------------------

/** Regex para datas no formato YYYY-MM-DD com mês e dia válidos. */
const ISO_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

/**
 * Retorna true se a string for uma data ISO 8601 válida (YYYY-MM-DD).
 * Rejeita datas sintaticamente corretas mas calendariamente inválidas (ex: 2026-02-30).
 */
export function validateDate(s: unknown): boolean {
	if (typeof s !== "string" || !ISO_DATE_RE.test(s)) return false
	return !Number.isNaN(new Date(s).getTime())
}

/**
 * Lança McpError se qualquer string em `dates` não for uma data ISO 8601 válida.
 * Use antes de passar datas a queries Supabase.
 */
export function requireValidDates(...dates: unknown[]): void {
	for (const d of dates) {
		if (!validateDate(d)) {
			throw new McpError(ErrorCode.InvalidParams, `Data inválida: "${d}". Use o formato YYYY-MM-DD (ex: 2026-04-10).`)
		}
	}
}

// ---------------------------------------------------------------------------
// safeInt — H3: garante inteiro seguro antes de interpolação em filtros Supabase
// ---------------------------------------------------------------------------

/**
 * Converte um valor para número inteiro positivo ou lança McpError.
 * Use SEMPRE antes de interpolar valores em strings de filtro Supabase (.or(), etc.)
 * para evitar injeção de filtros via type coercion.
 *
 * @param v         - Valor a converter (pode ser number, string numérica, etc.)
 * @param fieldName - Nome do campo, para a mensagem de erro
 */
export function safeInt(v: unknown, fieldName: string): number {
	const n = Number(v)
	if (!Number.isInteger(n) || n < 0) {
		throw new McpError(ErrorCode.InvalidParams, `${fieldName} deve ser um número inteiro não-negativo`)
	}
	return n
}

// ---------------------------------------------------------------------------
// safePositiveNumber — permite floats não-negativos (ex: planned_portion_quantity)
// ---------------------------------------------------------------------------

/**
 * Converte um valor para número não-negativo (aceita decimais) ou lança McpError.
 * Use para campos como planned_portion_quantity que aceitam frações de porção.
 *
 * @param v         - Valor a converter
 * @param fieldName - Nome do campo, para a mensagem de erro
 */
export function safePositiveNumber(v: unknown, fieldName: string): number {
	const n = Number(v)
	if (Number.isNaN(n) || n < 0) {
		throw new McpError(ErrorCode.InvalidParams, `${fieldName} deve ser um número não-negativo`)
	}
	return n
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
