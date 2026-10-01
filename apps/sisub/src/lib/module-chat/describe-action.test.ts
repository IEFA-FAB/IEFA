import { describe, expect, test } from "vitest"
import type { ChatModule } from "@/types/domain/module-chat"
import {
	type ChatActionAccess,
	type ChatActionDescription,
	type ChatActionReader,
	describeChatAction,
	type ReadScope,
	WRITE_TOOLS_BY_MODULE,
} from "./describe-action"

const RECIPE_GLOBAL = "11111111-1111-4111-8111-111111111111"
const RECIPE_K7 = "22222222-2222-4222-8222-222222222222"
const RECIPE_K8 = "33333333-3333-4333-8333-333333333333"
const MENU_K7 = "44444444-4444-4444-8444-444444444444"
const MENU_K8 = "55555555-5555-4555-8555-555555555555"
const ITEM_K7 = "66666666-6666-4666-8666-666666666666"
const MEAL_ALMOCO = "77777777-7777-4777-8777-777777777777"
const TEMPLATE_GLOBAL = "88888888-8888-4888-8888-888888888888"
const ESTIMATE_U3 = "99999999-9999-4999-8999-999999999999"
const MISSING = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

const reader: ChatActionReader = {
	async recipe(id) {
		if (id === RECIPE_GLOBAL) return { name: "Arroz carreteiro", kitchenId: null }
		if (id === RECIPE_K7) return { name: "Feijoada da casa", kitchenId: 7 }
		if (id === RECIPE_K8) return { name: "Receita da cozinha 8", kitchenId: 8 }
		return null
	},
	async kitchen(id) {
		return id === 7 ? { name: "Cozinha do GAP-SJ" } : id === 8 ? { name: "Cozinha 8" } : null
	},
	async mealType(id) {
		return id === MEAL_ALMOCO ? { name: "Almoço", kitchenId: null } : null
	},
	async dailyMenu(id) {
		if (id === MENU_K7) return { serviceDate: "2026-10-12", mealTypeName: "Almoço", kitchenId: 7, kitchenName: "Cozinha do GAP-SJ", forecastedHeadcount: 120 }
		if (id === MENU_K8) return { serviceDate: "2026-10-12", mealTypeName: "Jantar", kitchenId: 8, kitchenName: "Cozinha 8", forecastedHeadcount: null }
		return null
	},
	async menuItem(id) {
		return id === ITEM_K7 ? { recipeName: "Feijoada da casa", dailyMenuId: MENU_K7 } : null
	},
	async template(id) {
		return id === TEMPLATE_GLOBAL ? { name: "Semana padrão SDAB", kitchenId: null } : null
	},
	async quantityEstimate(id) {
		return id === ESTIMATE_U3 ? { title: "Anexo 2026 — gêneros", status: "draft", unitId: 3, unitName: "GAP-SJ" } : null
	},
}

/** Lê tudo, menos o que estiver em `deny` (escopo `kitchen:8`, `unit:4`…). */
function access(module: ChatModule, scopeId?: number, deny: string[] = []): ChatActionAccess {
	return {
		module,
		scopeId,
		canRead: (mod, scope?: ReadScope) => !deny.includes(mod) && !deny.includes(scope ? `${scope.type}:${scope.id}` : mod),
	}
}

