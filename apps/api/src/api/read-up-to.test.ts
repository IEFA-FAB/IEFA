import { describe, expect, test } from "bun:test"
import { readUpTo } from "./read-up-to.ts"

/**
 * Tabela falsa com o corte do PostgREST: `range` devolve no máximo o pedido E no máximo
 * `maxRows` — o teto da API, que pode ser menor que a página pedida.
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

describe("readUpTo", () => {
	test("passa do teto de 1000 até o limit pedido — o `.limit(100000)` voltava 1000 calado", async () => {
		const { page, calls } = table(2500, 1000)
		const { rows } = await readUpTo(100000, page, 1000)
		expect(rows).toHaveLength(2500)
		expect(calls).toEqual([
			[0, 999],
			[1000, 1999],
			[2000, 2999],
			[2500, 3499],
		])
	})

	test("para no limit, sem pedir além dele", async () => {
		const { page, calls } = table(5000)
		const { rows } = await readUpTo(1500, page, 1000)
		expect(rows).toHaveLength(1500)
		expect(rows?.at(-1)).toEqual({ id: 1499 })
		expect(calls).toEqual([
			[0, 999],
			[1000, 1499],
		])
	})

	test("max_rows menor que a página não corta", async () => {
		const { page } = table(2300, 500)
		expect((await readUpTo(100000, page, 1000)).rows).toHaveLength(2300)
	})

	test("limit menor que uma página faz uma requisição só", async () => {
		const { page, calls } = table(50)
		expect((await readUpTo(10, page, 1000)).rows).toHaveLength(10)
		expect(calls).toEqual([[0, 9]])
	})

	test("erro em qualquer página devolve o erro, nunca a lista parcial", async () => {
		let n = 0
		const page = async () => {
			n += 1
			return n === 2 ? { data: null, error: { message: "boom" } } : { data: Array(10).fill({}), error: null }
		}
		expect(await readUpTo(100, page, 10)).toEqual({ rows: null, error: { message: "boom" } })
	})
})
