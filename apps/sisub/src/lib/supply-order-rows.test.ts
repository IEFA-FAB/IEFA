import { describe, expect, it } from "vitest"
import {
	buildEmpenhoLinkUpdate,
	buildSupplyOrderItemRow,
	buildSupplyOrderRow,
	collectOrderArpItemIds,
	getKitchenPurchaseUnitId,
	isSupplyOrderGateMessage,
	toLinkEmpenhoFacts,
} from "@/lib/supply-order-rows"

describe("getKitchenPurchaseUnitId", () => {
	it("unidade compradora vence a unidade da cozinha; cozinha ausente dá null", () => {
		expect(getKitchenPurchaseUnitId({ unit_id: 1, purchase_unit_id: 2 })).toBe(2)
		expect(getKitchenPurchaseUnitId({ unit_id: 1, purchase_unit_id: null })).toBe(1)
		expect(getKitchenPurchaseUnitId({ unit_id: null, purchase_unit_id: null })).toBeNull()
		expect(getKitchenPurchaseUnitId(null)).toBeNull()
		expect(getKitchenPurchaseUnitId(undefined)).toBeNull()
	})
})

describe("emissão", () => {
	it("collectOrderArpItemIds tira os vazios e mantém a ordem", () => {
		expect(collectOrderArpItemIds([{ arpItemId: "a" }, {}, { arpItemId: "" }, { arpItemId: "a" }])).toEqual(["a", "a"])
	})

	it("buildSupplyOrderRow com empenho e SICAF reconhecido", () => {
		expect(
			buildSupplyOrderRow({
				empenhoId: "ne",
				kitchenId: 3,
				number: " OF-1 ",
				sentAt: "2026-10-13",
				expectedDelivery: "2026-10-20",
				sicafStatus: "irregular: x",
				isSicafAcknowledged: true,
				userId: "u",
			})
		).toEqual({
			empenho_id: "ne",
			kitchen_id: 3,
			number: "OF-1",
			sent_at: "2026-10-13",
			expected_delivery: "2026-10-20",
			status: "sent",
			sicaf_status: "irregular: x",
			sicaf_ack_by: "u",
			created_by: "u",
		})
	})

	it("buildSupplyOrderRow aguardando empenho, sem número e sem reconhecimento", () => {
		expect(
			buildSupplyOrderRow({
				empenhoId: undefined,
				kitchenId: 3,
				number: "  ",
				sentAt: "s",
				expectedDelivery: "e",
				sicafStatus: null,
				isSicafAcknowledged: undefined,
				userId: "u",
			})
		).toMatchObject({ empenho_id: null, number: null, sicaf_status: null, sicaf_ack_by: null })
		expect(
			buildSupplyOrderRow({
				empenhoId: null,
				kitchenId: 3,
				number: undefined,
				sentAt: "s",
				expectedDelivery: "e",
				sicafStatus: null,
				isSicafAcknowledged: false,
				userId: "u",
			})
		).toMatchObject({ empenho_id: null, number: null, sicaf_ack_by: null })
	})

	it("buildSupplyOrderItemRow: o item de compra informado vence o resolvido pelo CATMAT", () => {
		const resolved = new Map([["arp1", "pi-catmat"]])
		expect(buildSupplyOrderItemRow("of", { arpItemId: "arp1", purchaseItemId: "pi", orderedQty: 2, unitPrice: 0 }, resolved)).toEqual({
			supply_order_id: "of",
			arp_item_id: "arp1",
			purchase_item_id: "pi",
			ordered_qty: 2,
			unit_price: 0,
		})
		expect(buildSupplyOrderItemRow("of", { arpItemId: "arp1", orderedQty: 2 }, resolved)).toMatchObject({ purchase_item_id: "pi-catmat", unit_price: null })
		expect(buildSupplyOrderItemRow("of", { arpItemId: "arp2", orderedQty: 2 }, resolved)).toMatchObject({ purchase_item_id: null })
		expect(buildSupplyOrderItemRow("of", { orderedQty: 2 }, resolved)).toMatchObject({ arp_item_id: null, purchase_item_id: null })
	})

	it("isSupplyOrderGateMessage reconhece as recusas do trigger", () => {
		expect(isSupplyOrderGateMessage("O valor excede o saldo")).toBe(true)
		expect(isSupplyOrderGateMessage("empenho anulado")).toBe(true)
		expect(isSupplyOrderGateMessage("OF sem preço")).toBe(true)
		expect(isSupplyOrderGateMessage("duplicate key")).toBe(false)
	})
})

describe("vínculo da NE", () => {
	it("toLinkEmpenhoFacts normaliza unidade e status", () => {
		expect(toLinkEmpenhoFacts({ unit_id: "7", status: "ativo" }, ["a"])).toEqual({ unitId: 7, status: "ativo", coveredArpItemIds: ["a"] })
		expect(toLinkEmpenhoFacts({ unit_id: null, status: null }, [])).toEqual({ unitId: null, status: "null", coveredArpItemIds: [] })
	})

	it("buildEmpenhoLinkUpdate só grava o SICAF quando houve consulta", () => {
		expect(buildEmpenhoLinkUpdate({ empenhoId: "ne", updatedAt: "t", sicafStatus: null, isSicafAcknowledged: true, userId: "u" })).toEqual({
			empenho_id: "ne",
			updated_at: "t",
		})
		expect(buildEmpenhoLinkUpdate({ empenhoId: "ne", updatedAt: "t", sicafStatus: "regular: ok", isSicafAcknowledged: false, userId: "u" })).toEqual({
			empenho_id: "ne",
			updated_at: "t",
			sicaf_status: "regular: ok",
			sicaf_ack_by: null,
		})
		expect(buildEmpenhoLinkUpdate({ empenhoId: "ne", updatedAt: "t", sicafStatus: "irregular: x", isSicafAcknowledged: true, userId: "u" })).toMatchObject({
			sicaf_ack_by: "u",
		})
	})
})
