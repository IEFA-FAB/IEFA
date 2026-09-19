import { describe, expect, test } from "vitest"
import { supplyOrderLinkProblems } from "@/lib/supply-order-gate"

describe("supplyOrderLinkProblems — OF só contra empenho da própria unidade compradora", () => {
	const empenho = { unitId: 7, status: "ativo", arpItemId: "arp-1" }
	const base = { kitchenPurchaseUnitId: 7, empenho, itemArpItemIds: ["arp-1"] }

	test("vínculo certo passa", () => {
		expect(supplyOrderLinkProblems(base)).toEqual([])
		// item sem ARP (empenho que não é de ata) não cita item alheio
		expect(supplyOrderLinkProblems({ ...base, itemArpItemIds: [undefined, null] })).toEqual([])
	})

	test("empenho de outra OM é recusado", () => {
		expect(supplyOrderLinkProblems({ ...base, empenho: { ...empenho, unitId: 8 } }).join()).toMatch(/unidade compradora/)
	})

	test("cozinha sem unidade compradora não emite contra empenho nenhum", () => {
		expect(supplyOrderLinkProblems({ ...base, kitchenPurchaseUnitId: null }).join()).toMatch(/unidade compradora/)
		expect(supplyOrderLinkProblems({ ...base, empenho: { ...empenho, unitId: null } }).join()).toMatch(/unidade compradora/)
	})

	test("empenho anulado é recusado", () => {
		expect(supplyOrderLinkProblems({ ...base, empenho: { ...empenho, status: "anulado" } }).join()).toMatch(/anulado/)
	})

	test("item de ARP diferente do empenhado é recusado", () => {
		expect(supplyOrderLinkProblems({ ...base, itemArpItemIds: ["arp-1", "arp-2"] }).join()).toMatch(/não cobre/)
		expect(supplyOrderLinkProblems({ ...base, empenho: { ...empenho, arpItemId: null } }).join()).toMatch(/não cobre/)
	})
})
