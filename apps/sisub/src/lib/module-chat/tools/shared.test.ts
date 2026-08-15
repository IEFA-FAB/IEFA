import { toJsonSchema } from "@iefa/sisub-domain"
import { AgentListRecipesSchema, clampLimit, MAX_TOOL_RESULT_CHARS, PayloadTooLargeError } from "@iefa/sisub-domain/agent"
import { describe, expect, test, vi } from "vitest"
import type { UserPermission } from "@/types/domain/permissions"
import { globalTools } from "./global"
import { kitchenTools } from "./kitchen"
import { localAnalyticsTools } from "./local-analytics"
import {
	getMaxLevel,
	type ModuleToolDefinition,
	requireKitchenPermission,
	requireUnitPermission,
	requireUuid,
	requireValidDates,
	safeInt,
	sanitizeDbError,
	type ToolContext,
	ToolPermissionError,
	ToolValidationError,
	toolErr,
	toolOk,
	wrapTool,
} from "./shared"
import { unitTools } from "./unit"

function permission(overrides: Partial<UserPermission> = {}): UserPermission {
	return {
		module: "kitchen",
		level: 1,
		mess_hall_id: null,
		kitchen_id: null,
		unit_id: null,
		...overrides,
	}
}

function ctx(permissions: UserPermission[]): ToolContext {
	return {
		userId: "user-1",
		module: "kitchen",
		permissions,
		supabase: {} as ToolContext["supabase"],
		db: {} as ToolContext["db"],
	}
}

describe("module-chat permission helpers", () => {
	test("requireKitchenPermission permite escopo correto e nega escopo divergente", () => {
		const context = ctx([permission({ module: "kitchen", level: 2, kitchen_id: 7 })])

		expect(() => requireKitchenPermission(context, 2, { type: "kitchen", id: 7 })).not.toThrow()
		expect(() => requireKitchenPermission(context, 2, { type: "kitchen", id: 8 })).toThrow(ToolPermissionError)
	})

	test("requireUnitPermission valida nível mínimo", () => {
		const context = ctx([permission({ module: "unit", level: 1, unit_id: 3 })])

		expect(() => requireUnitPermission(context, 1, { type: "unit", id: 3 })).not.toThrow()
		expect(() => requireUnitPermission(context, 2, { type: "unit", id: 3 })).toThrow("Permissão insuficiente")
	})

	test("getMaxLevel respeita módulo, escopo e permissões globais", () => {
		const permissions = [
			permission({ module: "kitchen", level: 1, kitchen_id: 1 }),
			permission({ module: "kitchen", level: 2, kitchen_id: 2 }),
			permission({ module: "unit", level: 3, unit_id: null }),
		]

		expect(getMaxLevel(permissions, "kitchen", 1)).toBe(1)
		expect(getMaxLevel(permissions, "kitchen", 2)).toBe(2)
		expect(getMaxLevel(permissions, "kitchen", 9)).toBe(0)
		expect(getMaxLevel(permissions, "unit", 99)).toBe(3)
	})
})

describe("module-chat validation helpers", () => {
	test("safeInt aceita inteiros e rejeita valores inválidos", () => {
		expect(safeInt("42", "unitId")).toBe(42)
		expect(() => safeInt("42.5", "unitId")).toThrow(ToolValidationError)
		expect(() => safeInt("abc", "unitId")).toThrow("unitId deve ser um número inteiro válido")
	})

	test("requireValidDates aceita formato YYYY-MM-DD e rejeita datas inválidas", () => {
		expect(() => requireValidDates("2026-05-20", "2026-05-21")).not.toThrow()
		expect(() => requireValidDates("20/05/2026")).toThrow(ToolValidationError)
		expect(() => requireValidDates("2026-99-99")).toThrow(ToolValidationError)
	})

	test("requireUuid aceita UUID e rejeita payload inválido", () => {
		const uuid = "550e8400-e29b-41d4-a716-446655440000"

		expect(requireUuid(uuid, "recipeId")).toBe(uuid)
		expect(() => requireUuid("not-a-uuid", "recipeId")).toThrow("recipeId deve ser um UUID válido")
	})
})

