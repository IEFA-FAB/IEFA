import { describe, expect, test } from "bun:test"
import { createStepCounts, upsertCountingWrites } from "./upsert.ts"

/**
 * Com o trigger `a_skip_unchanged_sync_row`, o upsert de linha idêntica não grava nada, e o
 * `count` do PostgREST passa a contar só as gravadas. O painel mostra as duas contagens: sem
 * isso, "sync saudável sem mudanças" e "API devolveu vazio" aparecem iguais (0).
 */

type Call = { table: string; rows: object[]; options: Record<string, unknown> }

function fakeClient(response: { error: { message: string } | null; count: number | null }) {
	const calls: Call[] = []
	const client = {
		from: (table: string) => ({
			upsert: async (rows: object[], options: Record<string, unknown>) => {
				calls.push({ table, rows, options })
				return response
			},
		}),
	}
	// O client do Supabase é genérico demais para o fake; ele cobre só o `upsert`.
	return { client: client as any, calls }
}

describe("upsertCountingWrites", () => {
	test("devolve o count do PostgREST (só as linhas inseridas ou alteradas)", async () => {
		const { client, calls } = fakeClient({ error: null, count: 1 })
		const written = await upsertCountingWrites(client, "compras_material_item", [{ codigo_item: 1 }, { codigo_item: 2 }], { label: "upsert item" })
		expect(written).toBe(1)
		expect(calls).toEqual([{ table: "compras_material_item", rows: [{ codigo_item: 1 }, { codigo_item: 2 }], options: { count: "exact" } }])
	})

	test("repassa o onConflict", async () => {
		const { client, calls } = fakeClient({ error: null, count: 0 })
		await upsertCountingWrites(client, "compras_servico_unidade_medida", [{}], { label: "x", onConflict: "codigo_servico,sigla_unidade_medida" })
		expect(calls[0].options).toEqual({ count: "exact", onConflict: "codigo_servico,sigla_unidade_medida" })
	})

	test("lote idêntico: 0 gravadas, sem virar erro", async () => {
		const { client } = fakeClient({ error: null, count: 0 })
		expect(await upsertCountingWrites(client, "t", [{}, {}, {}], { label: "x" })).toBe(0)
	})

	test("sem count na resposta, conta o lote inteiro (o que o upsert cego gravava)", async () => {
		const { client } = fakeClient({ error: null, count: null })
		expect(await upsertCountingWrites(client, "t", [{}, {}], { label: "x" })).toBe(2)
	})

	test("lote vazio não chama o banco", async () => {
		const { client, calls } = fakeClient({ error: null, count: 0 })
		expect(await upsertCountingWrites(client, "t", [], { label: "x" })).toBe(0)
		expect(calls).toEqual([])
	})

	test("erro sobe com o label do step", async () => {
		const { client } = fakeClient({ error: { message: "statement timeout" }, count: null })
		await expect(upsertCountingWrites(client, "t", [{}], { label: "upsert pdm" })).rejects.toThrow("upsert pdm: statement timeout")
	})
})

describe("createStepCounts", () => {
	test("acumula processadas e gravadas e devolve o total a cada página", () => {
		const counts = createStepCounts()
		expect(counts.add(500, 3)).toEqual({ processed: 500, written: 3 })
		expect(counts.add(0, 0)).toEqual({ processed: 500, written: 3 })
		expect(counts.add(120, 0)).toEqual({ processed: 620, written: 3 })
		expect({ processed: counts.processed, written: counts.written }).toEqual({ processed: 620, written: 3 })
	})
})
