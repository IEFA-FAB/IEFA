/**
 * Contrato de escopo do catálogo de cozinha: rotinas de manutenção, etapas-modelo, utensílios e
 * preparações congeladas.
 *
 * As três listagens aceitam `kitchenId` para juntar o catálogo da cozinha ao global, e o guard
 * só olhava o MÓDULO: `kitchen:1` numa cozinha listava o catálogo local de qualquer outra só
 * trocando o número. O fluxo da receita e a etapa-modelo, por sua vez, gravavam vínculo com
 * utensílio/etapa de outra cozinha, que a leitura depois hidratava para quem abrisse a ficha. E a
 * congelada provisória (sobra ainda não revisada pela SDAB) abria por id para qualquer sessão.
 *
 * Os stubs só implementam o que o guard usa; depois dele a operação cai numa falha de stub, que
 * o teste separa de negar.
 */

import { describe, expect, test } from "bun:test"
import { type SisubDb, stepTemplateInKitchen, utensilInKitchen } from "@iefa/database/drizzle/sisub"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError, PermissionDeniedError } from "../types/errors.ts"
import { listMaintenancePlans } from "./equipment-maintenance.ts"
import { fetchFrozenPreparation, listFrozenPreparations } from "./frozen-preparation.ts"
import { createStepTemplate, listStepTemplates, listUtensils, saveRecipeFlow } from "./recipe-flow.ts"

const KITCHEN = 3
const OTHER_KITCHEN = 9
const UNIT = 5
const OTHER_UNIT = 6
const RECIPE_ID = "44444444-4444-4444-8444-444444444444"
const OWN_UTENSIL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const GLOBAL_UTENSIL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const FOREIGN_UTENSIL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const MISSING_UTENSIL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
const FOREIGN_STEP_TEMPLATE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
const OWN_STEP_TEMPLATE = "ffffffff-ffff-4fff-8fff-ffffffffffff"
const FROZEN_ID = "12121212-1212-4212-8212-121212121212"

type Perm = UserContext["permissions"][number]

function perm(module: Perm["module"], level: number, scope: Partial<Pick<Perm, "unit_id" | "kitchen_id" | "mess_hall_id">> = {}): Perm {
	return { module, level, unit_id: null, kitchen_id: null, mess_hall_id: null, ...scope }
}

function ctx(...permissions: Perm[]): UserContext {
	return { userId: "user-1", permissions, aal: 1, lastFactorAt: null, origin: "session" }
}

/** Desfecho da promessa: o erro (ou null), sem deixar a rejeição escapar. */
function outcome(run: Promise<unknown>): Promise<unknown> {
	return run.then(
		() => null,
		(e: unknown) => e
	)
}

async function denied(run: Promise<unknown>): Promise<boolean> {
	return (await outcome(run)) instanceof PermissionDeniedError
}

// ── Listagens com `kitchenId` ────────────────────────────────────────────────

/** Toda leitura volta vazia: o que está sob teste é a decisão do guard, não o resultado. */
function emptyCatalogDb(): SisubDb {
	const chain: Record<string, unknown> = {}
	chain.from = () => chain
	chain.where = () => Object.assign(Promise.resolve([]), chain)
	chain.orderBy = () => Object.assign(Promise.resolve([]), chain)
	chain.limit = () => Promise.resolve([])
	const findMany = () => Promise.resolve([])
	return {
		select: () => chain,
		query: { stepTemplateInKitchen: { findMany }, utensilInKitchen: { findMany } },
	} as unknown as SisubDb
}

const LISTINGS: [string, string[], (db: SisubDb, c: UserContext, kitchenId: number | null) => Promise<unknown>][] = [
	["listMaintenancePlans", ["kitchen", "kitchen-production"], (db, c, kitchenId) => listMaintenancePlans(db, c, { kitchenId, limit: 50 } as never)],
	["listStepTemplates", ["kitchen"], (db, c, kitchenId) => listStepTemplates(db, c, { kitchenId })],
	["listUtensils", ["kitchen", "kitchen-production"], (db, c, kitchenId) => listUtensils(db, c, { kitchenId })],
]

