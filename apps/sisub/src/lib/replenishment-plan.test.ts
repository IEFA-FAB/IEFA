import { describe, expect, it } from "vitest"
import {
	buildReplenishmentSuggestions,
	checkDispensaRoom,
	computeTransitByIngredient,
	consumeDispensaRoom,
	formatCalcMemory,
	groupObservedLeadTimes,
	indexDefaultPurchaseLinks,
	indexOwnArpBalances,
	indexStockByIngredient,
	type ReplenishmentContext,
	type ReplenishmentSuggestion,
	rankReplenishmentSuggestions,
	resolveGrossDemand,
	resolveObservedLeadDays,
	sumOrderedQtyByPurchaseItem,
	sumReceivedByIngredient,
} from "@/lib/replenishment-plan"

describe("indexStockByIngredient", () => {
	it("separa disponível de vencendo no horizonte e ignora saldo não positivo e insumo nulo", () => {
		const stock = indexStockByIngredient(
			[
				{ ingredient_id: "a", balance: 10, expiry_date: null },
				{ ingredient_id: "a", balance: "4", expiry_date: "2026-10-20" },
				{ ingredient_id: "a", balance: 3, expiry_date: "2026-10-21" },
				{ ingredient_id: "b", balance: 0, expiry_date: null },
				{ ingredient_id: null, balance: 99, expiry_date: null },
			],
			"2026-10-20"
		)
		expect(stock.get("a")).toEqual({ available: 13, expiring: 4 })
		// só saldo zero: o insumo nem entra
		expect(stock.has("b")).toBe(false)
		expect(stock.size).toBe(1)
	})
})

describe("sumOrderedQtyByPurchaseItem", () => {
	it("soma por item de compra, ignorando item sem purchase_item e OF sem itens", () => {
		const qty = sumOrderedQtyByPurchaseItem([
			{
				supply_order_item: [
					{ purchase_item_id: "p1", ordered_qty: 5 },
					{ purchase_item_id: null, ordered_qty: 9 },
					{ purchase_item_id: "", ordered_qty: 9 },
				],
			},
			{ supply_order_item: [{ purchase_item_id: "p1", ordered_qty: "2.5" }] },
			{ supply_order_item: null },
		])
		expect([...qty]).toEqual([["p1", 7.5]])
	})
})

describe("indexDefaultPurchaseLinks", () => {
	it("indexa preço, fator e CATMAT; fator ausente ou zero vira 1", () => {
		const index = indexDefaultPurchaseLinks([
			{ ingredient_id: "a", purchase_item_id: "p1", conversion_factor: 2, purchase_item: { catmat_item_codigo: 123, unit_price: "10.5" } },
			{ ingredient_id: "b", purchase_item_id: "p2", conversion_factor: null, purchase_item: { catmat_item_codigo: null, unit_price: null } },
			{ ingredient_id: "c", purchase_item_id: "p3", conversion_factor: 0, purchase_item: null },
		])
		expect(index.defaultPurchaseByIngredient).toEqual(
			new Map([
				["a", "p1"],
				["b", "p2"],
				["c", "p3"],
			])
		)
		expect(index.priceByIngredient.get("a")).toEqual({ unitPrice: 10.5, conversionFactor: 2 })
		expect(index.priceByIngredient.get("b")).toEqual({ unitPrice: null, conversionFactor: 1 })
		expect(index.priceByIngredient.get("c")).toEqual({ unitPrice: null, conversionFactor: 1 })
		expect([...index.catmatByIngredient]).toEqual([
			["a", true],
			["b", false],
			["c", false],
		])
		expect([...index.catmatCodeByIngredient]).toEqual([["a", 123]])
	})
})

