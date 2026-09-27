import { describe, expect, it } from "vitest"
import { aggregateLocalCommitments, resolveSaldoOficial } from "@/lib/arp-balance"

describe("aggregateLocalCommitments", () => {
	it("soma quantidade e valor apenas dos itens de NEs ativas", () => {
		const result = aggregateLocalCommitments([
			{ empenho_id: "ne1", arp_item_id: "a", status: "ativo", quantity: 10, value: 100 },
			{ empenho_id: "ne2", arp_item_id: "a", status: "ativo", quantity: 5, value: 50 },
			{ empenho_id: "ne3", arp_item_id: "a", status: "anulado", quantity: 999, value: 9999 },
		])
		expect(result.get("a")).toEqual({ quantidade: 15, valorTotal: 150, count: 2 })
	})

	it("agrupa por item da ARP: a NE com vários itens conta em cada um", () => {
		const result = aggregateLocalCommitments([
			{ empenho_id: "ne1", arp_item_id: "a", status: "ativo", quantity: 1, value: 10 },
			{ empenho_id: "ne1", arp_item_id: "b", status: "ativo", quantity: 2, value: 20 },
		])
		expect(result.get("a")).toEqual({ quantidade: 1, valorTotal: 10, count: 1 })
		expect(result.get("b")).toEqual({ quantidade: 2, valorTotal: 20, count: 1 })
	})

	it("dois itens da mesma NE no mesmo item de ARP somam, e a NE conta uma vez", () => {
		const result = aggregateLocalCommitments([
			{ empenho_id: "ne1", arp_item_id: "a", status: "ativo", quantity: 3, value: 30 },
			{ empenho_id: "ne1", arp_item_id: "a", status: "ativo", quantity: 4, value: 40 },
		])
		expect(result.get("a")).toEqual({ quantidade: 7, valorTotal: 70, count: 1 })
	})

	it("item só por valor (NE global) soma o valor e não a quantidade", () => {
		const result = aggregateLocalCommitments([{ empenho_id: "ne1", arp_item_id: "a", status: "ativo", quantity: null, value: 500 }])
		expect(result.get("a")).toEqual({ quantidade: 0, valorTotal: 500, count: 1 })
	})

	it("anulação recompõe o comprometimento local: item só com anulados fica de fora", () => {
		const result = aggregateLocalCommitments([{ empenho_id: "ne1", arp_item_id: "a", status: "anulado", quantity: 10, value: 100 }])
		expect(result.has("a")).toBe(false)
	})

	it("tolera numéricos vindos como string (PostgREST numeric)", () => {
		const result = aggregateLocalCommitments([{ empenho_id: "ne1", arp_item_id: "a", status: "ativo", quantity: "12.5", value: "125.75" }])
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
