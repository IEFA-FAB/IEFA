/**
 * Caracterização das linhas do painel "A caminho": cada braço do resumo e da ação de cada
 * origem, os cortes (OF totalmente recebida, nota recebida em outra cozinha) e a ordem final.
 */
import { describe, expect, test } from "vitest"
import {
	buildIncomingNoteScope,
	buildNfeRows,
	buildSupplyOrderRows,
	buildUnbilledRows,
	civilDate,
	countPendingByNote,
	daysLateFrom,
	type IncomingEmpenho,
	type IncomingNote,
	type IncomingOrder,
	type IncomingRow,
	indexNoteReceipts,
	indexOrderReceipts,
	paginateIncoming,
	type UnbilledReceipt,
} from "@/lib/incoming-rows"

const TODAY = "2026-10-13"
const KITCHEN = 7

function order(partial: Partial<IncomingOrder> = {}): IncomingOrder {
	return { id: "of-1", empenho_id: "ne-1", number: "12/2026", expected_delivery: "2026-10-20", status: "sent", ...partial }
}

const EMPENHO: IncomingEmpenho = { numero_empenho: "2026NE000123", favorecido_nome: "Padaria Boa", favorecido_cnpj: "12345678000190" }

function note(partial: Partial<IncomingNote> = {}): IncomingNote {
	return {
		id: "nf-1",
		access_key: "35261012345678000190550010000123451000123456",
		supplier_name: "Padaria Boa",
		supplier_cnpj: "12345678000190",
		supplier_cpf: null,
		issued_at: "2026-10-12T15:00:00Z",
		total_value: "150.50",
		status: "available",
		situation_result: null,
		kitchen_id: KITCHEN,
		...partial,
	}
}

const noIndex = indexNoteReceipts([], KITCHEN)

describe("daysLateFrom e civilDate", () => {
	test("sem previsão não há atraso", () => {
		expect(daysLateFrom(null, TODAY)).toBe(0)
	})
	test("prevista para o futuro ou hoje não atrasa", () => {
		expect(daysLateFrom("2026-10-14", TODAY)).toBe(0)
		expect(daysLateFrom("2026-10-13", TODAY)).toBe(0)
	})
	test("conta dias civis contra a data prevista, ignorando a hora", () => {
		expect(daysLateFrom("2026-10-10T23:00:00Z", TODAY)).toBe(3)
	})
	test("data civil é a de Brasília: 01h UTC ainda é o dia anterior", () => {
		expect(civilDate("2026-10-13T01:00:00Z")).toBe("2026-10-12")
	})
})

