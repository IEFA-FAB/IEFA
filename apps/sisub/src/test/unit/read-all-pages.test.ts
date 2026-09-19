import { describe, expect, test } from "vitest"
import { readAllPages, readAllPagesIn } from "@/lib/read-all-pages"

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
