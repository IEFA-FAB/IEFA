/**
 * Caracterização do lote: o julgamento contra a especificação (classe, temperatura, validade) e
 * as linhas gravadas em `goods_receipt_item_lot`.
 */
import { afterEach, describe, expect, test, vi } from "vitest"
import { arrivalDate, assessLot, hasLotInfo, initialInvoiceLot, invoiceLotSource, lotPayload, lotUpdateFromLine, lotWriteError } from "@/lib/receipt-lot"
import type { RequiredRange } from "@/lib/receipt-spec"

const FROZEN: RequiredRange = { minC: -18, maxC: -12, conservationClass: "congelado", minShelfLifeDays: 30 }

afterEach(() => {
	vi.useRealTimers()
})

describe("arrivalDate", () => {
	test("data civil de Brasília da criação do recebimento", () => {
		expect(arrivalDate("2026-10-13T02:00:00Z")).toBe("2026-10-12")
	})
	test("sem criação, hoje em Brasília", () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2026-10-13T01:00:00Z"))
		expect(arrivalDate(null)).toBe("2026-10-12")
		expect(arrivalDate(undefined)).toBe("2026-10-12")
	})
})

describe("assessLot", () => {
	const base = { spec: FROZEN, received: null, measured: null, expiryDate: null, arrival: "2026-10-01", divergenceNote: null }

	test("nada medido nem divergente: sem motivo", () => {
		expect(assessLot(base)).toEqual({ verdict: "nao_medido", outOfRange: false, temperatureReason: null, divergence: null })
	})

	test("dentro da faixa", () => {
		expect(assessLot({ ...base, measured: -15 })).toEqual({ verdict: "dentro", outOfRange: false, temperatureReason: null, divergence: null })
	})

	test("fora da faixa: a frase da temperatura é o motivo e a recusa", () => {
		const result = assessLot({ ...base, measured: -5, divergenceNote: "  caminhão atrasou " })
		expect(result.verdict).toBe("acima")
		expect(result.outOfRange).toBe(true)
		expect(result.temperatureReason).toBe("Temperatura aferida -5 °C fora da faixa exigida (mínima -18 °C, máxima -12 °C).")
		expect(result.divergence).toBe("Temperatura aferida -5 °C fora da faixa exigida (mínima -18 °C, máxima -12 °C). — caminhão atrasou")
	})

	test("chegou em outra classe: a faixa deixa de valer e a temperatura vai na frase da classe", () => {
		const result = assessLot({ ...base, received: "resfriado", measured: 3 })
		expect(result.verdict).toBe("sem_faixa")
		expect(result.outOfRange).toBe(false)
		expect(result.temperatureReason).toBeNull()
		expect(result.divergence).toBe("Recebido resfriado, medido 3 °C (sugerido pela especificação: congelado)")
	})

	test("mesma classe que a sugerida não diverge", () => {
		expect(assessLot({ ...base, received: "congelado", measured: -15 }).divergence).toBeNull()
	})

	test("validade abaixo do mínimo, contra o dia em que a carga chegou", () => {
		const result = assessLot({ ...base, expiryDate: "2026-10-11" })
		expect(result.divergence).toBe("Validade de 10 dias na entrega, abaixo do mínimo de 30 da especificação")
	})

	test("classe, temperatura e validade juntas, na ordem", () => {
		const result = assessLot({ ...base, measured: -5, expiryDate: "2026-10-02", divergenceNote: "nota" })
		expect(result.divergence).toBe(
			"Temperatura aferida -5 °C fora da faixa exigida (mínima -18 °C, máxima -12 °C).; Validade de 1 dia na entrega, abaixo do mínimo de 30 da especificação — nota"
		)
	})

	test("a nota sozinha não é divergência", () => {
		expect(assessLot({ ...base, divergenceNote: "só um comentário" }).divergence).toBeNull()
	})
})