describe("listagem do catálogo com kitchenId exige a cozinha pedida", () => {
	for (const [name, modules, run] of LISTINGS) {
		for (const module of modules) {
			test(`${name}: ${module}:1 de outra cozinha é recusado`, async () => {
				expect(await denied(run(emptyCatalogDb(), ctx(perm(module as Perm["module"], 1, { kitchen_id: OTHER_KITCHEN })), KITCHEN))).toBe(true)
			})

			test(`${name}: ${module}:1 na cozinha pedida passa`, async () => {
				expect(await outcome(run(emptyCatalogDb(), ctx(perm(module as Perm["module"], 1, { kitchen_id: KITCHEN })), KITCHEN))).toBeNull()
			})

			test(`${name}: ${module}:1 de outra cozinha ainda lê só o catálogo global (sem kitchenId)`, async () => {
				expect(await outcome(run(emptyCatalogDb(), ctx(perm(module as Perm["module"], 1, { kitchen_id: OTHER_KITCHEN })), null))).toBeNull()
			})
		}

		test(`${name}: deny escopado na cozinha pedida derruba o allow sem escopo`, async () => {
			const c = ctx(perm("kitchen", 1), perm("kitchen", 0, { kitchen_id: KITCHEN }))
			expect(await denied(run(emptyCatalogDb(), c, KITCHEN))).toBe(true)
		})
	}

	test("listMaintenancePlans e listUtensils: global:1 (SDAB, sem escopo) segue lendo qualquer cozinha", async () => {
		expect(await outcome(listMaintenancePlans(emptyCatalogDb(), ctx(perm("global", 1)), { kitchenId: KITCHEN, limit: 50 } as never))).toBeNull()
		expect(await outcome(listUtensils(emptyCatalogDb(), ctx(perm("global", 1)), { kitchenId: KITCHEN }))).toBeNull()
	})
})

// ── Referências do fluxo da receita e da etapa-modelo ────────────────────────

type RefRow = { id: string; kitchenId: number | null }

const UTENSILS: RefRow[] = [
	{ id: OWN_UTENSIL, kitchenId: KITCHEN },
	{ id: GLOBAL_UTENSIL, kitchenId: null },
	{ id: FOREIGN_UTENSIL, kitchenId: OTHER_KITCHEN },
]
const STEP_TEMPLATES: RefRow[] = [
	{ id: OWN_STEP_TEMPLATE, kitchenId: KITCHEN },
	{ id: FOREIGN_STEP_TEMPLATE, kitchenId: OTHER_KITCHEN },
]

/**
 * `recipeOwner` alimenta o guard de posse da receita; `select().from(tabela).where()` devolve o
 * catálogo da TABELA pedida (o `where` por id não é inspecionável, então o stub devolve todas as
 * linhas e a operação filtra pelos ids citados — é o que ela faz com o resultado real também).
 * Qualquer escrita é registrada e falha: o teste exige que a recusa venha antes.
 */
function refsDb(recipeOwner: number | null) {
	const writes: string[] = []
	const db = {
		select: () => ({
			from: (table: unknown) => ({
				where: () => {
					const all = table === utensilInKitchen ? UTENSILS : table === stepTemplateInKitchen ? STEP_TEMPLATES : []
					return Promise.resolve(all)
				},
			}),
		}),
		insert: () => {
			writes.push("insert")
			throw new Error("stub: escrita")
		},
		transaction: () => {
			writes.push("transaction")
			throw new Error("stub: escrita")
		},
		query: {
			recipesInKitchen: { findFirst: () => Promise.resolve({ kitchenId: recipeOwner }) },
			recipeIngredientsInKitchen: { findMany: () => Promise.resolve([]) },
		},
	}
	return { db: db as unknown as SisubDb, writes }
}

function step(overrides: { utensilIds?: string[]; stepTemplateId?: string | null } = {}) {
	return {
		clientId: "s1",
		stepTemplateId: overrides.stepTemplateId ?? null,
		canvasX: 0,
		canvasY: 0,
		utensilIds: overrides.utensilIds ?? [],
		outputs: [{ clientId: "o1", isFinal: true }],
		inputs: [],
	}
}

function isInvalidReference(error: unknown): boolean {
	return error instanceof DomainError && error.code === "INVALID_REFERENCE"
}

