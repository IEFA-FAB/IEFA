import { describe, expect, test } from "bun:test"
import { clampLimit, clampOffset, commaListToArray, dayBounds, parseOrderParam, parseSortableOrderParam, toInt } from "./query-params.ts"

describe("clampLimit", () => {
	test("usa o padrão quando o parâmetro está ausente ou não é número", () => {
		expect(clampLimit(null, 50, 200)).toBe(50)
		expect(clampLimit("", 50, 200)).toBe(50)
		expect(clampLimit("abc", 50, 200)).toBe(50)
	})

	test("corta no teto — é o que impede a rota pública de virar dump do banco", () => {
		expect(clampLimit("201", 50, 200)).toBe(200)
		expect(clampLimit("999999999", 50, 200)).toBe(200)
	})

	test("nunca desce abaixo de 1", () => {
		expect(clampLimit("0", 50, 200)).toBe(1)
		expect(clampLimit("-10", 50, 200)).toBe(1)
	})

	test("respeita valor válido dentro da faixa", () => {
		expect(clampLimit("37", 50, 200)).toBe(37)
	})
})

describe("clampOffset", () => {
	test("ausente ou inválido vira 0", () => {
		expect(clampOffset(null)).toBe(0)
		expect(clampOffset("abc")).toBe(0)
	})

	test("negativo vira 0, positivo passa", () => {
		expect(clampOffset("-5")).toBe(0)
		expect(clampOffset("120")).toBe(120)
	})
})

describe("toInt", () => {
	test("devolve o default quando não há número", () => {
		expect(toInt(undefined, 7)).toBe(7)
		expect(toInt("x", 7)).toBe(7)
		expect(toInt("12", 7)).toBe(12)
	})
})

describe("commaListToArray", () => {
	test("separa, apara e descarta vazio", () => {
		expect(commaListToArray("a, b ,,c")).toEqual(["a", "b", "c"])
		expect(commaListToArray("")).toEqual([])
	})
})

describe("parseOrderParam", () => {
	test("ascendente por padrão, desc explícito", () => {
		expect(parseOrderParam("description")).toEqual([{ column: "description", ascending: true }])
		expect(parseOrderParam("created_at:desc")).toEqual([{ column: "created_at", ascending: false }])
	})

	test("aceita múltiplas colunas e ignora vazio", () => {
		expect(parseOrderParam("description:asc,created_at:desc")).toEqual([
			{ column: "description", ascending: true },
			{ column: "created_at", ascending: false },
		])
		expect(parseOrderParam(null)).toEqual([])
	})
})

describe("parseSortableOrderParam", () => {
	const sortable = ["description", "created_at"] as const

	test("aceita coluna da allow-list", () => {
		const parsed = parseSortableOrderParam("created_at:desc", sortable)
		expect(parsed.ok).toBe(true)
		if (parsed.ok) expect(parsed.order).toEqual([{ column: "created_at", ascending: false }])
	})

	test("rejeita coluna fora da allow-list — inclusive coluna existente mas não publicada", () => {
		expect(parseSortableOrderParam("legacy_id", sortable).ok).toBe(false)
		expect(parseSortableOrderParam("deleted_at:desc", sortable).ok).toBe(false)
		expect(parseSortableOrderParam("description,legacy_id", sortable).ok).toBe(false)
	})

	test("parâmetro ausente é ordem vazia, não erro", () => {
		const parsed = parseSortableOrderParam(null, sortable)
		expect(parsed.ok).toBe(true)
		if (parsed.ok) expect(parsed.order).toEqual([])
	})
})

describe("dayBounds", () => {
	test("cobre o dia inteiro", () => {
		expect(dayBounds("2026-03-01")).toEqual({ start: "2026-03-01T00:00:00.000", end: "2026-03-01T23:59:59.999" })
	})
})
