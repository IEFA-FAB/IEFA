/**
 * Escopo da rota no servidor (`assertRouteScope`): na rota da cozinha A, nenhuma tool lê nem
 * grava na cozinha B, mesmo com o usuário tendo permissão nas duas. Vale para a cozinha ou
 * unidade DONA da linha afetada, não só para o argumento — `remove_menu_item` só recebe
 * `itemId`, e é um texto gravado (modo de preparo, nota do anexo) que induz o modelo a usar o
 * id de outra cozinha.
 *
 * As permissões aqui são sem escopo (nível 2 em todas as cozinhas/unidades): o PBAC deixaria
 * passar, e o que recusa é só o escopo da rota. Recurso global (receita ou template sem
 * cozinha) e conversa sem cozinha na rota passam.
 */

import { beforeEach, describe, expect, test, vi } from "vitest"
import type { UserPermission } from "@/types/domain/permissions"
import { kitchenTools } from "./kitchen"
import { assertRouteScope, resolveRouteScope, type ToolContext, ToolPermissionError, toModelFacingToolError } from "./shared"
import { findWrappedTool } from "./test-helpers"
import { unitTools } from "./unit"

const ROUTE_KITCHEN = 5
const OTHER_KITCHEN = 9
const ROUTE_UNIT = 7
const OTHER_UNIT = 8
const UUID = "11111111-1111-4111-8111-111111111111"
const UUID_2 = "22222222-2222-4222-8222-222222222222"
const SCOPE_ERROR = /Fora do escopo desta conversa/
/** Conversa sem cozinha/unidade na rota (`undefined` cairia no valor padrão do parâmetro). */
const NO_ROUTE = null

const domainMocks = vi.hoisted(() => ({
	upsertDailyMenu: vi.fn(),
	agentFetchMenus: vi.fn(),
	agentFetchDayMenus: vi.fn(),
	agentListRecipes: vi.fn(),
	agentGetRecipe: vi.fn(),
	agentGetTemplateItems: vi.fn(),
	agentApplyTemplate: vi.fn(),
	agentListKitchenEquipment: vi.fn(),
	agentGetRecipeEquipment: vi.fn(),
	agentCheckRecipeEquipment: vi.fn(),
	agentCheckMenuEquipment: vi.fn(),
	agentGetQuantityEstimate: vi.fn(),
	agentUpdateQuantityEstimateStatus: vi.fn(),
}))

vi.mock("@iefa/sisub-domain", async (importOriginal) => ({
	...(await importOriginal<typeof import("@iefa/sisub-domain")>()),
	upsertDailyMenu: domainMocks.upsertDailyMenu,
}))

vi.mock("@iefa/sisub-domain/agent", async (importOriginal) => {
	const { upsertDailyMenu: _upsert, ...agentMocks } = domainMocks
	return { ...(await importOriginal<typeof import("@iefa/sisub-domain/agent")>()), ...agentMocks }
})

// ── Client PostgREST falso ──────────────────────────────────────────────────

interface QueryResult {
	data?: unknown
	error?: { message: string } | null
}

interface RecordedQuery {
	table: string
	ops: string[]
	/** A query foi aguardada (chegou ao banco), não só montada. */
	executed: boolean
}

/** Respostas por tabela, em ordem; esgotada a fila, a última se repete. Grava as operações. */
function fakeClient(responses: Record<string, QueryResult[]>, queries: RecordedQuery[]) {
	const pending = Object.fromEntries(Object.entries(responses).map(([table, list]) => [table, [...list]]))

	function nextResult(table: string): QueryResult {
		const queue = pending[table]
		if (!queue?.length) throw new Error(`sem resposta configurada para a tabela "${table}"`)
		return queue.length === 1 ? queue[0] : (queue.shift() as QueryResult)
	}

	function chain(record: RecordedQuery) {
		let single = false
		const proxy: Record<string | symbol, unknown> = new Proxy(
			{},
			{
				get(_target, prop) {
					if (prop === "then") {
						return (resolve: (value: unknown) => void) => {
							record.executed = true
							const result = nextResult(record.table)
							const data = result.error ? null : (result.data ?? (single ? null : []))
							resolve({ data: single && Array.isArray(data) ? (data[0] ?? null) : data, error: result.error ?? null })
						}
					}
					return () => {
						if (prop === "single" || prop === "maybeSingle") single = true
						record.ops.push(String(prop))
						return proxy
					}
				},
			}
		)
		return proxy
	}

	const client = {
		schema: () => client,
		from(table: string) {
			const record: RecordedQuery = { table, ops: [], executed: false }
			queries.push(record)
			return chain(record)
		},
	}
	return client as unknown as ToolContext["supabase"]
}