function values(description: ChatActionDescription): string {
	if (description.status !== "described") throw new Error("esperava descrição")
	return description.details.map((d) => `${d.label}: ${d.value}`).join(" | ")
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-/i

describe("describeChatAction — uma descrição por tool de escrita, sem UUID", () => {
	test("create_recipe", async () => {
		const out = await describeChatAction({ toolName: "create_recipe", args: { name: "Pudim", preparationTime: 40 } }, access("global"), reader)
		expect(values(out)).toBe("Receita nova (catálogo global): Pudim | Tempo de preparo: 40 min")
	})

	test("update_recipe", async () => {
		const out = await describeChatAction({ toolName: "update_recipe", args: { recipeId: RECIPE_GLOBAL, name: "Arroz à grega" } }, access("global"), reader)
		expect(values(out)).toBe("Receita: Arroz carreteiro | Novo nome: Arroz à grega")
	})

	test("create_daily_menu", async () => {
		const args = { kitchenId: 7, date: "2026-10-12", mealTypeId: MEAL_ALMOCO, forecastedHeadcount: 150 }
		const out = await describeChatAction({ toolName: "create_daily_menu", args }, access("kitchen", 7), reader)
		expect(values(out)).toBe("Cardápio novo: 12/10/2026 · Almoço · Cozinha do GAP-SJ | Comensais previstos: 150")
	})

	test("add_menu_item", async () => {
		const out = await describeChatAction({ toolName: "add_menu_item", args: { dailyMenuId: MENU_K7, recipeId: RECIPE_GLOBAL } }, access("kitchen", 7), reader)
		expect(values(out)).toBe("Receita: Arroz carreteiro | Cardápio: 12/10/2026 · Almoço · Cozinha do GAP-SJ")
	})

	test("remove_menu_item", async () => {
		const out = await describeChatAction({ toolName: "remove_menu_item", args: { itemId: ITEM_K7 } }, access("kitchen", 7), reader)
		expect(values(out)).toBe("Item: Feijoada da casa | Cardápio: 12/10/2026 · Almoço · Cozinha do GAP-SJ")
	})

	test("update_menu_headcount", async () => {
		const out = await describeChatAction(
			{ toolName: "update_menu_headcount", args: { menuId: MENU_K7, forecastedHeadcount: 90 } },
			access("kitchen", 7),
			reader
		)
		expect(values(out)).toBe("Cardápio: 12/10/2026 · Almoço · Cozinha do GAP-SJ | Comensais previstos: 120 → 90")
	})

	test("apply_template", async () => {
		const args = {
			templateId: TEMPLATE_GLOBAL,
			kitchenId: 7,
			targetDates: ["2026-10-13", "2026-10-12"],
			startDayOfWeek: 1,
			headcounts: [{ mealTypeId: MEAL_ALMOCO, headcount: null }],
		}
		const out = await describeChatAction({ toolName: "apply_template", args }, access("kitchen", 7), reader)
		expect(values(out)).toBe(
			"Template: Semana padrão SDAB | Cozinha: Cozinha do GAP-SJ | 2 datas (só dias vazios): 12/10/2026, 13/10/2026 | Efetivo por refeição: Almoço: a definir"
		)
	})

	test("update_quantity_estimate_status", async () => {
		const args = { quantityEstimateId: ESTIMATE_U3, status: "completed" }
		const out = await describeChatAction({ toolName: "update_quantity_estimate_status", args }, access("unit", 3), reader)
		expect(values(out)).toBe("Anexo quantitativo: Anexo 2026 — gêneros | OM: GAP-SJ | Status: rascunho → concluído")
	})

	test("nenhuma descrição traz UUID", async () => {
		const cases: [ChatModule, string, Record<string, unknown>, number?][] = [
			["global", "update_recipe", { recipeId: RECIPE_GLOBAL }],
			["kitchen", "add_menu_item", { dailyMenuId: MENU_K7, recipeId: RECIPE_K7 }, 7],
			["kitchen", "remove_menu_item", { itemId: ITEM_K7 }, 7],
			["unit", "update_quantity_estimate_status", { quantityEstimateId: ESTIMATE_U3, status: "archived" }, 3],
		]
		for (const [module, toolName, args, scopeId] of cases) {
			const out = await describeChatAction({ toolName, args }, access(module, scopeId), reader)
			expect(values(out), toolName).not.toMatch(UUID_RE)
		}
	})

	test("as 8 tools de escrita têm descrição", () => {
		expect(Object.values(WRITE_TOOLS_BY_MODULE).flat().sort()).toEqual([
			"add_menu_item",
			"apply_template",
			"create_daily_menu",
			"create_recipe",
			"remove_menu_item",
			"update_menu_headcount",
			"update_quantity_estimate_status",
			"update_recipe",
		])
	})
})

describe("describeChatAction — falha vira 'não foi possível descrever'", () => {
	const unavailable = { status: "unavailable" }

	test("linha inexistente", async () => {
		expect(await describeChatAction({ toolName: "remove_menu_item", args: { itemId: MISSING } }, access("kitchen", 7), reader)).toEqual(unavailable)
	})

	test("argumento que a tool recusaria", async () => {
		expect(await describeChatAction({ toolName: "remove_menu_item", args: { itemId: "não-é-uuid" } }, access("kitchen", 7), reader)).toEqual(unavailable)
	})

	test("item de outra cozinha que não a da rota", async () => {
		expect(
			await describeChatAction({ toolName: "update_menu_headcount", args: { menuId: MENU_K8, forecastedHeadcount: 1 } }, access("kitchen", 7), reader)
		).toEqual(unavailable)
	})

	test("receita de outra cozinha não é descrita (nem o nome vaza)", async () => {
		expect(await describeChatAction({ toolName: "add_menu_item", args: { dailyMenuId: MENU_K7, recipeId: RECIPE_K8 } }, access("kitchen", 7), reader)).toEqual(
			unavailable
		)
	})

	test("sem permissão de leitura no escopo resolvido", async () => {
		expect(await describeChatAction({ toolName: "remove_menu_item", args: { itemId: ITEM_K7 } }, access("kitchen", undefined, ["kitchen:7"]), reader)).toEqual(
			unavailable
		)
	})

	test("anexo de outra OM", async () => {
		const args = { quantityEstimateId: ESTIMATE_U3, status: "completed" }
		expect(await describeChatAction({ toolName: "update_quantity_estimate_status", args }, access("unit", 4), reader)).toEqual(unavailable)
	})

	test("tool que não é de escrita do módulo da conversa", async () => {
		expect(await describeChatAction({ toolName: "create_recipe", args: { name: "x" } }, access("kitchen", 7), reader)).toEqual(unavailable)
		expect(await describeChatAction({ toolName: "list_recipes", args: {} }, access("global"), reader)).toEqual(unavailable)
	})

	test("erro de leitura", async () => {
		const broken: ChatActionReader = {
			...reader,
			async dailyMenu() {
				throw new Error("PGRST timeout")
			},
		}
		expect(
			await describeChatAction({ toolName: "update_menu_headcount", args: { menuId: MENU_K7, forecastedHeadcount: 1 } }, access("kitchen", 7), broken)
		).toEqual(unavailable)
	})

	test("sem rota, a permissão da cozinha resolvida decide", async () => {
		const out = await describeChatAction({ toolName: "remove_menu_item", args: { itemId: ITEM_K7 } }, access("kitchen"), reader)
		expect(out.status).toBe("described")
	})
})
