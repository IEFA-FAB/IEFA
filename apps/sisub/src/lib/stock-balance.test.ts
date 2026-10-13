import { describe, expect, it, vi } from "vitest"
import {
	aggregateStockBalance,
	applyStockItemNames,
	collectLotIds,
	listDescribableIds,
	type StockBalanceViewRow,
	type StockLotMeta,
	selectVisibleStockItems,
	stockItemKey,
} from "@/lib/stock-balance"

const row = (overrides: Partial<StockBalanceViewRow>): StockBalanceViewRow => ({
	ingredient_id: "ing",
	frozen_preparation_id: null,
	lot_id: null,
	lot_code: null,
	expiry_date: null,
	balance: 0,
	balance_value: 0,
	...overrides,
})

const meta = (overrides: Partial<StockLotMeta> = {}): StockLotMeta => ({
	short_code: "L-1",
	location: "A1",
	use_first: true,
	quarantined_at: null,
	derivation: null,
	...overrides,
})

const TODAY = "2026-10-13"

describe("collectLotIds e stockItemKey", () => {
	it("lotes sem repetição e sem o saldo sem lote", () => {
		expect(collectLotIds([{ lot_id: "a" }, { lot_id: null }, { lot_id: "a" }, { lot_id: "b" }])).toEqual(["a", "b"])
	})

	it("chave por insumo, senão por preparação", () => {
		expect(stockItemKey({ ingredient_id: "x", frozen_preparation_id: "y" })).toBe("i:x")
		expect(stockItemKey({ ingredient_id: null, frozen_preparation_id: "y" })).toBe("f:y")
	})
})

describe("aggregateStockBalance", () => {
	it("soma por item e monta os lotes com os metadados", () => {
		const byItem = aggregateStockBalance(
			[
				row({ lot_id: "l1", lot_code: "C1", expiry_date: "2026-12-01", balance: 10, balance_value: "50" }),
				row({ lot_id: null, balance: "-2", balance_value: null }),
				row({ ingredient_id: null, frozen_preparation_id: "fp", lot_id: "l2", balance: 1, balance_value: 3 }),
			],
			new Map([["l1", meta()]]),
			() => TODAY
		)
		expect([...byItem.keys()]).toEqual(["i:ing", "f:fp"])
		const item = byItem.get("i:ing")
		expect(item).toMatchObject({ ingredientId: "ing", frozenPreparationId: null, description: "", measureUnit: null, balance: 8, balanceValue: 50 })
		expect(item?.lots).toEqual([
			{
				lot_id: "l1",
				lot_code: "C1",
				expiry_date: "2026-12-01",
				balance: 10,
				balance_value: 50,
				short_code: "L-1",
				location: "A1",
				use_first: true,
				quarantined: false,
				derivation: null,
			},
			{
				lot_id: null,
				lot_code: null,
				expiry_date: null,
				balance: -2,
				balance_value: 0,
				short_code: null,
				location: null,
				use_first: false,
				quarantined: false,
				derivation: null,
			},
		])
		// lote sem metadado (não achado na tabela) fica com os padrões
		expect(byItem.get("f:fp")?.lots[0]).toMatchObject({ short_code: null, use_first: false, quarantined: false })
	})

	it("quarentena e vencido são exclusivos; quarentena vence", () => {
		const byItem = aggregateStockBalance(
			[
				row({ lot_id: "q", expiry_date: "2026-01-01", balance: 4 }),
				row({ lot_id: "v", expiry_date: "2026-10-12", balance: 3 }),
				row({ lot_id: "h", expiry_date: TODAY, balance: 2 }),
			],
			new Map([
				["q", meta({ quarantined_at: "2026-10-01T00:00:00Z", derivation: "split" })],
				["v", meta()],
				["h", meta()],
			]),
			() => TODAY
		)
		const item = byItem.get("i:ing")
		expect(item?.quarantinedBalance).toBe(4)
		// vence hoje ainda não está vencido
		expect(item?.expiredBalance).toBe(3)
		expect(item?.lots[0]).toMatchObject({ quarantined: true, derivation: "split" })
	})

	it("o relógio só é consultado para linha fora de quarentena e com validade", () => {
		const getToday = vi.fn(() => TODAY)
		aggregateStockBalance(
			[row({ lot_id: "q", expiry_date: "2026-01-01" }), row({ lot_id: null, expiry_date: null }), row({ lot_id: null, expiry_date: "2026-01-01" })],
			new Map([["q", meta({ quarantined_at: "x" })]]),
			getToday
		)
		expect(getToday).toHaveBeenCalledTimes(1)
	})

	it("próximo vencimento: o menor de lote com saldo positivo e fora de quarentena", () => {
		const byItem = aggregateStockBalance(
			[
				row({ lot_id: "a", expiry_date: "2026-12-01", balance: 1 }),
				row({ lot_id: "b", expiry_date: "2026-11-01", balance: 0 }),
				row({ lot_id: "q", expiry_date: "2026-10-20", balance: 5 }),
				row({ lot_id: "c", expiry_date: "2026-11-15", balance: "2" }),
				row({ lot_id: "d", expiry_date: "2026-11-30", balance: 2 }),
				row({ lot_id: "e", expiry_date: null, balance: 2 }),
			],
			new Map([["q", meta({ quarantined_at: "x" })]]),
			() => TODAY
		)
		expect(byItem.get("i:ing")?.nextExpiry).toBe("2026-11-15")
	})

	it("sem lote elegível o próximo vencimento fica nulo", () => {
		const byItem = aggregateStockBalance([row({ expiry_date: "2026-11-01", balance: null })], new Map(), () => TODAY)
		expect(byItem.get("i:ing")?.nextExpiry).toBeNull()
	})
})

