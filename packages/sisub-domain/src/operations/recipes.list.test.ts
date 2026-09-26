/**
 * Listagens de receitas com a dedup por família resolvida no Postgres.
 *
 * A versão anterior de `listRecipes` carregava a ficha técnica de TODAS as versões (4.597
 * linhas no catálogo global em 2026-09) e descartava dois terços em JS. Agora a vencedora de
 * cada linhagem sai de um `DISTINCT ON` na mesma instrução que monta a ficha.
 *
 * O stub não executa SQL, então os testes olham o SQL que o Drizzle gera de verdade
 * (`drizzle.mock`): o recorte (lixeira, escopo, busca) tem de estar na subconsulta, e o
 * `ORDER BY` tem de ser a regra de `isLineageWinner`. A equivalência da ordem com a regra é
 * verificada à parte, sobre todas as combinações pequenas de escopo × versão.
 */

import { describe, expect, test } from "bun:test"
import { type SisubDb, sisubSchema } from "@iefa/database/drizzle/sisub"
import { drizzle } from "drizzle-orm/postgres-js"
import type { ListRecipes } from "../schemas/recipes.ts"
import type { UserContext } from "../types/context.ts"
import { PermissionDeniedError } from "../types/errors.ts"
import { isLineageWinner } from "../utils/recipe-lineage.ts"
import { listRecipeSummaries, listRecipes } from "./recipes.ts"

const mockDb = drizzle.mock({ schema: sisubSchema })

function buildContext(permissions: UserContext["permissions"]): UserContext {
	return { userId: "user-1", permissions, aal: 1, lastFactorAt: null, origin: "session" }
}
const buildKitchenContext = (kitchenId: number) => buildContext([{ module: "kitchen", level: 1, kitchen_id: kitchenId, mess_hall_id: null, unit_id: null }])

type CapturedQuery = { sql: string; params: unknown[] }

/**
 * Stub que gera o SQL com o Drizzle real e devolve linhas prontas. `findMany` (ficha técnica)
 * e `select().from().where()` (resumo) registram a consulta; a subconsulta de linhagem é
 * montada pelo `selectDistinctOn` do mock, o mesmo builder que roda em produção.
 */
function createFakeDb(rows: unknown[] = []) {
	const queries: CapturedQuery[] = []
	const db = {
		selectDistinctOn: mockDb.selectDistinctOn.bind(mockDb),
		select: (fields: never) => ({
			from: (table: never) => ({
				where: (where: never) => {
					queries.push(mockDb.select(fields).from(table).where(where).toSQL())
					return Promise.resolve(rows.map((r) => structuredClone(r)))
				},
			}),
		}),
		query: {
			recipesInKitchen: {
				findMany: (config: Parameters<typeof mockDb.query.recipesInKitchen.findMany>[0]) => {
					queries.push(mockDb.query.recipesInKitchen.findMany(config).toSQL())
					return Promise.resolve(rows.map((r) => structuredClone(r)))
				},
			},
		},
	} as unknown as SisubDb
	return { db, queries }
}

const LINEAGE_ORDER =
	'order by coalesce("lineage"."base_recipe_id", "lineage"."id"), ("lineage"."kitchen_id" is not null) desc, "lineage"."version" desc, "lineage"."id" asc)'

/** Recorte + ordem da subconsulta de linhagem, com os parâmetros que ela consome. */
function extractLineageFilter(query: CapturedQuery): { sql: string; params: unknown[] } {
	const start = query.sql.lastIndexOf(" in (select distinct on")
	expect(start).toBeGreaterThan(-1)
	const firstParam = Number(/\$(\d+)/.exec(query.sql.slice(start))?.[1] ?? query.params.length + 1)
	return { sql: query.sql.slice(start), params: query.params.slice(firstParam - 1) }
}

async function captureListRecipesFilter(input: ListRecipes) {
	const { db, queries } = createFakeDb()
	await listRecipes(db, buildKitchenContext(7), input)
	expect(queries).toHaveLength(1)
	return extractLineageFilter(queries[0])
}

