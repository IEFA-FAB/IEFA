import { describe, expect, test } from "vitest"
import {
	buildConservationItems,
	buildInitialLotFields,
	buildLotDrafts,
	describeReceiptHeader,
	describeReceiptSource,
	evaluateLot,
	getLotRowClassName,
	getReceiptPrintTitle,
	isAwaitingDefinitive,
	requiredRange,
	resolveNeedsDesignation,
	tallyConservation,
} from "./receipt-detail"

describe("requiredRange", () => {
	test("sem especificação ou sem faixa: nulos", () => {
		expect(requiredRange(null)).toEqual({ minC: null, maxC: null })
		expect(requiredRange({ storage_temp_min_c: null, storage_temp_max_c: null })).toEqual({ minC: null, maxC: null })
	})
	test("faixa numérica (inclusive zero)", () => {
		expect(requiredRange({ storage_temp_min_c: 0, storage_temp_max_c: "5" as unknown as number })).toEqual({ minC: 0, maxC: 5 })
	})
})

describe("describeReceiptSource", () => {
	test("rótulo da origem, nota e fornecedor quando houver", () => {
		expect(describeReceiptSource({ source: "nfe", delivery_note_number: "123", supplier_name: "ACME" })).toBe("NF-e 123 · ACME")
		expect(describeReceiptSource({ source: "delivery_note", delivery_note_number: null, supplier_name: "ACME" })).toBe("Guia de remessa · ACME")
		expect(describeReceiptSource({ source: "origem-desconhecida", delivery_note_number: null, supplier_name: null })).toBe("origem-desconhecida")
	})
})

describe("isAwaitingDefinitive", () => {
	test("provisório ou divergente ainda não efetivado", () => {
		expect(isAwaitingDefinitive({ status: "provisional", definitive_at: null })).toBe(true)
		expect(isAwaitingDefinitive({ status: "divergent", definitive_at: null })).toBe(true)
		expect(isAwaitingDefinitive({ status: "divergent", definitive_at: "2026-01-01" })).toBe(false)
		expect(isAwaitingDefinitive({ status: "draft", definitive_at: null })).toBe(false)
	})
})

describe("resolveNeedsDesignation", () => {
	test("rascunho sem designado para o provisório", () => {
		expect(resolveNeedsDesignation("draft", false, { provisional: null, definitive: null })).toBe("provisional")
		expect(resolveNeedsDesignation("draft", false, { provisional: "x", definitive: null })).toBeNull()
	})
	test("aguardando definitivo sem designado", () => {
		expect(resolveNeedsDesignation("provisional", true, { provisional: "x", definitive: null })).toBe("definitive")
		expect(resolveNeedsDesignation("provisional", true, { provisional: "x", definitive: "y" })).toBeNull()
		expect(resolveNeedsDesignation("definitive", false, { provisional: null, definitive: null })).toBeNull()
	})
})

describe("describeReceiptHeader e getReceiptPrintTitle", () => {
	test("situação traduzida ou crua; recusa entra com data", () => {
		expect(describeReceiptHeader({ status: "draft", rejected_at: null }, "NF-e 1")).toBe("Situação: Rascunho · NF-e 1")
		expect(describeReceiptHeader({ status: "outro", rejected_at: null }, "x")).toBe("Situação: outro · x")
		expect(describeReceiptHeader({ status: "rejected", rejected_at: "2026-01-02T15:00:00Z" }, "x")).toMatch(/^Situação: Rejeitado · x · Recusado em /)
	})
	test("título do termo", () => {
		expect(getReceiptPrintTitle("rejected")).toBe("Termo de Recusa de Recebimento")
		expect(getReceiptPrintTitle("definitive")).toBe("Termo de Recebimento — Definitivo")
		expect(getReceiptPrintTitle("provisional")).toBe("Termo de Recebimento — Provisório")
	})
})

describe("tallyConservation", () => {
	test("conta por classe e ignora item sem classe", () => {
		expect(
			tallyConservation([
				{ conditioning: { conservation_class: "congelado" as never } },
				{ conditioning: null },
				{ conditioning: { conservation_class: null } },
				{ conditioning: { conservation_class: "congelado" as never } },
			])
		).toEqual({ congelado: 2 })
	})
})

describe("lote em edição", () => {
	test("rascunho de inclusão: vazio com a sugerida", () => {
		expect(buildInitialLotFields(null, "resfriado" as never)).toEqual({
			code: "",
			expiry: "",
			quantity: "",
			temperature: "",
			conservation: "resfriado",
			note: "",
		})
	})
	test("lote existente: valores gravados (temperatura zero incluída)", () => {
		expect(
			buildInitialLotFields(
				{ lot_code: "L1", expiry_date: "2026-12-01", quantity_base: 3, measured_temperature_c: 0, conservation_class: null, divergence_note: null },
				"resfriado" as never
			)
		).toEqual({ code: "L1", expiry: "2026-12-01", quantity: "3", temperature: "0", conservation: "resfriado", note: "" })
	})

	test("evaluateLot: sem divergência usa a faixa; divergência anula a faixa", () => {
		const range = { minC: 0, maxC: 5 }
		expect(evaluateLot(null, null, "", range)).toEqual({ classDivergence: null, measured: null, verdict: "nao_medido", outOfRange: false })
		expect(evaluateLot(null, null, "9", range)).toMatchObject({ measured: 9, verdict: "acima", outOfRange: true })
		expect(evaluateLot(null, null, "3", range)).toMatchObject({ verdict: "dentro", outOfRange: false })
		const divergent = evaluateLot("congelado" as never, "resfriado" as never, "9", range)
		expect(divergent.classDivergence).toBeTruthy()
		expect(divergent.verdict).toBe("sem_faixa")
		expect(divergent.outOfRange).toBe(false)
	})

	test("opções de conservação: 'Não declarada' só sem sugerida", () => {
		expect(buildConservationItems(null)[0]).toEqual({ value: null, label: "Não declarada" })
		expect(buildConservationItems("congelado" as never).some((item) => item.value === null)).toBe(false)
		expect(buildConservationItems(null).length).toBe(buildConservationItems("congelado" as never).length + 1)
	})

	test("classe da linha: fora da faixa vence a divergência", () => {
		expect(getLotRowClassName(true, "x")).toBe("bg-destructive/5")
		expect(getLotRowClassName(false, "x")).toBe("bg-warning/5")
		expect(getLotRowClassName(false, null)).toBeUndefined()
	})

	test("rascunhos para o saldo de lotes", () => {
		expect(
			buildLotDrafts([
				{
					lot_code: "L1",
					expiry_date: null,
					quantity_base: "2" as unknown as number,
					measured_temperature_c: null,
					conservation_class: null,
					divergence_note: null,
				},
				{ lot_code: "L2", expiry_date: "2026-01-01", quantity_base: 1, measured_temperature_c: 4, conservation_class: null, divergence_note: null },
			])
		).toEqual([
			{ lotCode: "L1", expiryDate: null, quantityBase: 2, measuredTemperatureC: null },
			{ lotCode: "L2", expiryDate: "2026-01-01", quantityBase: 1, measuredTemperatureC: 4 },
		])
	})
})
