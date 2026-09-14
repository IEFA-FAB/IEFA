/**
 * Pool resiliente — o que estes testes seguram:
 * - query/transação TRAVADA em execução rejeita com QUERY_DEADLINE e o pool é recriado;
 * - espera na FILA não conta (senão um pico de tráfego comum derrubaria o pool);
 * - quem capturou o handle antes do reset segue funcionando no pool novo, com os parsers
 *   que o `drizzle()` gravou no primeiro;
 * - `isWedged` só acusa o que o reset não conseguiu soltar.
 */

import { describe, expect, test } from "bun:test"
import { createResilientPostgres, QUERY_DEADLINE_CODE, type ResilientPostgresOptions } from "./postgres-pool"

type FakeQuery = Promise<unknown> & { active: boolean; resolve: (v: unknown) => void; reject: (e: unknown) => void }

function fakeQuery(): FakeQuery {
	let resolve!: (v: unknown) => void
	let reject!: (e: unknown) => void
	const query = new Promise((res, rej) => {
		resolve = res
		reject = rej
	}) as FakeQuery
	query.active = false
	query.resolve = (v) => {
		query.active = false
		resolve(v)
	}
	query.reject = (e) => {
		query.active = false
		reject(e)
	}
	// Mesmo tratamento que o `track` dá: sem isto o reject de teste vira unhandled.
	query.catch(() => {})
	return query
}

function fakePool() {
	const queries: FakeQuery[] = []
	const transactions: { start: () => void; settle: (v: unknown) => void; promise: Promise<unknown> }[] = []
	const ended: unknown[] = []
	const client = {
		options: { parsers: {} as Record<string, unknown>, serializers: {} as Record<string, unknown> },
		unsafe: () => {
			const q = fakeQuery()
			queries.push(q)
			return q
		},
		begin: (...args: unknown[]) => {
			const fn = args[args.length - 1] as (sql: unknown) => unknown
			let resolve!: (v: unknown) => void
			let reject!: (e: unknown) => void
			const promise = new Promise((res, rej) => {
				resolve = res
				reject = rej
			})
			promise.catch(() => {})
			transactions.push({
				start: () => {
					Promise.resolve(fn("tx")).then(resolve, reject)
				},
				settle: resolve,
				promise,
			})
			return promise
		},
		end: (opts: unknown) => {
			ended.push(opts)
			return Promise.resolve()
		},
	}
	return { client, queries, transactions, ended }
}

function setup(overrides: Partial<ResilientPostgresOptions> = {}) {
	let clock = 0
	const pools: ReturnType<typeof fakePool>[] = []
	const resets: unknown[] = []
	const resilient = createResilientPostgres("postgres://fake", {
		connection: {},
		queryDeadlineMs: 1000,
		transactionDeadlineMs: 2000,
		queueCeilingMs: 10_000,
		sweepIntervalMs: 60_000,
		now: () => clock,
		onReset: (e) => resets.push(e),
		factory: () => {
			const p = fakePool()
			pools.push(p)
			return p.client as never
		},
		...overrides,
	})
	const advance = async (ms: number) => {
		clock += ms
		resilient.sweep()
		await Promise.resolve()
	}
	return { resilient, pools, resets, advance }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe("query", () => {
	test("query que responde é intocada", async () => {
		const { resilient, pools, resets, advance } = setup()
		const result: Promise<unknown> = resilient.sql.unsafe("select 1")
		pools[0].queries[0].active = true
		await advance(500)
		pools[0].queries[0].resolve([1])
		await expect(result).resolves.toEqual([1])
		await advance(5000)
		expect(resets).toHaveLength(0)
	})

	test("espera na FILA não conta para o prazo", async () => {
		const { resilient, pools, resets, advance } = setup()
		void resilient.sql.unsafe("select 1")
		await advance(5000) // nunca ficou ativa: está na fila do pool
		expect(resets).toHaveLength(0)
		pools[0].queries[0].active = true
		await advance(900)
		await advance(900) // 900 ms de execução até aqui: dentro do prazo
		expect(resets).toHaveLength(0)
	})

	test("query travada em execução rejeita com QUERY_DEADLINE e destrói o pool", async () => {
		const { resilient, pools, resets, advance } = setup()
		const result = resilient.sql.unsafe("select 1")
		pools[0].queries[0].active = true
		await advance(1) // marca o início
		// Captura por `.then`, não `expect(...).rejects`: no Bun o `rejects` gira o event loop até
		// a promise assentar, e quem a rejeita é a varredura que só roda no `advance` seguinte.
		const outcome = result.then(
			() => null,
			(error: unknown) => error
		)
		await advance(1001)
		expect(await outcome).toMatchObject({ code: QUERY_DEADLINE_CODE })
		expect(resets).toHaveLength(1)
		expect(pools[0].ended).toEqual([{ timeout: 0 }])
	})

	test("várias expirações do mesmo pool resetam uma vez só", async () => {
		const { resilient, pools, resets, advance } = setup()
		void resilient.sql.unsafe("a")
		void resilient.sql.unsafe("b")
		for (const q of pools[0].queries) q.active = true
		await advance(1)
		await advance(1001)
		expect(resets).toHaveLength(1)
	})
})

describe("handle estável", () => {
	test("depois do reset o MESMO handle usa o pool novo, com os parsers do antigo", async () => {
		const { resilient, pools, advance } = setup()
		// o que o drizzle() faz na construção
		resilient.sql.options.parsers["1184"] = "transparent" as never
		void resilient.sql.unsafe("select 1")
		pools[0].queries[0].active = true
		await advance(1)
		await advance(1001)

		void resilient.sql.unsafe("select 2")
		expect(pools).toHaveLength(2)
		expect(pools[1].queries).toHaveLength(1)
		expect(pools[1].client.options.parsers["1184"]).toBe("transparent")
	})
})

describe("transação", () => {
	test("espera pelo BEGIN não conta; callback travado rejeita e reseta", async () => {
		const { resilient, pools, resets, advance } = setup()
		const tx = resilient.sql.begin(async () => new Promise(() => {}))
		await advance(10_000) // callback ainda não começou
		expect(resets).toHaveLength(0)

		pools[0].transactions[0].start()
		const outcome = tx.then(
			() => null,
			(error: unknown) => error
		)
		await advance(2001)
		expect(await outcome).toMatchObject({ code: QUERY_DEADLINE_CODE })
		expect(resets).toHaveLength(1)
	})

	test("resultado passa intacto, inclusive com options", async () => {
		const { resilient, pools } = setup()
		const tx = resilient.sql.begin("read write", async (sql: unknown) => `ok:${sql}`)
		pools[0].transactions[0].start()
		await expect(tx).resolves.toBe("ok:tx")
	})
})

describe("isWedged", () => {
	test("acusa execução além de 2× o prazo que o reset não soltou", async () => {
		const { resilient, pools, advance } = setup()
		const q = resilient.sql.unsafe("select 1")
		pools[0].queries[0].active = true
		// simula um driver que ignora o reject
		;(q as unknown as { reject: () => void }).reject = () => {}
		await advance(1)
		expect(resilient.isWedged()).toBe(false)
		await advance(1500)
		expect(resilient.isWedged()).toBe(false)
		await advance(600)
		expect(resilient.isWedged()).toBe(true)
	})

	test("acusa fila parada além do teto, e esquece o que terminou", async () => {
		const { resilient, pools, advance } = setup()
		void resilient.sql.unsafe("select 1")
		await advance(10_001)
		expect(resilient.isWedged()).toBe(true)
		pools[0].queries[0].resolve([])
		await flush()
		expect(resilient.isWedged()).toBe(false)
	})
})
