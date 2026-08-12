/**
 * Shared utilities for module chat tools.
 * Provides ToolContext, permission helpers, and TanStack AI tool wrapping.
 */

import type { Database } from "@iefa/database"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { hasPermission } from "@iefa/pbac"
import type { UserContext } from "@iefa/sisub-domain"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { ServerTool } from "@tanstack/ai"
import { toolDefinition } from "@tanstack/ai"
import type { AppModule, PermissionScope, UserPermission } from "@/types/domain/permissions"

// ── Tool context (passed to every tool handler) ─────────────────────────────

export interface ToolContext {
	userId: string
	permissions: UserPermission[]
	module: string
	scopeId?: number
	// Schema default kitchen; tools que leem core/procurement usam `.schema()`.
	supabase: SupabaseClient<Database, "kitchen">
	/**
	 * Cliente Drizzle das operations do domínio. Toda tool que lê algo já modelado em
	 * `@iefa/sisub-domain` deve passar por aqui em vez de montar PostgREST na mão: a
	 * query crua duplica nome de tabela e de coluna sem nada checar, e foi assim que
	 * `list_ingredients` acabou ordenando por uma coluna `name` que não existe.
	 */
	db: SisubDb
}

/** Traduz o contexto da tool para o `UserContext` que os guards do domínio esperam. */
export function domainCtx(ctx: ToolContext): UserContext {
	return { userId: ctx.userId, permissions: ctx.permissions }
}

// ── Tool definition (OpenAI function-calling format) ────────────────────────

export interface ModuleToolDefinition {
	name: string
	description: string
	parameters: Record<string, unknown> // JSON Schema
	requiredLevel: 1 | 2 | 3
	handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolHandlerResult>
}

export interface ToolHandlerResult {
	success: boolean
	data?: unknown
	error?: string
}

// ── Permission helpers ──────────────────────────────────────────────────────

export function requireModulePermission(ctx: ToolContext, module: AppModule, minLevel: number, scope?: PermissionScope): void {
	if (!hasPermission(ctx.permissions, module, minLevel, scope)) {
		throw new ToolPermissionError(`Permissão insuficiente: requer ${module} nível ${minLevel}`)
	}
}

export function requireKitchenPermission(ctx: ToolContext, minLevel: number, scope?: PermissionScope): void {
	requireModulePermission(ctx, "kitchen", minLevel, scope)
}

export function requireGlobalPermission(ctx: ToolContext, minLevel: number): void {
	requireModulePermission(ctx, "global", minLevel)
}

export function requireUnitPermission(ctx: ToolContext, minLevel: number, scope?: PermissionScope): void {
	requireModulePermission(ctx, "unit", minLevel, scope)
}

/**
 * Gets the max permission level for a given module + optional scope.
 */
export function getMaxLevel(permissions: UserPermission[], module: AppModule, scopeId?: number): number {
	const scopeType = module === "kitchen" ? "kitchen" : module === "unit" ? "unit" : undefined

	let maxLevel = 0
	for (const p of permissions) {
		if (p.module !== module) continue

		const isGlobal = p.unit_id === null && p.mess_hall_id === null && p.kitchen_id === null
		if (isGlobal) {
			maxLevel = Math.max(maxLevel, p.level)
			continue
		}

		if (!scopeType || scopeId == null) {
			maxLevel = Math.max(maxLevel, p.level)
			continue
		}

		if (scopeType === "kitchen" && p.kitchen_id === scopeId) {
			maxLevel = Math.max(maxLevel, p.level)
		} else if (scopeType === "unit" && p.unit_id === scopeId) {
			maxLevel = Math.max(maxLevel, p.level)
		}
	}

	return maxLevel
}

// ── Validation helpers ──────────────────────────────────────────────────────

export function safeInt(value: unknown, name: string): number {
	const num = Number(value)
	if (!Number.isFinite(num) || !Number.isInteger(num)) {
		throw new ToolValidationError(`${name} deve ser um número inteiro válido`)
	}
	return num
}

export function requireValidDates(...dates: unknown[]): void {
	for (const d of dates) {
		if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
			throw new ToolValidationError(`Data inválida: "${d}". Use formato YYYY-MM-DD.`)
		}
		const parsed = new Date(`${d}T00:00:00Z`)
		if (Number.isNaN(parsed.getTime())) {
			throw new ToolValidationError(`Data inválida: "${d}"`)
		}
	}
}