describe("saveRecipeFlow: utensílio e etapa-modelo só do catálogo global ou da cozinha dona da receita", () => {
	const kitchenWriter = ctx(perm("kitchen", 2, { kitchen_id: KITCHEN }))

	test("utensílio de outra cozinha é recusado antes de qualquer escrita", async () => {
		const { db, writes } = refsDb(KITCHEN)
		const error = await outcome(saveRecipeFlow(db, kitchenWriter, { recipeId: RECIPE_ID, steps: [step({ utensilIds: [OWN_UTENSIL, FOREIGN_UTENSIL] })] }))
		expect(isInvalidReference(error)).toBe(true)
		expect((error as DomainError).details).toEqual({ utensilIds: [FOREIGN_UTENSIL] })
		expect(writes).toEqual([])
	})

	test("utensílio inexistente dá a mesma recusa (sondar não revela posse)", async () => {
		const { db, writes } = refsDb(KITCHEN)
		const error = await outcome(saveRecipeFlow(db, kitchenWriter, { recipeId: RECIPE_ID, steps: [step({ utensilIds: [MISSING_UTENSIL] })] }))
		expect(isInvalidReference(error)).toBe(true)
		expect(writes).toEqual([])
	})

	test("etapa-modelo de outra cozinha é recusada", async () => {
		const { db, writes } = refsDb(KITCHEN)
		const error = await outcome(saveRecipeFlow(db, kitchenWriter, { recipeId: RECIPE_ID, steps: [step({ stepTemplateId: FOREIGN_STEP_TEMPLATE })] }))
		expect(isInvalidReference(error)).toBe(true)
		expect((error as DomainError).details).toEqual({ stepTemplateIds: [FOREIGN_STEP_TEMPLATE] })
		expect(writes).toEqual([])
	})

	test("utensílio global e da própria cozinha, com etapa-modelo da própria cozinha, passam para a gravação", async () => {
		const { db, writes } = refsDb(KITCHEN)
		const error = await outcome(
			saveRecipeFlow(db, kitchenWriter, {
				recipeId: RECIPE_ID,
				steps: [step({ utensilIds: [OWN_UTENSIL, GLOBAL_UTENSIL], stepTemplateId: OWN_STEP_TEMPLATE })],
			})
		)
		expect(isInvalidReference(error)).toBe(false)
		expect(writes).toEqual(["transaction"])
	})

	test("receita GLOBAL só cita utensílio global — o local de uma cozinha não entra no catálogo da FAB", async () => {
		const { db, writes } = refsDb(null)
		const error = await outcome(saveRecipeFlow(db, ctx(perm("global", 2)), { recipeId: RECIPE_ID, steps: [step({ utensilIds: [OWN_UTENSIL] })] }))
		expect(isInvalidReference(error)).toBe(true)
		expect(writes).toEqual([])
	})

	test("a permissão vem antes da checagem de referência (outra cozinha recebe 403, não a lista de ids)", async () => {
		const { db } = refsDb(KITCHEN)
		const error = await outcome(
			saveRecipeFlow(db, ctx(perm("kitchen", 2, { kitchen_id: OTHER_KITCHEN })), { recipeId: RECIPE_ID, steps: [step({ utensilIds: [FOREIGN_UTENSIL] })] })
		)
		expect(error).toBeInstanceOf(PermissionDeniedError)
	})
})

describe("createStepTemplate: utensílio padrão do mesmo escopo da etapa", () => {
	const base = { name: "Refogar", description: null, defaultDurationMinutes: null }

	test("etapa local com utensílio de outra cozinha é recusada sem gravar", async () => {
		const { db, writes } = refsDb(KITCHEN)
		const error = await outcome(
			createStepTemplate(db, ctx(perm("kitchen", 2, { kitchen_id: KITCHEN })), { ...base, kitchenId: KITCHEN, utensilIds: [FOREIGN_UTENSIL] })
		)
		expect(isInvalidReference(error)).toBe(true)
		expect(writes).toEqual([])
	})

	test("etapa global com utensílio local é recusada", async () => {
		const { db, writes } = refsDb(null)
		const error = await outcome(createStepTemplate(db, ctx(perm("global", 2)), { ...base, kitchenId: null, utensilIds: [OWN_UTENSIL] }))
		expect(isInvalidReference(error)).toBe(true)
		expect(writes).toEqual([])
	})

	test("etapa local com utensílio global e da própria cozinha segue para a gravação", async () => {
		const { db, writes } = refsDb(KITCHEN)
		const error = await outcome(
			createStepTemplate(db, ctx(perm("kitchen", 2, { kitchen_id: KITCHEN })), { ...base, kitchenId: KITCHEN, utensilIds: [OWN_UTENSIL, GLOBAL_UTENSIL] })
		)
		expect(isInvalidReference(error)).toBe(false)
		expect(writes).toEqual(["insert"])
	})
})

// ── Preparação congelada ─────────────────────────────────────────────────────

type FrozenRow = { id: string; provisionalSince: string | null; provisionalReviewedAt: string | null; provisionalKitchenId: number | null }