describe("module-chat result helpers", () => {
	test("toolOk e toolErr retornam contrato estável", () => {
		expect(toolOk({ id: 1 })).toEqual({ success: true, data: { id: 1 } })
		expect(toolErr("falhou")).toEqual({ success: false, error: "falhou" })
	})

	test("sanitizeDbError loga detalhe interno e retorna mensagem genérica", () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

		try {
			expect(sanitizeDbError(new Error("relation secret_table does not exist"), "list_recipes")).toBe("Erro ao executar list_recipes. Tente novamente.")
			expect(consoleSpy).toHaveBeenCalled()
		} finally {
			consoleSpy.mockRestore()
		}
	})

	test("wrapTool cria ServerTool com name, description e handler funcional", async () => {
		const def: ModuleToolDefinition = {
			name: "list_recipes",
			description: "Lista receitas",
			parameters: { type: "object", properties: {} },
			requiredLevel: 1,
			handler: async () => toolOk([]),
		}

		const serverTool = wrapTool(def, ctx([]))
		expect(serverTool.name).toBe("list_recipes")
		expect(serverTool.description).toBe("Lista receitas")
		expect(serverTool.__toolSide).toBe("server")
	})
})

describe("teto de payload das tools", () => {
	function toolReturning(data: unknown) {
		const def: ModuleToolDefinition = {
			name: "list_recipes",
			description: "Lista receitas",
			parameters: { type: "object", properties: {} },
			requiredLevel: 1,
			handler: async () => toolOk(data),
		}
		const execute = wrapTool(def, ctx([])).execute
		if (!execute) throw new Error("wrapTool não devolveu um ServerTool executável")
		return (args: Record<string, unknown>) => execute(args, undefined as never)
	}

	test("resultado dentro do teto passa intacto", async () => {
		const data = [{ id: "1", name: "Arroz" }]
		await expect(toolReturning(data)({})).resolves.toEqual(data)
	})

	test("resultado acima do teto vira erro acionável em vez de matar a run no provider", async () => {
		// O catálogo real (2.083 receitas com ingredientes aninhados) chegava a 10 MB:
		// o provider recusava o turno seguinte com 413 e o usuário via uma bolha vazia.
		const huge = Array.from({ length: 2000 }, (_, i) => ({ id: `id-${i}`, description: "x".repeat(200) }))
		expect(JSON.stringify(huge).length).toBeGreaterThan(MAX_TOOL_RESULT_CHARS)

		const run = toolReturning(huge)
		await expect(run({})).rejects.toBeInstanceOf(PayloadTooLargeError)
		await expect(run({})).rejects.toThrow(/reduza o limit/i)
	})

	test("a listagem de receitas do chat usa o mesmo contrato que o servidor MCP", () => {
		// O chat e o MCP expõem `list_recipes` para modelos diferentes a partir de bases
		// diferentes (function-calling x MCP). Enquanto cada lado escrevia o próprio JSON
		// Schema, os dois divergiam sem que nada quebrasse — este teste ancora a origem única.
		const kitchenListRecipes = kitchenTools.find((t) => t.name === "list_recipes")
		expect(kitchenListRecipes?.parameters).toEqual(toJsonSchema(AgentListRecipesSchema))

		const globalListRecipes = globalTools.find((t) => t.name === "list_recipes")
		expect(globalListRecipes?.parameters).toEqual(toJsonSchema(AgentListRecipesSchema.omit({ kitchenId: true })))
	})

	test("clampLimit aplica padrão e grampeia a faixa", () => {
		expect(clampLimit(undefined, 30, 100)).toBe(30)
		expect(clampLimit("abc", 30, 100)).toBe(30)
		expect(clampLimit(5, 30, 100)).toBe(5)
		expect(clampLimit(0, 30, 100)).toBe(1)
		expect(clampLimit(9999, 30, 100)).toBe(100)
		expect(clampLimit(12.7, 30, 100)).toBe(12)
	})

	test("toda listagem expõe limit — sem teto o payload cresce com o catálogo", () => {
		const listTools = [...globalTools, ...kitchenTools, ...unitTools, ...localAnalyticsTools].filter(
			(t) => t.name.startsWith("list_") || t.name === "get_atas" || t.name === "get_low_balance_items"
		)
		expect(listTools.length).toBeGreaterThan(0)

		const semLimite = listTools
			.filter((t) => {
				const props = (t.parameters as { properties?: Record<string, unknown> }).properties ?? {}
				return !("limit" in props)
			})
			.map((t) => t.name)

		// list_kitchens e get_meal_types são enumerações fechadas e curtas (dezenas de linhas).
		expect(semLimite).toEqual(["list_kitchens"])
	})
})