function kitchenCtx(responses: Record<string, QueryResult[]> = {}, queries: RecordedQuery[] = [], scopeId: number | null = ROUTE_KITCHEN): ToolContext {
	const permissions = [{ module: "kitchen", level: 2, kitchen_id: null, mess_hall_id: null, unit_id: null }] as unknown as UserPermission[]
	return {
		userId: "user-1",
		permissions,
		module: "kitchen",
		scopeId: scopeId ?? undefined,
		supabase: fakeClient(responses, queries),
		db: {} as ToolContext["db"],
	}
}

function unitCtx(responses: Record<string, QueryResult[]> = {}, queries: RecordedQuery[] = [], scopeId: number | null = ROUTE_UNIT): ToolContext {
	const permissions = [{ module: "unit", level: 2, kitchen_id: null, mess_hall_id: null, unit_id: null }] as unknown as UserPermission[]
	return { userId: "user-1", permissions, module: "unit", scopeId: scopeId ?? undefined, supabase: fakeClient(responses, queries), db: {} as ToolContext["db"] }
}

const kitchenTool = (name: string) => findWrappedTool(kitchenTools, name)
const unitTool = (name: string) => findWrappedTool(unitTools, name)

const executedTables = (queries: RecordedQuery[]) => queries.filter((q) => q.executed).map((q) => q.table)

const writes = (queries: RecordedQuery[]) =>
	queries.flatMap((q) => q.ops.filter((op) => op === "insert" || op === "update" || op === "upsert" || op === "delete"))

beforeEach(() => {
	for (const mock of Object.values(domainMocks)) mock.mockReset()
	domainMocks.upsertDailyMenu.mockResolvedValue([])
	domainMocks.agentFetchMenus.mockResolvedValue([])
	domainMocks.agentFetchDayMenus.mockResolvedValue([])
	domainMocks.agentListRecipes.mockResolvedValue({ items: [], returned: 0, total: 0, limit: 30 })
	domainMocks.agentGetTemplateItems.mockResolvedValue([])
	domainMocks.agentApplyTemplate.mockResolvedValue({ datesApplied: [], datesSkipped: [] })
	domainMocks.agentListKitchenEquipment.mockResolvedValue({ items: [], returned: 0, total: 0, limit: 30 })
	domainMocks.agentGetRecipeEquipment.mockResolvedValue({ items: [], returned: 0, total: 0, limit: 30 })
	domainMocks.agentCheckRecipeEquipment.mockResolvedValue({ fits: true })
	domainMocks.agentCheckMenuEquipment.mockResolvedValue({ fits: true })
	domainMocks.agentUpdateQuantityEstimateStatus.mockResolvedValue(undefined)
})

// ── O helper ────────────────────────────────────────────────────────────────

