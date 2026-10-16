import { afterEach, describe, expect, it, vi } from "vitest"
import {
	abandonDraftAdjustment,
	buildAdjustmentDocumentRow,
	buildAdjustmentItemRow,
	buildPostFailureRecovery,
	composeRecoveryNotes,
	findAdjustmentLotProblem,
} from "@/lib/stock-adjustment"

describe("findAdjustmentLotProblem", () => {
	it("lotes todos da cozinha e todos achados: sem problema", () => {
		expect(findAdjustmentLotProblem([{ kitchen_id: 1 }, { kitchen_id: 1 }], 1, ["a", "b"])).toBeNull()
	})

	it("lote repetido no pedido conta uma vez", () => {
		expect(findAdjustmentLotProblem([{ kitchen_id: 1 }], 1, ["a", "a"])).toBeNull()
	})

	it("lote de outra cozinha", () => {
		expect(findAdjustmentLotProblem([{ kitchen_id: 1 }, { kitchen_id: 2 }], 1, ["a", "b"])).toBe("Lote de outra cozinha")
	})

	it("outra cozinha é conferido antes de lote faltando", () => {
		expect(findAdjustmentLotProblem([{ kitchen_id: 2 }], 1, ["a", "b"])).toBe("Lote de outra cozinha")
	})

	it("lote não encontrado", () => {
		expect(findAdjustmentLotProblem([{ kitchen_id: 1 }], 1, ["a", "b"])).toBe("Lote não encontrado")
	})
})

describe("buildAdjustmentDocumentRow", () => {
	it("apara a observação e marca evidência pendente", () => {
		expect(buildAdjustmentDocumentRow({ kitchenId: 3, notes: "  quebra  ", isEvidencePending: true, userId: "u", submittedAt: "t" })).toEqual({
			kitchen_id: 3,
			notes: "quebra",
			evidence_status: "pending",
			created_by: "u",
			submitted_at: "t",
		})
	})

	it("observação vazia ou ausente vira null; evidência completa", () => {
		expect(buildAdjustmentDocumentRow({ kitchenId: 3, notes: "   ", isEvidencePending: false, userId: "u", submittedAt: "t" })).toMatchObject({
			notes: null,
			evidence_status: "complete",
		})
		expect(buildAdjustmentDocumentRow({ kitchenId: 3, notes: undefined, isEvidencePending: false, userId: "u", submittedAt: "t" }).notes).toBeNull()
	})
})

describe("buildAdjustmentItemRow", () => {
	it("copia o item com os textos aparados", () => {
		expect(
			buildAdjustmentItemRow("doc", {
				lotId: "l",
				ingredientId: "i",
				frozenPreparationId: "f",
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
			ingredient_id: "i",
			frozen_preparation_id: "f",
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
			ingredient_id: null,
			frozen_preparation_id: null,
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

describe("abandonDraftAdjustment", () => {
	const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
	afterEach(() => consoleError.mockClear())
	const DOC = "doc-1"

	it("rascunho desfeito: lança só o erro original", async () => {
		const deleteDraft = vi.fn(async () => ({ data: [{ id: DOC }], error: null }))
		await expect(abandonDraftAdjustment(deleteDraft, DOC, "Erro nos itens do ajuste: x")).rejects.toThrow(/^Erro nos itens do ajuste: x$/)
		expect(deleteDraft).toHaveBeenCalledOnce()
	})

	it("o desfazer que falha NÃO é engolido: a mensagem diz que o rascunho ficou, com os dois motivos", async () => {
		// Antes, a falha nos itens apagava o rascunho ignorando o erro do delete: o documento
		// ficava órfão em `draft` e a tela dizia só "Erro nos itens do ajuste".
		const outcome = abandonDraftAdjustment(
			async () => ({ data: null, error: { code: "", message: "TypeError: fetch failed" } }),
			DOC,
			"Erro nos itens do ajuste: x"
		)
		await expect(outcome).rejects.toThrow(
			"Erro nos itens do ajuste: x — e o rascunho doc-1 não pôde ser desfeito (o banco não respondeu; tente de novo); avise o nível 3"
		)
		expect(consoleError).toHaveBeenCalled()
	})

	it("nenhuma linha apagada não é 'desfeito': o documento pode já ter sido enviado, e reenviar duplicaria", async () => {
		// A escrita que "falhou" (envio para aprovação) foi gravada e só a resposta se perdeu: o
		// documento saiu de `draft`, o delete apaga 0 linhas sem erro.
		const outcome = abandonDraftAdjustment(async () => ({ data: [], error: null }), DOC, "Erro ao enviar o ajuste para aprovação: z")
		await expect(outcome).rejects.toThrow(
			"Erro ao enviar o ajuste para aprovação: z — e o documento doc-1 não estava mais em rascunho: o ajuste pode já ter sido enviado. Confira a lista de ajustes antes de lançar de novo"
		)
	})

	it("o desfazer que lança (transporte) também é dito", async () => {
		const outcome = abandonDraftAdjustment(
			async () => {
				throw new Error("AbortError: deadline")
			},
			DOC,
			"Erro ao conferir a alçada do ajuste: y"
		)
		await expect(outcome).rejects.toThrow(/rascunho doc-1 não pôde ser desfeito \(o banco não respondeu; tente de novo\)/)
	})
})
