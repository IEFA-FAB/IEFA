/**
 * Contrato de argumentos das tools do chat — o que acontece quando o modelo chama.
 *
 * A run morre inteira quando uma chamada é rejeitada: o modelo lê o erro de validação,
 * tenta de novo com sintaxe de function call quebrada e o provider responde 400
 * `tool_use_failed`, sem mensagem para o usuário. Foi exatamente essa cadeia que
 * `{"limit":2,"search":null}` disparou em `/global/chat`.
 *
 * Por isso este arquivo varre TODAS as tools de TODOS os módulos em vez de testar uma:
 * a próxima tool escrita entra na varredura sem ninguém lembrar deste teste.
 */

import type { ServerTool } from "@tanstack/ai"
import { describe, expect, test } from "vitest"
import type { UserPermission } from "@/types/domain/permissions"
import { globalTools } from "./global"
import { kitchenTools } from "./kitchen"
import { localAnalyticsTools } from "./local-analytics"
import { type ModuleToolDefinition, type ToolContext, toolOk, wrapTool } from "./shared"
import { unitTools } from "./unit"

const ALL_TOOLS: [string, ModuleToolDefinition[]][] = [
	["global", globalTools],
	["kitchen", kitchenTools],
	["unit", unitTools],
	["local-analytics", localAnalyticsTools],
]

function ctx(permissions: UserPermission[] = []): ToolContext {
	return {
		userId: "user-1",
		module: "global",
		permissions,
		supabase: {} as ToolContext["supabase"],
		db: {} as ToolContext["db"],
	}
}

type JsonProp = { type?: unknown; format?: string; enum?: unknown[]; anyOf?: { type?: unknown }[] }
type JsonSchema = { properties?: Record<string, JsonProp>; required?: string[] }

/** Valor plausível para um parâmetro obrigatório — o teste é sobre os opcionais. */
function sampleFor(prop: JsonProp): unknown {
	if (Array.isArray(prop.enum) && prop.enum.length > 0) return prop.enum[0]
	const type = Array.isArray(prop.type) ? prop.type.find((t) => t !== "null") : prop.type
	switch (type) {
		case "number":
		case "integer":
			return 1
		case "boolean":
			return true
		case "array":
			return []
		case "object":
			return {}
		default:
			return prop.format === "uuid" ? "11111111-1111-4111-8111-111111111111" : "2026-01-01"
	}
}

/** Argumentos como um modelo manda: obrigatórios preenchidos, opcionais explicitamente `null`. */
function argsWithNullOptionals(schema: JsonSchema): Record<string, unknown> {
	const required = new Set(schema.required ?? [])
	const args: Record<string, unknown> = {}
	for (const [name, prop] of Object.entries(schema.properties ?? {})) {
		args[name] = required.has(name) ? sampleFor(prop) : null
	}
	return args
}

/**
 * Roda a mesma validação que o engine do @tanstack/ai roda antes de chamar o handler.
 * Quando o `inputSchema` carrega um standard-schema (é o caso das tools que vêm de um
 * schema Zod do domínio), é ele quem barra a chamada — não o JSON Schema publicado.
 */
async function validateLikeEngine(tool: ServerTool, args: Record<string, unknown>): Promise<{ ok: boolean; message?: string }> {
	const schema = tool.inputSchema as {
		"~standard"?: {
			validate: (value: unknown) => { issues?: { message: string; path?: unknown[] }[] } | Promise<{ issues?: { message: string; path?: unknown[] }[] }>
		}
	}
	const standard = schema?.["~standard"]
	if (!standard) return { ok: true }

	const result = await standard.validate(args)
	if (!result.issues?.length) return { ok: true }
	return { ok: false, message: result.issues.map((issue) => `${(issue.path ?? []).join(".")}: ${issue.message}`).join("; ") }
}

describe("argumentos que o modelo manda de verdade", () => {
	for (const [modulo, tools] of ALL_TOOLS) {
		test(`[${modulo}] toda tool aceita chamada sem argumento opcional nenhum`, async () => {
			for (const def of tools) {
				const schema = def.parameters as JsonSchema
				const required = new Set(schema.required ?? [])
				const args = Object.fromEntries(
					Object.entries(schema.properties ?? {})
						.filter(([name]) => required.has(name))
						.map(([name, prop]) => [name, sampleFor(prop)])
				)

				const check = await validateLikeEngine(wrapTool(def, ctx()), args)
				expect(`${def.name}: ${check.ok ? "ok" : check.message}`).toBe(`${def.name}: ok`)
			}
		})

		test(`[${modulo}] toda tool aceita null nos opcionais`, async () => {
			// Regressão do bug de /global/chat: o modelo preenche o campo que não quer usar
			// com null em vez de omitir. Um único `.optional()` sem `.nullish()` derruba a run.
			for (const def of tools) {
				const check = await validateLikeEngine(wrapTool(def, ctx()), argsWithNullOptionals(def.parameters as JsonSchema))
				expect(`${def.name}: ${check.ok ? "ok" : check.message}`).toBe(`${def.name}: ok`)
			}
		})
	}
})

describe("normalização antes do handler", () => {
	function spyTool(parameters: Record<string, unknown>) {
		const recebidos: Record<string, unknown>[] = []
		const def: ModuleToolDefinition = {
			name: "spy",
			description: "spy",
			parameters,
			requiredLevel: 1,
			handler: async (args) => {
				recebidos.push(args)
				return toolOk({})
			},
		}
		const execute = wrapTool(def, ctx()).execute
		if (!execute) throw new Error("wrapTool não devolveu ServerTool executável")
		return { recebidos, run: (args: Record<string, unknown>) => execute(args, undefined as never) }
	}

	test("null em campo que o schema não declara anulável não chega no handler", async () => {
		// `safeInt(null)` devolveria 0 — um id de cozinha silenciosamente errado.
		const { recebidos, run } = spyTool({ type: "object", properties: { kitchenId: { type: "number" }, search: { type: "string" } }, required: ["kitchenId"] })

		await run({ kitchenId: 2, search: null })

		expect(recebidos[0]).toEqual({ kitchenId: 2 })
		expect("search" in (recebidos[0] ?? {})).toBe(false)
	})

	test("null em campo declarado anulável chega intacto — lá ele tem significado", async () => {
		const { recebidos, run } = spyTool({
			type: "object",
			properties: { kitchenId: { anyOf: [{ type: "number" }, { type: "null" }] } },
		})

		await run({ kitchenId: null })

		expect(recebidos[0]).toEqual({ kitchenId: null })
	})

	test("valores falsy legítimos passam — 0 e string vazia não são ausência", async () => {
		const { recebidos, run } = spyTool({ type: "object", properties: { limit: { type: "number" }, search: { type: "string" } } })

		await run({ limit: 0, search: "" })

		expect(recebidos[0]).toEqual({ limit: 0, search: "" })
	})
})
