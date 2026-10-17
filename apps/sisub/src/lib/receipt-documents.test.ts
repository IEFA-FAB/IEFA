/**
 * Caracterização dos documentos do recebimento: o casamento com a NF-e no vínculo posterior e o
 * que a tela mostra da nota, da OF e do empenho ligados.
 */
import { afterEach, describe, expect, test, vi } from "vitest"
import {
	buildReceiptContextEmpenho,
	buildReceiptContextInvoice,
	buildReceiptContextSupplyOrder,
	collectInvoiceLinkWarnings,
	formatSupplyOrderLabel,
	getLinkResultCounts,
	isSwitchingNfe,
	type LinkInvoiceItem,
	type LinkReceiptLine,
	planInvoiceLink,
} from "@/lib/receipt-documents"

afterEach(() => {
	vi.useRealTimers()
})

describe("isSwitchingNfe", () => {
	test("só troca quando há nota nova, nota atual, e elas diferem", () => {
		expect(isSwitchingNfe("b", "a")).toBe(true)
		expect(isSwitchingNfe("a", "a")).toBe(false)
		expect(isSwitchingNfe(null, "a")).toBe(false)
		expect(isSwitchingNfe(undefined, "a")).toBe(false)
		expect(isSwitchingNfe("b", null)).toBe(false)
	})
})

describe("planInvoiceLink", () => {
	const line = (partial: Partial<LinkReceiptLine>): LinkReceiptLine => ({
		id: "it-1",
		ingredient_id: "ing-1",
		purchase_item_id: null,
		nfe_item_id: null,
		unit_cost: null,
		unit_cost_source: null,
		...partial,
	})
	const item = (partial: Partial<LinkInvoiceItem>): LinkInvoiceItem => ({
		id: "nf-1",
		n_item: 1,
		description: "Pão",
		ingredient_id: "ing-1",
		purchase_item_id: null,
		matched_qty_base: 10,
		unit_price: 5,
		commercial_qty: 2,
		...partial,
	})

	test("casa pelo insumo e dá o custo da linha da nota à linha sem custo", () => {
		expect(
			planInvoiceLink({
				lines: [line({}), line({ id: "it-2", ingredient_id: "ing-sem-nota" }), line({ id: "it-3", ingredient_id: null })],
				invoiceItems: [item({})],
				switchingNfe: false,
				attested: false,
			})
		).toEqual({
			links: [{ receipt_item_id: "it-1", nfe_item_id: "nf-1" }],
			costs: [{ receipt_item_id: "it-1", unit_cost: 1 }],
			// a linha sem insumo também não casa, mas não tem nome para dizer
			unmatchedIngredientIds: ["ing-sem-nota"],
		})
	})

	test("efetivado: casa, mas o custo não muda", () => {
		const plan = planInvoiceLink({ lines: [line({})], invoiceItems: [item({})], switchingNfe: false, attested: true })
		expect(plan.links).toHaveLength(1)
		expect(plan.costs).toEqual([])
	})

	test("linha já ligada ao item desta nota não gera vínculo; linha com custo não ganha outro", () => {
		const plan = planInvoiceLink({
			lines: [line({ nfe_item_id: "nf-1", unit_cost: 3, unit_cost_source: "invoice_link" })],
			invoiceItems: [item({})],
			switchingNfe: false,
			attested: false,
		})
		expect(plan).toEqual({ links: [], costs: [], unmatchedIngredientIds: [] })
	})

	test("trocando de nota: o item antigo e o custo que veio da nota antiga não contam", () => {
		const plan = planInvoiceLink({
			lines: [
				line({ nfe_item_id: "nf-1", unit_cost: 3, unit_cost_source: "invoice_link" }),
				line({ id: "it-2", ingredient_id: "ing-2", nfe_item_id: "nf-1", unit_cost: 7, unit_cost_source: "manual" }),
			],
			invoiceItems: [item({}), item({ id: "nf-2", n_item: 2, ingredient_id: "ing-2" })],
			switchingNfe: true,
			attested: false,
		})
		expect(plan.links).toEqual([
			{ receipt_item_id: "it-1", nfe_item_id: "nf-1" },
			{ receipt_item_id: "it-2", nfe_item_id: "nf-2" },
		])
		// o custo informado à mão fica; o da nota antiga é refeito
		expect(plan.costs).toEqual([{ receipt_item_id: "it-1", unit_cost: 1 }])
	})

	test("números vindos como texto são convertidos para o casamento", () => {
		const plan = planInvoiceLink({
			lines: [line({ unit_cost: null })],
			invoiceItems: [item({ matched_qty_base: "4" as unknown as number, unit_price: "2" as unknown as number, commercial_qty: "6" as unknown as number })],
			switchingNfe: false,
			attested: false,
		})
		expect(plan.costs).toEqual([{ receipt_item_id: "it-1", unit_cost: 3 }])
	})
})

