import { describe, expect, test } from "vitest"
import { buildOccasionPrintMeals, formatOccasionBase, formatOccasionDemand, occasionPrintSubtitle } from "./occasion-print"

type Template = Parameters<typeof buildOccasionPrintMeals>[0]

function item(recipeId: string, name: string, extra: Record<string, unknown> = {}) {
	return {
		recipe_id: recipeId,
		meal_type_id: "slot-jantar",
		event_meal_id: "meal-1",
		item_group: null,
		sort_order: 0,
		headcount_override: null,
		recommended_proportion: null,
		recipe_origin: { id: recipeId, name },
		...extra,
	}
}

function template(partial: Partial<Record<keyof Template, unknown>>): Template {
	return { items: [], event_meals: [], snack_family: null, snack_class: null, snack_variant: null, ...partial } as unknown as Template
}

const slotNames: Record<string, string> = { "slot-jantar": "Jantar", "slot-almoco": "Almoço" }
const slotNameOf = (id: string) => slotNames[id] ?? null

describe("formatOccasionDemand", () => {
	test("evento: só o pax direto; a % do efetivo não sai", () => {
		expect(formatOccasionDemand({ headcount_override: 120 }, "event")).toBe("120 pax")
		expect(formatOccasionDemand({ recommended_proportion: 30 }, "event")).toBeNull()
	})

	test("apoio: porções por kit em decimal brasileiro; pax direto é total de porções", () => {
		expect(formatOccasionDemand({ recommended_proportion: 200 }, "apoio")).toBe("2 por kit")
		expect(formatOccasionDemand({ recommended_proportion: 50 }, "apoio")).toBe("0,5 por kit")
		expect(formatOccasionDemand({ headcount_override: 40, recommended_proportion: 200 }, "apoio")).toBe("40 porções")
		expect(formatOccasionDemand({}, "apoio")).toBeNull()
	})
})

describe("formatOccasionBase", () => {
	test("pessoas no evento, kits no apoio, com singular", () => {
		expect(formatOccasionBase(120, "event")).toBe("120 pessoas")
		expect(formatOccasionBase(1, "event")).toBe("1 pessoa")
		expect(formatOccasionBase(40, "apoio")).toBe("40 kits")
		expect(formatOccasionBase(1, "apoio")).toBe("1 kit")
		expect(formatOccasionBase(null, "event")).toBeNull()
	})
})

