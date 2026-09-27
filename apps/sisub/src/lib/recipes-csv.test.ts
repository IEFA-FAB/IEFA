import type { RecipeSummary } from "@iefa/sisub-domain"
import { describe, expect, test } from "vitest"
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

const lines = (csv: string) => csv.replace(/^﻿/, "").split("\n")

describe("buildRecipesCsv", () => {
	test("cabeçalho com BOM e uma linha por preparação com todas as colunas", () => {
		const csv = buildRecipesCsv({
			recipes: [
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
			folderNameById: new Map([["f1", "Guarnições"]]),
			menuUsageIds: new Set(["r1"]),
			reviewedAtById: new Map([["r1", "2026-09-14T13:00:00Z"]]),
		})
		expect(csv.startsWith("﻿")).toBe(true)
		const [header, row] = lines(csv)
		expect(header).toBe(RECIPES_CSV_HEADER.map((h) => `"${h}"`).join(","))
		expect(row).toBe('"Guarnições","Arroz branco","Local","3","100","45","0123","Sim","14/09/2026","10/09/2026"')
	})

	test("global, sem pasta, nunca revisada e fora de plano semanal", () => {
		const [, row] = lines(
			buildRecipesCsv({
				recipes: [recipe({ id: "r1", name: "Feijão" })],
				folderNameById: new Map(),
				menuUsageIds: new Set(),
				reviewedAtById: new Map(),
			})
		)
		expect(row).toBe('"Sem pasta","Feijão","Global","1","","","","Não","",""')
	})

	test("ordena por pasta e depois por nome; pasta apagada entra em Sem pasta, no fim", () => {
		const csv = buildRecipesCsv({
			recipes: [
				recipe({ id: "1", name: "Zebra", folder_id: "a" }),
				recipe({ id: "2", name: "Solta" }),
				recipe({ id: "3", name: "Bolo", folder_id: "b" }),
				recipe({ id: "4", name: "Abacate", folder_id: "a" }),
				recipe({ id: "5", name: "Órfã", folder_id: "apagada" }),
			],
			folderNameById: new Map([
				["a", "Sobremesas"],
				["b", "Bolos"],
			]),
			menuUsageIds: new Set(),
			reviewedAtById: new Map(),
		})
		const names = lines(csv)
			.slice(1)
			.map((line) => line.split(",")[1])
		expect(names).toEqual(['"Bolo"', '"Abacate"', '"Zebra"', '"Órfã"', '"Solta"'])
	})

	test("nome com fórmula é neutralizado", () => {
		const [, row] = lines(
			buildRecipesCsv({
				recipes: [recipe({ id: "r1", name: '=HYPERLINK("x")' })],
				folderNameById: new Map(),
				menuUsageIds: new Set(),
				reviewedAtById: new Map(),
			})
		)
		expect(row.split(",")[1]).toBe(`"'=HYPERLINK(""x"")"`)
	})

	test("lista vazia sai só com o cabeçalho", () => {
		expect(lines(buildRecipesCsv({ recipes: [], folderNameById: new Map(), menuUsageIds: new Set(), reviewedAtById: new Map() }))).toHaveLength(1)
	})
})