describe("collectInvoiceLinkWarnings", () => {
	test("CNPJ da nota primeiro; sem ele, o CPF; documento da entrega ausente vira nulo", () => {
		expect(
			collectInvoiceLinkWarnings({
				receiptSupplierDocument: "111",
				empenhoSupplierCnpj: "222",
				invoice: { supplier_cnpj: "333", supplier_cpf: "111" },
				invoiceItemCount: 0,
				attested: true,
			})
		).toEqual([
			"A NF-e é de outro emitente, não de quem entregou: confira se é a nota desta entrega.",
			"O emitente da NF-e não é o favorecido do empenho: a liquidação exige nota do credor do empenho (Lei 4.320, art. 63).",
			"A NF-e só tem a chave (XML não importado): o vínculo fica, e os itens casam quando o XML chegar.",
			"O recebimento já foi efetivado: o vínculo não muda quantidade, custo nem estoque.",
		])
		expect(
			collectInvoiceLinkWarnings({
				receiptSupplierDocument: undefined,
				empenhoSupplierCnpj: null,
				invoice: { supplier_cnpj: null, supplier_cpf: "111" },
				invoiceItemCount: 3,
				attested: false,
			})
		).toEqual([])
	})
})

describe("getLinkResultCounts", () => {
	test("primeira linha da função; sem linha, zero", () => {
		expect(getLinkResultCounts([{ linked_items: 3, costed_items: 1 }])).toEqual({ linkedItems: 3, costedItems: 1 })
		expect(getLinkResultCounts([])).toEqual({ linkedItems: 0, costedItems: 0 })
		expect(getLinkResultCounts(null)).toEqual({ linkedItems: 0, costedItems: 0 })
		expect(getLinkResultCounts([{ linked_items: null, costed_items: null }])).toEqual({ linkedItems: 0, costedItems: 0 })
	})
})

describe("contexto do recebimento", () => {
	test("rótulo da OF", () => {
		expect(formatSupplyOrderLabel("12/2026")).toBe("OF 12/2026")
		expect(formatSupplyOrderLabel(null)).toBe("OF sem número")
	})

	const note = {
		access_key: "35261012345678000190550010000123451000123456",
		supplier_name: "Padaria Boa",
		status: "available",
		situation_result: "authorized",
		situation_checked_at: "2026-10-12T12:00:00Z",
	}

	test("sem nota, nada", () => {
		expect(buildReceiptContextInvoice(null)).toBeNull()
	})

	test("nota autorizada e consultada há pouco: sem problema", () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2026-10-13T12:00:00Z"))
		expect(buildReceiptContextInvoice(note)).toEqual({ problem: null, cancelled: false, refused: false, label: "NF-e 000012345 · Padaria Boa" })
	})

	test("nota cancelada, sem emitente no rótulo", () => {
		expect(buildReceiptContextInvoice({ ...note, supplier_name: null, situation_result: "cancelled" })).toEqual({
			problem: "NF-e cancelada pelo emitente — não sustenta efetivação nem pagamento",
			cancelled: true,
			refused: false,
			label: "NF-e 000012345",
		})
	})

	test("nota recusada (recusa do recebimento pela metade): o problema é concluir a recusa", () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2026-10-13T12:00:00Z"))
		// Consultada e autorizada na SEFAZ, mas recusada pela unidade: a recusa vale mais.
		expect(buildReceiptContextInvoice({ ...note, status: "refused" })).toEqual({
			problem: "A NF-e deste recebimento foi recusada. Conclua a recusa do recebimento ou peça a reabertura da NF-e",
			cancelled: false,
			refused: true,
			label: "NF-e 000012345 · Padaria Boa",
		})
	})

	test("nota sem consulta: o problema diz para consultar", () => {
		const invoice = buildReceiptContextInvoice({ ...note, situation_result: null, situation_checked_at: null })
		expect(invoice?.cancelled).toBe(false)
		expect(invoice?.problem).toMatch(/^Consulte a situação da NF-e na SEFAZ/)
	})

	test("OF ligada: aguardando empenho ou não", () => {
		expect(buildReceiptContextSupplyOrder(null, "of-1")).toBeNull()
		expect(buildReceiptContextSupplyOrder({ number: "12/2026", empenho_id: null }, "of-1")).toEqual({ id: "of-1", label: "OF 12/2026", awaitingEmpenho: true })
		expect(buildReceiptContextSupplyOrder({ number: null, empenho_id: "ne-1" }, "of-1")).toEqual({ id: "of-1", label: "OF sem número", awaitingEmpenho: false })
	})

	test("empenho ligado, com e sem favorecido", () => {
		expect(buildReceiptContextEmpenho(null)).toBeNull()
		expect(buildReceiptContextEmpenho({ numero_empenho: "2026NE1", favorecido_nome: "Padaria" })).toEqual({ label: "2026NE1 · Padaria" })
		expect(buildReceiptContextEmpenho({ numero_empenho: "2026NE1", favorecido_nome: null })).toEqual({ label: "2026NE1" })
	})
})
