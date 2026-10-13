import { describe, expect, test } from "vitest"
import { collectOccasionPreparationSources, formatOccasionDateLabel, isOccasionOutOfContext, isOccasionPrintBlocked } from "./occasion-menu-print"

type Items = Parameters<typeof collectOccasionPreparationSources>[0]

const KITCHEN = { kind: "kitchen", kitchenId: 7, kitchenIdStr: "7" } as const
const GLOBAL = { kind: "global" } as const

describe("isOccasionOutOfContext", () => {
	test("sem cardápio: não é 'fora de contexto' (o não encontrado é outro ramo)", () => {
		expect(isOccasionOutOfContext(null, "event", KITCHEN)).toBe(false)
		expect(isOccasionOutOfContext(undefined, "event", GLOBAL)).toBe(false)
	})

	test("tipo diferente do da rota", () => {
		expect(isOccasionOutOfContext({ template_type: "apoio", kitchen_id: 7 }, "event", KITCHEN)).toBe(true)
		expect(isOccasionOutOfContext({ template_type: "weekly", kitchen_id: null }, "apoio", GLOBAL)).toBe(true)
	})

	test("rota global: só o modelo sem cozinha", () => {
		expect(isOccasionOutOfContext({ template_type: "event", kitchen_id: null }, "event", GLOBAL)).toBe(false)
		expect(isOccasionOutOfContext({ template_type: "event", kitchen_id: 7 }, "event", GLOBAL)).toBe(true)
	})

	test("rota da cozinha: a própria cozinha ou o modelo global; outra cozinha não", () => {
		expect(isOccasionOutOfContext({ template_type: "event", kitchen_id: 7 }, "event", KITCHEN)).toBe(false)
		expect(isOccasionOutOfContext({ template_type: "event", kitchen_id: null }, "event", KITCHEN)).toBe(false)
		expect(isOccasionOutOfContext({ template_type: "event", kitchen_id: 8 }, "event", KITCHEN)).toBe(true)
	})
})

describe("isOccasionPrintBlocked", () => {
	const idle = { ingredientsPending: false, mealTypesPending: false, isSupportMenu: false, snackMealTypePending: false, templateFetching: false }

	test("nada carregando: libera", () => {
		expect(isOccasionPrintBlocked(idle)).toBe(false)
	})

	test("cada espera segura sozinha", () => {
		expect(isOccasionPrintBlocked({ ...idle, ingredientsPending: true })).toBe(true)
		expect(isOccasionPrintBlocked({ ...idle, mealTypesPending: true })).toBe(true)
		expect(isOccasionPrintBlocked({ ...idle, templateFetching: true })).toBe(true)
	})

	test("horário dos lanches só segura no apoio", () => {
		expect(isOccasionPrintBlocked({ ...idle, snackMealTypePending: true })).toBe(false)
		expect(isOccasionPrintBlocked({ ...idle, snackMealTypePending: true, isSupportMenu: true })).toBe(true)
		expect(isOccasionPrintBlocked({ ...idle, isSupportMenu: true })).toBe(false)
	})
})

describe("collectOccasionPreparationSources", () => {
	const row = (recipeId: string | null, originId: string, name = `Ficha ${originId}`) => ({ recipe_id: recipeId, recipe_origin: { id: originId, name } })

	test("só fichas de preparações colocadas numa refeição; sem recipe_id ou sem origem fica de fora", () => {
		const result = collectOccasionPreparationSources(
			[row("r1", "o1"), row("r2", "o2"), row(null, "o3"), { recipe_id: "r4", recipe_origin: null }] as unknown as Items,
			new Set(["r1", "r4"]),
			new Map()
		)
		expect(result.map((s) => s.id)).toEqual(["o1"])
	})

	test("item fora da folha não reserva a origem: vale a primeira ocorrência impressa", () => {
		const result = collectOccasionPreparationSources(
			[row("fora", "o1", "Nome do item fora"), row("dentro", "o1", "Nome do item impresso"), row("dentro2", "o1", "Repetida")] as unknown as Items,
			new Set(["dentro", "dentro2"]),
			new Map()
		)
		expect(result).toEqual([{ id: "o1", name: "Nome do item impresso", version: "v1", prePreparation: null, method: null }])
	})
})

describe("formatOccasionDateLabel", () => {
	test("sem data, vazia ou inválida: vazio", () => {
		expect(formatOccasionDateLabel(undefined)).toBe("")
		expect(formatOccasionDateLabel("")).toBe("")
		expect(formatOccasionDateLabel("não é data")).toBe("")
	})

	test("data por extenso em caixa alta", () => {
		expect(formatOccasionDateLabel("2026-10-13")).toBe("13 DE OUTUBRO DE 2026")
		expect(formatOccasionDateLabel("2026-03-01")).toBe("01 DE MARÇO DE 2026")
	})
})
