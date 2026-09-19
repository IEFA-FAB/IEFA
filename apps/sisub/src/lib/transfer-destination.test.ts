import { describe, expect, test } from "vitest"
import { transferDestinationProblem } from "@/lib/transfer-destination"

describe("transferDestinationProblem — o destino não é um id qualquer", () => {
	const origin = { unitId: 1, purchaseUnitId: 10 }

	test("mesma OM de lotação passa", () => {
		expect(transferDestinationProblem({ origin, destination: { unitId: 1, purchaseUnitId: null }, callerOperatesDestination: false })).toBeNull()
	})

	test("mesma unidade compradora passa", () => {
		expect(transferDestinationProblem({ origin, destination: { unitId: 2, purchaseUnitId: 10 }, callerOperatesDestination: false })).toBeNull()
	})

	test("outra OM é recusada, a menos que o chamador opere o estoque do destino", () => {
		const destination = { unitId: 3, purchaseUnitId: 30 }
		expect(transferDestinationProblem({ origin, destination, callerOperatesDestination: false })).toMatch(/mesma OM/)
		expect(transferDestinationProblem({ origin, destination, callerOperatesDestination: true })).toBeNull()
	})

	test("destino inexistente é recusado mesmo para quem opera tudo", () => {
		expect(transferDestinationProblem({ origin, destination: null, callerOperatesDestination: true })).toMatch(/não encontrada/)
	})

	test("cozinha sem OM nenhuma não casa com nada", () => {
		const orphan = { unitId: null, purchaseUnitId: null }
		expect(transferDestinationProblem({ origin: orphan, destination: orphan, callerOperatesDestination: false })).toMatch(/mesma OM/)
	})
})
