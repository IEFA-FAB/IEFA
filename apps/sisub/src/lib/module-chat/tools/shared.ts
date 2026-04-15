/**
 * Shared utilities for module chat tools.
 * Provides ToolContext, permission helpers, and OpenAI function-calling format helpers.
 */

import type { Database } from "@iefa/database"
import type { SupabaseClient } from "@supabase/supabase-js"
import { hasPermission } from "@/auth/pbac"
import type { AppModule, PermissionScope, UserPermission } from "@/types/domain/permissions"

// ── Tool context (passed to every tool handler) ─────────────────────────────

export interface ToolContext {
	userId: string
	permissions: UserPermission[]
	module: string
	scopeId?: number
	supabase: SupabaseClient<Database, "sisub">
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
// biome-ignore lint/suspicious/noExplicitAny: bypass strict table typing
export function untypedFrom(ctx: ToolContext, table: string): any {
	// biome-ignore lint/suspicious/noExplicitAny: bypass strict table typing
	return (ctx.supabase as any).from(table)
}

/**
 * Convert ModuleToolDefinition[] to OpenAI tools format.
 */
export function toOpenAITools(tools: ModuleToolDefinition[]): Array<{
	type: "function"
	function: { name: string; description: string; parameters: Record<string, unknown> }
}> {
	return tools.map((t) => ({
		type: "function" as const,
		function: {
			name: t.name,
			description: t.description,
			parameters: t.parameters,
		},
	}))
}
