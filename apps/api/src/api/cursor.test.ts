import { describe, expect, test } from "bun:test"
import { type CursorValue, decodeCursor, encodeCursor, keysetFilter, MAX_CURSOR_LENGTH } from "./cursor.ts"
import type { OrderRule } from "./query-params.ts"

const ARRANCHAMENTO_ORDER: OrderRule[] = [
	{ column: "date", ascending: false },
	{ column: "mess_hall_id", ascending: true },
	{ column: "meal", ascending: true },
	{ column: "user_id", ascending: true },
]

describe("cursor", () => {
	test("ida e volta: os valores da última linha voltam iguais", () => {
		const values = ["2026-10-01", 3, "almoco", "6f1c2a8e-0000-4000-8000-000000000001"]
		const raw = encodeCursor(ARRANCHAMENTO_ORDER, values)
		expect(raw).toMatch(/^[A-Za-z0-9_-]+$/)
		expect(decodeCursor(raw, ARRANCHAMENTO_ORDER)).toEqual({ ok: true, values })
	})

	test("cursor de outra ordenação é recusado, não aplicado à ordem errada", () => {
		const raw = encodeCursor([{ column: "id", ascending: true }], [10])
		expect(decodeCursor(raw, [{ column: "id", ascending: false }])).toEqual({ ok: false, reason: "order-mismatch" })
		expect(
			decodeCursor(raw, [
				{ column: "created_at", ascending: true },
				{ column: "id", ascending: true },
			])
		).toEqual({ ok: false, reason: "order-mismatch" })
	})

	test("cursor malformado ou forjado fora do formato é recusado", () => {
		const order: OrderRule[] = [{ column: "id", ascending: true }]
		expect(decodeCursor("não-é-base64!", order)).toEqual({ ok: false, reason: "malformed" })
		expect(decodeCursor(Buffer.from("{").toString("base64url"), order)).toEqual({ ok: false, reason: "malformed" })
		// valor de tipo que nenhuma coluna tem
		expect(decodeCursor(Buffer.from(JSON.stringify({ o: [["id", "a"]], v: [{ x: 1 }] })).toString("base64url"), order)).toEqual({
			ok: false,
			reason: "malformed",
		})
		// coluna com sintaxe de filtro embutida
		expect(decodeCursor(Buffer.from(JSON.stringify({ o: [["id.gt.0", "a"]], v: [1] })).toString("base64url"), order)).toEqual({
			ok: false,
			reason: "malformed",
		})
		// ordem e valores de tamanhos diferentes
		expect(decodeCursor(Buffer.from(JSON.stringify({ o: [["id", "a"]], v: [] })).toString("base64url"), order)).toEqual({ ok: false, reason: "malformed" })
		expect(decodeCursor("A".repeat(MAX_CURSOR_LENGTH + 1), order)).toEqual({ ok: false, reason: "malformed" })
	})
})

describe("keysetFilter", () => {
	test("coluna única ascendente: depois do valor", () => {
		expect(keysetFilter([{ column: "id", ascending: true }], [42])).toBe('or(id.gt."42",id.is.null)')
	})

	test("ordem composta: (c1 depois) OU (c1 igual E c2 depois) OU …, na direção de cada coluna", () => {
		expect(keysetFilter(ARRANCHAMENTO_ORDER, ["2026-10-01", 3, "almoco", "u1"])).toBe(
			[
				'date.lt."2026-10-01"',
				'and(date.eq."2026-10-01",or(mess_hall_id.gt."3",mess_hall_id.is.null))',
				'and(date.eq."2026-10-01",mess_hall_id.eq."3",or(meal.gt."almoco",meal.is.null))',
				'and(date.eq."2026-10-01",mess_hall_id.eq."3",meal.eq."almoco",or(user_id.gt."u1",user_id.is.null))',
			].join(",")
		)
	})

	test("nulos onde o Postgres os põe: fim da ascendente, começo da descendente", () => {
		const order: OrderRule[] = [
			{ column: "sgOrg", ascending: true },
			{ column: "id", ascending: true },
		]
		// asc com nulo: só os nulos com chave maior vêm depois
		expect(keysetFilter(order, [null, 7])).toBe('and(sgOrg.is.null,or(id.gt."7",id.is.null))')
		// desc com nulo: todos os não nulos vêm depois
		expect(keysetFilter([{ column: "dataAtualizacao", ascending: false }, ...order.slice(1)], [null, 7])).toBe(
			'dataAtualizacao.not.is.null,and(dataAtualizacao.is.null,or(id.gt."7",id.is.null))'
		)
	})

	test("valor com vírgula, parêntese, ponto e aspas vira literal, não sintaxe de filtro", () => {
		const value: CursorValue = 'a,b).c"d\\e'
		expect(keysetFilter([{ column: "question", ascending: true }], [value])).toBe('or(question.gt."a,b).c\\"d\\\\e",question.is.null)')
	})
})