describe("listRecipes — SQL", () => {
	test("uma instrução só: a ficha técnica é filtrada pela vencedora de cada linhagem", async () => {
		const { db, queries } = createFakeDb()
		await listRecipes(db, buildKitchenContext(7), { kitchenId: null })
		expect(queries).toHaveLength(1)
		expect(queries[0].sql).toContain(
			`where "recipesInKitchen"."id" in (select distinct on (coalesce("lineage"."base_recipe_id", "lineage"."id")) "id" from "kitchen"."recipes" "lineage" where ("lineage"."deleted_at" is null and "lineage"."kitchen_id" is null) ${LINEAGE_ORDER}`
		)
		// O recorte vive na subconsulta, não fora dela: fora, filtraria depois da dedup.
		expect(queries[0].sql.endsWith(LINEAGE_ORDER)).toBe(true)
	})

	test("cozinha + busca: escopo global ∪ local e ilike na subconsulta", async () => {
		const filter = await captureListRecipesFilter({ kitchenId: 7, search: "arroz" })
		expect(filter.sql).toContain(
			'where ("lineage"."deleted_at" is null and ("lineage"."kitchen_id" is null or "lineage"."kitchen_id" = $3) and "lineage"."name" ilike $4)'
		)
		expect(filter.params).toEqual([7, "%arroz%"])
	})

	test("includeDeleted tira só o filtro de lixeira", async () => {
		const filter = await captureListRecipesFilter({ kitchenId: null, includeDeleted: true })
		expect(filter.sql).toContain(`where "lineage"."kitchen_id" is null ${LINEAGE_ORDER}`)
		expect(filter.sql).not.toContain("deleted_at")
	})

	test("globalOnly ignora as locais da cozinha", async () => {
		const filter = await captureListRecipesFilter({ kitchenId: 7, globalOnly: true })
		expect(filter.sql).toContain('where ("lineage"."deleted_at" is null and "lineage"."kitchen_id" is null)')
		expect(filter.params).toEqual([])
	})

	test("listRecipeSummaries usa o mesmo filtro de linhagem", async () => {
		const input: ListRecipes = { kitchenId: 7, search: "feijão" }
		const full = await captureListRecipesFilter(input)
		const { db, queries } = createFakeDb()
		await listRecipeSummaries(db, buildKitchenContext(7), input)
		expect(queries).toHaveLength(1)
		expect(queries[0].sql.startsWith('select "id", "name", "version"')).toBe(true)
		const summary = extractLineageFilter(queries[0])
		// Os placeholders mudam de número (a ficha consome dois `limit` antes); o texto não.
		const renumber = (sql: string) => sql.replace(/\$\d+/g, "$?")
		expect(renumber(summary.sql)).toBe(renumber(full.sql))
		expect(summary.params).toEqual(full.params)
	})
})

describe("listRecipes — pós-processamento", () => {
	const buildFullRow = (id: string, name: string, ingredients: unknown[] = []) => ({
		id,
		name,
		version: 1,
		kitchenId: null,
		baseRecipeId: null,
		deletedAt: null,
		portionYield: "100.000",
		recipeIngredientsInKitchens: ingredients,
	})

	test("ordem pt-BR e `numeric` como número", async () => {
		const { db } = createFakeDb([buildFullRow("f", "Feijão"), buildFullRow("a", "Arroz"), buildFullRow("b", "Abóbora")])
		const recipes = await listRecipes(db, buildKitchenContext(7), { kitchenId: null })
		expect(recipes.map((r) => r.id)).toEqual(["b", "a", "f"])
		expect(recipes[0].portion_yield).toBe(100)
	})

	test("preparação congelada na lixeira não vaza pela ficha", async () => {
		const ingredients = [
			{ id: "ri-1", frozenPreparationInKitchen: { id: "fp-1", deletedAt: "2026-09-01T00:00:00Z" }, ingredientInKitchen: null },
			{ id: "ri-2", frozenPreparationInKitchen: { id: "fp-2", deletedAt: null }, ingredientInKitchen: null },
		]
		const { db } = createFakeDb([buildFullRow("s", "Feijão", ingredients)])
		const [recipe] = await listRecipes(db, buildKitchenContext(7), { kitchenId: null })
		expect(recipe.ingredients.map((ri) => ri.frozen_preparation?.id ?? null)).toEqual([null, "fp-2"])
	})

	test("cozinha alheia é recusada antes de qualquer consulta", async () => {
		const { db, queries } = createFakeDb()
		await expect(listRecipes(db, buildKitchenContext(7), { kitchenId: 9 })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(queries).toHaveLength(0)
	})
})

describe("ORDER BY da linhagem ≡ isLineageWinner", () => {
	type Candidate = { id: string; kitchenId: number | null; version: number }

	/** O `ORDER BY` de `LINEAGE_ORDER` dentro de uma linhagem, em JS: primeira linha vence. */
	function pickFirstByLineageOrder(rows: Candidate[]): Candidate {
		return rows.toSorted(
			(a, b) => Number(b.kitchenId != null) - Number(a.kitchenId != null) || b.version - a.version || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
		)[0]
	}

	/** Todas as linhagens de até 3 linhas sobre escopo {global, cozinha 7} × versão {1, 2, 3}. */
	function enumerateLineages(): Candidate[][] {
		const ranks = [null, 7].flatMap((kitchenId) => [1, 2, 3].map((version) => ({ kitchenId, version })))
		const lineages: Candidate[][] = []
		const extend = (current: Candidate[]) => {
			if (current.length > 0) lineages.push(current)
			if (current.length === 3) return
			for (const rank of ranks) extend([...current, { id: `r${current.length}`, ...rank }])
		}
		extend([])
		return lineages
	}

	test("sem empate, a primeira pela ordem é a que a regra elege contra todas as outras", () => {
		for (const rows of enumerateLineages()) {
			const winner = pickFirstByLineageOrder(rows)
			// Ninguém da linhagem vence a escolhida pela regra.
			for (const other of rows) expect(isLineageWinner(other, winner)).toBe(false)
			// E, se não há empate de escopo + versão com ela, a escolhida vence todas as demais.
			const tied = rows.filter((r) => r !== winner && !isLineageWinner(winner, r))
			if (tied.length === 0) for (const other of rows.filter((r) => r !== winner)) expect(isLineageWinner(winner, other)).toBe(true)
		}
	})

	test("empate exato (anomalia; o índice único impede) fica com o menor id, qualquer que seja a ordem física", () => {
		const a = { id: "a", kitchenId: null, version: 2 }
		const b = { id: "b", kitchenId: null, version: 2 }
		expect(pickFirstByLineageOrder([a, b]).id).toBe("a")
		expect(pickFirstByLineageOrder([b, a]).id).toBe("a")
	})
})