export function requireUuid(value: unknown, name: string): string {
	if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
		throw new ToolValidationError(`${name} deve ser um UUID válido`)
	}
	return value
}

/**
 * Normaliza o `limit` que o modelo mandou: ausente vira o padrão, fora da faixa
 * é grampeado. Toda tool de listagem precisa de um teto — sem ele a resposta
 * cresce com o catálogo e o turno seguinte estoura o limite do provider.
 */
export function clampLimit(value: unknown, fallback: number, max: number): number {
	if (value == null) return fallback
	const num = Number(value)
	if (!Number.isFinite(num)) return fallback
	return Math.min(Math.max(Math.trunc(num), 1), max)
}

// ── Error classes ───────────────────────────────────────────────────────────

export class ToolPermissionError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "ToolPermissionError"
	}
}

export class ToolValidationError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "ToolValidationError"
	}
}

export class ToolResultTooLargeError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "ToolResultTooLargeError"
	}
}

// ── Result helpers ──────────────────────────────────────────────────────────

export function toolOk(data: unknown): ToolHandlerResult {
	return { success: true, data }
}

export function toolErr(error: string): ToolHandlerResult {
	return { success: false, error }
}

/**
 * Sanitize DB errors to avoid exposing internal details to the LLM.
 */
export function sanitizeDbError(error: { message?: string; code?: string } | Error, context: string): string {
	const msg = error instanceof Error ? error.message : (error.message ?? "Erro desconhecido")
	// biome-ignore lint/suspicious/noConsole: server-side error logging
	console.error(`[module-chat:${context}]`, msg)
	return `Erro ao executar ${context}. Tente novamente.`
}

/**
 * Untyped .from() helper for tables not yet in the generated Supabase types
 * (e.g., after a migration that hasn't been regenerated).
 * Also useful for tables whose generated types have column-name mismatches.
 */
// biome-ignore lint/suspicious/noExplicitAny: dynamic table string — no generated type for runtime-resolved table names
export function untypedFrom(ctx: ToolContext, table: string): any {
	// biome-ignore lint/suspicious/noExplicitAny: dynamic table string — no generated type for runtime-resolved table names
	return (ctx.supabase as SupabaseClient<any, any>).from(table)
}

/**
 * Teto de caracteres do resultado de UMA tool, em JSON.
 *
 * O resultado da tool volta ao provider inteiro, dentro do prompt do turno
 * seguinte. Sem teto, uma listagem que cresce com o catálogo (o `list_recipes`
 * chegou a 10 MB com 2.083 receitas e ingredientes aninhados) faz o provider
 * responder 413 — a run morre com RUN_ERROR e o usuário vê só uma bolha vazia.
 * ~24 mil caracteres ≈ 6 mil tokens: cabe com folga em qualquer modelo e ainda
 * deixa espaço para o histórico.
 */
export const MAX_TOOL_RESULT_CHARS = 24_000

/**
 * Wraps a ModuleToolDefinition as a TanStack AI ServerTool.
 * The ToolContext is injected via closure so each request gets its own auth/supabase.
 */
export function wrapTool(def: ModuleToolDefinition, ctx: ToolContext): ServerTool {
	return toolDefinition({
		name: def.name,
		description: def.description,
		// Pass the JSON schema directly — TanStack AI v0.22+ accepts plain JSONSchema
		// biome-ignore lint/suspicious/noExplicitAny: plain JSONSchema accepted at runtime but not yet reflected in SchemaInput types
		inputSchema: def.parameters as any,
	}).server(async (args) => {
		const result = await def.handler(args as Record<string, unknown>, ctx)
		if (!result.success) throw new Error(result.error ?? "Ferramenta falhou")

		// Rede de segurança para o payload: falhar aqui devolve um erro de tool que
		// o modelo lê e pode corrigir (buscar mais estreito, pedir menos itens).
		// Deixar passar quebra a run inteira no provider, sem mensagem nenhuma.
		const serialized = JSON.stringify(result.data ?? null)
		if (serialized.length > MAX_TOOL_RESULT_CHARS) {
			throw new ToolResultTooLargeError(
				`Resultado de ${def.name} grande demais (${Math.round(serialized.length / 1000)} mil caracteres; teto ${Math.round(MAX_TOOL_RESULT_CHARS / 1000)} mil). ` +
					"Refaça a chamada mais estreita: filtre por busca/data/escopo ou reduza o limit."
			)
		}
		return result.data
	})
}