describe("buildOccasionPrintMeals", () => {
	test("evento: grupos na ordem da composição, itens pela ordem; grupo vazio não sai; principal em negrito", () => {
		const meals = buildOccasionPrintMeals(
			template({
				event_meals: [
					{
						id: "meal-1",
						name: "Coquetel",
						meal_type_id: "slot-jantar",
						sort_order: 0,
						base_headcount: 80,
						source_template_id: null,
						groups: [
							{ key: "entradas", label: "Entradas" },
							{ key: "prato_principal", label: "Prato principal" },
							{ key: "sobremesa", label: "Sobremesa" },
						],
					},
				],
				items: [
					item("r-file", "Filé ao molho madeira", { item_group: "prato_principal", headcount_override: 80 }),
					item("r-bruschetta", "Bruschetta", { item_group: "entradas", sort_order: 1 }),
					item("r-canape", "Canapé", { item_group: "entradas", sort_order: 0 }),
				],
			}),
			"event",
			slotNameOf
		)
		expect(meals).toHaveLength(1)
		const [meal] = meals
		expect(meal.name).toBe("Coquetel")
		expect(meal.slotName).toBe("Jantar")
		expect(meal.base).toBe("80 pessoas")
		expect(meal.groups.map((g) => g.label)).toEqual(["Entradas", "Prato principal"])
		expect(meal.groups[0].entries.map((e) => e.name)).toEqual(["Canapé", "Bruschetta"])
		expect(meal.groups[1].entries).toEqual([{ recipeId: "r-file", name: "Filé ao molho madeira", main: true, demand: "80 pax" }])
	})

	test("item num grupo que a composição perdeu sai em 'Sem grupo', no fim", () => {
		const [meal] = buildOccasionPrintMeals(
			template({
				event_meals: [
					{ id: "meal-1", name: "Jantar", meal_type_id: "slot-jantar", sort_order: 0, base_headcount: null, groups: [{ key: "entradas", label: "Entradas" }] },
				],
				items: [item("r-1", "Sopa", { item_group: "removido" }), item("r-2", "Canapé", { item_group: "entradas" })],
			}),
			"event",
			slotNameOf
		)
		expect(meal.groups.map((g) => g.label)).toEqual(["Entradas", "Sem grupo"])
		expect(meal.groups[1].entries.map((e) => e.name)).toEqual(["Sopa"])
		// Horário com o mesmo nome da refeição não se repete.
		expect(meal.slotName).toBeNull()
	})

	test("apoio simples: kit sem composição vira lista sem rótulo, com porções por kit", () => {
		const [meal] = buildOccasionPrintMeals(
			template({
				event_meals: [{ id: "meal-1", name: "Kit", meal_type_id: "slot-almoco", sort_order: 0, base_headcount: 30, groups: [] }],
				items: [item("r-1", "Sanduíche natural", { meal_type_id: "slot-almoco", recommended_proportion: 200 })],
			}),
			"apoio",
			slotNameOf
		)
		expect(meal.base).toBe("30 kits")
		expect(meal.groups).toEqual([{ key: null, label: null, entries: [{ recipeId: "r-1", name: "Sanduíche natural", main: false, demand: "2 por kit" }] }])
	})

	test("padrão de lanche gravado com porções no pax lê como porções por kit", () => {
		const [meal] = buildOccasionPrintMeals(
			template({
				snack_family: "bordo",
				snack_class: "B",
				event_meals: [{ id: "meal-1", name: "Kit", meal_type_id: "slot-almoco", sort_order: 0, base_headcount: null, groups: [] }],
				items: [item("r-1", "Suco", { meal_type_id: "slot-almoco", headcount_override: 2 })],
			}),
			"apoio",
			slotNameOf
		)
		expect(meal.groups[0].entries[0].demand).toBe("2 por kit")
	})

	test("padrão de lanche imprime o horário de sistema dos lanches, como o editor mostra", () => {
		const names = (id: string) => (id === "slot-lanche" ? "Lanches de Bordo/Apoio" : slotNameOf(id))
		const [meal] = buildOccasionPrintMeals(
			template({
				snack_family: "bordo",
				snack_class: "B",
				event_meals: [{ id: "meal-1", name: "Kit", meal_type_id: "slot-almoco", sort_order: 0, base_headcount: null, groups: [] }],
				items: [item("r-1", "Suco", { meal_type_id: "slot-almoco", recommended_proportion: 100 })],
			}),
			"apoio",
			names,
			"slot-lanche"
		)
		expect(meal.slotName).toBe("Lanches de Bordo/Apoio")
		// Apoio comum fica no horário gravado.
		const [plain] = buildOccasionPrintMeals(
			template({
				event_meals: [{ id: "meal-1", name: "Kit", meal_type_id: "slot-almoco", sort_order: 0, base_headcount: null, groups: [] }],
				items: [item("r-1", "Suco", { meal_type_id: "slot-almoco" })],
			}),
			"apoio",
			names,
			"slot-lanche"
		)
		expect(plain.slotName).toBe("Almoço")
	})

	test("padrão de lanche não imprime kits nem pax: vêm do pedido", () => {
		const [meal] = buildOccasionPrintMeals(
			template({
				snack_family: "apoio",
				snack_class: "A",
				event_meals: [{ id: "meal-1", name: "Kit", meal_type_id: "slot-almoco", sort_order: 0, base_headcount: 40, groups: [] }],
				items: [item("r-1", "Suco", { meal_type_id: "slot-almoco", headcount_override: 40, recommended_proportion: 100 })],
			}),
			"apoio",
			slotNameOf
		)
		expect(meal.base).toBeNull()
		expect(meal.groups[0].entries[0].demand).toBe("1 por kit")
	})

	test("refeição sem preparação sai sem grupos (a folha mostra que está vazia)", () => {
		const meals = buildOccasionPrintMeals(
			template({ event_meals: [{ id: "meal-1", name: "Brunch", meal_type_id: "slot-almoco", sort_order: 0, base_headcount: null, groups: [] }] }),
			"event",
			slotNameOf
		)
		expect(meals).toHaveLength(1)
		expect(meals[0].groups).toEqual([])
	})
})

describe("occasionPrintSubtitle", () => {
	test("nome do cardápio e, no padrão de lanche, a classificação", () => {
		expect(occasionPrintSubtitle({ ...template({}), name: "Formatura" })).toBe("Formatura")
		expect(occasionPrintSubtitle({ ...template({ snack_family: "bordo", snack_class: "A" }), name: "Lanche do voo" })).toBe("Lanche do voo · Lanche de Bordo A")
	})
})