const PENDING: FrozenRow = { id: FROZEN_ID, provisionalSince: "2026-09-30T12:00:00Z", provisionalReviewedAt: null, provisionalKitchenId: KITCHEN }
const REVIEWED: FrozenRow = { ...PENDING, provisionalReviewedAt: "2026-10-01T12:00:00Z" }
const CATALOG: FrozenRow = { id: FROZEN_ID, provisionalSince: null, provisionalReviewedAt: null, provisionalKitchenId: null }

/** A congelada pedida e a cozinha dona dela (lotada em UNIT). */
function frozenDb(row: FrozenRow | undefined): SisubDb {
	const chain: Record<string, unknown> = {}
	chain.from = () => chain
	chain.where = () => chain
	chain.orderBy = () => Promise.resolve([])
	return {
		select: () => chain,
		query: {
			frozenPreparationInKitchen: { findFirst: () => Promise.resolve(row) },
			kitchenInKitchen: { findFirst: () => Promise.resolve({ id: KITCHEN, unitId: UNIT, purchaseUnitId: null }) },
		},
	} as unknown as SisubDb
}

describe("preparação congelada", () => {
	test("listFrozenPreparations exige um módulo que monta, executa ou cura preparação", async () => {
		expect(await denied(listFrozenPreparations(frozenDb(undefined), ctx(), {}))).toBe(true)
		expect(await denied(listFrozenPreparations(frozenDb(undefined), ctx(perm("diner", 1)), {}))).toBe(true)
		for (const module of ["kitchen", "kitchen-production", "global"] as const) {
			expect(
				await outcome(listFrozenPreparations(frozenDb(undefined), ctx(perm(module, 1, module === "global" ? {} : { kitchen_id: KITCHEN })), {}))
			).toBeNull()
		}
	})

	test("fetchFrozenPreparation sem módulo é 403", async () => {
		expect(await denied(fetchFrozenPreparation(frozenDb(CATALOG), ctx(perm("diner", 1)), { id: FROZEN_ID }))).toBe(true)
	})

	test("item do catálogo (ou provisória já revisada) abre para qualquer cozinha", async () => {
		const otherKitchen = ctx(perm("kitchen", 1, { kitchen_id: OTHER_KITCHEN }))
		expect(await outcome(fetchFrozenPreparation(frozenDb(CATALOG), otherKitchen, { id: FROZEN_ID }))).toBeNull()
		expect(await outcome(fetchFrozenPreparation(frozenDb(REVIEWED), otherKitchen, { id: FROZEN_ID }))).toBeNull()
	})

	test("provisória pendente de outra cozinha responde como inexistente", async () => {
		const error = await outcome(fetchFrozenPreparation(frozenDb(PENDING), ctx(perm("kitchen", 1, { kitchen_id: OTHER_KITCHEN })), { id: FROZEN_ID }))
		expect(error).toBeInstanceOf(NotFoundError)
		const viaOtherUnit = await outcome(
			fetchFrozenPreparation(frozenDb(PENDING), ctx(perm("kitchen", 1, { kitchen_id: OTHER_KITCHEN }), perm("unit", 1, { unit_id: OTHER_UNIT })), {
				id: FROZEN_ID,
			})
		)
		expect(viaOtherUnit).toBeInstanceOf(NotFoundError)
	})

	test("provisória pendente abre só para a cozinha dona e a SDAB", async () => {
		const allowed = [ctx(perm("kitchen", 1, { kitchen_id: KITCHEN })), ctx(perm("kitchen-production", 1, { kitchen_id: KITCHEN })), ctx(perm("global", 1))]
		for (const c of allowed) expect(await outcome(fetchFrozenPreparation(frozenDb(PENDING), c, { id: FROZEN_ID }))).toBeNull()
		// `unit` da OM dona não é cozinha dona: a sobra é da cozinha até a revisão.
		const viaOwnerUnit = await outcome(
			fetchFrozenPreparation(frozenDb(PENDING), ctx(perm("kitchen", 1, { kitchen_id: OTHER_KITCHEN }), perm("unit", 1, { unit_id: UNIT })), { id: FROZEN_ID })
		)
		expect(viaOwnerUnit).toBeInstanceOf(NotFoundError)
	})

	test("id inexistente é NotFound", async () => {
		expect(await outcome(fetchFrozenPreparation(frozenDb(undefined), ctx(perm("global", 1)), { id: FROZEN_ID }))).toBeInstanceOf(NotFoundError)
	})
})
