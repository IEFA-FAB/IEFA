import { describe, expect, test } from "bun:test"
import { COMPRAS_SYNC_SOURCE, hasLiveSync } from "./sync-log.ts"

/**
 * `compras_sync_log` é compartilhada entre ingestões (Compras.gov e PCA do PNCP). Sem o
 * discriminador de origem, um sync do PNCP em `running` bloquearia o sync semanal do CATMAT,
 * seria marcado como morto pela recuperação alheia, e apareceria na tela de rotinas do
 * Compras.gov com o rótulo errado.
 *
 * Estes testes provam que o filtro está na query — não que o banco tem a coluna.
 */

type Filter = { column: string; value: unknown }

/** Captura os filtros aplicados e devolve as linhas que sobrevivem a eles. */
class FakeSupabase {
	filters: Filter[] = []
	constructor(private rows: Array<Record<string, unknown>>) {}

	from(_table: string) {
		const builder = {
			select: (_columns: string) => builder,
			eq: (column: string, value: unknown) => {
				this.filters.push({ column, value })
				return builder
			},
			// biome-ignore lint/suspicious/noThenProperty: o builder do PostgREST é um thenable e `hasLiveSync` faz await nele; o fake precisa imitar isso
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

describe("isolamento do log de sync por origem", () => {
	test("hasLiveSync filtra por status e por origem", async () => {
		const db = new FakeSupabase([])
		await hasLiveSync(db as never)

		expect(db.filters).toContainEqual({ column: "status", value: "running" })
		expect(db.filters).toContainEqual({ column: "source", value: COMPRAS_SYNC_SOURCE })
	})

	test("sync do PNCP em execução NÃO bloqueia o sync do Compras.gov", async () => {
		const db = new FakeSupabase([vivo("pncp_pca")])

		expect(await hasLiveSync(db as never)).toBe(false)
	})

	test("sync do Compras.gov em execução bloqueia outro do Compras.gov", async () => {
		const db = new FakeSupabase([vivo(COMPRAS_SYNC_SOURCE)])

		expect(await hasLiveSync(db as never)).toBe(true)
	})

	test("a origem consultada é parametrizável, para a ingestão do PNCP reusar o mesmo guard", async () => {
		const db = new FakeSupabase([vivo("pncp_pca")])

		expect(await hasLiveSync(db as never, "pncp_pca")).toBe(true)
	})
})
