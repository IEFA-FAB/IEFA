import { describe, expect, test } from "vitest"
import type { QuantityEstimateAnnexRow } from "@/lib/quantity-estimate-annex"
import type { QuantityEstimateWithDetails } from "@/types/domain/quantity-estimate"
import { buildAnnexSettings, isJustificationMissing, selectAnnexRows, summarizePrices } from "./quantity-estimate-detail"

function estimate(patch: Partial<QuantityEstimateWithDetails> = {}): QuantityEstimateWithDetails {
	return {
		status: "draft",
		validity_months: 12,
		max_increase_percent: 25,
		max_quantity_justification: null,
		min_quote_percent: null,
		items: [],
		meta: { is_stale: false, price_research: { oldest_research_at: null, validity_days: 180, is_expired: false }, snapshot: null },
		...patch,
	} as unknown as QuantityEstimateWithDetails
}

const rowWith = (warnings: string[]) => ({ warnings }) as unknown as QuantityEstimateAnnexRow

describe("buildAnnexSettings", () => {
	test("sem anexo: nulo", () => {
		expect(buildAnnexSettings(undefined)).toBeNull()
		expect(buildAnnexSettings(null)).toBeNull()
	})
	test("cotação mínima ausente vale 100", () => {
		expect(buildAnnexSettings(estimate())).toEqual({ validityMonths: 12, maxIncreasePercent: 25, maxQuantityJustification: null, minQuotePercent: 100 })
		expect(buildAnnexSettings(estimate({ min_quote_percent: "80" as never }))?.minQuotePercent).toBe(80)
		expect(buildAnnexSettings(estimate({ min_quote_percent: 0 as never }))?.minQuotePercent).toBe(0)
	})
})

describe("selectAnnexRows", () => {
	test("sem anexo ou sem configuração: vazio", () => {
		expect(selectAnnexRows(undefined, [], null)).toEqual([])
		expect(selectAnnexRows(estimate(), [], null)).toEqual([])
	})
	test("rascunho calcula na hora (sem necessidades, sem linhas)", () => {
		const qe = estimate()
		expect(selectAnnexRows(qe, [], buildAnnexSettings(qe))).toEqual([])
	})
	test("concluído sem snapshot: vazio (nunca recalcula)", () => {
		const qe = estimate({ status: "completed" as never })
		expect(selectAnnexRows(qe, [], buildAnnexSettings(qe))).toEqual([])
	})
	test("concluído com snapshot vazio: linhas do snapshot", () => {
		const qe = estimate({ status: "completed" as never, meta: { ...estimate().meta, snapshot: { selections: [], components: [] } } })
		expect(selectAnnexRows(qe, [], buildAnnexSettings(qe))).toEqual([])
	})
})

describe("isJustificationMissing", () => {
	const needs = [rowWith(["increase_requires_justification"])]
	test("só no rascunho, com aviso e sem justificativa", () => {
		expect(isJustificationMissing(estimate(), needs)).toBe(true)
		expect(isJustificationMissing(estimate({ max_quantity_justification: "  " }), needs)).toBe(true)
		expect(isJustificationMissing(estimate({ max_quantity_justification: "Porque sim" }), needs)).toBe(false)
		expect(isJustificationMissing(estimate(), [rowWith([])])).toBe(false)
		expect(isJustificationMissing(estimate({ status: "completed" as never }), needs)).toBe(false)
		expect(isJustificationMissing(undefined, needs)).toBe(false)
	})
})

describe("summarizePrices", () => {
	test("sem preço", () => {
		expect(summarizePrices([{ unit_price: null, estimated_quantity: 3 }])).toEqual({ hasPrices: false, grandTotal: 0 })
	})
	test("soma só os itens com preço (preço zero conta como preço)", () => {
		expect(
			summarizePrices([
				{ unit_price: "2.5", estimated_quantity: "4" },
				{ unit_price: null, estimated_quantity: 10 },
				{ unit_price: 0, estimated_quantity: 7 },
			])
		).toEqual({ hasPrices: true, grandTotal: 10 })
	})
	test("soma as linhas fechadas em centavo, com o meio-centavo para cima", () => {
		// 3 × 0,155 = 0,46499… em binário: cada linha aparece como 0,47, e o total acompanha
		expect(
			summarizePrices([
				{ unit_price: 0.155, estimated_quantity: 3 },
				{ unit_price: 0.155, estimated_quantity: 3 },
			]).grandTotal
		).toBe(0.94)
	})
})
