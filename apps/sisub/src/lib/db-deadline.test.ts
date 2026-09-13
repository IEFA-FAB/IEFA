/**
 * Prazo das operações do pool do Drizzle.
 *
 * O que estes testes seguram é a saída do estado que derrubou a task em 2026-09-13: uma
 * query que nunca volta tem que REJEITAR (para o request terminar) e AVISAR o dono do pool
 * (para a conexão travada ser destruída). Só rejeitar deixaria a vaga ocupada para sempre;
 * só avisar deixaria o request pendurado até o ALB cortar.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { guardWithDeadline, PendingSet, QUERY_DEADLINE_CODE } from "./db-deadline"

type FakeQuery = Promise<unknown> & { reject: (reason: unknown) => void; resolve: (value: unknown) => void }

function fakeQuery(): FakeQuery {
	let resolve!: (value: unknown) => void
	let reject!: (reason: unknown) => void
	const promise = new Promise((res, rej) => {
		resolve = res
		reject = rej
	}) as FakeQuery
	promise.resolve = resolve
	promise.reject = reject
	return promise
}

function fakeClient() {
	const queries: FakeQuery[] = []
	const transactions: FakeQuery[] = []
	const client = {
		options: { parsers: {} as Record<string, unknown> },
		unsafe: vi.fn(() => {
			const query = fakeQuery()
			queries.push(query)
			return query
		}),
		begin: vi.fn(() => {
			const transaction = fakeQuery()
			transactions.push(transaction)
			return transaction
		}),
	}
	return { client, queries, transactions }
}

beforeEach(() => {
	vi.useFakeTimers()
})

afterEach(() => {
	vi.useRealTimers()
})

describe("guardWithDeadline — query", () => {
	test("query que responde dentro do prazo não é tocada", async () => {
		const { client, queries } = fakeClient()
		const onExpire = vi.fn()
		const guarded = guardWithDeadline(client, { deadlineMs: 1000, onExpire })

		const result = guarded.unsafe()
		queries[0].resolve([1])
		await expect(result).resolves.toEqual([1])

		await vi.advanceTimersByTimeAsync(5000)
		expect(onExpire).not.toHaveBeenCalled()
	})

	test("query pendurada rejeita com QUERY_DEADLINE e avisa o dono do pool", async () => {
		const { client } = fakeClient()
		const onExpire = vi.fn()
		const guarded = guardWithDeadline(client, { deadlineMs: 1000, onExpire })

		const result = guarded.unsafe()
		const assertion = expect(result).rejects.toMatchObject({ code: QUERY_DEADLINE_CODE })
		await vi.advanceTimersByTimeAsync(1000)

		await assertion
		expect(onExpire).toHaveBeenCalledOnce()
		expect(onExpire.mock.calls[0][0]).toMatchObject({ code: QUERY_DEADLINE_CODE })
	})

	test("devolve o MESMO objeto de query — o Drizzle encadeia `.values()` nele", () => {
		const { client, queries } = fakeClient()
		const guarded = guardWithDeadline(client, { deadlineMs: 1000, onExpire: vi.fn() })

		expect(guarded.unsafe()).toBe(queries[0])
	})
})

describe("guardWithDeadline — transação", () => {
	test("transação pendurada rejeita e avisa", async () => {
		const { client } = fakeClient()
		const onExpire = vi.fn()
		const guarded = guardWithDeadline(client, { deadlineMs: 1000, onExpire })

		const assertion = expect(guarded.begin()).rejects.toMatchObject({ code: QUERY_DEADLINE_CODE })
		await vi.advanceTimersByTimeAsync(1000)

		await assertion
		expect(onExpire).toHaveBeenCalledOnce()
	})

	test("resultado e erro da transação passam intactos", async () => {
		const { client, transactions } = fakeClient()
		const guarded = guardWithDeadline(client, { deadlineMs: 1000, onExpire: vi.fn() })

		const ok = guarded.begin()
		transactions[0].resolve("commit")
		await expect(ok).resolves.toBe("commit")

		const failed = guarded.begin()
		transactions[1].reject(new Error("23505"))
		await expect(failed).rejects.toThrow("23505")
	})
})

describe("guardWithDeadline — Proxy", () => {
	test("o resto do client passa direto: o drizzle() escreve em options.parsers", () => {
		const { client } = fakeClient()
		const guarded = guardWithDeadline(client, { deadlineMs: 1000, onExpire: vi.fn() })

		guarded.options.parsers["1184"] = "transparent"
		expect(client.options.parsers["1184"]).toBe("transparent")
	})
})

describe("PendingSet", () => {
	test("mede a operação pendente mais antiga e esquece as encerradas", async () => {
		const { client, queries } = fakeClient()
		const tracker = new PendingSet()
		const guarded = guardWithDeadline(client, { deadlineMs: 60_000, onExpire: vi.fn(), tracker })

		expect(tracker.oldestPendingMs()).toBe(0)

		guarded.unsafe()
		await vi.advanceTimersByTimeAsync(2000)
		guarded.unsafe()
		await vi.advanceTimersByTimeAsync(1000)
		expect(tracker.oldestPendingMs()).toBe(3000)

		queries[0].resolve([])
		await vi.advanceTimersByTimeAsync(0)
		expect(tracker.oldestPendingMs()).toBe(1000)
	})
})
