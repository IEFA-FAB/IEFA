import { describe, expect, test } from "vitest"
import { type ExecutionClient, loadUnitExecution } from "@/lib/acquisition-execution"

type Row = Record<string, unknown>
type Filter = (row: Row) => boolean

/**
 * Cliente PostgREST falso: aplica `eq`/`gte`/`lte`/`in`/`is` e corta cada resposta em 1000 linhas,
 * como o PostgREST faz — sem avisar. É o corte que o carregador tem de atravessar.
 */
function fakeClient(tables: Record<string, Row[]>, calls: string[]): ExecutionClient {
	return {
		from(table: string) {
			const filters: Filter[] = []
			let range: [number, number] = [0, 999]
			const builder = {
				select: () => builder,
				eq: (column: string, value: unknown) => {
					filters.push((row) => row[column] === value)
					return builder
				},
				gte: (column: string, value: string) => {
					filters.push((row) => String(row[column]) >= value)
					return builder
				},
				lte: (column: string, value: string) => {
					filters.push((row) => String(row[column]) <= value)
					return builder
				},
				is: (column: string, value: unknown) => {
					filters.push((row) => (row[column] ?? null) === value)
					return builder
				},
				in: (column: string, values: unknown[]) => {
					filters.push((row) => values.includes(row[column]))
					return builder
				},
				order: () => builder,
				range: (from: number, to: number) => {
					range = [from, Math.min(to, from + 999)]
					return builder
				},
				// biome-ignore lint/suspicious/noThenProperty: imita o builder "thenable" do supabase-js
				then: (resolve: (value: { data: Row[]; error: null }) => unknown) => {
					calls.push(table)
					const rows = (tables[table] ?? []).filter((row) => filters.every((f) => f(row)))
					return Promise.resolve(resolve({ data: rows.slice(range[0], range[1] + 1), error: null }))
				},
			}
			return builder
		},
	}
}

describe("loadUnitExecution — somatório sem corte de 1000 linhas e por exercício", () => {
	const unitId = 7
	const empenhos: Row[] = Array.from({ length: 2500 }, (_, i) => ({
		id: `e${String(i).padStart(4, "0")}`,
		unit_id: unitId,
		numero_empenho: `2026NE${String(i).padStart(6, "0")}`,
		data_empenho: "2026-05-10",
		status: "ativo",
		acquisition_id: "a1",
		favorecido_nome: null,
		origem: "manual",
	}))
	// NE de outro exercício, sem contratação: fica fora.
	empenhos.push({ ...empenhos[0], id: "old", numero_empenho: "2025NE000001", data_empenho: "2025-12-20", acquisition_id: null })
	// NE de janeiro/2027 ligada à contratação de 2026: entra no empenhado dela.
	empenhos.push({ ...empenhos[0], id: "jan", numero_empenho: "2027NE000001", data_empenho: "2027-01-05", acquisition_id: "a1" })

	const tables: Record<string, Row[]> = {
		acquisition: [
			{ id: "a1", unit_id: unitId, fiscal_year: 2026, deleted_at: null, created_at: "2026-01-01" },
			{ id: "a0", unit_id: unitId, fiscal_year: 2025, deleted_at: null, created_at: "2025-01-01" },
		],
		empenho: empenhos,
		v_empenho_vigente: empenhos.map((e) => ({ empenho_id: e.id, valor_vigente: 10 })),
		empenho_item: empenhos.map((e) => ({ id: `i-${e.id}`, empenho_id: e.id, arp_item_id: null })),
		arp: [],
		arp_item: [],
	}

	test("lê todas as NEs do exercício (mais de mil) e as da contratação do exercício com data em outro ano", async () => {
		const calls: string[] = []
		const client = fakeClient(tables, calls)
		const execution = await loadUnitExecution({ procurement: client, finance: client }, { unitId, fiscalYear: 2026, acquisitionColumns: "*" })
		expect(execution.acquisitions.map((a) => a.id)).toEqual(["a1"])
		expect(execution.empenhos).toHaveLength(2501)
		expect(execution.empenhos.some((e) => e.id === "old")).toBe(false)
		expect(execution.empenhos.some((e) => e.id === "jan")).toBe(true)
		expect(execution.vigenteById.size).toBe(2501)
		const committed = [...execution.vigenteById.values()].reduce((sum, value) => sum + value, 0)
		expect(committed).toBe(25010)
		// Paginou de verdade: mais de uma requisição à tabela de empenhos.
		expect(calls.filter((table) => table === "empenho").length).toBeGreaterThan(2)
	})
})
