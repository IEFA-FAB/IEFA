import type { RecipeIngredientDigest } from "@iefa/sisub-domain"
import { describe, expect, test } from "vitest"
import { buildPreparationEntries, DEFAULT_PRINT_OPTIONS, describeAllergens, isMainDish, type PreparationSource, parsePrintOptions } from "./cardapio-print"

const arroz: PreparationSource = { id: "r1", name: "Arroz branco", version: "v2", prePreparation: null, method: "Refogar e cozinhar." }
const lasanha: PreparationSource = { id: "r2", name: "Lasanha à bolonhesa", version: "v1", prePreparation: "Descongelar a carne.", method: null }
const salada: PreparationSource = { id: "r3", name: "Salada verde", version: "v1", prePreparation: null, method: null }

const digests = new Map<string, RecipeIngredientDigest>([
	[
		"r1",
		{
			recipe_id: "r1",
			ingredients: [
				{ name: "Arroz", allergens: [] },
				{ name: "Óleo de soja", allergens: [] },
			],
			unresolved: [],
		},
	],
	[
		"r2",
		{
			recipe_id: "r2",
			ingredients: [
				{ name: "Massa de lasanha", allergens: ["gluten", "ovos"] },
				{ name: "Queijo muçarela", allergens: ["leite"] },
				{ name: "Molho bolonhesa congelado", allergens: [] },
			],
			unresolved: ["Molho bolonhesa congelado"],
		},
	],
	["r3", { recipe_id: "r3", ingredients: [{ name: "Alface", allergens: [] }], unresolved: [] }],
])

describe("isMainDish", () => {
	test("só o grupo prato principal sai em negrito", () => {
		expect(isMainDish("prato_principal")).toBe(true)
		for (const g of ["acompanhamento", "guarnicao", "bebida", "sobremesa", null, undefined]) expect(isMainDish(g)).toBe(false)
	})
})

describe("parsePrintOptions", () => {
	test("valor salvo inválido cai no padrão campo a campo", () => {
		expect(parsePrintOptions(null)).toEqual(DEFAULT_PRINT_OPTIONS)
		expect(parsePrintOptions({ showMethod: false, ingredients: "tudo" })).toEqual({ showMethod: false, ingredients: "none" })
		expect(parsePrintOptions({ ingredients: "allergens" })).toEqual({ showMethod: true, ingredients: "allergens" })
	})
})

describe("buildPreparationEntries", () => {
	test("padrão = folha antiga: só fichas com texto de preparo, sem ingredientes", () => {
		const entries = buildPreparationEntries([salada, lasanha, arroz], digests, DEFAULT_PRINT_OPTIONS)
		expect(entries.map((e) => e.name)).toEqual(["Arroz branco", "Lasanha à bolonhesa"])
		expect(entries.every((e) => e.ingredients == null && e.allergens == null)).toBe(true)
	})

	test("modo de preparo desligado apaga o texto; sem ingredientes a lista fica vazia", () => {
		expect(buildPreparationEntries([arroz, lasanha], digests, { showMethod: false, ingredients: "none" })).toEqual([])
	})

	test("todos os ingredientes: nomes, sem quantidade, e entra quem não tem preparo", () => {
		const entries = buildPreparationEntries([salada, arroz], digests, { showMethod: false, ingredients: "all" })
		expect(entries.map((e) => [e.name, e.ingredients, e.method])).toEqual([
			["Arroz branco", ["Arroz", "Óleo de soja"], null],
			["Salada verde", ["Alface"], null],
		])
	})

	test("somente alergênicos: rótulos na ordem canônica, sem lista de ingredientes", () => {
		const [entry] = buildPreparationEntries([lasanha], digests, { showMethod: true, ingredients: "allergens" })
		expect(entry.ingredients).toBeNull()
		expect(entry.allergens).toEqual(["Glúten", "Leite", "Ovos"])
		expect(entry.prePreparation).toBe("Descongelar a carne.")
		expect(describeAllergens(entry)).toBe("Glúten, Leite, Ovos (não conferido: Molho bolonhesa congelado)")
	})

	test("ficha com ingredientes e nenhum marcado não vira 'isento'", () => {
		const [entry] = buildPreparationEntries([arroz], digests, { showMethod: false, ingredients: "allergens" })
		expect(describeAllergens(entry)).toBe("nenhum marcado nos insumos")
	})

	test("ficha sem ingrediente nenhum não ganha linha de alergênicos", () => {
		const vazia: PreparationSource = { id: "r9", name: "Água", version: "v1", prePreparation: null, method: null }
		const withEmpty = new Map(digests).set("r9", { recipe_id: "r9", ingredients: [], unresolved: [] })
		expect(buildPreparationEntries([vazia], withEmpty, { showMethod: true, ingredients: "allergens" })).toEqual([])
	})

	test("ingredientes ainda não carregados: a ficha sai só com o preparo", () => {
		const [entry] = buildPreparationEntries([arroz], undefined, { showMethod: true, ingredients: "all" })
		expect(entry.ingredients).toBeNull()
		expect(entry.method).toBe("Refogar e cozinhar.")
	})
})