describe("trânsito", () => {
	it("sumReceivedByIngredient ignora linha sem insumo", () => {
		expect([
			...sumReceivedByIngredient([
				{ ingredient_id: "a", received_qty_base: 2 },
				{ ingredient_id: null, received_qty_base: 5 },
				{ ingredient_id: "a", received_qty_base: "1" },
			]),
		]).toEqual([["a", 3]])
	})

	it("computeTransitByIngredient: um link por item de compra, convertido, menos o recebido e nunca negativo", () => {
		const transit = computeTransitByIngredient({
			transitLinks: [
				{ ingredient_id: "a", purchase_item_id: "p1", conversion_factor: 2 },
				// segundo link do mesmo item de compra: ignorado
				{ ingredient_id: "b", purchase_item_id: "p1", conversion_factor: 10 },
				// insumo fora da demanda
				{ ingredient_id: "x", purchase_item_id: "p2", conversion_factor: 1 },
				{ ingredient_id: "a", purchase_item_id: "p3", conversion_factor: null },
				{ ingredient_id: "b", purchase_item_id: "p4", conversion_factor: 0 },
				// item de compra sem quantidade pedida
				{ ingredient_id: "b", purchase_item_id: "p5", conversion_factor: 1 },
			],
			purchaseQty: new Map([
				["p1", 5],
				["p2", 7],
				["p3", 1],
				["p4", 3],
			]),
			ingredientSet: new Set(["a", "b"]),
			receivedByIngredient: new Map([
				["b", 10],
				["c", 1],
			]),
		})
		expect(transit.get("a")).toBe(11)
		expect(transit.get("b")).toBe(0)
		expect(transit.get("c")).toBe(0)
		expect(transit.has("x")).toBe(false)
	})
})

describe("indexOwnArpBalances", () => {
	it("soma só ARP vigente, com insumo, e guarda o último fornecedor conhecido", () => {
		const result = indexOwnArpBalances(
			[
				{ saldo_empenho: 10, ni_fornecedor: "111", quantity_estimate_item: { ingredient_id: "a" }, arp: { data_vigencia_fim: null } },
				{ saldo_empenho: null, ni_fornecedor: null, quantity_estimate_item: { ingredient_id: "a" }, arp: { data_vigencia_fim: "2026-10-13" } },
				{ saldo_empenho: 5, ni_fornecedor: 222, quantity_estimate_item: { ingredient_id: "a" }, arp: { data_vigencia_fim: "2026-12-31" } },
				{ saldo_empenho: 99, ni_fornecedor: "333", quantity_estimate_item: { ingredient_id: "a" }, arp: { data_vigencia_fim: "2026-10-12" } },
				{ saldo_empenho: 99, ni_fornecedor: "444", quantity_estimate_item: { ingredient_id: null }, arp: { data_vigencia_fim: null } },
			],
			"2026-10-13"
		)
		expect([...result.arpBalanceById]).toEqual([["a", 15]])
		expect([...result.expectedSupplierByIngredient]).toEqual([["a", "222"]])
	})
})

describe("groupObservedLeadTimes", () => {
	it("cada linha entra na chave fornecedor:item e na só-item; inválida fica de fora", () => {
		const observed = groupObservedLeadTimes([
			{ purchase_item_id: "p1", ni_fornecedor: "f1", lead_time_days: 5 },
			{ purchase_item_id: "p1", ni_fornecedor: null, lead_time_days: "7" },
			{ purchase_item_id: null, ni_fornecedor: "f1", lead_time_days: 3 },
			{ purchase_item_id: "p1", ni_fornecedor: "f1", lead_time_days: "abc" },
		])
		expect([...observed]).toEqual([
			["f1:p1", [5]],
			["p1", [5, 7]],
		])
	})
})

