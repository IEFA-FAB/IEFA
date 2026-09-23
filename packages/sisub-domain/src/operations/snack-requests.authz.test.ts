/**
 * Contrato de autorização e validação do pedido de lanche (sem banco).
 *
 * O que trava:
 *   - pedido alheio responde como inexistente, na leitura e no cancelamento (IDOR);
 *   - a cozinha que decide é a da LINHA do pedido, nunca uma vinda do input;
 *   - as regras do Módulo 7 que o servidor impõe antes de gravar: ordem de missão, antecedência
 *     de 24 h, retirada antes da partida, civil sem motivo.
 *
 * O stub devolve, em ordem, as linhas de cada query executada. Operação que chegasse a
 * escrever pediria `transaction`, que o stub recusa — então "lançou antes de escrever" é
 * verificado por construção.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { UserPermission } from "@iefa/pbac"
import type { CreateSnackRequest } from "../schemas/snack.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError, PermissionDeniedError } from "../types/errors.ts"
import { cancelMySnackRequest, createSnackRequest, decideSnackRequest, getKitchenSnackRequest, getMySnackRequest } from "./snack-requests.ts"

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const REQUEST_OF_B = "11111111-1111-4111-8111-111111111111"

function perm(module: UserPermission["module"], level: number, kitchenId: number | null = null): UserPermission {
	return { module, level, kitchen_id: kitchenId, unit_id: null, mess_hall_id: null } as UserPermission
}

function ctx(userId: string, permissions: UserPermission[]): UserContext {
	return { userId, permissions, aal: 1, lastFactorAt: null, origin: "session" }
}

/** Cada query executada consome a próxima entrada de `results`. */
function fakeDb(results: unknown[][]): SisubDb {
	const queue = [...results]
	function chain(): Record<string, unknown> {
		const proxy: Record<string, unknown> = new Proxy(
			{},
			{
				get(_t, prop) {
					if (typeof prop === "symbol") return undefined
					if (prop === "then") return (resolve: (v: unknown[]) => unknown) => Promise.resolve(queue.shift() ?? []).then(resolve)
					return () => proxy
				},
			}
		)
		return proxy
	}
	return {
		select: () => chain(),
		execute: () => chain(),
		transaction: () => {
			throw new Error("o teste não deveria chegar à escrita")
		},
	} as unknown as SisubDb
}

const requestOfB = { id: REQUEST_OF_B, requestedBy: USER_B, kitchenId: 7, status: "submitted" }

describe("pedido alheio", () => {
	test("leitura por outro comensal responde como inexistente", async () => {
		const db = fakeDb([[requestOfB]])
		await expect(getMySnackRequest(db, ctx(USER_A, [perm("diner", 1)]), { requestId: REQUEST_OF_B })).rejects.toBeInstanceOf(NotFoundError)
	})

	test("cancelamento por outro comensal responde como inexistente", async () => {
		const db = fakeDb([[requestOfB]])
		await expect(cancelMySnackRequest(db, ctx(USER_A, [perm("diner", 1)]), { requestId: REQUEST_OF_B })).rejects.toBeInstanceOf(NotFoundError)
	})
})

describe("cozinha do pedido vem da linha", () => {
	test("kitchen:2 em outra cozinha não decide", async () => {
		const db = fakeDb([[requestOfB]])
		await expect(
			decideSnackRequest(db, ctx(USER_A, [perm("kitchen", 2, 99)]), { requestId: REQUEST_OF_B, decision: "reject", reason: "sem insumo" })
		).rejects.toBeInstanceOf(PermissionDeniedError)
	})

	test("kitchen:1 na cozinha do pedido não decide", async () => {
		const db = fakeDb([[requestOfB]])
		await expect(
			decideSnackRequest(db, ctx(USER_A, [perm("kitchen", 1, 7)]), { requestId: REQUEST_OF_B, decision: "reject", reason: "sem insumo" })
		).rejects.toBeInstanceOf(PermissionDeniedError)
	})

	test("leitura pela cozinha exige kitchen:1 na cozinha da linha", async () => {
		const db = fakeDb([[requestOfB]])
		await expect(getKitchenSnackRequest(db, ctx(USER_A, [perm("kitchen", 1, 99)]), { requestId: REQUEST_OF_B })).rejects.toBeInstanceOf(PermissionDeniedError)
	})
})

describe("regras impostas no envio", () => {
	const now = new Date("2026-10-01T12:00:00Z")
	const diner = ctx(USER_A, [perm("diner", 1)])
	const base: CreateSnackRequest = {
		kitchenId: 7,
		missionKind: "aerea",
		departureAt: "2026-10-03T12:00:00Z",
		totalMinutes: 150,
		longestLegMinutes: null,
		stopsWithoutMess: false,
		groundMinutes: 0,
		isOperational: true,
		hasGalley: false,
		hasOven: false,
		crewCount: 6,
		paxCount: 0,
		requesterUnitLabel: "1º/1º GT",
		missionDescription: "Transporte de carga",
		missionOrderNumber: "OM-123",
		waterQuantity: 6,
		cupQuantity: 12,
		iceQuantity: 0,
		coffeeQuantity: 1,
		includesNonMilitary: false,
		preference: "lanche",
		pickupAt: "2026-10-03T10:00:00Z",
		pickupResponsible: "Sgt Silva",
		fundingSource: "economia_om",
		lines: [{ standardId: "22222222-2222-4222-8222-222222222222", audience: "crew", quantity: 6 }],
	}

	async function codeOf(input: CreateSnackRequest, c: UserContext = diner): Promise<string> {
		try {
			await createSnackRequest(fakeDb([]), c, input, now)
			return "OK"
		} catch (error) {
			return error instanceof DomainError ? error.code : String(error)
		}
	}

	test("sem diner não pede", async () => {
		expect(await codeOf(base, ctx(USER_A, []))).toBe("PERMISSION_DENIED")
	})

	test("missão aérea exige ordem de missão", async () => {
		expect(await codeOf({ ...base, missionOrderNumber: undefined })).toBe("SNACK_MISSION_ORDER_REQUIRED")
	})

	test("civil sem motivo", async () => {
		expect(await codeOf({ ...base, includesNonMilitary: true })).toBe("SNACK_NON_MILITARY_REASON_REQUIRED")
	})

	test("menos de 24 h sem justificativa", async () => {
		expect(await codeOf({ ...base, pickupAt: "2026-10-02T00:00:00Z", departureAt: "2026-10-02T02:00:00Z" })).toBe("SNACK_LATE_REASON_REQUIRED")
	})

	test("retirada depois da partida", async () => {
		expect(await codeOf({ ...base, pickupAt: "2026-10-03T13:00:00Z" })).toBe("SNACK_PICKUP_AFTER_DEPARTURE")
	})

	test("padrão fora da cozinha ou não pedível", async () => {
		// A query de padrões volta vazia: nenhum dos pedidos é pedível na cozinha 7.
		expect(await codeOf(base)).toBe("SNACK_STANDARD_UNAVAILABLE")
	})
})
