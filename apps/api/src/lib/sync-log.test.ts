import { describe, expect, test } from "bun:test"
import { claimSync, hasLiveSync, isSyncLive, recoverStaleSyncs, SYNC_SOURCES } from "./sync-log.ts"

/**
 * O log de execução é COMPARTILHADO por todas as integrações. Sem o discriminador de origem,
 * um sync bloqueia o outro, a recuperação de um mata a execução saudável do outro, e o painel
 * de um mostra o sync do outro.
 *
 * E a exclusão mútua não pode ser "verifica e insere": esse padrão é uma corrida. Quem garante
 * é o índice parcial único `(source) where status = 'running'`, e o papel do código é traduzir
 * o 23505 em "já está rodando".
 */

type Filter = { column: string; value: unknown }
type Row = Record<string, unknown>

class FakeDb {
	filters: Filter[] = []
	inserted: Row[] = []
	updates: Row[] = []
	/** Simula o índice parcial único recusando a segunda execução viva da mesma origem. */
	constructor(
		private rows: Row[] = [],
		private rejectInsertWith?: string
	) {}

	from(_table: string) {
		const builder = {
			select: (_c?: string) => builder,
			eq: (column: string, value: unknown) => {
				this.filters.push({ column, value })
				return builder
			},
			in: (_c: string, _v: unknown[]) => builder,
			update: (patch: Row) => {
				this.updates.push(patch)
				return builder
			},
			insert: (row: Row) => {
				this.inserted.push(row)
				return {
					select: (_c: string) => ({
						single: () =>
							Promise.resolve(
								this.rejectInsertWith ? { data: null, error: { code: this.rejectInsertWith, message: "duplicate key" } } : { data: { id: 42 }, error: null }
							),
					}),
				}
			},
			// biome-ignore lint/suspicious/noThenProperty: o builder do PostgREST é um thenable e o código faz await nele; o fake precisa imitar isso
			then: (resolve: (r: { data: unknown; error: null }) => unknown) => {
				const data = this.rows.filter((row) => this.filters.every((f) => row[f.column] === f.value))
				return Promise.resolve(resolve({ data, error: null }))
			},
		}
		return builder
	}
}

const vivo = (source: string) => ({
	id: 1,
	source,
	status: "running",
	heartbeat_at: new Date().toISOString(),
	started_at: new Date().toISOString(),
})

const morto = (source: string) => ({
	id: 2,
	source,
	status: "running",
	heartbeat_at: new Date(Date.now() - 10 * 60_000).toISOString(),
	started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
})

describe("isSyncLive", () => {
	test("heartbeat recente é vivo", () => {
		expect(isSyncLive(new Date().toISOString(), new Date().toISOString())).toBe(true)
	})

	test("heartbeat velho é morto", () => {
		expect(isSyncLive(new Date(Date.now() - 10 * 60_000).toISOString(), new Date().toISOString())).toBe(false)
	})

	test("sem heartbeat, vale a margem de partida", () => {
		expect(isSyncLive(null, new Date().toISOString())).toBe(true)
		expect(isSyncLive(null, new Date(Date.now() - 60_000).toISOString())).toBe(false)
	})
})

describe("isolamento por origem", () => {
	test("hasLiveSync filtra por status E por origem", async () => {
		const db = new FakeDb([])
		await hasLiveSync(db as never, SYNC_SOURCES.comprasGov)

		expect(db.filters).toContainEqual({ column: "status", value: "running" })
		expect(db.filters).toContainEqual({ column: "source", value: SYNC_SOURCES.comprasGov })
	})

	test("execução viva de OUTRA origem não bloqueia", async () => {
		const db = new FakeDb([vivo(SYNC_SOURCES.pncpPca)])

		expect(await hasLiveSync(db as never, SYNC_SOURCES.comprasGov)).toBe(false)
	})

	test("execução viva da MESMA origem bloqueia", async () => {
		const db = new FakeDb([vivo(SYNC_SOURCES.comprasGov)])

		expect(await hasLiveSync(db as never, SYNC_SOURCES.comprasGov)).toBe(true)
	})

	test("recuperação não toca execução de outra origem", async () => {
		const db = new FakeDb([morto(SYNC_SOURCES.nutritionReference)])

		expect(await recoverStaleSyncs(db as never, SYNC_SOURCES.comprasGov)).toBe(0)
		expect(db.updates).toHaveLength(0)
	})

	test("recuperação marca a execução morta da própria origem", async () => {
		const db = new FakeDb([morto(SYNC_SOURCES.comprasGov)])

		expect(await recoverStaleSyncs(db as never, SYNC_SOURCES.comprasGov)).toBe(1)
		expect(db.updates.some((u) => u.error_message === "instance_died")).toBe(true)
	})
})

describe("claimSync — exclusão garantida pelo banco", () => {
	test("toma a vaga e carimba origem, status e primeiro heartbeat", async () => {
		const db = new FakeDb([])

		const r = await claimSync(db as never, { source: SYNC_SOURCES.pncpPca, triggeredBy: "manual", totalSteps: 2 })

		expect(r).toEqual({ claimed: true, syncId: 42 })
		const row = db.inserted[0]
		expect(row.source).toBe(SYNC_SOURCES.pncpPca)
		expect(row.status).toBe("running")
		// Sem o primeiro heartbeat no insert, a execução vive só a margem de 15 s.
		expect(row.heartbeat_at).toBeTruthy()
	})

	test("violação de unicidade vira 'já rodando', não exceção", async () => {
		const db = new FakeDb([], "23505")

		const r = await claimSync(db as never, { source: SYNC_SOURCES.pncpPca, triggeredBy: "cron", totalSteps: 1 })

		expect(r).toEqual({ claimed: false, reason: "already_running" })
	})

	test("erro que NÃO é de unicidade propaga — não pode virar 'já rodando' em silêncio", async () => {
		const db = new FakeDb([], "42P01")

		await expect(claimSync(db as never, { source: SYNC_SOURCES.pncpPca, triggeredBy: "cron", totalSteps: 1 })).rejects.toThrow(/pncp_pca/)
	})
})
