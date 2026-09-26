import { describe, expect, test } from "vitest"
import { sicafDecision, supplyOrderLinkProblems, supplyOrderLinkUpdateProblem } from "@/lib/supply-order-gate"

describe("vínculo posterior da NE à OF", () => {
	test("zero linhas atualizadas é recusa, não sucesso (outro usuário vinculou antes)", () => {
		expect(supplyOrderLinkUpdateProblem(0)).toMatch(/já recebeu um empenho/)
		expect(supplyOrderLinkUpdateProblem(1)).toBeNull()
	})

	test("SICAF irregular exige reconhecimento explícito também no vínculo", () => {
		const irregular = { status: "irregular", detail: "certidão vencida" }
		const refused = sicafDecision(irregular, "12345678000199", false, "no vínculo da NE")
		expect(refused.ok).toBe(false)
		const acknowledged = sicafDecision(irregular, "12345678000199", true, "no vínculo da NE")
		expect(acknowledged).toEqual({ ok: true, sicafStatus: "irregular: certidão vencida (CNPJ 12345678000199, verificado no vínculo da NE)" })
		expect(sicafDecision({ status: "regular", detail: "ok" }, "12345678000199", false, "na emissão").ok).toBe(true)
	})
})

describe("supplyOrderLinkProblems — OF só contra empenho da própria unidade compradora", () => {
	const empenho = { unitId: 7, status: "ativo", coveredArpItemIds: ["arp-1"] }
	const base = { kitchenPurchaseUnitId: 7, empenho, itemArpItemIds: ["arp-1"] }

	test("vínculo certo passa", () => {
		expect(supplyOrderLinkProblems(base)).toEqual([])
		// item sem ARP (empenho que não é de ata) não cita item alheio
		expect(supplyOrderLinkProblems({ ...base, itemArpItemIds: [undefined, null] })).toEqual([])
	})

	test("NE com três itens da ata cobre os três", () => {
		const multi = { ...empenho, coveredArpItemIds: ["arp-1", "arp-2", "arp-3"] }
		expect(supplyOrderLinkProblems({ ...base, empenho: multi, itemArpItemIds: ["arp-3", "arp-1"] })).toEqual([])
		expect(supplyOrderLinkProblems({ ...base, empenho: multi, itemArpItemIds: ["arp-4"] }).join()).toMatch(/não cobre/)
	})

	test("OF aguardando empenho passa (a pendência é outra)", () => {
		expect(supplyOrderLinkProblems({ ...base, empenho: null })).toEqual([])
	})

	test("empenho de outra OM é recusado", () => {
		expect(supplyOrderLinkProblems({ ...base, empenho: { ...empenho, unitId: 8 } }).join()).toMatch(/unidade compradora/)
	})

	test("cozinha sem unidade compradora não emite contra empenho nenhum", () => {
		expect(supplyOrderLinkProblems({ ...base, kitchenPurchaseUnitId: null }).join()).toMatch(/unidade compradora/)
		expect(supplyOrderLinkProblems({ ...base, kitchenPurchaseUnitId: null, empenho: null }).join()).toMatch(/unidade compradora/)
		expect(supplyOrderLinkProblems({ ...base, empenho: { ...empenho, unitId: null } }).join()).toMatch(/unidade compradora/)
	})

	test("empenho anulado é recusado", () => {
		expect(supplyOrderLinkProblems({ ...base, empenho: { ...empenho, status: "anulado" } }).join()).toMatch(/anulado/)
	})

	test("item de ARP diferente do empenhado é recusado", () => {
		expect(supplyOrderLinkProblems({ ...base, itemArpItemIds: ["arp-1", "arp-2"] }).join()).toMatch(/não cobre/)
		expect(supplyOrderLinkProblems({ ...base, empenho: { ...empenho, coveredArpItemIds: [] } }).join()).toMatch(/não cobre/)
	})
})
