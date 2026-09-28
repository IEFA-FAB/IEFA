import { describe, expect, test } from "bun:test"
import { buildIdempotencyKey, type PersistResearchInput, type PriceResearchClient, persistResearch } from "./persist.ts"

type Row = Record<string, unknown>
type PgError = { code: string; message: string }

/**
 * Dublê do PostgREST com a regra que importa aqui: `price_research` recusa chave repetida
 * com 23505, como o índice parcial `uq_price_research_idempotency`. Não há `upsert` no
 * cabeçalho — se a persistência voltar a usá-lo, o `upsertCalls` acusa (e o banco real
 * responderia 42P10, que um dublê não reproduz).
 */
class FakeSupabase {
	tables: Record<string, Row[]> = { price_research: [], price_research_item: [] }
	upsertCalls: string[] = []
	/** Erro forçado no próximo insert de `price_research` (simula falha que não é 23505). */
	failNextHeaderInsert: PgError | null = null
	private seq = 0

	from(table: string) {
		if (!this.tables[table]) this.tables[table] = []
		const rows = this.tables[table]
		return {
			insert: (row: Row) => ({
				select: (_columns: string) => ({
					single: async (): Promise<{ data: Row | null; error: PgError | null }> => {
						if (table === "price_research") {
							if (this.failNextHeaderInsert) {
								const error = this.failNextHeaderInsert
								this.failNextHeaderInsert = null
								return { data: null, error }
							}
							if (rows.some((r) => r.idempotency_key === row.idempotency_key)) {
								return { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "uq_price_research_idempotency"' } }
							}
						}
						const saved = { ...row, id: `${table}-${++this.seq}` }
						rows.push(saved)
						return { data: { id: saved.id }, error: null }
					},
				}),
			}),
			select: (_columns: string) => ({
				eq: (column: string, value: unknown) => ({
					maybeSingle: async () => {
						const found = rows.find((r) => r[column] === value)
						return { data: found ? { id: found.id } : null, error: null }
					},
				}),
			}),
			upsert: async (_rows: Row[], _options: unknown) => {
				this.upsertCalls.push(table)
				return { error: null }
			},
		}
	}

	async rpc(_fn: string, _args: unknown) {
		return { data: [], error: null }
	}
}

const NOW = new Date("2026-09-27T15:00:00Z")

function input(overrides: Partial<PersistResearchInput> = {}): PersistResearchInput {
	return {
		quantityEstimateId: "qe-1",
		options: { months: 12, similarityThreshold: 0.4 },
		items: [
			{
				quantityEstimateItemId: "qei-1",
				ingredientId: "ing-1",
				ingredientName: "Arroz",
				catmatCodigo: null,
				catmatDescricao: null,
				analysis: null,
				error: "Item sem código CATMAT vinculado",
			},
		],
		summary: { total: 1, withPrice: 0, withoutCatmat: 1, nonCompliant: 0 },
		now: NOW,
		...overrides,
	}
}

const asClient = (fake: FakeSupabase) => fake as unknown as PriceResearchClient

describe("persistResearch — cabeçalho idempotente", () => {
	test("1ª gravação insere o cabeçalho com a chave e grava os itens", async () => {
		const fake = new FakeSupabase()

		const researchId = await persistResearch(asClient(fake), input())

		expect(researchId).toBe("price_research-1")
		expect(fake.tables.price_research).toHaveLength(1)
		expect(fake.tables.price_research[0]).toMatchObject({
			quantity_estimate_id: "qe-1",
			idempotency_key: buildIdempotencyKey("qe-1", { months: 12, similarityThreshold: 0.4 }, NOW),
			total_items: 1,
			items_without_catmat: 1,
		})
		expect(fake.tables.price_research_item).toHaveLength(1)
		expect(fake.tables.price_research_item[0]).toMatchObject({ research_id: researchId, quantity_estimate_item_id: "qei-1" })
		// O cabeçalho não passa por `upsert(onConflict)`: o índice da chave é parcial (42P10).
		expect(fake.upsertCalls).not.toContain("price_research")
	})

	test("reenvio com a mesma chave devolve o mesmo id e não duplica nada", async () => {
		const fake = new FakeSupabase()

		const first = await persistResearch(asClient(fake), input())
		const again = await persistResearch(asClient(fake), input())

		expect(again).toBe(first)
		expect(fake.tables.price_research).toHaveLength(1)
		expect(fake.tables.price_research_item).toHaveLength(1)
	})

	test("outro dia ou outros parâmetros geram pesquisa nova", async () => {
		const fake = new FakeSupabase()

		const first = await persistResearch(asClient(fake), input())
		const nextDay = await persistResearch(asClient(fake), input({ now: new Date("2026-09-28T15:00:00Z") }))
		const otherParams = await persistResearch(asClient(fake), input({ options: { months: 6, similarityThreshold: 0.4 } }))

		expect(new Set([first, nextDay, otherParams]).size).toBe(3)
		expect(fake.tables.price_research).toHaveLength(3)
	})

	test("erro diferente de 23505 devolve null, sem reler nem gravar itens", async () => {
		const fake = new FakeSupabase()
		fake.failNextHeaderInsert = { code: "42P10", message: "there is no unique or exclusion constraint matching the ON CONFLICT specification" }

		const researchId = await persistResearch(asClient(fake), input())

		expect(researchId).toBeNull()
		expect(fake.tables.price_research).toHaveLength(0)
		expect(fake.tables.price_research_item).toHaveLength(0)
	})

	test("23505 sem linha para reler devolve null em vez de inventar id", async () => {
		const fake = new FakeSupabase()
		fake.failNextHeaderInsert = { code: "23505", message: "duplicate key value violates unique constraint" }

		expect(await persistResearch(asClient(fake), input())).toBeNull()
		expect(fake.tables.price_research_item).toHaveLength(0)
	})
})

describe("buildIdempotencyKey", () => {
	test("usa o dia civil de Brasília, não o UTC", () => {
		// 01:30 UTC do dia 28 ainda é 22:30 do dia 27 em Brasília.
		const key = buildIdempotencyKey("qe-1", {}, new Date("2026-09-28T01:30:00Z"))
		expect(key.endsWith(":2026-09-27")).toBe(true)
		expect(key.startsWith("quantity-estimate:v1:qe-1:")).toBe(true)
	})
})
