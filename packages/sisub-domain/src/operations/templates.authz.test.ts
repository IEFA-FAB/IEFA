/**
 * Contrato de autorização da LEITURA de templates.
 *
 * Template global (`kitchen_id` nulo) é o catálogo da SDAB. Quem o administra chega às telas de
 * `/global/weekly-plans` com permissão `global` e, tipicamente, sem cozinha nenhuma. Exigir
 * `kitchen:1` nessas leituras — como era — trancava esse usuário fora da própria listagem de
 * planos e do editor deles.
 *
 * A leitura do catálogo global aceita `kitchen` OU `global`; sem nenhum dos dois, continua barrada.
 * Template de cozinha segue exigindo aquela cozinha.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { UserContext } from "../types/context.ts"
import { PermissionDeniedError } from "../types/errors.ts"
import { getTemplate, getTemplateItems, listDeletedTemplates, listTemplates } from "./templates.ts"

const TEMPLATE_ID = "11111111-1111-4111-8111-111111111111"
const KITCHEN = 3
const OTHER_KITCHEN = 9

function ctx(permissions: UserContext["permissions"]): UserContext {
	return { userId: "user-1", permissions, aal: 1, lastFactorAt: null, origin: "session" }
}

const globalCtx = ctx([{ module: "global", level: 1, kitchen_id: null, mess_hall_id: null, unit_id: null }])
const kitchenCtx = (kitchenId: number) => ctx([{ module: "kitchen", level: 1, kitchen_id: kitchenId, mess_hall_id: null, unit_id: null }])
const nobodyCtx = ctx([])

/** Stub do Drizzle: devolve uma linha de template com o dono pedido e listas vazias. */
function fakeDb(templateKitchenId: number | null): SisubDb {
	const row = {
		id: TEMPLATE_ID,
		kitchenId: templateKitchenId,
		deletedAt: null,
		name: "Semana",
		menuTemplateItemsInKitchens: [],
	}
	return {
		query: {
			menuTemplateInKitchen: {
				findMany: () => Promise.resolve([]),
				findFirst: () => Promise.resolve(row),
			},
			menuTemplateMealInKitchen: { findMany: () => Promise.resolve([]) },
			menuTemplateEventMealInKitchen: { findMany: () => Promise.resolve([]) },
		},
	} as unknown as SisubDb
}

describe("leitura do catálogo global de templates", () => {
	const GLOBAL_READS: [string, (db: SisubDb, c: UserContext) => Promise<unknown>][] = [
		["listTemplates", (db, c) => listTemplates(db, c, { kitchenId: null })],
		["listDeletedTemplates", (db, c) => listDeletedTemplates(db, c, { kitchenId: null })],
		["getTemplate", (db, c) => getTemplate(db, c, { templateId: TEMPLATE_ID })],
		["getTemplateItems", (db, c) => getTemplateItems(db, c, { templateId: TEMPLATE_ID })],
	]

	for (const [name, run] of GLOBAL_READS) {
		test(`${name}: quem tem só \`global\` lê o catálogo global`, async () => {
			await expect(run(fakeDb(null), globalCtx)).resolves.toBeDefined()
		})

		test(`${name}: quem tem cozinha também lê o catálogo global`, async () => {
			await expect(run(fakeDb(null), kitchenCtx(KITCHEN))).resolves.toBeDefined()
		})

		test(`${name}: sem \`kitchen\` nem \`global\`, continua barrado`, async () => {
			await expect(run(fakeDb(null), nobodyCtx)).rejects.toBeInstanceOf(PermissionDeniedError)
		})
	}
})

describe("leitura de template de cozinha", () => {
	test("getTemplate de uma cozinha exige AQUELA cozinha — `global` não abre", async () => {
		await expect(getTemplate(fakeDb(KITCHEN), globalCtx, { templateId: TEMPLATE_ID })).rejects.toBeInstanceOf(PermissionDeniedError)
	})

	test("getTemplate de uma cozinha recusa outra cozinha", async () => {
		await expect(getTemplate(fakeDb(KITCHEN), kitchenCtx(OTHER_KITCHEN), { templateId: TEMPLATE_ID })).rejects.toBeInstanceOf(PermissionDeniedError)
	})

	test("listTemplates de uma cozinha exige AQUELA cozinha", async () => {
		await expect(listTemplates(fakeDb(null), globalCtx, { kitchenId: KITCHEN })).rejects.toBeInstanceOf(PermissionDeniedError)
	})
})