describe("peças da sugestão", () => {
	it("resolveGrossDemand aplica FC e IR quando há", () => {
		expect(resolveGrossDemand(100, { correction_factor: 1.2, rehydration_index: 2 })).toBe(60)
		expect(resolveGrossDemand(100, { correction_factor: null, rehydration_index: null })).toBe(100)
		expect(resolveGrossDemand(100, undefined)).toBe(100)
	})

	it("resolveObservedLeadDays prefere o fornecedor esperado e cai no item", () => {
		const observed = new Map([
			["f1:p1", [3]],
			["p1", [9]],
		])
		expect(resolveObservedLeadDays(undefined, "f1", observed)).toEqual([])
		expect(resolveObservedLeadDays("p1", "f1", observed)).toEqual([3])
		expect(resolveObservedLeadDays("p1", "f2", observed)).toEqual([9])
		expect(resolveObservedLeadDays("p1", undefined, observed)).toEqual([9])
		expect(resolveObservedLeadDays("p2", undefined, observed)).toEqual([])
	})

	it("checkDispensaRoom confere sem reservar; consumeDispensaRoom desconta só em canal de dispensa", () => {
		const room = new Map<string, number | null>([
			["89", 1000],
			["90", null],
		])
		const classByCatmat = new Map([
			[1, "89"],
			[2, "90"],
		])
		const fits = checkDispensaRoom({ catmat: 1, estimatedValue: 400, classByCatmat, dispensaRoom: room })
		expect(fits).toEqual({ lineCode: "89", smallValue: true, remaining: 1000 })
		expect(room.get("89")).toBe(1000)
		// canal que não é dispensa não consome
		for (const channel of ["own_arp", "carona", "licitacao"] as const) consumeDispensaRoom(room, fits, 400, channel)
		expect(room.get("89")).toBe(1000)
		consumeDispensaRoom(room, fits, 400, "contrata_mais")
		expect(room.get("89")).toBe(600)
		// não cabe: nem dispensa consome
		const tooBig = checkDispensaRoom({ catmat: 1, estimatedValue: 700, classByCatmat, dispensaRoom: room })
		expect(tooBig).toEqual({ lineCode: "89", smallValue: false, remaining: 600 })
		consumeDispensaRoom(room, tooBig, 700, "supermercado_virtual")
		expect(room.get("89")).toBe(600)
		// dispensa sem valor no ramo: não presume folga
		expect(checkDispensaRoom({ catmat: 2, estimatedValue: 1, classByCatmat, dispensaRoom: room })).toEqual({
			lineCode: "90",
			smallValue: false,
			remaining: null,
		})
		// sem CATMAT, CATMAT sem classe, ramo sem entrada
		expect(checkDispensaRoom({ catmat: undefined, estimatedValue: 1, classByCatmat, dispensaRoom: room })).toEqual({
			lineCode: undefined,
			smallValue: false,
			remaining: null,
		})
		expect(checkDispensaRoom({ catmat: 3, estimatedValue: 1, classByCatmat, dispensaRoom: room })).toMatchObject({ smallValue: false, remaining: null })
		expect(checkDispensaRoom({ catmat: 4, estimatedValue: 1, classByCatmat: new Map([[4, "91"]]), dispensaRoom: room })).toMatchObject({
			smallValue: false,
			remaining: null,
		})
		// valor nulo
		expect(checkDispensaRoom({ catmat: 1, estimatedValue: null, classByCatmat, dispensaRoom: room })).toMatchObject({ smallValue: false, remaining: 600 })
	})

	it("formatCalcMemory com e sem estoque mínimo e fatores", () => {
		const stock = { available: 3, expiring: 1.5 }
		expect(
			formatCalcMemory({
				estimatedQuantity: 10,
				factors: { correction_factor: 1.2, rehydration_index: null },
				grossDemand: 12,
				minStock: 2,
				stock,
				inTransit: 1,
				netNeed: 10,
			})
		).toBe("bruta 10 × FC 1.2 ÷ IR 1 = 12 + mínimo 2; − estoque 3.00 (excl. 1.50 vencendo) − trânsito 1 = 10")
		expect(formatCalcMemory({ estimatedQuantity: 10, factors: undefined, grossDemand: 10, minStock: 0, stock, inTransit: 0, netNeed: 7 })).toBe(
			"bruta 10 × FC 1 ÷ IR 1 = 10; − estoque 3.00 (excl. 1.50 vencendo) − trânsito 0 = 7"
		)
	})
})