describe("lotPayload", () => {
	const fields = { receiptItemId: "it-1", lotCode: "  L-01 ", quantityBase: 10 }

	test("sem aceite: campos de aceite nulos, opcionais nulos, código aparado", () => {
		expect(lotPayload(fields, { measured: null, received: null, divergence: null, outOfRange: false }, "user-1")).toEqual({
			receipt_item_id: "it-1",
			lot_code: "L-01",
			expiry_date: null,
			quantity_base: 10,
			unit_cost: null,
			measured_temperature_c: null,
			conservation_class: null,
			divergence_note: null,
			divergence_reason: null,
			temperature_ack_by: null,
			temperature_ack_at: null,
		})
	})

	test("fora da faixa: grava quem aceitou e quando", () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2026-10-13T12:00:00Z"))
		const payload = lotPayload(
			{ ...fields, expiryDate: "2026-11-01", unitCost: 0, divergenceNote: "  ok " },
			{ measured: -5, received: "congelado", divergence: "motivo", outOfRange: true },
			"user-1"
		)
		expect(payload).toMatchObject({
			expiry_date: "2026-11-01",
			unit_cost: 0,
			measured_temperature_c: -5,
			conservation_class: "congelado",
			divergence_note: "ok",
			divergence_reason: "motivo",
			temperature_ack_by: "user-1",
			temperature_ack_at: "2026-10-13T12:00:00.000Z",
		})
	})

	test("nota só de espaços vira nula", () => {
		expect(
			lotPayload({ ...fields, divergenceNote: "   " }, { measured: null, received: null, divergence: null, outOfRange: false }, "u").divergence_note
		).toBeNull()
	})
})

describe("lotWriteError", () => {
	test("código repetido na linha tem frase própria, com o código como veio", () => {
		expect(lotWriteError({ code: "23505", message: "duplicate key" }, " L-01").message).toBe('Lote " L-01" já lançado nesta linha')
	})
	test("o resto passa pela mensagem pública do banco", () => {
		expect(lotWriteError({ code: "P0001", message: "Lote recusado pela regra" }, "L-01").message).toMatch(/^Erro ao gravar lote: /)
	})
})

describe("lote inicial da NF-e", () => {
	const source = { row: { purchase_item_id: "pi-1", ingredient_id: "ing-1" }, lotCode: " ABC ", expiryDate: "2026-10-20" }

	test("a linha de origem vem pelo item da nota", () => {
		const byNfeItem = new Map([["nf-1", source]])
		expect(invoiceLotSource("nf-1", byNfeItem)).toBe(source)
		expect(invoiceLotSource(null, byNfeItem)).toBeUndefined()
		expect(invoiceLotSource("nf-x", byNfeItem)).toBeUndefined()
	})

	test("lote e validade da nota, julgada contra o mínimo", () => {
		expect(initialInvoiceLot({ id: "it-1", received_qty_base: 12, unit_cost: 2.5 }, source, { index: 0, today: "2026-10-13" }, 30)).toEqual({
			receipt_item_id: "it-1",
			lot_code: "ABC",
			expiry_date: "2026-10-20",
			quantity_base: 12,
			unit_cost: 2.5,
			divergence_reason: "Validade de 7 dias na entrega, abaixo do mínimo de 30 da especificação",
		})
	})

	test("sem código na nota (ou só espaços), o sintético pela posição", () => {
		expect(initialInvoiceLot({ id: "it-1", received_qty_base: 1, unit_cost: null }, undefined, { index: 2, today: "2026-10-13" }, null)).toEqual({
			receipt_item_id: "it-1",
			lot_code: "SEM-LOTE-2026-10-13-3",
			expiry_date: null,
			quantity_base: 1,
			unit_cost: null,
			divergence_reason: null,
		})
		expect(
			initialInvoiceLot({ id: "it-1", received_qty_base: 1, unit_cost: null }, { ...source, lotCode: "  " }, { index: 0, today: "2026-10-13" }, null).lot_code
		).toBe("SEM-LOTE-2026-10-13-1")
	})
})

describe("lote da entrega sem nota", () => {
	test("só há o que gravar com código ou validade", () => {
		expect(hasLotInfo({})).toBe(false)
		expect(hasLotInfo({ lotCode: "  ", expiryDate: null })).toBe(false)
		expect(hasLotInfo({ lotCode: "L1" })).toBe(true)
		expect(hasLotInfo({ expiryDate: "2026-11-01" })).toBe(true)
	})

	test("com código: troca o sintético; validade julgada contra a chegada", () => {
		expect(lotUpdateFromLine({ lotCode: " L1 ", expiryDate: "2026-10-05" }, "2026-10-01", 10)).toEqual({
			lot_code: "L1",
			expiry_date: "2026-10-05",
			divergence_reason: "Validade de 4 dias na entrega, abaixo do mínimo de 10 da especificação",
		})
	})

	test("sem código: o sintético fica (a chave nem aparece)", () => {
		const update = lotUpdateFromLine({ lotCode: "  ", expiryDate: "2026-12-01" }, "2026-10-01", null)
		expect(update).toEqual({ expiry_date: "2026-12-01", divergence_reason: null })
		expect("lot_code" in update).toBe(false)
	})

	test("só código: validade nula e sem motivo", () => {
		expect(lotUpdateFromLine({ lotCode: "L2" }, "2026-10-01", 30)).toEqual({ lot_code: "L2", expiry_date: null, divergence_reason: null })
	})
})
