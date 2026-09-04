/**
 * Contrato de autorização da memória de cálculo da pesquisa de preço.
 *
 * A trilha de auditoria de preço sustenta decisão de compra (Lei 14.133/2021): gravar nela é
 * WRITE, e o guard vivia só no server fn. Este teste fixa as duas barreiras que a operação
 * precisa manter sozinha, já que a conexão Drizzle usa o role do projeto e RLS não se aplica:
 *
 *   1. pesquisa avulsa exige `unit:1` — sessão autenticada sem o módulo não grava;
 *   2. ligar a pesquisa a uma ATA exige `unit:2` NA UNIDADE DONA, e a unidade sai da linha
 *      persistida (`procurement_list.unit_id`) — nunca do payload. Quando só o `ataItemId`
 *      chega, a ata efetiva também vem do banco.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError, PermissionDeniedError } from "../types/errors.ts"
import { type SavePriceResearchAudit, savePriceResearchAudit } from "./price-research.ts"

/** A ATA existente pertence à unidade 5. */
const OWNER_UNIT = 5
const OWNER_LIST = "list-1"
/** Marca que o guard liberou e a operação chegou na escrita — o stub não implementa transação. */
const WRITE_REACHED = "write-reached"

function ctx(unitId: number | null, level = 2): UserContext {
	return {
		userId: "user-1",
		permissions: [{ module: "unit", level, kitchen_id: null, mess_hall_id: null, unit_id: unitId }],
	}
}

/**
 * Stub do handle Drizzle. O guard só exercita `db.select(cols).from().where().limit()`, e o
 * `where` não é inspecionável sem montar o dialeto inteiro — o stub decide pelas COLUNAS
 * pedidas (`listId` = ata dona do item, `unitId` = unidade dona da ata). Sob teste está a
 * decisão de autorização, não a montagem da query.
 */
function fakeDb(opts: { unitId?: number; listId?: string; missingItem?: boolean; missingList?: boolean } = {}): SisubDb {
	const select = (cols: Record<string, unknown>) => {
		const rows =
			"listId" in cols
				? opts.missingItem
					? []
					: [{ id: "item-1", listId: opts.listId ?? OWNER_LIST }]
				: opts.missingList
					? []
					: [{ unitId: opts.unitId ?? OWNER_UNIT }]
		const chain = {
			from: () => chain,
			where: () => chain,
			limit: () => Promise.resolve(rows),
			orderBy: () => chain,
		}
		return chain
	}
	return {
		select,
		transaction: () => Promise.reject(new Error(WRITE_REACHED)),
	} as unknown as SisubDb
}

const BASE: SavePriceResearchAudit = {
	catmatCodigo: 460_000,
	method: "median",
	referencePrice: 10,
	stats: { mean: 10, median: 10, stdDev: 0, cv: 0, min: 10, max: 10, uniqueSources: 3 },
	rawCount: 3,
	validCount: 3,
	validSamples: [],
	outlierSamples: [],
}

function input(extra: Partial<SavePriceResearchAudit> = {}): SavePriceResearchAudit {
	return { ...BASE, ...extra }
}

/** Roda e devolve o erro (ou null) — para separar "negou" de "não implementado". */
function failure(run: Promise<unknown>): Promise<unknown> {
	return run.then(
		() => null,
		(e: unknown) => e
	)
}

describe("autorização da memória de cálculo de pesquisa de preço", () => {
	test("nega sessão autenticada sem permissão de unidade", async () => {
		await expect(savePriceResearchAudit(fakeDb(), { userId: "user-1", permissions: [] }, input())).rejects.toBeInstanceOf(PermissionDeniedError)
	})

	test("deixa passar pesquisa avulsa de quem tem unit:1", async () => {
		const error = await failure(savePriceResearchAudit(fakeDb(), ctx(OWNER_UNIT, 1), input()))
		expect(error).not.toBeInstanceOf(PermissionDeniedError)
		expect((error as Error).message).toBe(WRITE_REACHED)
	})

	test("nega ligar à ATA quem tem unit:2 em OUTRA unidade", async () => {
		await expect(savePriceResearchAudit(fakeDb(), ctx(OWNER_UNIT + 1), input({ ataId: OWNER_LIST }))).rejects.toBeInstanceOf(PermissionDeniedError)
	})

	test("nega ligar à ATA quem só lê a própria unidade", async () => {
		await expect(savePriceResearchAudit(fakeDb(), ctx(OWNER_UNIT, 1), input({ ataId: OWNER_LIST }))).rejects.toBeInstanceOf(PermissionDeniedError)
	})

	test("resolve o dono pelo ITEM quando só o ataItemId chega", async () => {
		// O payload não diz de quem é a ata: a unidade vem de procurement_list.unit_id.
		await expect(savePriceResearchAudit(fakeDb(), ctx(OWNER_UNIT + 1), input({ ataItemId: "item-1" }))).rejects.toBeInstanceOf(PermissionDeniedError)
	})

	test("recusa item que não pertence à ATA informada, antes de qualquer permissão", async () => {
		// O item aponta para OWNER_LIST; o payload afirma outra ata. Passar por aqui deixaria o
		// payload escolher contra qual unidade a permissão é checada.
		const error = await failure(savePriceResearchAudit(fakeDb(), ctx(null), input({ ataId: "list-2", ataItemId: "item-1" })))
		expect(error).toBeInstanceOf(DomainError)
		expect(error).not.toBeInstanceOf(PermissionDeniedError)
		expect((error as DomainError).code).toBe("VALIDATION_FAILED")
	})

	test("item inexistente é recusado, não tratado como pesquisa avulsa", async () => {
		// Sem isso, um ataItemId inventado cairia no caminho sem ATA e gravaria com unit:1.
		const error = await failure(savePriceResearchAudit(fakeDb({ missingItem: true }), ctx(null), input({ ataItemId: "item-404" })))
		expect(error).toBeInstanceOf(DomainError)
		expect(error).not.toBeInstanceOf(PermissionDeniedError)
		expect((error as DomainError).code).toBe("VALIDATION_FAILED")
	})

	test("ATA inexistente não vira permissão concedida", async () => {
		const error = await failure(savePriceResearchAudit(fakeDb({ missingList: true }), ctx(null), input({ ataId: OWNER_LIST })))
		expect(error).toBeInstanceOf(NotFoundError)
	})

	test("deixa passar quem tem unit:2 na unidade dona", async () => {
		const error = await failure(savePriceResearchAudit(fakeDb(), ctx(OWNER_UNIT), input({ ataId: OWNER_LIST })))
		expect(error).not.toBeInstanceOf(PermissionDeniedError)
		expect((error as Error).message).toBe(WRITE_REACHED)
	})

	test("deixa passar unit:2 sem escopo (abrange toda unidade)", async () => {
		const error = await failure(savePriceResearchAudit(fakeDb(), ctx(null), input({ ataItemId: "item-1" })))
		expect(error).not.toBeInstanceOf(PermissionDeniedError)
		expect((error as Error).message).toBe(WRITE_REACHED)
	})
})