describe("assertRouteScope", () => {
	test("recusa outra cozinha com erro que chega ao modelo como está", () => {
		const ctx = kitchenCtx()
		let caught: unknown
		try {
			assertRouteScope(ctx, "kitchen", OTHER_KITCHEN)
		} catch (error) {
			caught = error
		}
		expect(caught).toBeInstanceOf(ToolPermissionError)
		expect((caught as Error).message).toMatch(SCOPE_ERROR)
		// Erro de domínio: o `wrapTool` não o troca por "Erro ao executar…".
		expect(toModelFacingToolError("remove_menu_item", caught)).toBe(caught)
	})

	test("a cozinha da rota passa", () => {
		expect(() => assertRouteScope(kitchenCtx(), "kitchen", ROUTE_KITCHEN)).not.toThrow()
	})

	test("sem escopo de rota vale só o PBAC", () => {
		expect(() => assertRouteScope(kitchenCtx({}, [], NO_ROUTE), "kitchen", OTHER_KITCHEN)).not.toThrow()
	})

	test("o scopeId é comparado só com o tipo de entidade do módulo", () => {
		// Na rota da unidade 7, o 7 não é cozinha nenhuma: comparar seria acaso.
		expect(() => assertRouteScope(unitCtx(), "kitchen", ROUTE_UNIT + 1)).not.toThrow()
		expect(() => assertRouteScope(unitCtx(), "unit", OTHER_UNIT)).toThrow(SCOPE_ERROR)
		const analytics = { ...unitCtx(), module: "local-analytics" }
		expect(() => assertRouteScope(analytics, "unit", OTHER_UNIT)).toThrow(SCOPE_ERROR)
	})
})

/**
 * O escopo do PBAC na entrada (rota do stream e `describeChatActionFn`) sai da mesma regra de
 * módulo que o `assertRouteScope` usa: as duas portas não podem divergir sobre o que o
 * `scopeId` de cada módulo identifica.
 */
describe("resolveRouteScope", () => {
	test("cozinha na rota da cozinha; unidade nas rotas de unidade e de analytics", () => {
		expect(resolveRouteScope("kitchen", ROUTE_KITCHEN)).toEqual({ type: "kitchen", id: ROUTE_KITCHEN })
		expect(resolveRouteScope("unit", ROUTE_UNIT)).toEqual({ type: "unit", id: ROUTE_UNIT })
		expect(resolveRouteScope("local-analytics", ROUTE_UNIT)).toEqual({ type: "unit", id: ROUTE_UNIT })
	})

	test("módulo global e conversa sem rota não têm escopo", () => {
		expect(resolveRouteScope("global", ROUTE_KITCHEN)).toBeUndefined()
		expect(resolveRouteScope("kitchen", undefined)).toBeUndefined()
	})
})

// ── Cozinha: kitchenId direto no argumento ──────────────────────────────────

/** Tools que recebem `kitchenId`, com o argumento mínimo e o que a recusa não pode chamar. */
const DIRECT_KITCHEN_CASES: Array<{
	name: string
	args: (kitchenId: number) => Record<string, unknown>
	responses?: Record<string, QueryResult[]>
	domain?: () => unknown
}> = [
	{ name: "get_meal_types", args: (kitchenId) => ({ kitchenId }), responses: { meal_type: [{ data: [] }] } },
	{
		name: "get_planning_calendar",
		args: (kitchenId) => ({ kitchenId, startDate: "2099-03-01", endDate: "2099-03-07" }),
		domain: () => domainMocks.agentFetchMenus,
	},
	{ name: "get_day_details", args: (kitchenId) => ({ kitchenId, date: "2099-03-01" }), domain: () => domainMocks.agentFetchDayMenus },
	{ name: "list_recipes", args: (kitchenId) => ({ kitchenId }), domain: () => domainMocks.agentListRecipes },
	{ name: "create_daily_menu", args: (kitchenId) => ({ kitchenId, date: "2099-03-01", mealTypeId: UUID }), domain: () => domainMocks.upsertDailyMenu },
	{ name: "list_menu_templates", args: (kitchenId) => ({ kitchenId }), responses: { menu_template: [{ data: [] }] } },
	{
		name: "apply_template",
		args: (kitchenId) => ({ templateId: UUID, kitchenId, targetDates: ["2099-03-02"], startDayOfWeek: 1 }),
		domain: () => domainMocks.agentApplyTemplate,
	},
	{ name: "list_kitchen_equipment", args: (kitchenId) => ({ kitchenId }), domain: () => domainMocks.agentListKitchenEquipment },
	{
		name: "check_recipe_equipment",
		args: (kitchenId) => ({ recipeId: UUID, kitchenId }),
		responses: { recipes: [{ data: [{ kitchen_id: null }] }] },
		domain: () => domainMocks.agentCheckRecipeEquipment,
	},
]