describe("OF enviada com saldo a receber", () => {
	test("recebimento em andamento: concluir, sem atraso, com o id do recebimento", () => {
		const index = indexOrderReceipts([{ id: "gr-1", supply_order_id: "of-1", definitive_at: null }])
		const [row] = buildSupplyOrderRows([order({ expected_delivery: "2026-10-01" })], new Map([["ne-1", EMPENHO]]), index, TODAY)
		expect(row).toEqual<IncomingRow>({
			key: "of:of-1",
			kind: "supply_order",
			supplierName: "Padaria Boa",
			supplierDocument: "12345678000190",
			reference: "OF 12/2026",
			referenceDate: "2026-10-01",
			daysLate: 0,
			value: null,
			summary: "Empenho 2026NE000123",
			nextAction: "Concluir o recebimento",
			supplyOrderId: "of-1",
			nfeDocumentId: null,
			goodsReceiptId: "gr-1",
			unclaimedNote: false,
		})
	})

	test("parcialmente recebida: receber o saldo, mesmo atrasada", () => {
		const [row] = buildSupplyOrderRows(
			[order({ status: "partially_received", expected_delivery: "2026-10-10" })],
			new Map([["ne-1", EMPENHO]]),
			indexOrderReceipts([]),
			TODAY
		)
		expect(row?.nextAction).toBe("Receber o saldo restante")
		expect(row?.daysLate).toBe(3)
		expect(row?.goodsReceiptId).toBeNull()
	})

	test("atrasada: cobrar o fornecedor", () => {
		const [row] = buildSupplyOrderRows([order({ expected_delivery: "2026-10-12" })], new Map(), indexOrderReceipts([]), TODAY)
		expect(row?.nextAction).toBe("Cobrar o fornecedor")
		expect(row?.daysLate).toBe(1)
	})

	test("no prazo: aguardando entrega", () => {
		const [row] = buildSupplyOrderRows([order()], new Map(), indexOrderReceipts([]), TODAY)
		expect(row?.nextAction).toBe("Aguardando entrega")
		expect(row?.daysLate).toBe(0)
	})

	test("empenho com número, sem empenho e empenho não identificado", () => {
		const empenhoById = new Map([["ne-1", EMPENHO]])
		const rows = buildSupplyOrderRows(
			[order({ id: "a" }), order({ id: "b", empenho_id: null }), order({ id: "c", empenho_id: "ne-desconhecido" }), order({ id: "d", empenho_id: "ne-2" })],
			new Map([...empenhoById, ["ne-2", { ...EMPENHO, numero_empenho: null }]]),
			indexOrderReceipts([]),
			TODAY
		)
		expect(rows.map((row) => row.summary)).toEqual(["Empenho 2026NE000123", "Aguardando empenho", "Empenho não identificado", "Empenho não identificado"])
		// sem empenho lido, o fornecedor fica nulo
		expect(rows[1]?.supplierName).toBeNull()
		expect(rows[1]?.supplierDocument).toBeNull()
	})

	test("OF sem número", () => {
		const [row] = buildSupplyOrderRows([order({ number: null })], new Map(), indexOrderReceipts([]), TODAY)
		expect(row?.reference).toBe("OF sem número")
	})

	test("OF totalmente recebida sai; parcial ou com recebimento aberto fica", () => {
		const index = indexOrderReceipts([
			{ id: "gr-a", supply_order_id: "a", definitive_at: "2026-10-01T10:00:00Z" },
			{ id: "gr-b", supply_order_id: "b", definitive_at: "2026-10-01T10:00:00Z" },
			{ id: "gr-c1", supply_order_id: "c", definitive_at: "2026-10-01T10:00:00Z" },
			{ id: "gr-c2", supply_order_id: "c", definitive_at: null },
			{ id: "gr-x", supply_order_id: null, definitive_at: null },
		])
		const rows = buildSupplyOrderRows([order({ id: "a" }), order({ id: "b", status: "partially_received" }), order({ id: "c" })], new Map(), index, TODAY)
		expect(rows.map((row) => row.supplyOrderId)).toEqual(["b", "c"])
		expect(rows[1]?.goodsReceiptId).toBe("gr-c2")
	})

	test("o último recebimento aberto da OF é o que vale", () => {
		const index = indexOrderReceipts([
			{ id: "gr-1", supply_order_id: "of-1", definitive_at: null },
			{ id: "gr-2", supply_order_id: "of-1", definitive_at: null },
		])
		expect(index.openByOrder.get("of-1")).toBe("gr-2")
	})
})

