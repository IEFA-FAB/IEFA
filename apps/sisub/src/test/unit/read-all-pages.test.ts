import { describe, expect, test } from "vitest"
import { readAllPages, readAllPagesByKey, readAllPagesIn } from "@/lib/read-all-pages"

/**
 * Tabela falsa com o corte do PostgREST: `range` devolve no máximo o pedido E
 * no máximo `maxRows` — o teto da API, que pode ser menor que a página pedida.
 */
function table(total: number, maxRows = Number.POSITIVE_INFINITY) {
	const rows = Array.from({ length: total }, (_, i) => ({ id: i }))
	const calls: Array<[number, number]> = []
	const page = async (from: number, to: number) => {
		calls.push([from, to])
		return { data: rows.slice(from, Math.min(to + 1, from + maxRows)), error: null }
	}
	return { page, calls }
}

describe("readAllPages", () => {
	test("junta as páginas além do teto — é o que a consulta crua cortava calada", async () => {
		const { page, calls } = table(2500)
		const rows = await readAllPages<{ id: number }>("linhas", page, 1000)
		expect(rows).toHaveLength(2500)
		expect(calls).toEqual([
			[0, 999],
			[1000, 1999],
			[2000, 2999],
			[2500, 3499],
		])
	})

	test("para só na página vazia", async () => {
		const { page, calls } = table(2000)
		expect(await readAllPages("linhas", page, 1000)).toHaveLength(2000)
		expect(calls).toHaveLength(3)
	})

	test("max_rows da API menor que a página pedida não corta", async () => {
		// com o critério "página menor que o pedido", isto voltava 500 linhas
		const { page } = table(2300, 500)
		expect(await readAllPages("linhas", page, 1000)).toHaveLength(2300)
	})

	test("erro em qualquer página lança, em vez de devolver a lista parcial", async () => {
		let n = 0
		const page = async () => {
			n += 1
			return n === 2 ? { data: null, error: { message: "boom" } } : { data: Array(10).fill({}), error: null }
		}
		await expect(readAllPages("itens", page, 10)).rejects.toThrow("Erro ao carregar itens: boom")
	})
})

describe("readAllPagesByKey", () => {
	/** Tabela ordenada por `id` com o teto `maxRows` da API; `.gt(id, after)` + `.limit(size)`. */
	function keyedTable(ids: number[], maxRows = Number.POSITIVE_INFINITY) {
		const rows = ids.map((id) => ({ id }))
		const calls: Array<number | null> = []
		const page = async (after: number | null, size: number) => {
			calls.push(after)
			const sorted = [...rows].sort((a, b) => a.id - b.id)
			return { data: sorted.filter((row) => after === null || row.id > after).slice(0, Math.min(size, maxRows)), error: null }
		}
		return { rows, page, calls }
	}

	test("junta as páginas pela chave, além do teto", async () => {
		const { page, calls } = keyedTable(
			Array.from({ length: 2500 }, (_, i) => i + 1),
			1000
		)
		const rows = await readAllPagesByKey("linhas", page, (row) => row.id, 1000)
		expect(rows).toHaveLength(2500)
		expect(calls).toEqual([null, 1000, 2000, 2500])
	})

	test("linha inserida antes da fronteira no meio da leitura não duplica a da fronteira", async () => {
		// por offset, a inserção empurrava a linha 1000 para a página 2 e ela entrava duas vezes
		const table = keyedTable(Array.from({ length: 1500 }, (_, i) => (i + 1) * 10))
		let n = 0
		const page = async (after: number | null, size: number) => {
			n += 1
			if (n === 2) table.rows.push({ id: 5 })
			return table.page(after, size)
		}
		const rows = await readAllPagesByKey("linhas", page, (row) => row.id, 1000)
		expect(rows).toHaveLength(1500)
		expect(new Set(rows.map((row) => row.id)).size).toBe(1500)
	})

	test("deduplica pela chave como defesa", async () => {
		let n = 0
		const page = async () => {
			n += 1
			if (n === 1) return { data: [{ id: 1 }, { id: 2 }], error: null }
			if (n === 2) return { data: [{ id: 2 }, { id: 3 }], error: null }
			return { data: [], error: null }
		}
		const rows = await readAllPagesByKey("linhas", page, (row) => row.id, 2)
		expect(rows.map((row) => row.id)).toEqual([1, 2, 3])
	})

	test("consulta sem o filtro de keyset lança em vez de girar para sempre", async () => {
		const page = async () => ({ data: [{ id: 1 }, { id: 2 }], error: null })
		await expect(readAllPagesByKey("linhas", page, (row) => row.id, 2)).rejects.toThrow("a paginação não avançou")
	})

	test("erro em qualquer página lança", async () => {
		let n = 0
		const page = async () => {
			n += 1
			return n === 2 ? { data: null, error: { message: "boom" } } : { data: [{ id: n }], error: null }
		}
		await expect(readAllPagesByKey("itens", page, (row: { id: number }) => row.id, 1)).rejects.toThrow("Erro ao carregar itens: boom")
	})
})

describe("readAllPagesIn", () => {
	test("fatia os ids, sem repetir, e não consulta com lista vazia", async () => {
		const chunks: string[][] = []
		const page = async (chunk: string[], from: number, to: number) => {
			if (from === 0) chunks.push(chunk)
			return { data: chunk.slice(from, to + 1).map((id) => ({ id })), error: null }
		}
		const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`)
		const rows = await readAllPagesIn<{ id: string }>("notas", [...ids, "id-0"], page, 100)
		expect(rows).toHaveLength(250)
		expect(chunks.map((c) => c.length)).toEqual([100, 100, 50])

		chunks.length = 0
		expect(await readAllPagesIn("notas", [], page)).toEqual([])
		expect(chunks).toHaveLength(0)
	})
})
