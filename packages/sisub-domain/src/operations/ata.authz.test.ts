/**
 * Contrato de autorização das operações de ATA.
 *
 * Estas dez operações recebiam `_ctx` e descartavam: o guard vivia só no `requireAuth()` do
 * server fn, então qualquer sessão autenticada — inclusive com `unit:2` de OUTRA OM — publicava,
 * arquivava, repreçava ou apagava a ATA de qualquer unidade. O teste fixa a barreira que faltava.
 *
 * A ATA é escopada por UNIDADE, e sete das dez recebem só um id: a unidade dona sai da linha
 * persistida (`procurement_list.unit_id`), nunca da requisição — pedir o escopo ao chamador seria
 * o mesmo furo com outra roupa.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { UserContext } from "../types/context.ts"
import { PermissionDeniedError } from "../types/errors.ts"
import {
	createAta,
	createAtaDraft,
	deleteAta,
	finalizeAtaDraft,
	saveAtaDraftItems,
	updateAtaDraft,
	updateAtaItemDescription,
	updateAtaItemPrices,
	updateAtaStatus,
} from "./ata.ts"

/** A ATA existente pertence à unidade 5. */
const OWNER_UNIT = 5

function ctx(unitId: number | null, level = 2): UserContext {
	return {
		userId: "user-1",
		permissions: [{ module: "unit", level, kitchen_id: null, mess_hall_id: null, unit_id: unitId }],
	}
}

/**
 * Stub do handle Drizzle. Os guards só exercitam `db.select(cols).from().where().limit()`, e o
 * `where` não é inspecionável sem montar o dialeto inteiro — o stub decide pelas COLUNAS pedidas
 * (`unitId` = dono da lista, `listId` = ata dona do item). O que está sob teste é a decisão de
 * autorização, não a montagem da query.
 */
function fakeDb(rows: { unitId?: number; listId?: string } = {}): SisubDb {
	const select = (cols: Record<string, unknown>) => {
		const row = "listId" in cols ? { listId: "list-1" } : { unitId: rows.unitId ?? OWNER_UNIT }
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
	["updateAtaDraft", (db, c) => updateAtaDraft(db, c, { draftId: "list-1", name: "x" } as never)],
	["saveAtaDraftItems", (db, c) => saveAtaDraftItems(db, c, { draftId: "list-1", items: [] } as never)],
	["finalizeAtaDraft", (db, c) => finalizeAtaDraft(db, c, { draftId: "list-1" } as never)],
	["updateAtaStatus", (db, c) => updateAtaStatus(db, c, { ataId: "list-1", status: "published" } as never)],
	["updateAtaItemPrices", (db, c) => updateAtaItemPrices(db, c, { ataId: "list-1", items: [] } as never)],
	["deleteAta", (db, c) => deleteAta(db, c, { ataId: "list-1" } as never)],
	["updateAtaItemDescription", (db, c) => updateAtaItemDescription(db, c, { ataItemId: "item-1", description: "x" } as never)],
]

/** Operações que recebem a unidade de destino no próprio input. */
const BY_INPUT_UNIT: [string, (db: SisubDb, c: UserContext) => Promise<unknown>][] = [
	["createAtaDraft", (db, c) => createAtaDraft(db, c, { unitId: OWNER_UNIT } as never)],
	["createAta", (db, c) => createAta(db, c, { unitId: OWNER_UNIT, name: "x", kitchenSelections: [], items: [] } as never)],
]

const ALL = [...BY_ID, ...BY_INPUT_UNIT]

describe("autorização das operações de ATA", () => {
	test.each(ALL)("%s nega escrita de quem tem unit:2 em OUTRA unidade", async (_name, run) => {
		await expect(run(fakeDb(), ctx(OWNER_UNIT + 1))).rejects.toBeInstanceOf(PermissionDeniedError)
	})

	test.each(ALL)("%s nega quem só lê a própria unidade", async (_name, run) => {
		await expect(run(fakeDb(), ctx(OWNER_UNIT, 1))).rejects.toBeInstanceOf(PermissionDeniedError)
	})

	test.each(ALL)("%s nega sessão autenticada sem permissão de unidade", async (_name, run) => {
		await expect(run(fakeDb(), { userId: "user-1", permissions: [] })).rejects.toBeInstanceOf(PermissionDeniedError)
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