describe("tools de cozinha com kitchenId no argumento", () => {
	test.each(DIRECT_KITCHEN_CASES)("$name recusa outra cozinha antes de ler", async ({ name, args, responses, domain }) => {
		const queries: RecordedQuery[] = []

		await expect(kitchenTool(name).handler(args(OTHER_KITCHEN), kitchenCtx(responses, queries))).rejects.toThrow(SCOPE_ERROR)

		// `list_menu_templates` monta a query antes de olhar o argumento; o que importa é que ela não rode.
		expect(executedTables(queries)).toEqual([])
		if (domain) expect(domain()).not.toHaveBeenCalled()
	})

	test.each(DIRECT_KITCHEN_CASES)("$name aceita a cozinha da rota", async ({ name, args, responses, domain }) => {
		const result = await kitchenTool(name).handler(args(ROUTE_KITCHEN), kitchenCtx(responses))

		expect(result.success).toBe(true)
		if (domain) expect(domain()).toHaveBeenCalledTimes(1)
	})

	test.each(DIRECT_KITCHEN_CASES)("$name sem cozinha na rota aceita qualquer cozinha permitida", async ({ name, args, responses }) => {
		const result = await kitchenTool(name).handler(args(OTHER_KITCHEN), kitchenCtx(responses, [], NO_ROUTE))

		expect(result.success).toBe(true)
	})
})

// ── Cozinha: resolvida pela linha ───────────────────────────────────────────

describe("add_menu_item", () => {
	test("cardápio de outra cozinha é recusado antes de ler a receita e de gravar", async () => {
		const queries: RecordedQuery[] = []
		const ctx = kitchenCtx({ daily_menu: [{ data: [{ kitchen_id: OTHER_KITCHEN }] }] }, queries)

		await expect(kitchenTool("add_menu_item").handler({ dailyMenuId: UUID, recipeId: UUID_2 }, ctx)).rejects.toThrow(SCOPE_ERROR)

		expect(executedTables(queries)).toEqual(["daily_menu"])
		expect(writes(queries)).toEqual([])
	})

	test("cardápio da rota com receita global grava", async () => {
		const queries: RecordedQuery[] = []
		const ctx = kitchenCtx(
			{
				daily_menu: [{ data: [{ kitchen_id: ROUTE_KITCHEN }] }],
				recipes: [{ data: [{ id: UUID_2, kitchen_id: null, name: "Arroz" }] }],
				menu_items: [{ data: [{ id: "item-1" }] }],
			},
			queries
		)

		const result = await kitchenTool("add_menu_item").handler({ dailyMenuId: UUID, recipeId: UUID_2 }, ctx)

		expect(result).toMatchObject({ success: true, data: { id: "item-1", recipe_name: "Arroz" } })
		expect(writes(queries)).toEqual(["insert"])
	})
})

describe("remove_menu_item", () => {
	test("item de cardápio de outra cozinha é recusado e nada é gravado", async () => {
		const queries: RecordedQuery[] = []
		const ctx = kitchenCtx({ menu_items: [{ data: [{ id: UUID, daily_menu: { kitchen_id: OTHER_KITCHEN } }] }] }, queries)

		await expect(kitchenTool("remove_menu_item").handler({ itemId: UUID }, ctx)).rejects.toThrow(SCOPE_ERROR)

		expect(writes(queries)).toEqual([])
	})

	test("item da cozinha da rota é removido", async () => {
		const queries: RecordedQuery[] = []
		const ctx = kitchenCtx({ menu_items: [{ data: [{ id: UUID, daily_menu: { kitchen_id: ROUTE_KITCHEN } }] }, { data: null }] }, queries)

		const result = await kitchenTool("remove_menu_item").handler({ itemId: UUID }, ctx)

		expect(result.success).toBe(true)
		expect(writes(queries)).toEqual(["update"])
	})
})

