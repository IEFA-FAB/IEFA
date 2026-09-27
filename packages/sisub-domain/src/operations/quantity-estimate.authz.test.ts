/**
 * Contrato de autorização das operações de anexo.
 *
 * Estas operações recebiam `_ctx` e descartavam: o guard vivia só no `requireAuth()` do
 * server fn, então qualquer sessão autenticada — inclusive com `unit:2` de OUTRA OM — publicava,
 * arquivava, repreçava ou apagava o anexo de qualquer unidade. O teste fixa a barreira que faltava.
 *
 * O anexo é escopado por UNIDADE, e sete das dez recebem só um id: a unidade dona sai da linha
 * persistida (`quantity_estimate.unit_id`), nunca da requisição — pedir o escopo ao chamador seria
 * o mesmo furo com outra roupa.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { UserContext } from "../types/context.ts"
import { PermissionDeniedError } from "../types/errors.ts"
import {
	createQuantityEstimate,
	createQuantityEstimateDraft,
	deleteQuantityEstimate,
	finalizeQuantityEstimateDraft,
	saveQuantityEstimateDraftItems,
	updateQuantityEstimateDraft,
	updateQuantityEstimateItemDescription,
	updateQuantityEstimateItemPrices,
	updateQuantityEstimateLimits,
	updateQuantityEstimateStatus,
} from "./quantity-estimate.ts"

/** O anexo existente pertence à unidade 5. */
const OWNER_UNIT = 5

function ctx(unitId: number | null, level = 2): UserContext {
	return {
		userId: "user-1",
		permissions: [{ module: "unit", level, kitchen_id: null, mess_hall_id: null, unit_id: unitId }],
		// Eixo de garantia no piso: estes testes são de PERMISSÃO, e os dois eixos são ortogonais.
		aal: 1,
		lastFactorAt: null,
		origin: "session",
	}
}

/**
 * Stub do handle Drizzle. Os guards só exercitam `db.select(cols).from().where().limit()`, e o
 * `where` não é inspecionável sem montar o dialeto inteiro — o stub decide pelas COLUNAS pedidas
 * (`unitId` = dono do anexo, `quantityEstimateId` = anexo dono do item). O que está sob teste é a decisão de
 * autorização, não a montagem da query.
 */
function fakeDb(rows: { unitId?: number; quantityEstimateId?: string } = {}): SisubDb {
	const select = (cols: Record<string, unknown>) => {
		const row = "quantityEstimateId" in cols ? { quantityEstimateId: "list-1" } : { unitId: rows.unitId ?? OWNER_UNIT }
		// Só o `.limit()` dos guards resolve. Query encadeada mais abaixo na operação recebe o
		// próprio objeto e falha — de propósito: o teste separa negar de não-implementado.
		const chain = {
			from: () => chain,
			where: () => chain,
			limit: () => Promise.resolve([row]),
		}
		return chain
	}
	return { select } as unknown as SisubDb
}

/** Operações que resolvem o dono a partir do id que recebem. */
const BY_ID: [string, (db: SisubDb, c: UserContext) => Promise<unknown>][] = [
	["updateQuantityEstimateDraft", (db, c) => updateQuantityEstimateDraft(db, c, { draftId: "list-1", name: "x" } as never)],
	["saveQuantityEstimateDraftItems", (db, c) => saveQuantityEstimateDraftItems(db, c, { draftId: "list-1", items: [] } as never)],
	["finalizeQuantityEstimateDraft", (db, c) => finalizeQuantityEstimateDraft(db, c, { draftId: "list-1" } as never)],
	["updateQuantityEstimateStatus", (db, c) => updateQuantityEstimateStatus(db, c, { quantityEstimateId: "list-1", status: "published" } as never)],
	["updateQuantityEstimateItemPrices", (db, c) => updateQuantityEstimateItemPrices(db, c, { quantityEstimateId: "list-1", items: [] } as never)],
	["deleteQuantityEstimate", (db, c) => deleteQuantityEstimate(db, c, { quantityEstimateId: "list-1" } as never)],
	[
		"updateQuantityEstimateItemDescription",
		(db, c) => updateQuantityEstimateItemDescription(db, c, { quantityEstimateItemId: "item-1", description: "x" } as never),
	],
	["updateQuantityEstimateLimits", (db, c) => updateQuantityEstimateLimits(db, c, { quantityEstimateId: "list-1", maxIncreasePercent: 30 } as never)],
]

/** Operações que recebem a unidade de destino no próprio input. */
const BY_INPUT_UNIT: [string, (db: SisubDb, c: UserContext) => Promise<unknown>][] = [
	["createQuantityEstimateDraft", (db, c) => createQuantityEstimateDraft(db, c, { unitId: OWNER_UNIT } as never)],
	["createQuantityEstimate", (db, c) => createQuantityEstimate(db, c, { unitId: OWNER_UNIT, name: "x", kitchenSelections: [], items: [] } as never)],
]

const ALL = [...BY_ID, ...BY_INPUT_UNIT]

describe("autorização das operações de anexo", () => {
	test.each(ALL)("%s nega escrita de quem tem unit:2 em OUTRA unidade", async (_name, run) => {
		await expect(run(fakeDb(), ctx(OWNER_UNIT + 1))).rejects.toBeInstanceOf(PermissionDeniedError)
	})

	test.each(ALL)("%s nega quem só lê a própria unidade", async (_name, run) => {
		await expect(run(fakeDb(), ctx(OWNER_UNIT, 1))).rejects.toBeInstanceOf(PermissionDeniedError)
	})

	test.each(ALL)("%s nega sessão autenticada sem permissão de unidade", async (_name, run) => {
		await expect(run(fakeDb(), { userId: "user-1", permissions: [], aal: 1, lastFactorAt: null, origin: "session" })).rejects.toBeInstanceOf(
			PermissionDeniedError
		)
	})

	// O guard passa e a operação segue até o stub, que não implementa o resto do Drizzle: o que
	// importa é que a falha resultante NÃO seja de permissão.
	test.each(ALL)("%s deixa passar quem tem unit:2 na unidade dona", async (_name, run) => {
		const error = await run(fakeDb(), ctx(OWNER_UNIT)).then(
			() => null,
			(e: unknown) => e
		)
		expect(error).not.toBeInstanceOf(PermissionDeniedError)
	})

	test.each(ALL)("%s deixa passar unit:2 sem escopo (abrange toda unidade)", async (_name, run) => {
		const error = await run(fakeDb(), ctx(null)).then(
			() => null,
			(e: unknown) => e
		)
		expect(error).not.toBeInstanceOf(PermissionDeniedError)
	})
})
