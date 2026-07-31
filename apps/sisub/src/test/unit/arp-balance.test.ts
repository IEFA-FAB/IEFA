import { describe, expect, it } from "vitest"
import { aggregateLocalCommitments, resolveSaldoOficial } from "@/lib/arp-balance"

describe("aggregateLocalCommitments", () => {
	it("soma quantidade e valor apenas dos empenhos ativos", () => {
		const result = aggregateLocalCommitments([
			{ arp_item_id: "a", status: "ativo", quantidade_empenhada: 10, valor_total: 100 },
			{ arp_item_id: "a", status: "ativo", quantidade_empenhada: 5, valor_total: 50 },
			{ arp_item_id: "a", status: "anulado", quantidade_empenhada: 999, valor_total: 9999 },
		])
		expect(result.get("a")).toEqual({ quantidade: 15, valorTotal: 150, count: 2 })
	})

	it("agrupa por item da ARP", () => {
		const result = aggregateLocalCommitments([
			{ arp_item_id: "a", status: "ativo", quantidade_empenhada: 1, valor_total: 10 },
			{ arp_item_id: "b", status: "ativo", quantidade_empenhada: 2, valor_total: 20 },
		])
		expect(result.get("a")?.quantidade).toBe(1)
		expect(result.get("b")?.quantidade).toBe(2)
	})

	it("anulação recompõe o comprometimento local: item só com anulados fica de fora", () => {
		const result = aggregateLocalCommitments([{ arp_item_id: "a", status: "anulado", quantidade_empenhada: 10, valor_total: 100 }])
		expect(result.has("a")).toBe(false)
	})

	it("tolera numéricos vindos como string (PostgREST numeric)", () => {
		const result = aggregateLocalCommitments([{ arp_item_id: "a", status: "ativo", quantidade_empenhada: "12.5", valor_total: "125.75" }])
		expect(result.get("a")).toEqual({ quantidade: 12.5, valorTotal: 125.75, count: 1 })
	})

	it("lista vazia produz mapa vazio", () => {
		expect(aggregateLocalCommitments([]).size).toBe(0)
	})
})

describe("resolveSaldoOficial", () => {
	it("usa saldo_empenho do snapshot quando presente", () => {
		expect(resolveSaldoOficial({ quantidade_homologada: 100, quantidade_empenhada: 30, saldo_empenho: 60 })).toBe(60)
	})

	it("saldo_empenho igual a zero é zero, não fallback", () => {
		expect(resolveSaldoOficial({ quantidade_homologada: 100, quantidade_empenhada: 30, saldo_empenho: 0 })).toBe(0)
	})

	it("deriva homologada − empenhada quando a API não trouxe o saldo", () => {
		expect(resolveSaldoOficial({ quantidade_homologada: 100, quantidade_empenhada: 30, saldo_empenho: null })).toBe(70)
	})

	it("snapshot vazio resulta em zero (nunca mistura empenhos locais)", () => {
		expect(resolveSaldoOficial({ quantidade_homologada: null, quantidade_empenhada: null, saldo_empenho: null })).toBe(0)
	})
})