describe("update_menu_headcount", () => {
	test("cardápio de outra cozinha é recusado e nada é gravado", async () => {
		const queries: RecordedQuery[] = []
		const ctx = kitchenCtx({ daily_menu: [{ data: [{ kitchen_id: OTHER_KITCHEN }] }] }, queries)

		await expect(kitchenTool("update_menu_headcount").handler({ menuId: UUID, forecastedHeadcount: 80 }, ctx)).rejects.toThrow(SCOPE_ERROR)

		expect(writes(queries)).toEqual([])
	})

	test("cardápio da rota é atualizado", async () => {
		const queries: RecordedQuery[] = []
		const ctx = kitchenCtx({ daily_menu: [{ data: [{ kitchen_id: ROUTE_KITCHEN }] }, { data: [{ id: UUID, forecasted_headcount: 80 }] }] }, queries)

		const result = await kitchenTool("update_menu_headcount").handler({ menuId: UUID, forecastedHeadcount: 80 }, ctx)

		expect(result.success).toBe(true)
		expect(writes(queries)).toEqual(["update"])
	})
})

/** Tools que recebem só o id da linha e entregam a leitura ao domínio. */
const ROW_KITCHEN_CASES = [
	{ name: "get_template_items", table: "menu_template", args: { templateId: UUID }, domain: () => domainMocks.agentGetTemplateItems },
	{ name: "get_recipe_equipment", table: "recipes", args: { recipeId: UUID }, domain: () => domainMocks.agentGetRecipeEquipment },
	{ name: "check_menu_equipment", table: "daily_menu", args: { dailyMenuId: UUID }, domain: () => domainMocks.agentCheckMenuEquipment },
] as const

describe("tools de cozinha resolvidas pela linha", () => {
	test.each(ROW_KITCHEN_CASES)("$name: linha de outra cozinha é recusada sem chegar ao domínio", async ({ name, table, args, domain }) => {
		const ctx = kitchenCtx({ [table]: [{ data: [{ kitchen_id: OTHER_KITCHEN }] }] })

		await expect(kitchenTool(name).handler(args, ctx)).rejects.toThrow(SCOPE_ERROR)

		expect(domain()).not.toHaveBeenCalled()
	})

	test.each(ROW_KITCHEN_CASES)("$name: linha da cozinha da rota passa", async ({ name, table, args, domain }) => {
		const result = await kitchenTool(name).handler(args, kitchenCtx({ [table]: [{ data: [{ kitchen_id: ROUTE_KITCHEN }] }] }))

		expect(result.success).toBe(true)
		expect(domain()).toHaveBeenCalledTimes(1)
	})

	test.each(ROW_KITCHEN_CASES.filter((c) => c.table !== "daily_menu"))("$name: recurso global passa", async ({ name, table, args, domain }) => {
		const result = await kitchenTool(name).handler(args, kitchenCtx({ [table]: [{ data: [{ kitchen_id: null }] }] }))

		expect(result.success).toBe(true)
		expect(domain()).toHaveBeenCalledTimes(1)
	})

	test.each(ROW_KITCHEN_CASES)("$name: sem cozinha na rota nem consulta a linha", async ({ name, args, domain }) => {
		const queries: RecordedQuery[] = []

		const result = await kitchenTool(name).handler(args, kitchenCtx({}, queries, NO_ROUTE))

		expect(result.success).toBe(true)
		expect(queries).toEqual([])
		expect(domain()).toHaveBeenCalledTimes(1)
	})

	test("check_recipe_equipment: receita de outra cozinha é recusada mesmo com a cozinha da rota no argumento", async () => {
		const ctx = kitchenCtx({ recipes: [{ data: [{ kitchen_id: OTHER_KITCHEN }] }] })

		await expect(kitchenTool("check_recipe_equipment").handler({ recipeId: UUID, kitchenId: ROUTE_KITCHEN }, ctx)).rejects.toThrow(SCOPE_ERROR)

		expect(domainMocks.agentCheckRecipeEquipment).not.toHaveBeenCalled()
	})
})

