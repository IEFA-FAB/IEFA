import { describe, expect, test } from "vitest"
import { parseComprasJson } from "./compras-json"

describe("parseComprasJson", () => {
	test("preserva idCompra acima de MAX_SAFE_INTEGER como string", () => {
		const raw = '{"resultado":[{"idCompra":98776905900162026,"idItemCompra":12194125}]}'
		const parsed = parseComprasJson<{ resultado: Array<{ idCompra: string; idItemCompra: number }> }>(raw)
		expect(parsed.resultado[0].idCompra).toBe("98776905900162026")
		// Prova do problema que a normalização evita: o parse direto corrompe o id.
		expect(String(JSON.parse(raw).resultado[0].idCompra)).toBe("98776905900162030")
	})

	test("é idempotente quando a API já devolve idCompra entre aspas", () => {
		const parsed = parseComprasJson<{ idCompra: string }>('{"idCompra":"98776905900162026"}')
		expect(parsed.idCompra).toBe("98776905900162026")
	})

	test("normaliza todas as ocorrências e tolera espaço após os dois-pontos", () => {
		const parsed = parseComprasJson<Array<{ idCompra: string }>>('[{"idCompra": 1},{"idCompra":2}]')
		expect(parsed.map((r) => r.idCompra)).toEqual(["1", "2"])
	})

	test("não mexe em outros campos numéricos", () => {
		const parsed = parseComprasJson<{ idItemCompra: number; precoUnitario: number }>('{"idItemCompra":12194125,"precoUnitario":16.79}')
		expect(parsed.idItemCompra).toBe(12194125)
		expect(parsed.precoUnitario).toBe(16.79)
	})
})
