/**
 * Contrato de erro do `upsertArranchamento`: o erro do upsert propaga (sem o antigo delete +
 * insert), uma queda de conexão ganha UMA segunda tentativa e a recusa do trigger à conta
 * institucional sai com a mensagem dela. A FK e o trigger de verdade são provados no banco real
 * (`apps/sisub/src/test/operations/arranchamento.operations.test.ts`).
 */

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { UserContext } from "../types/context.ts"
import { type DomainError, QueryFailedError } from "../types/errors.ts"
import { upsertArranchamento } from "./arranchamento.ts"

const USER = "22222222-2222-2222-2222-222222222222"
const ctx: UserContext = { userId: USER, permissions: [], aal: 1, lastFactorAt: null, origin: "session" }
const input = { date: "2099-01-01", meal: "almoco", willEat: true, messHallId: 1 } as Parameters<typeof upsertArranchamento>[2]

/** Réplica do `DrizzleQueryError`: SQL na `message`, erro do driver em `.cause`. */
function drizzleQueryError(code: string, message: string): Error {
	const error = new Error('Failed query: insert into "kitchen"."arranchamento" …\nparams: ')
	;(error as Error & { cause?: unknown }).cause = Object.assign(new Error(message), { code })
	return error
}

/**
 * Banco falso: cada upsert consome o próximo desfecho de `outcomes` (erro → rejeita,
 * `undefined` → grava); o select do `assertAccountCanEat` consome os de `reads` e, esgotados,
 * lê `pessoal`. Conta as leituras e os caminhos de escrita.
 */
function fakeDb(outcomes: Array<Error | undefined>, reads: Error[] = []) {
	const calls = { read: 0, upsert: 0, delete: 0, transaction: 0 }
	const db = {
		execute: () => {
			const failure = reads[calls.read++]
			return failure ? Promise.reject(failure) : Promise.resolve([{ account_kind: "pessoal" }])
		},
		insert: () => ({
			values: () => ({
				onConflictDoUpdate: () => {
					const outcome = outcomes[calls.upsert++]
					return outcome ? Promise.reject(outcome) : Promise.resolve()
				},
			}),
		}),
		delete: () => {
			calls.delete++
			return { where: () => Promise.resolve() }
		},
		transaction: () => {
			calls.transaction++
			return Promise.resolve()
		},
	}
	return { db: db as unknown as SisubDb, calls }
}

describe("upsertArranchamento: erro do upsert", () => {
	// A retentativa loga a 1ª falha; o spy mantém a saída do teste limpa.
	let warn: ReturnType<typeof spyOn>
	beforeEach(() => {
		warn = spyOn(console, "warn").mockImplementation(() => {})
	})
	afterEach(() => warn.mockRestore())

	test("FK violada: lança UPSERT_FAILED com a mensagem de salvar, sem repetir nem apagar", async () => {
		const fk = drizzleQueryError("23503", 'insert or update on table "arranchamento" violates foreign key constraint "arranchamento_mess_hall_id_fkey"')
		const { db, calls } = fakeDb([fk])
		const error = await upsertArranchamento(db, ctx, input).catch((e) => e)
		expect(error).toBeInstanceOf(QueryFailedError)
		expect((error as QueryFailedError).code).toBe("UPSERT_FAILED")
		expect((error as QueryFailedError).publicMessage).toBe("Não foi possível salvar o arranchamento. Tente novamente.")
		expect((error as QueryFailedError).cause).toBe(fk)
		expect(calls).toEqual({ read: 1, upsert: 1, delete: 0, transaction: 0 })
	})

	test("queda de conexão: repete o upsert uma vez e grava", async () => {
		const { db, calls } = fakeDb([drizzleQueryError("CONNECTION_CLOSED", "write CONNECTION_CLOSED"), undefined])
		await upsertArranchamento(db, ctx, input)
		expect(calls).toEqual({ read: 1, upsert: 2, delete: 0, transaction: 0 })
	})

	test("duas quedas seguidas: lança UPSERT_FAILED depois da segunda tentativa", async () => {
		const timeout = drizzleQueryError("CONNECT_TIMEOUT", "write CONNECT_TIMEOUT")
		const { db, calls } = fakeDb([timeout, timeout])
		const error = await upsertArranchamento(db, ctx, input).catch((e) => e)
		expect((error as QueryFailedError).code).toBe("UPSERT_FAILED")
		expect(calls).toEqual({ read: 1, upsert: 2, delete: 0, transaction: 0 })
	})

	test("corrida com a conta virando institucional: a recusa do trigger sai como ACCOUNT_INSTITUTIONAL, sem repetir", async () => {
		// `assertAccountCanEat` leu `pessoal`; o trigger recusa o `willEat: true` no insert.
		const { db, calls } = fakeDb([drizzleQueryError("P0001", "ACCOUNT_INSTITUTIONAL_NO_MEALS")])
		const error = await upsertArranchamento(db, ctx, input).catch((e) => e)
		expect((error as DomainError).code).toBe("ACCOUNT_INSTITUTIONAL")
		expect(error).not.toBeInstanceOf(QueryFailedError)
		expect(calls).toEqual({ read: 1, upsert: 1, delete: 0, transaction: 0 })
	})

	test("queda de conexão no select do assertAccountCanEat (1ª query do request): repete a leitura e grava", async () => {
		const { db, calls } = fakeDb([undefined], [drizzleQueryError("CONNECTION_CLOSED", "write CONNECTION_CLOSED")])
		await upsertArranchamento(db, ctx, input)
		expect(calls).toEqual({ read: 2, upsert: 1, delete: 0, transaction: 0 })
		expect(warn).toHaveBeenCalledTimes(1)
	})

	test("duas quedas no select: lança FETCH_FAILED e não tenta gravar", async () => {
		const closed = drizzleQueryError("CONNECTION_CLOSED", "write CONNECTION_CLOSED")
		const { db, calls } = fakeDb([undefined], [closed, closed])
		const error = await upsertArranchamento(db, ctx, input).catch((e) => e)
		expect((error as QueryFailedError).code).toBe("FETCH_FAILED")
		expect(calls).toEqual({ read: 2, upsert: 0, delete: 0, transaction: 0 })
	})
})
