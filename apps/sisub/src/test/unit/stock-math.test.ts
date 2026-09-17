/**
 * Unit — matemática pura do estoque: alocação FEFO e suficiência.
 *
 * As datas dos casos são fixas e a referência é passada explicitamente
 * (`referenceDate`): sem isso o teste vira bomba-relógio — passava em 2026 e
 * quebrava quando o "2026-08-01" dos exemplos vencesse de verdade.
 */
import { allocateFefo, brasiliaToday, sortFefo, sufficiency } from "@iefa/sisub-domain"
import { describe, expect, test } from "vitest"

const REF = "2026-07-01"
const lot = (lotId: string, balance: number, expiryDate: string | null, receivedAt?: string) => ({ lotId, balance, expiryDate, receivedAt })

describe("allocateFefo", () => {
	test("consome primeiro o lote que vence antes", () => {
		const result = allocateFefo([lot("b", 100, "2026-12-01"), lot("a", 100, "2026-08-01")], 30, { referenceDate: REF })
		expect(result.allocations).toEqual([{ lotId: "a", quantity: 30 }])
		expect(result.shortfall).toBe(0)
	})

	test("atravessa múltiplos lotes quando o primeiro não basta", () => {
		const result = allocateFefo([lot("a", 20, "2026-08-01"), lot("b", 100, "2026-12-01")], 30, { referenceDate: REF })
		expect(result.allocations).toEqual([
			{ lotId: "a", quantity: 20 },
			{ lotId: "b", quantity: 10 },
		])
	})

	test("lote VENCIDO não é alocado — consumir vencido é decisão explícita", () => {
		const result = allocateFefo([lot("vencido", 50, "2026-06-30"), lot("valido", 50, "2026-09-01")], 10, { referenceDate: REF })
		expect(result.allocations).toEqual([{ lotId: "valido", quantity: 10 }])
	})

	test("lote que vence HOJE ainda é alocado", () => {
		const result = allocateFefo([lot("hoje", 50, REF), lot("depois", 50, "2026-09-01")], 10, { referenceDate: REF })
		expect(result.allocations).toEqual([{ lotId: "hoje", quantity: 10 }])
	})

	test("vencido de sobra não evita shortfall", () => {
		const result = allocateFefo([lot("vencido", 100, "2026-06-01")], 10, { referenceDate: REF })
		expect(result.allocations).toEqual([])
		expect(result.shortfall).toBe(10)
	})

	test("lote sem validade entra pela data de entrada (FIFO), não no fim da fila", () => {
		const result = allocateFefo([lot("novo", 100, null, "2026-06-20"), lot("antigo", 5, null, "2026-06-02")], 10, { referenceDate: REF })
		expect(result.allocations).toEqual([
			{ lotId: "antigo", quantity: 5 },
			{ lotId: "novo", quantity: 5 },
		])
	})

	test("sem validade e sem data de entrada sai por último", () => {
		const result = allocateFefo([lot("orfao", 100, null), lot("com", 5, "2026-09-01")], 10, { referenceDate: REF })
		expect(result.allocations).toEqual([
			{ lotId: "com", quantity: 5 },
			{ lotId: "orfao", quantity: 5 },
		])
	})

	test("lote excluído (quarentena) não é alocado", () => {
		const result = allocateFefo([lot("quarentena", 100, "2026-08-01"), lot("ok", 100, "2026-09-01")], 10, {
			referenceDate: REF,
			excludeLotIds: ["quarentena"],
		})
		expect(result.allocations).toEqual([{ lotId: "ok", quantity: 10 }])
	})

	test("estoque insuficiente reporta shortfall", () => {
		const result = allocateFefo([lot("a", 8, "2026-08-01")], 10, { referenceDate: REF })
		expect(result.allocations).toEqual([{ lotId: "a", quantity: 8 }])
		expect(result.shortfall).toBe(2)
	})

	test("lotes zerados/negativos são ignorados", () => {
		const result = allocateFefo([lot("zero", 0, "2026-08-01"), lot("neg", -5, "2026-08-02"), lot("ok", 10, "2026-09-01")], 4, {
			referenceDate: REF,
		})
		expect(result.allocations).toEqual([{ lotId: "ok", quantity: 4 }])
	})

	test("quantidade não-positiva não aloca nada", () => {
		expect(allocateFefo([lot("a", 10, null)], 0)).toEqual({ allocations: [], shortfall: 0 })
		expect(allocateFefo([lot("a", 10, null)], -3)).toEqual({ allocations: [], shortfall: 0 })
	})

	test("sem referência explícita usa hoje em Brasília", () => {
		const ontem = new Date(Date.now() - 86_400_000).toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 10)
		const result = allocateFefo([lot("vencido-ontem", 100, ontem), lot("valido", 100, "2099-01-01")], 5)
		expect(result.allocations).toEqual([{ lotId: "valido", quantity: 5 }])
	})
})

describe("brasiliaToday", () => {
	test("converte o instante UTC para a data civil de Brasília", () => {
		// 01/09 00:30 UTC ainda é 31/08 em Brasília (UTC-3)
		expect(brasiliaToday(new Date("2026-09-01T00:30:00Z"))).toBe("2026-08-31")
	})
})

describe("sortFefo", () => {
	test("ordena por validade asc com nulls no fim, estável", () => {
		const sorted = sortFefo([{ expiryDate: null }, { expiryDate: "2026-09-01" }, { expiryDate: "2026-08-01" }])
		expect(sorted.map((l) => l.expiryDate)).toEqual(["2026-08-01", "2026-09-01", null])
	})

	test("lote sem validade usa a data de entrada na ordenação", () => {
		const sorted = sortFefo([
			{ expiryDate: null, receivedAt: "2026-05-01T10:00:00Z" },
			{ expiryDate: "2026-06-01", receivedAt: null },
			{ expiryDate: null, receivedAt: "2026-04-01T10:00:00Z" },
		])
		expect(sorted.map((l) => l.expiryDate ?? l.receivedAt)).toEqual(["2026-04-01T10:00:00Z", "2026-05-01T10:00:00Z", "2026-06-01"])
	})
})

describe("sufficiency", () => {
	test("conta suficientes e lista faltantes", () => {
		const result = sufficiency([
			{ itemKey: "arroz", required: 10, available: 50 },
			{ itemKey: "feijao", required: 20, available: 5 },
		])
		expect(result.total).toBe(2)
		expect(result.sufficient).toBe(1)
		expect(result.missing[0]?.itemKey).toBe("feijao")
	})
})
