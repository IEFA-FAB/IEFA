import { describe, expect, test } from "bun:test"
import {
	clampLimit,
	clampOffset,
	commaListToArray,
	dayBounds,
	escapeLikePattern,
	MAX_FILTER_VALUES,
	MAX_OFFSET,
	parseListFilter,
	parseOrderParam,
	parseSortableOrderParam,
	toInt,
} from "./query-params.ts"

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

describe("parseSortableOrderParam — teto de regras", () => {
	const sortable = ["description", "created_at"] as const

	test("mais regras que o teto é rejeitado, mesmo com todas as colunas na allow-list", () => {
		const parsed = parseSortableOrderParam("description,created_at,description,created_at", sortable)
		expect(parsed.ok).toBe(false)
		if (!parsed.ok) expect(parsed.reason).toBe("too-many-rules")
	})

	test("o motivo distingue coluna desconhecida de lista longa demais", () => {
		const unknown = parseSortableOrderParam("legacy_id", sortable)
		expect(unknown.ok).toBe(false)
		if (!unknown.ok) expect(unknown.reason).toBe("unknown-column")
	})
})

describe("clampOffset", () => {
	test("offset negativo volta para a primeira página", () => {
		expect(clampOffset("-5")).toBe(0)
	})

	test("offset além do teto é limitado — acima de 2^53 o range perde precisão e a janela sai errada", () => {
		expect(clampOffset("99999999999999999999")).toBe(MAX_OFFSET)
		// Sem o clamp: 1e20 + 49 === 1e20, então `to - from + 1` daria 1 em vez do limite pedido.
		expect(MAX_OFFSET + 49 - MAX_OFFSET + 1).toBe(50)
	})

	test("valor ausente ou inválido é a primeira página", () => {
		expect(clampOffset(null)).toBe(0)
		expect(clampOffset("abc")).toBe(0)
	})
})

describe("escapeLikePattern", () => {
	test("torna literais os curingas que o SQL interpreta", () => {
		expect(escapeLikePattern("100%")).toBe("100\\%")
		expect(escapeLikePattern("A_1")).toBe("A\\_1")
		expect(escapeLikePattern("a\\b")).toBe("a\\\\b")
	})

	test("texto comum passa intacto", () => {
		expect(escapeLikePattern("arroz polido tipo 1")).toBe("arroz polido tipo 1")
	})
})

describe("parseListFilter", () => {
	test("ausente e vazio são 'não filtra', não erro", () => {
		expect(parseListFilter(null)).toBeNull()
		expect(parseListFilter("")).toBeNull()
		expect(parseListFilter(" , , ")).toBeNull()
	})

	test("lista dentro do teto passa aparada", () => {
		expect(parseListFilter("KG, L ,UN")).toEqual({ ok: true, values: ["KG", "L", "UN"] })
	})

	test("lista acima do teto é rejeitada", () => {
		const many = Array.from({ length: MAX_FILTER_VALUES + 1 }, (_, i) => `v${i}`).join(",")
		expect(parseListFilter(many)).toEqual({ ok: false })
		const atLimit = Array.from({ length: MAX_FILTER_VALUES }, (_, i) => `v${i}`).join(",")
		expect(parseListFilter(atLimit)?.ok).toBe(true)
	})
})

describe("dayBounds", () => {
	test("cobre o dia inteiro", () => {
		expect(dayBounds("2026-03-01")).toEqual({ start: "2026-03-01T00:00:00.000", end: "2026-03-01T23:59:59.999" })
	})
})
