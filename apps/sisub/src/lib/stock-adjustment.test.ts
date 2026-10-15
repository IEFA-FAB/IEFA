import { describe, expect, it } from "vitest"
import {
	buildAdjustmentDocumentRow,
	buildAdjustmentItemRow,
	buildPostFailureRecovery,
	composeRecoveryNotes,
	findAdjustmentLotProblem,
} from "@/lib/stock-adjustment"

describe("findAdjustmentLotProblem", () => {
	it("lotes todos do local e todos achados: sem problema", () => {
		expect(findAdjustmentLotProblem([{ location_id: 1 }, { location_id: 1 }], 1, ["a", "b"])).toBeNull()
	})

	it("lote repetido no pedido conta uma vez", () => {
		expect(findAdjustmentLotProblem([{ location_id: 1 }], 1, ["a", "a"])).toBeNull()
	})

	it("lote de outro local", () => {
		expect(findAdjustmentLotProblem([{ location_id: 1 }, { location_id: 2 }], 1, ["a", "b"])).toBe("Lote de outra cozinha")
	})

	it("outro local é conferido antes de lote faltando", () => {
		expect(findAdjustmentLotProblem([{ location_id: 2 }], 1, ["a", "b"])).toBe("Lote de outra cozinha")
	})

	it("lote não encontrado", () => {
		expect(findAdjustmentLotProblem([{ location_id: 1 }], 1, ["a", "b"])).toBe("Lote não encontrado")
	})
})

describe("buildAdjustmentDocumentRow", () => {
	it("apara a observação e marca evidência pendente", () => {
		expect(buildAdjustmentDocumentRow({ locationId: 3, notes: "  quebra  ", isEvidencePending: true, userId: "u", submittedAt: "t" })).toEqual({
			location_id: 3,
			notes: "quebra",
			evidence_status: "pending",
			created_by: "u",
			submitted_at: "t",
		})
	})

	it("observação vazia ou ausente vira null; evidência completa", () => {
		expect(buildAdjustmentDocumentRow({ locationId: 3, notes: "   ", isEvidencePending: false, userId: "u", submittedAt: "t" })).toMatchObject({
			notes: null,
			evidence_status: "complete",
		})
		expect(buildAdjustmentDocumentRow({ locationId: 3, notes: undefined, isEvidencePending: false, userId: "u", submittedAt: "t" }).notes).toBeNull()
	})
})

describe("buildAdjustmentItemRow", () => {
	it("copia o item com os textos aparados", () => {
		expect(
			buildAdjustmentItemRow("doc", {
				lotId: "l",
				ingredientId: "i",
				direction: "out",
				quantity: 2,
				unitCost: 3.5,
				reasonCode: "spoiled",
				note: " mofo ",
				evidenceKind: "photo",
				evidenceReference: " foto-1 ",
				measuredTemperatureC: 9,
				correctedMovementId: "m",
			})
		).toEqual({
			adjustment_id: "doc",
			lot_id: "l",
			item_id: "i",
			direction: "out",
			quantity: 2,
			unit_cost: 3.5,
			reason_code: "spoiled",
			note: "mofo",
			evidence_kind: "photo",
			evidence_reference: "foto-1",
			measured_temperature_c: 9,
			corrected_movement_id: "m",
		})
	})

	it("a preparação congelada também vira o `item_id`", () => {
		expect(buildAdjustmentItemRow("doc", { frozenPreparationId: "f", direction: "out", quantity: 1, reasonCode: "spoiled" }).item_id).toBe("f")
	})

	it("ausentes e textos vazios viram null; zero continua zero", () => {
		expect(
			buildAdjustmentItemRow("doc", {
				direction: "in",
				quantity: 1,
				reasonCode: "found",
				note: "  ",
				evidenceReference: "",
				unitCost: 0,
				measuredTemperatureC: 0,
			})
		).toEqual({
			adjustment_id: "doc",
			lot_id: null,
			item_id: null,
			direction: "in",
			quantity: 1,
			unit_cost: 0,
			reason_code: "found",
			note: null,
			evidence_kind: null,
			evidence_reference: null,
			measured_temperature_c: 0,
			corrected_movement_id: null,
		})
	})
})

describe("recuperação do lançamento que falhou", () => {
	it("composeRecoveryNotes acrescenta a falha à observação do operador", () => {
		expect(composeRecoveryNotes("caiu da prateleira", "Lançamento automático falhou: x")).toBe("caiu da prateleira\n\nLançamento automático falhou: x")
		expect(composeRecoveryNotes("", "falhou")).toBe("falhou")
		expect(composeRecoveryNotes(undefined, "falhou")).toBe("falhou")
	})

	it("grava a exigência quando a regra relida exige", () => {
		expect(buildPostFailureRecovery({ operatorNote: undefined, failureNote: "f", isRequirementUnknown: false, nowRequires: true })).toEqual({
			status: "pending_approval",
			notes: "f",
			approval_required: true,
		})
	})

	it("grava a exigência quando a releitura falhou (falha fechada)", () => {
		expect(buildPostFailureRecovery({ operatorNote: "o", failureNote: "f", isRequirementUnknown: true, nowRequires: null })).toEqual({
			status: "pending_approval",
			notes: "o\n\nf",
			approval_required: true,
		})
	})

	it("não toca a exigência quando a regra relida não exige", () => {
		const update = buildPostFailureRecovery({ operatorNote: "o", failureNote: "f", isRequirementUnknown: false, nowRequires: false })
		expect(update).toEqual({ status: "pending_approval", notes: "o\n\nf" })
		expect("approval_required" in update).toBe(false)
	})
})