describe("nomes, visibilidade e ordem", () => {
	const build = () =>
		aggregateStockBalance(
			[
				row({ ingredient_id: "b", lot_id: "1", expiry_date: "2026-12-01", balance: 1 }),
				row({ ingredient_id: "b", lot_id: "2", expiry_date: null, balance: 1 }),
				row({ ingredient_id: "b", lot_id: "3", expiry_date: "2026-11-01", balance: 1 }),
				row({ ingredient_id: "a", balance: 1 }),
				row({ ingredient_id: null, frozen_preparation_id: "f", balance: 1 }),
			],
			new Map(),
			() => TODAY
		)

	it("listDescribableIds separa insumos e preparações", () => {
		expect(listDescribableIds(build())).toEqual({ ingredientIds: ["b", "a"], frozenIds: ["f"] })
	})

	it("applyStockItemNames usa a chave sem nome e ordena os lotes com o sem validade no fim", () => {
		const byItem = build()
		applyStockItemNames(
			byItem,
			new Map([
				["i:b", { description: "Feijão", measureUnit: "KG" }],
				["f:f", { description: "Ávila", measureUnit: null }],
			])
		)
		expect(byItem.get("i:b")).toMatchObject({ description: "Feijão", measureUnit: "KG" })
		expect(byItem.get("i:b")?.lots.map((l) => l.lot_id)).toEqual(["3", "1", "2"])
		expect(byItem.get("i:a")).toMatchObject({ description: "i:a", measureUnit: null })
	})

	it("selectVisibleStockItems tira o escondido pela contagem cega e ordena em pt-BR", () => {
		const byItem = build()
		applyStockItemNames(
			byItem,
			new Map([
				["i:b", { description: "Feijão", measureUnit: "KG" }],
				["i:a", { description: "arroz", measureUnit: "KG" }],
				["f:f", { description: "Ávila", measureUnit: null }],
			])
		)
		expect(selectVisibleStockItems(byItem, new Set()).map((i) => i.description)).toEqual(["arroz", "Ávila", "Feijão"])
		expect(selectVisibleStockItems(byItem, new Set(["b", "f"])).map((i) => i.description)).toEqual(["arroz"])
	})
})