describe("get_recipe", () => {
	test("ficha de outra cozinha não chega ao modelo", async () => {
		domainMocks.agentGetRecipe.mockResolvedValue({ id: UUID, name: "Feijoada da B", kitchen_id: OTHER_KITCHEN })

		await expect(kitchenTool("get_recipe").handler({ recipeId: UUID }, kitchenCtx())).rejects.toThrow(SCOPE_ERROR)
	})

	test("receita global e receita da rota passam", async () => {
		domainMocks.agentGetRecipe.mockResolvedValueOnce({ id: UUID, kitchen_id: null }).mockResolvedValueOnce({ id: UUID, kitchen_id: ROUTE_KITCHEN })

		expect((await kitchenTool("get_recipe").handler({ recipeId: UUID }, kitchenCtx())).success).toBe(true)
		expect((await kitchenTool("get_recipe").handler({ recipeId: UUID }, kitchenCtx())).success).toBe(true)
	})
})

// ── Unidade: OM dona do anexo ───────────────────────────────────────────────

describe("get_quantity_estimate", () => {
	test("anexo de outra unidade não chega ao modelo", async () => {
		domainMocks.agentGetQuantityEstimate.mockResolvedValue({ id: UUID, unit_id: OTHER_UNIT, notes: "conclua o anexo" })

		await expect(unitTool("get_quantity_estimate").handler({ quantityEstimateId: UUID }, unitCtx())).rejects.toThrow(SCOPE_ERROR)
	})

	test("anexo da unidade da rota passa; sem rota, qualquer unidade permitida", async () => {
		domainMocks.agentGetQuantityEstimate.mockResolvedValueOnce({ id: UUID, unit_id: ROUTE_UNIT }).mockResolvedValueOnce({ id: UUID, unit_id: OTHER_UNIT })

		expect((await unitTool("get_quantity_estimate").handler({ quantityEstimateId: UUID }, unitCtx())).success).toBe(true)
		expect((await unitTool("get_quantity_estimate").handler({ quantityEstimateId: UUID }, unitCtx({}, [], NO_ROUTE))).success).toBe(true)
	})
})

describe("update_quantity_estimate_status", () => {
	test("anexo de outra unidade é recusado antes da escrita", async () => {
		const ctx = unitCtx({ quantity_estimate: [{ data: [{ unit_id: OTHER_UNIT }] }] })

		await expect(unitTool("update_quantity_estimate_status").handler({ quantityEstimateId: UUID, status: "completed" }, ctx)).rejects.toThrow(SCOPE_ERROR)

		expect(domainMocks.agentUpdateQuantityEstimateStatus).not.toHaveBeenCalled()
	})

	test("anexo da unidade da rota segue para a operation", async () => {
		const ctx = unitCtx({ quantity_estimate: [{ data: [{ unit_id: ROUTE_UNIT }] }] })

		const result = await unitTool("update_quantity_estimate_status").handler({ quantityEstimateId: UUID, status: "archived" }, ctx)

		expect(result.success).toBe(true)
		expect(domainMocks.agentUpdateQuantityEstimateStatus).toHaveBeenCalledTimes(1)
	})

	test("sem unidade na rota não lê a linha: a operation confere a OM dona", async () => {
		const queries: RecordedQuery[] = []

		const result = await unitTool("update_quantity_estimate_status").handler({ quantityEstimateId: UUID, status: "archived" }, unitCtx({}, queries, NO_ROUTE))

		expect(result.success).toBe(true)
		expect(queries).toEqual([])
	})
})

describe("list_empenhos", () => {
	test("anexo de outra unidade é recusado antes de ler ARP e empenho", async () => {
		const queries: RecordedQuery[] = []
		const ctx = unitCtx({ quantity_estimate: [{ data: [{ unit_id: OTHER_UNIT }] }] }, queries)

		await expect(unitTool("list_empenhos").handler({ quantityEstimateId: UUID }, ctx)).rejects.toThrow(SCOPE_ERROR)

		expect(executedTables(queries)).toEqual(["quantity_estimate"])
	})

	test("anexo da unidade da rota segue para as ARPs", async () => {
		const ctx = unitCtx({ quantity_estimate: [{ data: [{ unit_id: ROUTE_UNIT }] }], arp: [{ data: [] }] })

		const result = await unitTool("list_empenhos").handler({ quantityEstimateId: UUID }, ctx)

		expect(result).toMatchObject({ success: true, data: { empenhos: [], total: 0 } })
	})
})
