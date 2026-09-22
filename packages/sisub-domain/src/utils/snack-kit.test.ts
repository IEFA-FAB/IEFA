import { describe, expect, test } from "bun:test"
import {
	brasiliaCivilDate,
	buildSnackProductionSummary,
	canTransition,
	computeKitEnergy,
	computeRecipeEnergy,
	isLateRequest,
	isStandardReviewOverdue,
	labelExpiresAt,
	requesterCanCancel,
	type SnackStandardSnapshot,
} from "./snack-kit.ts"

describe("energia", () => {
	const kcal = new Map([
		["pao", 300],
		["frango", 160],
	])

	test("kcal por porção divide pelo rendimento e ignora opcional", () => {
		const energy = computeRecipeEnergy(
			{
				name: "Sanduíche de frango",
				portionYield: 2,
				ingredients: [
					{ ingredientId: "pao", name: "Pão", netQuantity: "100", measureUnit: "g", isOptional: false },
					{ ingredientId: "frango", name: "Frango", netQuantity: 0.1, measureUnit: "kg", isOptional: false },
					{ ingredientId: "frango", name: "Frango extra", netQuantity: 500, measureUnit: "g", isOptional: true },
				],
			},
			kcal
		)
		expect(energy.kcalPerPortion).toBe(230)
		expect(energy.missing).toEqual([])
	})

	test("insumo sem composição fica em missing, não vira zero", () => {
		const energy = computeRecipeEnergy(
			{ name: "X", portionYield: 1, ingredients: [{ ingredientId: "queijo", name: "Queijo", netQuantity: 30, measureUnit: "g", isOptional: false }] },
			kcal
		)
		expect(energy).toEqual({ kcalPerPortion: null, missing: ["Queijo"] })
	})

	test("kit com preparação parcial é marcado incompleto", () => {
		const kit = computeKitEnergy([
			{ recipeName: "Sanduíche", portions: 1, energy: { kcalPerPortion: 230, missing: [] } },
			{ recipeName: "Suco", portions: 1, energy: { kcalPerPortion: 90, missing: ["Açúcar"] } },
		])
		expect(kit).toEqual({ kcal: 320, complete: false, incomplete: ["Suco"] })
	})
})

describe("máquina de estados", () => {
	test("não pula etapas", () => {
		expect(canTransition("submitted", "delivered")).toBe(false)
		expect(canTransition("submitted", "accepted")).toBe(true)
		expect(canTransition("ready", "delivered")).toBe(true)
	})

	test("terminal não sai", () => {
		expect(canTransition("closed", "cancelled")).toBe(false)
		expect(canTransition("rejected", "accepted")).toBe(false)
	})

	test("requisitante cancela só antes da produção", () => {
		expect(requesterCanCancel("accepted")).toBe(true)
		expect(requesterCanCancel("in_production")).toBe(false)
	})
})

describe("prazos", () => {
	const now = new Date("2026-10-01T12:00:00Z")

	test("antecedência conta até a partida quando ela vem antes da retirada", () => {
		expect(isLateRequest(now, "2026-10-03T12:00:00Z", "2026-10-02T10:00:00Z")).toBe(true)
		expect(isLateRequest(now, "2026-10-02T12:00:00Z", "2026-10-02T13:00:00Z")).toBe(false)
	})

	test("validade padrão de 24 h", () => {
		expect(labelExpiresAt(new Date("2026-10-01T08:00:00Z"), null).toISOString()).toBe("2026-10-02T08:00:00.000Z")
	})

	test("data civil de Brasília entre 00h e 03h UTC é o dia anterior", () => {
		expect(brasiliaCivilDate("2026-10-02T02:30:00Z")).toBe("2026-10-01")
		expect(brasiliaCivilDate("2026-10-02T03:30:00Z")).toBe("2026-10-02")
	})

	test("revisão trimestral", () => {
		expect(isStandardReviewOverdue(null, "2026-10-01")).toBe(true)
		expect(isStandardReviewOverdue("2026-07-01", "2026-10-01")).toBe(false)
		expect(isStandardReviewOverdue("2026-06-30", "2026-10-01")).toBe(true)
	})
})

describe("consolidado de produção", () => {
	const standard = (id: string, recipes: [string, number][]): SnackStandardSnapshot => ({
		id,
		name: `Padrão ${id}`,
		family: "bordo",
		snackClass: "B",
		variant: "lanche",
		requiresGalley: false,
		requiresOven: false,
		shelfLifeHours: null,
		kcalPerKit: 500,
		kcalComplete: true,
		items: recipes.map(([recipeId, portions]) => ({ recipeId, recipeName: `Receita ${recipeId}`, portions, itemGroup: null })),
	})

	test("duas requisições com a mesma preparação somam porções e guardam as origens", () => {
		const summary = buildSnackProductionSummary([
			{
				id: "r1",
				missionDescription: "M1",
				pickupAt: "2026-10-02T09:00:00Z",
				waterQuantity: 6,
				cupQuantity: 12,
				iceQuantity: 0,
				coffeeQuantity: 1,
				lines: [{ standard: standard("s1", [["sanduiche", 1]]), audience: "crew", kits: 6 }],
			},
			{
				id: "r2",
				missionDescription: "M2",
				pickupAt: "2026-10-02T10:00:00Z",
				waterQuantity: 4,
				cupQuantity: 4,
				iceQuantity: 2,
				coffeeQuantity: 0,
				lines: [
					{
						standard: standard("s2", [
							["sanduiche", 1],
							["suco", 2],
						]),
						audience: "crew",
						kits: 4,
					},
				],
			},
		])
		expect(summary.recipes).toEqual([
			{ recipeId: "sanduiche", recipeName: "Receita sanduiche", portions: 10, requestIds: ["r1", "r2"] },
			{ recipeId: "suco", recipeName: "Receita suco", portions: 8, requestIds: ["r2"] },
		])
		expect(summary.materials).toEqual({ water: 10, cups: 16, ice: 2, coffee: 1 })
		expect(summary.standards.map((s) => [s.standardId, s.kits])).toEqual([
			["s1", 6],
			["s2", 4],
		])
	})

	test("linha zerada no aceite não entra", () => {
		const summary = buildSnackProductionSummary([
			{
				id: "r1",
				missionDescription: "M1",
				pickupAt: "2026-10-02T09:00:00Z",
				waterQuantity: 0,
				cupQuantity: 0,
				iceQuantity: 0,
				coffeeQuantity: 0,
				lines: [{ standard: standard("s1", [["sanduiche", 1]]), audience: "pax", kits: 0 }],
			},
		])
		expect(summary.recipes).toEqual([])
	})
})
