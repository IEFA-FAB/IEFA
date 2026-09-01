import { describe, expect, test } from "bun:test"
import {
	EDITABLE_RECEIPT_STATUSES,
	GOODS_RECEIPT_STATUSES,
	isInflow,
	isReceiptEditable,
	STOCK_INFLOW_TYPES,
	STOCK_MOVEMENT_TYPES,
	STOCK_OUTFLOW_TYPES,
} from "./inventory-vocabulary.ts"

describe("partição entrada/saída", () => {
	test("as duas listas cobrem exatamente o vocabulário", () => {
		expect([...STOCK_INFLOW_TYPES, ...STOCK_OUTFLOW_TYPES].sort()).toEqual([...STOCK_MOVEMENT_TYPES].sort())
	})

	test("nenhum tipo está nas duas", () => {
		const entradas = new Set<string>(STOCK_INFLOW_TYPES)
		expect(STOCK_OUTFLOW_TYPES.filter((tipo) => entradas.has(tipo))).toEqual([])
	})
})

describe("isInflow", () => {
	test("classifica cada tipo do vocabulário sem sobra", () => {
		expect(STOCK_MOVEMENT_TYPES.filter(isInflow).sort()).toEqual([...STOCK_INFLOW_TYPES].sort())
	})

	test("valor desconhecido NÃO é entrada", () => {
		// Espelha a trigger AFTER, que trata tudo que não está na lista de entradas
		// como saída. Se este default mudar, o relatório passa a discordar do ledger.
		expect(isInflow("tipo_que_nao_existe")).toBe(false)
		expect(isInflow("")).toBe(false)
	})

	test("não confunde o par in/out", () => {
		expect(isInflow("transfer_in")).toBe(true)
		expect(isInflow("transfer_out")).toBe(false)
		expect(isInflow("adjustment_in")).toBe(true)
		expect(isInflow("adjustment_out")).toBe(false)
	})
})

describe("isReceiptEditable", () => {
	test("só rascunho e provisório aceitam escrita", () => {
		expect(GOODS_RECEIPT_STATUSES.filter(isReceiptEditable).sort()).toEqual([...EDITABLE_RECEIPT_STATUSES].sort())
	})

	test("definitivo não é editável — efetivação é única", () => {
		expect(isReceiptEditable("definitive")).toBe(false)
	})

	test("divergente não é editável: já movimentou o ledger", () => {
		// `divergent` é status PÓS-efetivação. Tratá-lo como editável reabriria
		// para escrita um recebimento que já criou lotes e movimentos.
		expect(isReceiptEditable("divergent")).toBe(false)
	})

	test("status desconhecido não abre escrita", () => {
		expect(isReceiptEditable("qualquer_coisa")).toBe(false)
	})
})
