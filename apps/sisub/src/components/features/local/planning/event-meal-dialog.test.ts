import { MAX_EVENT_MEAL_GROUPS } from "@iefa/sisub-domain/schemas"
import { describe, expect, test, vi } from "vitest"
import { type EventMealDraft, groupSuggestionsFor } from "@/lib/event-meals"
import { assessEventMealDraft, type DraftGroup, fromDraftGroup, getEventMealDialogTitle, MAX_LABEL, MAX_NAME, toDraftGroup } from "./event-meal-dialog"

const meal: EventMealDraft = { id: "m1", name: "Coquetel", meal_type_id: "mt1", groups: [], base_headcount: null }
const group = (over: Partial<DraftGroup> = {}): DraftGroup => ({ key: "entrada", label: "Entradas", minItems: "", maxItems: "", ...over })

describe("toDraftGroup / fromDraftGroup", () => {
	test("contagens viram texto e voltam a número; vazio some", () => {
		expect(toDraftGroup({ key: "a", label: "A", minItems: 2, maxItems: 0 })).toEqual({ key: "a", label: "A", minItems: "2", maxItems: "0" })
		expect(toDraftGroup({ key: "a", label: "A" })).toEqual({ key: "a", label: "A", minItems: "", maxItems: "" })
		expect(toDraftGroup({ key: "a", label: "A", minItems: null, maxItems: null })).toEqual({ key: "a", label: "A", minItems: "", maxItems: "" })
		expect(fromDraftGroup(group({ minItems: "2", maxItems: "0" }))).toEqual({ key: "entrada", label: "Entradas", minItems: 2, maxItems: 0 })
		expect(fromDraftGroup(group({ minItems: "x" }))).toEqual({ key: "entrada", label: "Entradas" })
	})
})

describe("assessEventMealDraft", () => {
	const ok = { meal, name: "Coquetel", mealTypeId: "mt1", groups: [group()], templateType: "event" as const, countLeaving: () => 0 }

	test("refeição válida pode salvar; chave nova sai do rótulo", () => {
		const out = assessEventMealDraft({ ...ok, groups: [group(), group({ key: "", label: " Sobremesas " })] })
		expect(out.canSave).toBe(true)
		expect(out.resolved[1]?.label).toBe("Sobremesas")
		expect(out.resolved[1]?.key).not.toBe("")
		expect(out).toMatchObject({ hasBlank: false, duplicate: undefined, tooMany: false, invertedCount: undefined, missingGroups: false, leaving: 0 })
	})

	test("sem refeição não salva e não conta quem sai", () => {
		const countLeaving = vi.fn(() => 3)
		const out = assessEventMealDraft({ ...ok, meal: null, countLeaving })
		expect(out.canSave).toBe(false)
		expect(out.leaving).toBe(0)
		expect(countLeaving).not.toHaveBeenCalled()
	})

	test("conta as preparações que saem de grupo, com a composição resolvida", () => {
		const countLeaving = vi.fn(() => 2)
		const out = assessEventMealDraft({ ...ok, countLeaving })
		expect(out.leaving).toBe(2)
		expect(countLeaving).toHaveBeenCalledWith("m1", out.resolved)
	})

	test("nome e horário obrigatórios", () => {
		expect(assessEventMealDraft({ ...ok, name: "  " }).canSave).toBe(false)
		expect(assessEventMealDraft({ ...ok, mealTypeId: "" }).canSave).toBe(false)
	})

	test("evento sem grupo trava; apoio sem grupo é o kit simples", () => {
		expect(assessEventMealDraft({ ...ok, groups: [] })).toMatchObject({ missingGroups: true, canSave: false })
		expect(assessEventMealDraft({ ...ok, groups: [], templateType: "apoio" })).toMatchObject({ missingGroups: false, canSave: true })
	})

	test("grupo em branco, repetido, demais, longo ou com contagem invertida", () => {
		expect(assessEventMealDraft({ ...ok, groups: [group({ label: " " })] })).toMatchObject({ hasBlank: true, canSave: false })
		const dup = assessEventMealDraft({ ...ok, groups: [group(), group({ key: "outra", label: "entradas" })] })
		expect(dup.duplicate?.label).toBe("entradas")
		expect(dup.canSave).toBe(false)
		const many = Array.from({ length: MAX_EVENT_MEAL_GROUPS + 1 }, (_, i) => group({ key: `g${i}`, label: `Grupo ${i}` }))
		expect(assessEventMealDraft({ ...ok, groups: many })).toMatchObject({ tooMany: true, canSave: false })
		expect(assessEventMealDraft({ ...ok, groups: [group({ label: "x".repeat(MAX_LABEL + 1) })] }).canSave).toBe(false)
		expect(assessEventMealDraft({ ...ok, groups: [group({ label: "x".repeat(MAX_LABEL) })] }).canSave).toBe(true)
		const inverted = assessEventMealDraft({ ...ok, groups: [group({ minItems: "5", maxItems: "2" })] })
		expect(inverted.invertedCount).toMatchObject({ label: "Entradas", minItems: 5, maxItems: 2 })
		expect(inverted.canSave).toBe(false)
	})

	test("nome longo demais (contado sem os espaços das pontas)", () => {
		expect(assessEventMealDraft({ ...ok, name: "x".repeat(MAX_NAME + 1) }).canSave).toBe(false)
		expect(assessEventMealDraft({ ...ok, name: ` ${"x".repeat(MAX_NAME)} ` }).canSave).toBe(true)
	})

	test("sugestões somem quando a chave ou o rótulo já está na composição", () => {
		const all = groupSuggestionsFor("event")
		const first = all[0]
		if (!first) throw new Error("sem sugestões de evento")
		expect(assessEventMealDraft({ ...ok, groups: [] }).suggestions).toEqual(all)
		expect(assessEventMealDraft({ ...ok, groups: [group({ key: first.key, label: "Outro nome" })] }).suggestions).not.toContainEqual(first)
		expect(assessEventMealDraft({ ...ok, groups: [group({ key: "", label: first.label })] }).suggestions).not.toContainEqual(first)
		expect(assessEventMealDraft({ ...ok, templateType: "apoio", groups: [] }).suggestions).toEqual(groupSuggestionsFor("apoio"))
	})
})

describe("getEventMealDialogTitle", () => {
	test("nova (evento ou apoio) ou edição", () => {
		expect(getEventMealDialogTitle(true, true)).toBe("Nova refeição do apoio")
		expect(getEventMealDialogTitle(true, false)).toBe("Nova refeição do evento")
		expect(getEventMealDialogTitle(false, true)).toBe("Editar refeição")
	})
})