describe("buildReplenishmentSuggestion", () => {
	const baseContext = (overrides: Partial<ReplenishmentContext> = {}): ReplenishmentContext => ({
		horizonDays: 14,
		factorsById: new Map(),
		stockById: new Map(),
		transitById: new Map(),
		policyById: new Map(),
		expectedSupplierByIngredient: new Map(),
		observedByPurchaseItem: new Map(),
		arpBalanceById: new Map(),
		classByCatmat: new Map(),
		dispensaRoom: new Map(),
		defaultPurchaseByIngredient: new Map(),
		priceByIngredient: new Map(),
		catmatByIngredient: new Map(),
		catmatCodeByIngredient: new Map(),
		...overrides,
	})
	const need = { ingredient_id: "a", ingredient_name: "Arroz", measure_unit: "KG", estimated_quantity: 140 }
	const buildOne = (one: typeof need, ctx: ReplenishmentContext) => buildReplenishmentSuggestions([one], ctx)[0]

	it("insumo sem dado nenhum: tudo zerado, cobertura igual ao horizonte e licitação", () => {
		const result = buildOne({ ...need, estimated_quantity: 0 }, baseContext())
		expect(result).toMatchObject({
			ingredientId: "a",
			description: "Arroz",
			measureUnit: "KG",
			grossDemand: 0,
			availableStock: 0,
			expiringExcluded: 0,
			inTransit: 0,
			netNeed: 0,
			coverageDays: 14,
		})
		expect(result.calcMemory).toBe("bruta 0 × FC 1 ÷ IR 1 = 0; − estoque 0.00 (excl. 0.00 vencendo) − trânsito 0 = 0")
	})

	it("ARP própria com saldo cobre a necessidade", () => {
		const result = buildOne(
			need,
			baseContext({
				stockById: new Map([["a", { available: 20, expiring: 2.123456 }]]),
				transitById: new Map([["a", 10.123456]]),
				policyById: new Map([["a", { min_stock: 5, coverage_days: 7, urgency_threshold_days: null }]]),
				arpBalanceById: new Map([["a", 1000]]),
			})
		)
		// 140 + 5 − 20 − 10.1235
		expect(result.netNeed).toBe(114.8765)
		expect(result.inTransit).toBe(10.1235)
		expect(result.expiringExcluded).toBe(2.1235)
		expect(result.coverageDays).toBe(2)
		expect(result.channel).toBe("own_arp")
		expect(result.calcMemory).toContain("+ mínimo 5")
	})

	it("valor pequeno no ramo consome a folga da dispensa e entra no lead time do fornecedor esperado", () => {
		const dispensaRoom = new Map<string, number | null>([["89", 1000]])
		const result = buildOne(
			need,
			baseContext({
				defaultPurchaseByIngredient: new Map([["a", "p1"]]),
				expectedSupplierByIngredient: new Map([["a", "f1"]]),
				observedByPurchaseItem: new Map([["f1:p1", [4, 4, 4]]]),
				priceByIngredient: new Map([["a", { unitPrice: 2, conversionFactor: 2 }]]),
				catmatByIngredient: new Map([["a", true]]),
				catmatCodeByIngredient: new Map([["a", 1]]),
				classByCatmat: new Map([[1, "89"]]),
				dispensaRoom,
			})
		)
		expect(result.netNeed).toBe(140)
		// (140 ÷ 2) × 2 = 140 de 1000
		expect(dispensaRoom.get("89")).toBe(860)
		expect(result.leadTime.days).toBe(4)
	})

	it("buildReplenishmentSuggestions dá a folga da dispensa ao mais urgente, não ao primeiro em ordem alfabética", () => {
		const dispensaRoom = new Map<string, number | null>([["89", 150]])
		const policy = { min_stock: 0, coverage_days: 7, urgency_threshold_days: 5 }
		const ctx = baseContext({
			// 140 em 14 dias = 10/dia: "a" cobre 10 dias (folgado), "b" está zerado (urgente)
			stockById: new Map([["a", { available: 100, expiring: 0 }]]),
			policyById: new Map([
				["a", policy],
				["b", policy],
			]),
			priceByIngredient: new Map([
				["a", { unitPrice: 1, conversionFactor: 1 }],
				["b", { unitPrice: 1, conversionFactor: 1 }],
			]),
			catmatByIngredient: new Map([
				["a", true],
				["b", true],
			]),
			catmatCodeByIngredient: new Map([
				["a", 1],
				["b", 1],
			]),
			classByCatmat: new Map([[1, "89"]]),
			dispensaRoom,
		})
		// valores 40 (a) e 140 (b): a folga de 150 só cabe um dos dois
		const result = buildReplenishmentSuggestions(
			[
				{ ...need, ingredient_id: "a", ingredient_name: "Arroz" },
				{ ...need, ingredient_id: "b", ingredient_name: "Batata" },
			],
			ctx
		)
		expect(result.map((s) => s.ingredientId)).toEqual(["a", "b"]) // saída na ordem de entrada
		expect(result[0]).toMatchObject({ coverageDays: 10, netNeed: 40, channel: "licitacao" })
		expect(result[1]).toMatchObject({ coverageDays: 0, netNeed: 140, channel: "supermercado_virtual" })
		expect(dispensaRoom.get("89")).toBe(10)
	})

	it("buildReplenishmentSuggestions desempata pela necessidade e depois pelo id, independente da ordem de entrada", () => {
		const policy = { min_stock: 0, coverage_days: 7, urgency_threshold_days: 5 }
		const make = () =>
			baseContext({
				policyById: new Map(["x", "y", "z"].map((id) => [id, policy])),
				priceByIngredient: new Map(["x", "y", "z"].map((id) => [id, { unitPrice: 1, conversionFactor: 1 }])),
				catmatByIngredient: new Map(["x", "y", "z"].map((id) => [id, true])),
				catmatCodeByIngredient: new Map(["x", "y", "z"].map((id) => [id, 1])),
				classByCatmat: new Map([[1, "89"]]),
				// todos com cobertura 0: "y" (necessidade 200) vem antes; "x" e "z" (100) desempatam pelo id
				dispensaRoom: new Map<string, number | null>([["89", 300]]),
			})
		const needs = [
			{ ...need, ingredient_id: "z", estimated_quantity: 100 },
			{ ...need, ingredient_id: "y", estimated_quantity: 200 },
			{ ...need, ingredient_id: "x", estimated_quantity: 100 },
		]
		const forward = buildReplenishmentSuggestions(needs, make())
		const backward = buildReplenishmentSuggestions([...needs].reverse(), make())
		const channelById = (list: ReplenishmentSuggestion[]) => Object.fromEntries(list.map((s) => [s.ingredientId, s.channel]))
		expect(channelById(forward)).toEqual({ x: "supermercado_virtual", y: "supermercado_virtual", z: "licitacao" })
		expect(channelById(backward)).toEqual(channelById(forward))
	})

	const twoItemContext = (overrides: Partial<ReplenishmentContext>) =>
		baseContext({
			priceByIngredient: new Map([
				["a", { unitPrice: 1, conversionFactor: 1 }],
				["b", { unitPrice: 1, conversionFactor: 1 }],
			]),
			catmatByIngredient: new Map([
				["a", true],
				["b", true],
			]),
			catmatCodeByIngredient: new Map([
				["a", 1],
				["b", 1],
			]),
			classByCatmat: new Map([[1, "89"]]),
			...overrides,
		})
	const twoNeeds = [
		{ ...need, ingredient_id: "a", ingredient_name: "Arroz" },
		{ ...need, ingredient_id: "b", ingredient_name: "Batata" },
	]

	it("buildReplenishmentSuggestions: o urgente coberto por ARP própria não tira a folga do próximo urgente", () => {
		const dispensaRoom = new Map<string, number | null>([["89", 150]])
		const policy = { min_stock: 0, coverage_days: 7, urgency_threshold_days: 5 }
		const result = buildReplenishmentSuggestions(
			twoNeeds,
			twoItemContext({
				// "a" zerado (mais urgente) e com ARP própria; "b" com 2 dias de cobertura
				stockById: new Map([["b", { available: 20, expiring: 0 }]]),
				policyById: new Map([
					["a", policy],
					["b", policy],
				]),
				arpBalanceById: new Map([["a", 1000]]),
				dispensaRoom,
			})
		)
		expect(result[0]).toMatchObject({ coverageDays: 0, netNeed: 140, channel: "own_arp" })
		expect(result[1]).toMatchObject({ coverageDays: 2, netNeed: 120, channel: "supermercado_virtual" })
		expect(dispensaRoom.get("89")).toBe(30)
	})

	it("buildReplenishmentSuggestions ordena pela distância até o limiar, não pela cobertura absoluta", () => {
		const dispensaRoom = new Map<string, number | null>([["89", 150]])
		const result = buildReplenishmentSuggestions(
			twoNeeds,
			twoItemContext({
				// "a": 3 dias de cobertura, limiar 4 (1 dia atrasado); "b": 4 dias, limiar 20 (16 dias)
				stockById: new Map([
					["a", { available: 30, expiring: 0 }],
					["b", { available: 40, expiring: 0 }],
				]),
				policyById: new Map([
					["a", { min_stock: 0, coverage_days: 7, urgency_threshold_days: 4 }],
					["b", { min_stock: 0, coverage_days: 7, urgency_threshold_days: 20 }],
				]),
				dispensaRoom,
			})
		)
		expect(result[1]).toMatchObject({ coverageDays: 4, netNeed: 100, channel: "supermercado_virtual" })
		expect(result[0]).toMatchObject({ coverageDays: 3, netNeed: 110, channel: "licitacao" })
		expect(dispensaRoom.get("89")).toBe(50)
	})

	it("rankReplenishmentSuggestions filtra sem necessidade nem vencimento e ordena pela necessidade", () => {
		const s = (ingredientId: string, netNeed: number, expiringExcluded: number) => ({ ingredientId, netNeed, expiringExcluded }) as ReplenishmentSuggestion
		expect(rankReplenishmentSuggestions([s("a", 1, 0), s("b", 0, 0), s("c", 0, 2), s("d", 5, 0)]).map((x) => x.ingredientId)).toEqual(["d", "a", "c"])
	})
})
