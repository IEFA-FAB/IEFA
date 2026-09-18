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

	test("'usar primeiro' fura a fila, mesmo com validade maior", () => {
		// o lote já aberto tem que sair antes do fechado de validade menor —
		// é a única alavanca que o operador tem sobre a fila, e o banco ordena
		// por `use_first desc` ANTES da validade
		const sorted = sortFefo([
			{ lotId: "b", expiryDate: "2026-08-01", useFirst: false },
			{ lotId: "a", expiryDate: "2026-12-01", useFirst: true },
			{ lotId: "c", expiryDate: "2026-09-01", useFirst: false },
		])
		expect(sorted.map((l) => l.lotId)).toEqual(["a", "b", "c"])
	})

	test("empate de validade: a entrada mais antiga sai primeiro, mesmo com id maior", () => {
		// o arroz que chegou antes sai antes; sem isto, lotes de mesma validade
		// saíam em ordem de UUID
		const sorted = sortFefo([
			{ lotId: "a", expiryDate: "2026-08-01", receivedAt: "2026-07-10T10:00:00Z" },
			{ lotId: "z", expiryDate: "2026-08-01", receivedAt: "2026-07-01T10:00:00Z" },
		])
		expect(sorted.map((l) => l.lotId)).toEqual(["z", "a"])
	})

	test("empate de validade e de entrada desempata pelo lote, não pela ordem de chegada", () => {
		// a ordem em que as linhas voltam do PostgREST não é garantida: sem o
		// desempate a prévia escolhia um lote e a baixa outro, conforme o plano
		const lots = [
			{ lotId: "z", expiryDate: "2026-08-01" },
			{ lotId: "a", expiryDate: "2026-08-01" },
			{ lotId: "m", expiryDate: "2026-08-01" },
		]
		expect(sortFefo(lots).map((l) => l.lotId)).toEqual(["a", "m", "z"])
		expect(sortFefo([...lots].reverse()).map((l) => l.lotId)).toEqual(["a", "m", "z"])
	})

	test("a entrada é lida na data civil de Brasília", () => {
		// 18/09 00:30 UTC é 17/09 em Brasília: o lote recebido nessa hora entra
		// na fila ANTES do que venceu no dia 18, não depois
		const sorted = sortFefo([
			{ lotId: "vence-18", expiryDate: "2026-09-18" },
			{ lotId: "entrou-17-a-noite", expiryDate: null, receivedAt: "2026-09-18T00:30:00Z" },
		])
		expect(sorted.map((l) => l.lotId)).toEqual(["entrou-17-a-noite", "vence-18"])
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
