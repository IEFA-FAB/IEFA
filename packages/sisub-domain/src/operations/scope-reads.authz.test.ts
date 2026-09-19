/**
 * Contrato de autorização das LEITURAS escopadas e das referências que uma escrita cita.
 *
 * Achados da auditoria de 2026-09-19 (rodada 2): estas operações recebiam `_ctx` e
 * descartavam — a server fn só exigia sessão —, ou checavam um escopo que não era o do dado.
 * Com o `unitId`/`kitchenId`/`ataId` vindo do corpo, qualquer sessão lia o rascunho de ATA, a
 * ATA, o painel e o cardápio planejado de qualquer OM, e o fork de template levava a ficha local
 * de uma cozinha para outra.
 *
 * Os stubs só implementam o que o GUARD usa; depois dele a operação cai numa falha de stub —
 * que o teste separa de negar (`PermissionDeniedError`).
 */

import { describe, expect, test } from "bun:test"
import { kitchenInKitchen, mealTypeInKitchen, recipesInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import { canReachKitchen, kitchenBelongsToUnit, requireKitchenOrItsUnit } from "../guards/kitchen-unit.ts"
import { requireUnscopedPermission } from "../guards/require-permission.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, PermissionDeniedError } from "../types/errors.ts"
import { calculateAtaNeeds, fetchAtaDetails, fetchAtaList } from "./ata.ts"
import { fetchKitchenDrafts, fetchPendingDraft } from "./kitchen-draft.ts"
import { fetchKitchenSettings } from "./kitchens.ts"
import { resolveDisplayName } from "./places.ts"
import { fetchProcurementNeeds, fetchUnitDashboard } from "./procurement.ts"
import { forkTemplate } from "./templates.ts"
import { fetchUnitSettings } from "./units.ts"

const UNIT = 5
const OTHER_UNIT = 6
const KITCHEN = 3
const OTHER_KITCHEN = 9

type Perm = UserContext["permissions"][number]

function perm(module: Perm["module"], level: number, scope: Partial<Pick<Perm, "unit_id" | "kitchen_id" | "mess_hall_id">> = {}): Perm {
	return { module, level, unit_id: null, kitchen_id: null, mess_hall_id: null, ...scope }
}

function ctx(...permissions: Perm[]): UserContext {
	return { userId: "user-1", permissions, aal: 1, lastFactorAt: null, origin: "session" }
}

/** Resolve a promessa em "negou" x "passou do guard" (qualquer outro desfecho). */
async function denied(run: Promise<unknown>): Promise<boolean> {
	const error = await run.then(
		() => null,
		(e: unknown) => e
	)
	return error instanceof PermissionDeniedError
}

/** Cozinha KITCHEN, lotada em UNIT, sem unidade compradora própria. */
const KITCHEN_ROW = { id: KITCHEN, unitId: UNIT, purchaseUnitId: null }

function kitchenDb(row: typeof KITCHEN_ROW | null = KITCHEN_ROW): SisubDb {
	return { query: { kitchenInKitchen: { findFirst: () => Promise.resolve(row) } } } as unknown as SisubDb
}

describe("ponte cozinha ↔ OM", () => {
	test("a cozinha pertence à OM de lotação e à compradora", () => {
		expect(kitchenBelongsToUnit({ id: 1, unitId: UNIT, purchaseUnitId: 50 }, UNIT)).toBe(true)
		expect(kitchenBelongsToUnit({ id: 1, unitId: UNIT, purchaseUnitId: 50 }, 50)).toBe(true)
		expect(kitchenBelongsToUnit({ id: 1, unitId: UNIT, purchaseUnitId: 50 }, OTHER_UNIT)).toBe(false)
	})

	test("alcança a cozinha quem tem a cozinha ou a OM dela — e só", () => {
		expect(canReachKitchen(ctx(perm("kitchen", 1, { kitchen_id: KITCHEN })), 1, KITCHEN_ROW)).toBe(true)
		expect(canReachKitchen(ctx(perm("unit", 1, { unit_id: UNIT })), 1, KITCHEN_ROW)).toBe(true)
		expect(canReachKitchen(ctx(perm("kitchen", 1, { kitchen_id: OTHER_KITCHEN })), 1, KITCHEN_ROW)).toBe(false)
		expect(canReachKitchen(ctx(perm("unit", 1, { unit_id: OTHER_UNIT })), 1, KITCHEN_ROW)).toBe(false)
	})

	test("requireKitchenOrItsUnit lê a OM da LINHA", async () => {
		expect(await denied(requireKitchenOrItsUnit(kitchenDb(), ctx(perm("unit", 1, { unit_id: UNIT })), 1, KITCHEN))).toBe(false)
		expect(await denied(requireKitchenOrItsUnit(kitchenDb(), ctx(perm("unit", 1, { unit_id: OTHER_UNIT })), 1, KITCHEN))).toBe(true)
	})
})

describe("requireUnscopedPermission — o grant de UMA cozinha não abre a FAB", () => {
	test("grant escopado não passa; sem escopo passa; deny sem escopo derruba", () => {
		expect(() => requireUnscopedPermission(ctx(perm("kitchen", 1, { kitchen_id: KITCHEN })), "kitchen", 1)).toThrow(PermissionDeniedError)
		expect(() => requireUnscopedPermission(ctx(perm("kitchen", 1)), "kitchen", 1)).not.toThrow()
		expect(() => requireUnscopedPermission(ctx(perm("kitchen", 1), perm("kitchen", 0)), "kitchen", 1)).toThrow(PermissionDeniedError)
	})
})

describe("rascunho de ATA da cozinha", () => {
	const READS: [string, (db: SisubDb, c: UserContext) => Promise<unknown>][] = [
		["fetchKitchenDrafts", (db, c) => fetchKitchenDrafts(db, c, { kitchenId: KITCHEN })],
		["fetchPendingDraft", (db, c) => fetchPendingDraft(db, c, { kitchenId: KITCHEN })],
	]
	for (const [name, run] of READS) {
		test(`${name}: nega sessão sem a cozinha nem a OM dela`, async () => {
			expect(await denied(run(kitchenDb(), ctx()))).toBe(true)
			expect(await denied(run(kitchenDb(), ctx(perm("kitchen", 1, { kitchen_id: OTHER_KITCHEN }))))).toBe(true)
			expect(await denied(run(kitchenDb(), ctx(perm("unit", 1, { unit_id: OTHER_UNIT }))))).toBe(true)
		})
		test(`${name}: passa a própria cozinha e a gestão da OM (o wizard da ATA)`, async () => {
			expect(await denied(run(kitchenDb(), ctx(perm("kitchen", 1, { kitchen_id: KITCHEN }))))).toBe(false)
			expect(await denied(run(kitchenDb(), ctx(perm("unit", 1, { unit_id: UNIT }))))).toBe(false)
		})
	}
})

describe("ATA e painel da unidade", () => {
	const ataDb = {
		query: { procurementListInProcurement: { findFirst: () => Promise.resolve({ id: "ata-1", unitId: UNIT, status: "draft" }) } },
	} as unknown as SisubDb

	test("fetchAtaList exige unit:1 na unidade pedida", async () => {
		expect(await denied(fetchAtaList({} as SisubDb, ctx(perm("unit", 1, { unit_id: OTHER_UNIT })), { unitId: UNIT }))).toBe(true)
		expect(await denied(fetchAtaList({} as SisubDb, ctx(perm("unit", 1, { unit_id: UNIT })), { unitId: UNIT }))).toBe(false)
	})

	test("fetchAtaDetails exige unit:1 na unidade DONA, lida da linha", async () => {
		expect(await denied(fetchAtaDetails(ataDb, ctx(perm("unit", 1, { unit_id: OTHER_UNIT })), { ataId: "ata-1" }))).toBe(true)
		expect(await denied(fetchAtaDetails(ataDb, ctx(), { ataId: "ata-1" }))).toBe(true)
		expect(await denied(fetchAtaDetails(ataDb, ctx(perm("unit", 1, { unit_id: UNIT })), { ataId: "ata-1" }))).toBe(false)
	})

	test("fetchUnitDashboard exige unit:1 na unidade pedida", async () => {
		expect(await denied(fetchUnitDashboard({} as SisubDb, ctx(perm("unit", 1, { unit_id: OTHER_UNIT })), { unitId: UNIT }))).toBe(true)
		expect(await denied(fetchUnitDashboard({} as SisubDb, ctx(perm("unit", 1, { unit_id: UNIT })), { unitId: UNIT }))).toBe(false)
	})

	test("fetchUnitSettings exige unit:1 na unidade pedida", async () => {
		expect(await denied(fetchUnitSettings({} as SisubDb, ctx(perm("unit", 1, { unit_id: OTHER_UNIT })), { unitId: UNIT }))).toBe(true)
		expect(await denied(fetchUnitSettings({} as SisubDb, ctx(perm("unit", 1, { unit_id: UNIT })), { unitId: UNIT }))).toBe(false)
	})

	test("fetchKitchenSettings exige a cozinha ou a OM dela", async () => {
		expect(await denied(fetchKitchenSettings(kitchenDb(), ctx(perm("kitchen", 1, { kitchen_id: OTHER_KITCHEN })), { kitchenId: KITCHEN }))).toBe(true)
		expect(await denied(fetchKitchenSettings(kitchenDb(), ctx(perm("unit", 1, { unit_id: UNIT })), { kitchenId: KITCHEN }))).toBe(false)
	})
})

describe("fetchProcurementNeeds — escopado pelo recorte pedido", () => {
	const range = { startDate: "2026-09-01", endDate: "2026-09-30" }

	test("por cozinha: a cozinha (kitchen ou storage), não QUALQUER cozinha", async () => {
		expect(await denied(fetchProcurementNeeds({} as SisubDb, ctx(perm("kitchen", 1, { kitchen_id: OTHER_KITCHEN })), { ...range, kitchenId: KITCHEN }))).toBe(
			true
		)
		expect(await denied(fetchProcurementNeeds({} as SisubDb, ctx(perm("kitchen", 1, { kitchen_id: KITCHEN })), { ...range, kitchenId: KITCHEN }))).toBe(false)
		// a reposição do almoxarifado chama com o ctx do estoque
		expect(await denied(fetchProcurementNeeds({} as SisubDb, ctx(perm("storage", 1, { kitchen_id: KITCHEN })), { ...range, kitchenId: KITCHEN }))).toBe(false)
	})

	test("por unidade: unit:1 nela", async () => {
		expect(await denied(fetchProcurementNeeds({} as SisubDb, ctx(perm("kitchen", 1, { kitchen_id: KITCHEN })), { ...range, unitId: UNIT }))).toBe(true)
		expect(await denied(fetchProcurementNeeds({} as SisubDb, ctx(perm("unit", 1, { unit_id: UNIT })), { ...range, unitId: UNIT }))).toBe(false)
	})

	test("sem recorte: só a permissão sem escopo", async () => {
		expect(await denied(fetchProcurementNeeds({} as SisubDb, ctx(perm("kitchen", 1, { kitchen_id: KITCHEN })), range))).toBe(true)
		expect(await denied(fetchProcurementNeeds({} as SisubDb, ctx(perm("kitchen", 1)), range))).toBe(false)
	})
})

describe("resolveDisplayName", () => {
	test("o próprio nome é livre; o de terceiro exige messhall:1 no rancho", async () => {
		const db = {} as SisubDb
		expect(await denied(resolveDisplayName(db, ctx(), { userId: "user-1", messHallId: 1 }))).toBe(false)
		expect(await denied(resolveDisplayName(db, ctx(), { userId: "user-2", messHallId: 1 }))).toBe(true)
		expect(await denied(resolveDisplayName(db, ctx(perm("messhall", 1, { mess_hall_id: 2 })), { userId: "user-2", messHallId: 1 }))).toBe(true)
		expect(await denied(resolveDisplayName(db, ctx(perm("messhall", 1, { mess_hall_id: 1 })), { userId: "user-2", messHallId: 1 }))).toBe(false)
	})
})

// ─── Seleções (cozinha + plano) citadas pelo cálculo da ATA ────────────────────

const LOCAL_TEMPLATE = "local-template"
const FOREIGN_TEMPLATE = "foreign-template"

/**
 * Stub de `select(cols).from(table).where(...)` aguardado direto (sem `.limit`). Decide pela
 * TABELA: cozinhas devolvem a OM; templates, a cozinha dona.
 */
function selectionDb(): SisubDb {
	const select = () => ({
		from: (table: unknown) => ({
			where: () =>
				Promise.resolve(
					table === kitchenInKitchen
						? [KITCHEN_ROW]
						: [
								{ id: LOCAL_TEMPLATE, kitchenId: KITCHEN },
								{ id: FOREIGN_TEMPLATE, kitchenId: OTHER_KITCHEN },
							]
				),
		}),
	})
	return { select } as unknown as SisubDb
}

function needsInput(templateId: string) {
	return {
		kitchenSelections: [
			{
				kitchenId: KITCHEN,
				kitchenName: "K",
				deliveryNotes: "",
				templateSelections: [{ templateId, templateName: "T", repetitions: 1 }],
				eventSelections: [],
				exceptionSelections: [],
			},
		],
	}
}

describe("calculateAtaNeeds — lê planos, então exige alcançar a cozinha", () => {
	test("nega quem não alcança a cozinha selecionada", async () => {
		expect(await denied(calculateAtaNeeds(selectionDb(), ctx(), needsInput(LOCAL_TEMPLATE)))).toBe(true)
		expect(await denied(calculateAtaNeeds(selectionDb(), ctx(perm("unit", 1, { unit_id: OTHER_UNIT })), needsInput(LOCAL_TEMPLATE)))).toBe(true)
	})

	test("passa a cozinha ou a OM dela", async () => {
		expect(await denied(calculateAtaNeeds(selectionDb(), ctx(perm("unit", 1, { unit_id: UNIT })), needsInput(LOCAL_TEMPLATE)))).toBe(false)
		expect(await denied(calculateAtaNeeds(selectionDb(), ctx(perm("kitchen", 1, { kitchen_id: KITCHEN })), needsInput(LOCAL_TEMPLATE)))).toBe(false)
	})

	test("plano local de OUTRA cozinha é recusado mesmo para quem alcança a selecionada", async () => {
		const error = await calculateAtaNeeds(selectionDb(), ctx(perm("unit", 1, { unit_id: UNIT })), needsInput(FOREIGN_TEMPLATE)).then(
			() => null,
			(e: unknown) => e
		)
		expect(error).toBeInstanceOf(DomainError)
		expect((error as DomainError).code).toBe("TEMPLATE_ACCESS_DENIED")
	})
})

// ─── forkTemplate: a cópia herda referências que precisam caber no destino ─────

const SOURCE_TEMPLATE = "11111111-1111-4111-8111-111111111111"
const LOCAL_RECIPE_OF_A = "recipe-a"

function forkDb(recipeOwner: number | null): SisubDb {
	const source = {
		id: SOURCE_TEMPLATE,
		kitchenId: KITCHEN,
		name: "Semana",
		deletedAt: null,
		templateType: "weekly",
		expectedMonthlyOccurrences: null,
		menuTemplateItemsInKitchens: [{ dayOfWeek: 1, mealTypeId: "meal-global", recipeId: LOCAL_RECIPE_OF_A, headcountOverride: null }],
	}
	const select = () => ({
		from: (table: unknown) => ({
			where: () =>
				Promise.resolve(
					table === recipesInKitchen
						? [{ id: LOCAL_RECIPE_OF_A, kitchenId: recipeOwner }]
						: table === mealTypeInKitchen
							? [{ id: "meal-global", kitchenId: null }]
							: []
				),
		}),
	})
	return {
		query: {
			menuTemplateInKitchen: { findFirst: () => Promise.resolve(source) },
			menuTemplateMealInKitchen: { findMany: () => Promise.resolve([]) },
		},
		select,
	} as unknown as SisubDb
}

describe("forkTemplate", () => {
	// kitchen:1 na origem (A) + kitchen:2 no destino (C) — o par que o achado usava.
	const forker = ctx(perm("kitchen", 1, { kitchen_id: KITCHEN }), perm("kitchen", 2, { kitchen_id: OTHER_KITCHEN }))

	test("não leva a preparação LOCAL da origem para outra cozinha", async () => {
		const error = await forkTemplate(forkDb(KITCHEN), forker, { sourceTemplateId: SOURCE_TEMPLATE, targetKitchenId: OTHER_KITCHEN }).then(
			() => null,
			(e: unknown) => e
		)
		expect((error as DomainError).code).toBe("TEMPLATE_FORK_OUT_OF_SCOPE")
	})

	test("preparação global segue copiável (a falha seguinte é do stub, não da regra)", async () => {
		const error = await forkTemplate(forkDb(null), forker, { sourceTemplateId: SOURCE_TEMPLATE, targetKitchenId: OTHER_KITCHEN }).then(
			() => null,
			(e: unknown) => e
		)
		expect((error as DomainError | null)?.code).not.toBe("TEMPLATE_FORK_OUT_OF_SCOPE")
		expect(error).not.toBeInstanceOf(PermissionDeniedError)
	})
})