describe("NF-e sem recebimento efetivado", () => {
	test("escopo: só a cozinha sem unidade compradora; com ela, também a nota não reivindicada da unidade", () => {
		expect(buildIncomingNoteScope(KITCHEN, null)).toBe("kitchen_id.eq.7")
		expect(buildIncomingNoteScope(KITCHEN, 5)).toBe("kitchen_id.eq.7,and(kitchen_id.is.null,unit_id.eq.5)")
	})

	test("nota disponível sem pendência: registrar o recebimento", () => {
		const [row] = buildNfeRows([note()], noIndex, new Map())
		expect(row).toEqual<IncomingRow>({
			key: "nfe:nf-1",
			kind: "nfe",
			supplierName: "Padaria Boa",
			supplierDocument: "12345678000190",
			reference: "NF-e 000012345",
			referenceDate: "2026-10-12",
			daysLate: 0,
			value: 150.5,
			summary: "Nota disponível",
			nextAction: "Registrar o recebimento",
			supplyOrderId: null,
			nfeDocumentId: "nf-1",
			goodsReceiptId: null,
			unclaimedNote: false,
		})
	})

	test("cancelada na SEFAZ vence todo o resto", () => {
		const index = indexNoteReceipts([{ id: "gr-1", nfe_document_id: "nf-1", kitchen_id: KITCHEN, definitive_at: null }], KITCHEN)
		const [row] = buildNfeRows([note({ situation_result: "cancelled", kitchen_id: null, status: "announced" })], index, new Map([["nf-1", 2]]))
		expect(row?.summary).toBe("Cancelada na SEFAZ")
		expect(row?.nextAction).toBe("Não receber — confirme com o fornecedor")
		expect(row?.goodsReceiptId).toBe("gr-1")
	})

	test("recebimento em andamento nesta cozinha: concluir", () => {
		const index = indexNoteReceipts([{ id: "gr-1", nfe_document_id: "nf-1", kitchen_id: String(KITCHEN), definitive_at: null }], KITCHEN)
		const [row] = buildNfeRows([note({ kitchen_id: null, status: "announced" })], index, new Map([["nf-1", 2]]))
		expect(row?.summary).toBe("Recebimento em andamento")
		expect(row?.nextAction).toBe("Concluir o recebimento")
		expect(row?.goodsReceiptId).toBe("gr-1")
		// a marca de não reivindicada segue a coluna, não o resumo
		expect(row?.unclaimedNote).toBe(true)
	})

	test("sem cozinha: assumir a nota", () => {
		const [row] = buildNfeRows([note({ kitchen_id: null, status: "announced" })], noIndex, new Map([["nf-1", 2]]))
		expect(row?.summary).toBe("Enviada à unidade, ainda sem cozinha")
		expect(row?.nextAction).toBe("Assumir a nota para esta cozinha")
		expect(row?.unclaimedNote).toBe(true)
	})

	test("anunciada pela chave: importar o XML", () => {
		const [row] = buildNfeRows([note({ status: "announced" })], noIndex, new Map([["nf-1", 2]]))
		expect(row?.summary).toBe("Anunciada pela chave, XML não recebido")
		expect(row?.nextAction).toBe("Importar o XML da nota")
	})

	test("itens pendentes: singular e plural", () => {
		const pending = countPendingByNote([{ nfe_document_id: "a" }, { nfe_document_id: "b" }, { nfe_document_id: "b" }, { nfe_document_id: "b" }])
		const rows = buildNfeRows([note({ id: "a" }), note({ id: "b" })], noIndex, pending)
		expect(rows.map((row) => row.nextAction)).toEqual(["Casar 1 item", "Casar 3 itens"])
		expect(rows.map((row) => row.summary)).toEqual(["Nota disponível", "Nota disponível"])
	})

	test("nota sem chave, sem emissão, sem valor e de emitente pessoa física", () => {
		const [row] = buildNfeRows(
			[note({ access_key: null, issued_at: null, total_value: null, supplier_cnpj: null, supplier_cpf: "12345678901" })],
			noIndex,
			new Map()
		)
		expect(row?.reference).toBe("NF-e sem chave")
		expect(row?.referenceDate).toBeNull()
		expect(row?.value).toBeNull()
		expect(row?.supplierDocument).toBe("12345678901")
	})

	test("valor zero continua zero (não vira nulo)", () => {
		const [row] = buildNfeRows([note({ total_value: 0 })], noIndex, new Map())
		expect(row?.value).toBe(0)
	})

	test("nota efetivada sai; recebida em outra cozinha sai; em andamento aqui e lá fica", () => {
		const index = indexNoteReceipts(
			[
				{ id: "gr-a", nfe_document_id: "a", kitchen_id: KITCHEN, definitive_at: "2026-10-01T10:00:00Z" },
				{ id: "gr-b", nfe_document_id: "b", kitchen_id: 99, definitive_at: null },
				{ id: "gr-c1", nfe_document_id: "c", kitchen_id: 99, definitive_at: null },
				{ id: "gr-c2", nfe_document_id: "c", kitchen_id: KITCHEN, definitive_at: null },
				{ id: "gr-x", nfe_document_id: null, kitchen_id: KITCHEN, definitive_at: "2026-10-01T10:00:00Z" },
			],
			KITCHEN
		)
		const rows = buildNfeRows([note({ id: "a" }), note({ id: "b" }), note({ id: "c" }), note({ id: "d" })], index, new Map())
		expect(rows.map((row) => row.nfeDocumentId)).toEqual(["c", "d"])
		expect(rows[0]?.goodsReceiptId).toBe("gr-c2")
	})
})

