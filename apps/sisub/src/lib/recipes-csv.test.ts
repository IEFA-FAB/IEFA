import type { RecipeSummary } from "@iefa/sisub-domain"
import { describe, expect, test } from "vitest"
import { buildRecipeTree } from "./recipe-tree"
import { buildRecipesCsv, RECIPES_CSV_HEADER } from "./recipes-csv"

const recipe = (overrides: Partial<RecipeSummary> & Pick<RecipeSummary, "id" | "name">): RecipeSummary => ({
	version: 1,
	portion_yield: null,
	preparation_time_minutes: null,
	kitchen_id: null,
	folder_id: null,
	rational_id: null,
	deleted_at: null,
	base_recipe_id: null,
	...overrides,
})

/** Árvore como a exportação monta: tudo aberto, pasta vazia fora. */
const expandedNodes = (recipes: RecipeSummary[], folders: { id: string; name: string }[], sortDirection: "asc" | "desc" = "asc") =>
	buildRecipeTree({ folders, recipes, sortDirection, autoExpand: true, hideEmptyFolders: true }).nodes

const lines = (csv: string) => csv.split("\n")
const noUsage = { menuUsageIds: new Set<string>(), reviewedAtById: new Map<string, string>() }

describe("buildRecipesCsv", () => {
	test("cabeçalho e uma linha por preparação com todas as colunas", () => {
		const csv = buildRecipesCsv({
			nodes: expandedNodes(
				[
					recipe({
						id: "r1",
						name: "Arroz branco",
						folder_id: "f1",
						kitchen_id: 7,
						version: 3,
						portion_yield: 100,
						preparation_time_minutes: 45,
						rational_id: "0123",
						deleted_at: "2026-09-10T12:00:00Z",
					}),
				],
				[{ id: "f1", name: "Guarnições" }]
			),
			menuUsageIds: new Set(["r1"]),
			reviewedAtById: new Map([["r1", "2026-09-14T13:00:00Z"]]),
		})
		const [header, row] = lines(csv)
		expect(header).toBe(RECIPES_CSV_HEADER.map((h) => `"${h}"`).join(","))
		expect(row).toBe('"Guarnições","Arroz branco","Local","3","100","45","0123","Sim","14/09/2026","10/09/2026"')
	})

	test("global, sem pasta, nunca revisada e fora de plano semanal", () => {
		const [, row] = lines(buildRecipesCsv({ nodes: expandedNodes([recipe({ id: "r1", name: "Feijão" })], []), ...noUsage }))
		expect(row).toBe('"Sem pasta","Feijão","Global","1","","","","Não","",""')
	})

	test("segue a ordem da tela: pasta, nome, direção; órfã em Sem pasta, sempre no fim", () => {
		const recipes = [
			recipe({ id: "1", name: "Zebra", folder_id: "a" }),
			recipe({ id: "2", name: "Solta" }),
			recipe({ id: "3", name: "Bolo", folder_id: "b" }),
			recipe({ id: "4", name: "Abacate", folder_id: "a" }),
			recipe({ id: "5", name: "Órfã", folder_id: "apagada" }),
		]
		const folders = [
			{ id: "a", name: "Sobremesas" },
			{ id: "b", name: "Bolos" },
		]
		const namesOf = (sortDirection: "asc" | "desc") =>
			lines(buildRecipesCsv({ nodes: expandedNodes(recipes, folders, sortDirection), ...noUsage }))
				.slice(1)
				.map((line) => line.split(",").slice(0, 2).join(","))
		expect(namesOf("asc")).toEqual(['"Bolos","Bolo"', '"Sobremesas","Abacate"', '"Sobremesas","Zebra"', '"Sem pasta","Órfã"', '"Sem pasta","Solta"'])
		expect(namesOf("desc")).toEqual(['"Sobremesas","Zebra"', '"Sobremesas","Abacate"', '"Bolos","Bolo"', '"Sem pasta","Solta"', '"Sem pasta","Órfã"'])
	})

	test("pastas homônimas não se misturam", () => {
		const csv = buildRecipesCsv({
			nodes: expandedNodes(
				[recipe({ id: "1", name: "B", folder_id: "x" }), recipe({ id: "2", name: "A", folder_id: "y" }), recipe({ id: "3", name: "C", folder_id: "x" })],
				[
					{ id: "x", name: "Molhos" },
					{ id: "y", name: "Molhos" },
				]
			),
			...noUsage,
		})
		const names = lines(csv)
			.slice(1)
			.map((line) => line.split(",")[1])
		// Cada pasta sai inteira antes da outra, em vez de A, B, C intercalados.
		expect([names.slice(0, 2), names.slice(1)]).toContainEqual(['"B"', '"C"'])
	})

	test("nome com fórmula é neutralizado", () => {
		const [, row] = lines(buildRecipesCsv({ nodes: expandedNodes([recipe({ id: "r1", name: '=HYPERLINK("x")' })], []), ...noUsage }))
		expect(row.split(",")[1]).toBe(`"'=HYPERLINK(""x"")"`)
	})

	test("sem preparação, só o cabeçalho", () => {
		expect(lines(buildRecipesCsv({ nodes: [], ...noUsage }))).toHaveLength(1)
	})
})
