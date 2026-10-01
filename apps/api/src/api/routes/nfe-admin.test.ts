import { describe, expect, test } from "bun:test"
import { kitchenForImportedNfe } from "./nfe-admin.ts"

describe("kitchenForImportedNfe — a nota fica com a cozinha só se for da unidade dela", () => {
	test("destinatário é a unidade de compra da cozinha: fica com ela", () => {
		expect(kitchenForImportedNfe({ requestedKitchenId: 7, destinationUnitId: 5, kitchenPurchaseUnitId: 5 })).toBe(7)
	})

	test("destinatário é OUTRA unidade: a nota vai sem cozinha para a triagem da unidade certa", () => {
		expect(kitchenForImportedNfe({ requestedKitchenId: 7, destinationUnitId: 6, kitchenPurchaseUnitId: 5 })).toBeNull()
	})

	test("cozinha sem unidade de compra não fica com nota de unidade reconhecida", () => {
		expect(kitchenForImportedNfe({ requestedKitchenId: 7, destinationUnitId: 6, kitchenPurchaseUnitId: null })).toBeNull()
	})

	test("destinatário não reconhecido mantém a cozinha que enviou (não há para onde mandar)", () => {
		expect(kitchenForImportedNfe({ requestedKitchenId: 7, destinationUnitId: null, kitchenPurchaseUnitId: 5 })).toBe(7)
	})

	test("envio sem cozinha (triagem global) continua sem cozinha", () => {
		expect(kitchenForImportedNfe({ requestedKitchenId: null, destinationUnitId: 5, kitchenPurchaseUnitId: null })).toBeNull()
	})
})