describe("entrega sem nota", () => {
	const receipt = (partial: Partial<UnbilledReceipt> = {}): UnbilledReceipt => ({
		id: "gr-1",
		supply_order_id: "of-1",
		status: "definitive",
		delivery_note_number: "R-77",
		supplier_name: "Padaria Boa",
		supplier_document: "12345678000190",
		created_at: "2026-10-11T02:00:00Z",
		...partial,
	})

	test("entregue, com remessa, na data civil de Brasília", () => {
		expect(buildUnbilledRows([receipt()])).toEqual<IncomingRow[]>([
			{
				key: "sem-nota:gr-1",
				kind: "delivery_without_invoice",
				supplierName: "Padaria Boa",
				supplierDocument: "12345678000190",
				reference: "Remessa R-77",
				referenceDate: "2026-10-10",
				daysLate: 0,
				value: null,
				summary: "Entregue, aguardando a nota fiscal",
				nextAction: "Vincular à nota quando ela chegar",
				supplyOrderId: "of-1",
				nfeDocumentId: null,
				goodsReceiptId: "gr-1",
				unclaimedNote: false,
			},
		])
	})

	test("provisório e sem número de remessa", () => {
		const [row] = buildUnbilledRows([receipt({ status: "provisional", delivery_note_number: null, supply_order_id: null })])
		expect(row?.summary).toBe("Recebimento provisório, aguardando a nota")
		expect(row?.reference).toBe("Entrega sem nota")
		expect(row?.supplyOrderId).toBeNull()
	})
})

describe("ordem e corte", () => {
	const row = (key: string, kind: IncomingRow["kind"], daysLate: number, referenceDate: string | null): IncomingRow => ({
		key,
		kind,
		supplierName: null,
		supplierDocument: null,
		reference: key,
		referenceDate,
		daysLate,
		value: null,
		summary: "",
		nextAction: "",
		supplyOrderId: null,
		nfeDocumentId: null,
		goodsReceiptId: null,
		unclaimedNote: false,
	})

	test("mais atrasado primeiro; depois o mais antigo; sem data por último, na ordem de entrada", () => {
		const rows = [
			row("sem-data-1", "nfe", 0, null),
			row("recente", "nfe", 0, "2026-10-12"),
			row("atraso-1", "supply_order", 1, "2026-10-12"),
			row("antigo", "delivery_without_invoice", 0, "2026-10-01"),
			row("atraso-5", "supply_order", 5, "2026-10-08"),
			row("sem-data-2", "nfe", 0, null),
		]
		const result = paginateIncoming(rows, undefined, 50)
		expect(result.rows.map((r) => r.key)).toEqual(["atraso-5", "atraso-1", "antigo", "recente", "sem-data-1", "sem-data-2"])
		expect(result.total).toBe(6)
		expect(result.late).toBe(2)
		// ordena no lugar, como antes
		expect(rows[0]?.key).toBe("atraso-5")
	})

	test("filtro por tipo e limite: total e atrasados contam o filtrado inteiro", () => {
		const rows = [
			row("a", "supply_order", 2, "2026-10-01"),
			row("b", "nfe", 0, "2026-10-02"),
			row("c", "supply_order", 0, "2026-10-03"),
			row("d", "supply_order", 1, null),
		]
		const result = paginateIncoming(rows, ["supply_order"], 1)
		expect(result.rows.map((r) => r.key)).toEqual(["a"])
		expect(result.total).toBe(3)
		expect(result.late).toBe(2)
	})

	test("lista de tipos vazia é o mesmo que nenhum filtro", () => {
		const result = paginateIncoming([row("a", "nfe", 0, null), row("b", "supply_order", 0, null)], [], 50)
		expect(result.total).toBe(2)
	})
})
