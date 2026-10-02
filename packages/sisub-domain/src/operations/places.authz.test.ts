/**
 * `applyPlacesDiff`: reparentar (mudar a OM de cozinha ou refeitório existente) decide quem os
 * alcança por `unit` — exige `admin:2` além do `global:2` do diff e grava
 * `sensitive_operation_log` na mesma transação das escritas. O resto do diff (cozinha que
 * atende o refeitório, cozinha de origem) continua só com `global:2`.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { UserPermission } from "@iefa/pbac"
import type { UserContext } from "../types/context.ts"
import type { DomainError } from "../types/errors.ts"
import { applyPlacesDiff, isReparentDiff } from "./places.ts"

const NO_SCOPE = { kitchen_id: null, mess_hall_id: null, unit_id: null }

function ctxWith(permissions: Array<Pick<UserPermission, "module" | "level">>): UserContext {
	return { userId: "actor", permissions: permissions.map((p) => ({ ...p, ...NO_SCOPE })) as UserPermission[], aal: 1, lastFactorAt: null, origin: "session" }
}

const GLOBAL_ONLY = ctxWith([{ module: "global", level: 2 }])
const GLOBAL_AND_ADMIN = ctxWith([
	{ module: "global", level: 2 },
	{ module: "admin", level: 2 },
])

/**
 * Stub do Drizzle com transação: `current` é o valor atual da coluna lida com `for update`;
 * `updates` e `logs` registram o que a transação escreveu; `failLog` simula a falha do log
 * (a transação inteira tem de falhar junto).
 */
function stubDb(opts: { current?: number | null; failLog?: boolean } = {}) {
	const state = { transactions: 0, updates: [] as Array<Record<string, unknown>>, logs: [] as Array<Record<string, unknown>>, locks: 0 }
	const tx = {
		select: () => ({
			from: () => ({
				where: () => ({
					for: () => {
						state.locks++
						return Promise.resolve([{ value: opts.current ?? null }])
					},
				}),
			}),
		}),
		update: () => ({
			set: (values: Record<string, unknown>) => ({
				where: () => {
					state.updates.push(values)
					return Promise.resolve([])
				},
			}),
		}),
		insert: () => ({
			values: (values: Record<string, unknown>) => ({
				returning: () => {
					if (opts.failLog) return Promise.reject(new Error("log indisponível"))
					state.logs.push(values)
					return Promise.resolve([{ id: "log-1", ...values }])
				},
			}),
		}),
	}
	const db = {
		transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
			state.transactions++
			return fn(tx)
		},
	} as unknown as SisubDb
	return { db, state }
}

const caught = (promise: Promise<unknown>) =>
	promise.then(
		() => null,
		(e: unknown) => e as DomainError
	)

describe("isReparentDiff", () => {
	test("as colunas de OM são reparentar; a ligação cozinha↔refeitório não", () => {
		expect(isReparentDiff({ table: "kitchen", recordId: 1, column: "unit_id", newValue: 2 })).toBe(true)
		expect(isReparentDiff({ table: "kitchen", recordId: 1, column: "purchase_unit_id", newValue: 2 })).toBe(true)
		expect(isReparentDiff({ table: "mess_halls", recordId: 1, column: "unit_id", newValue: 2 })).toBe(true)
		expect(isReparentDiff({ table: "kitchen", recordId: 1, column: "kitchen_id", newValue: 2 })).toBe(false)
		expect(isReparentDiff({ table: "mess_halls", recordId: 1, column: "kitchen_id", newValue: 2 })).toBe(false)
	})
})

describe("applyPlacesDiff", () => {
	test("global:2 sem admin não reparenta — nada é escrito", async () => {
		for (const diff of [
			{ table: "kitchen", recordId: 7, column: "unit_id", newValue: 2 },
			{ table: "kitchen", recordId: 7, column: "purchase_unit_id", newValue: 2 },
			{ table: "mess_halls", recordId: 9, column: "unit_id", newValue: 2 },
		] as const) {
			const { db, state } = stubDb({ current: 1 })
			const error = await caught(applyPlacesDiff(db, GLOBAL_ONLY, { diffs: [diff] }))
			expect(error?.code).toBe("PERMISSION_DENIED")
			expect(state.transactions).toBe(0)
		}
	})

	test("global:2 segue ligando cozinha e refeitório, sem log", async () => {
		const { db, state } = stubDb()
		await expect(applyPlacesDiff(db, GLOBAL_ONLY, { diffs: [{ table: "mess_halls", recordId: 9, column: "kitchen_id", newValue: 3 }] })).resolves.toEqual({
			ok: true,
			count: 1,
		})
		expect(state.updates).toEqual([{ kitchenId: 3 }])
		expect(state.logs).toEqual([])
	})

	test("admin:2 reparenta, e o log (na mesma transação) leva o antes e o depois com o ator da sessão", async () => {
		const { db, state } = stubDb({ current: 1 })
		await applyPlacesDiff(
			db,
			GLOBAL_AND_ADMIN,
			{ diffs: [{ table: "kitchen", recordId: 7, column: "unit_id", newValue: 2 }] },
			{ operation: "applyPlacesDiffFn", grade: "session" }
		)
		expect(state.transactions).toBe(1)
		expect(state.locks).toBe(1)
		expect(state.updates).toEqual([{ unitId: 2 }])
		expect(state.logs).toEqual([
			{
				actorId: "actor",
				operation: "applyPlacesDiffFn",
				assurance: "session",
				target: { action: "reparent", changes: [{ table: "kitchen", record_id: 7, column: "unit_id", previous: 1, value: 2 }] },
			},
		])
	})

	test("reenviar a mesma OM não registra mudança que não houve", async () => {
		const { db, state } = stubDb({ current: 2 })
		await applyPlacesDiff(db, GLOBAL_AND_ADMIN, { diffs: [{ table: "mess_halls", recordId: 9, column: "unit_id", newValue: 2 }] })
		expect(state.logs).toEqual([])
	})

	test("falha do log derruba a operação (a transação desfaz as escritas)", async () => {
		const { db } = stubDb({ current: 1, failLog: true })
		const error = await caught(applyPlacesDiff(db, GLOBAL_AND_ADMIN, { diffs: [{ table: "kitchen", recordId: 7, column: "unit_id", newValue: 2 }] }))
		expect(error?.code).toBe("AUDIT_INSERT_FAILED")
	})
})
