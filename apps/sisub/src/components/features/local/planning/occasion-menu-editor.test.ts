import { describe, expect, test } from "vitest"
import { type EventMealDraft, SUPPORT_KIT_MEAL_NAME } from "@/lib/event-meals"
import { EMPTY_SNACK_STANDARD_DRAFT, OCCASION_DAY, OCCASION_MENU_COPY, SNACK_MEAL_TYPE_NAME } from "@/lib/occasion-menu"
import type { TemplateItemDraft } from "@/types/domain/planning"
import {
	areSlotsReady,
	buildInitialOccasionContent,
	buildOccasionUpdates,
	buildSlotOptions,
	deriveOccasionEditorFlags,
	describeMealOrigin,
	isForkOnSave,
	isTemplateOutOfContext,
	kitchenIdOf,
	lockedSlotNameFor,
	mealDialogViewOf,
	printTooltipLabel,
	recipeIdsInMeal,
	resolveSlotName,
	saveBlockReason,
} from "./occasion-menu-editor"

const KITCHEN = { scope: "kitchen", kitchenId: 7 } as const
const GLOBAL = { scope: "global" } as const
const eventCopy = OCCASION_MENU_COPY.event
const feminineCopy = { ...eventCopy, article: "a" as const, noun: "ceia" }

const meal = (over: Partial<EventMealDraft> = {}): EventMealDraft => ({
	id: "m1",
	name: "Jantar",
	meal_type_id: "mt1",
	groups: [],
	base_headcount: null,
	...over,
})
const item = (over: Partial<TemplateItemDraft> = {}): TemplateItemDraft =>
	({ day_of_week: OCCASION_DAY, meal_type_id: "m1", recipe_id: "r1", headcount_override: null, recommended_proportion: null, ...over }) as TemplateItemDraft

describe("kitchenIdOf", () => {
	test("cozinha devolve o id; global, null", () => {
		expect(kitchenIdOf(KITCHEN)).toBe(7)
		expect(kitchenIdOf(GLOBAL)).toBeNull()
	})
})

describe("isForkOnSave", () => {
	test("só forka global aberto na cozinha", () => {
		expect(isForkOnSave(KITCHEN, { kitchen_id: null })).toBe(true)
		expect(isForkOnSave(KITCHEN, { kitchen_id: 7 })).toBe(false)
		expect(isForkOnSave(KITCHEN, null)).toBe(false)
		expect(isForkOnSave(KITCHEN, undefined)).toBe(false)
		expect(isForkOnSave(GLOBAL, { kitchen_id: null })).toBe(false)
	})
})

describe("isTemplateOutOfContext", () => {
	test("sem template não está fora de contexto", () => {
		expect(isTemplateOutOfContext(null, "event", KITCHEN)).toBe(false)
		expect(isTemplateOutOfContext(undefined, "event", GLOBAL)).toBe(false)
	})
	test("tipo diferente do da rota", () => {
		expect(isTemplateOutOfContext({ kitchen_id: 7, template_type: "apoio" }, "event", KITCHEN)).toBe(true)
	})
	test("template de cozinha aberto pela rota global", () => {
		expect(isTemplateOutOfContext({ kitchen_id: 7, template_type: "event" }, "event", GLOBAL)).toBe(true)
		expect(isTemplateOutOfContext({ kitchen_id: null, template_type: "event" }, "event", GLOBAL)).toBe(false)
	})
	test("cozinha abre template local ou global do mesmo tipo", () => {
		expect(isTemplateOutOfContext({ kitchen_id: 7, template_type: "event" }, "event", KITCHEN)).toBe(false)
		expect(isTemplateOutOfContext({ kitchen_id: null, template_type: "event" }, "event", KITCHEN)).toBe(false)
	})
})

describe("deriveOccasionEditorFlags", () => {
	const base = { editContext: KITCHEN, templateType: "event", isSupportMenu: false, snackEnabled: false, willFork: false, kitchenId: 7 } as const

	test("evento na cozinha", () => {
		expect(deriveOccasionEditorFlags(base)).toEqual({
			isSnackStandard: false,
			isKitchenTemplate: true,
			allowAbsolutes: true,
			allowMealAbsolutes: true,
			isGlobalEvent: false,
			canAddModelMeal: true,
			showOccurrences: false,
			canApplyToCalendar: true,
			isSuggestedSlot: false,
			headcountScope: "event-meal-base",
		})
	})
	test("evento na cozinha que vai forkar não monta por modelo", () => {
		expect(deriveOccasionEditorFlags({ ...base, willFork: true }).canAddModelMeal).toBe(false)
	})
	test("evento no catálogo global", () => {
		expect(deriveOccasionEditorFlags({ ...base, editContext: GLOBAL, kitchenId: null })).toEqual({
			isSnackStandard: false,
			isKitchenTemplate: false,
			allowAbsolutes: false,
			allowMealAbsolutes: false,
			isGlobalEvent: true,
			canAddModelMeal: false,
			showOccurrences: false,
			canApplyToCalendar: false,
			isSuggestedSlot: true,
			headcountScope: "event-meal-base",
		})
	})
	test("apoio na cozinha, sem e com padrão de lanche", () => {
		const support = { ...base, templateType: "apoio", isSupportMenu: true } as const
		expect(deriveOccasionEditorFlags(support)).toMatchObject({
			isSnackStandard: false,
			allowMealAbsolutes: true,
			canAddModelMeal: false,
			showOccurrences: true,
			canApplyToCalendar: true,
			headcountScope: "support-meal-kits",
		})
		expect(deriveOccasionEditorFlags({ ...support, snackEnabled: true })).toMatchObject({
			isSnackStandard: true,
			allowAbsolutes: true,
			allowMealAbsolutes: false,
			showOccurrences: true,
			canApplyToCalendar: false,
			isSuggestedSlot: false,
		})
	})
	test("padrão de lanche só vale no apoio", () => {
		expect(deriveOccasionEditorFlags({ ...base, snackEnabled: true }).isSnackStandard).toBe(false)
	})
	test("apoio global com padrão de lanche não sugere horário", () => {
		const flags = deriveOccasionEditorFlags({ ...base, editContext: GLOBAL, kitchenId: null, templateType: "apoio", isSupportMenu: true, snackEnabled: true })
		expect(flags).toMatchObject({ isSnackStandard: true, isGlobalEvent: false, showOccurrences: false, isSuggestedSlot: false })
	})
})

describe("areSlotsReady", () => {
	test("evento não espera horário", () => {
		expect(areSlotsReady(false, false, false)).toBe(true)
	})
	test("apoio espera os dois", () => {
		expect(areSlotsReady(true, true, true)).toBe(true)
		expect(areSlotsReady(true, true, false)).toBe(false)
		expect(areSlotsReady(true, false, true)).toBe(false)
	})
})

describe("buildOccasionUpdates", () => {
	test("evento local não manda ocorrências", () => {
		expect(buildOccasionUpdates({ name: "  Jantar ", description: "  ", occurrences: "3", isSupportMenu: false, allowAbsolutes: true })).toEqual({
			name: "Jantar",
			description: null,
		})
	})
	test("apoio local manda as ocorrências lidas", () => {
		expect(buildOccasionUpdates({ name: "Kit", description: " obs ", occurrences: "30", isSupportMenu: true, allowAbsolutes: true })).toEqual({
			name: "Kit",
			description: "obs",
			expected_monthly_occurrences: 30,
		})
		expect(
			buildOccasionUpdates({ name: "Kit", description: "", occurrences: "", isSupportMenu: true, allowAbsolutes: true }).expected_monthly_occurrences
		).toBeNull()
	})
	test("modelo global limpa as ocorrências, evento ou apoio", () => {
		expect(buildOccasionUpdates({ name: "A", description: "", occurrences: "30", isSupportMenu: true, allowAbsolutes: false })).toHaveProperty(
			"expected_monthly_occurrences",
			null
		)
		expect(buildOccasionUpdates({ name: "A", description: "", occurrences: "30", isSupportMenu: false, allowAbsolutes: false })).toHaveProperty(
			"expected_monthly_occurrences",
			null
		)
	})
})

describe("buildInitialOccasionContent", () => {
	const template = (over: Record<string, unknown> = {}) =>
		({
			name: "Coquetel",
			description: "Formatura",
			expected_monthly_occurrences: 12,
			items: [],
			event_meals: [],
			snack_family: null,
			snack_class: null,
			snack_variant: null,
			requires_galley: false,
			requires_oven: false,
			reviewed_at: null,
			shelf_life_hours: null,
			orderable: false,
			...over,
		}) as unknown as Parameters<typeof buildInitialOccasionContent>[0]
	const mealTypes = [
		{ id: "mt1", name: "Almoço" },
		{ id: "mt2", name: "Jantar" },
	]
	const snackMealType = { id: "snack", name: SNACK_MEAL_TYPE_NAME }

	test("campos de texto e nulos", () => {
		const out = buildInitialOccasionContent(template(), { isSupportMenu: false, templateType: "event", mealTypes, snackMealType: undefined })
		expect(out).toMatchObject({ name: "Coquetel", description: "Formatura", occurrences: "12", meals: [], items: [], snack: EMPTY_SNACK_STANDARD_DRAFT })
		const empty = buildInitialOccasionContent(template({ name: null, description: null, expected_monthly_occurrences: null }), {
			isSupportMenu: false,
			templateType: "event",
			mealTypes,
			snackMealType: undefined,
		})
		expect(empty).toMatchObject({ name: "", description: "", occurrences: "" })
	})

	test("evento sem refeição não ganha o kit", () => {
		expect(buildInitialOccasionContent(template(), { isSupportMenu: false, templateType: "event", mealTypes, snackMealType }).meals).toEqual([])
	})

	test("apoio vazio abre com o kit no primeiro horário da cozinha", () => {
		const out = buildInitialOccasionContent(template(), { isSupportMenu: true, templateType: "apoio", mealTypes, snackMealType })
		expect(out.meals).toHaveLength(1)
		expect(out.meals[0]).toMatchObject({ name: SUPPORT_KIT_MEAL_NAME, meal_type_id: "mt1", groups: [] })
	})

	test("apoio vazio sem horário da cozinha cai no de sistema, e sem nenhum fica sem horário", () => {
		expect(buildInitialOccasionContent(template(), { isSupportMenu: true, templateType: "apoio", mealTypes: [], snackMealType }).meals[0].meal_type_id).toBe(
			"snack"
		)
		expect(
			buildInitialOccasionContent(template(), { isSupportMenu: true, templateType: "apoio", mealTypes: undefined, snackMealType: null }).meals[0].meal_type_id
		).toBe("")
	})

	test("padrão de lanche: kit no horário de sistema, porções legadas e refeições levadas para ele", () => {
		const snack = template({
			snack_family: "bordo",
			snack_class: "B",
			event_meals: [{ id: "e1", name: "Lanche", meal_type_id: "mt2", groups: [] }],
			items: [{ meal_type_id: "mt2", event_meal_id: "e1", recipe_id: "r1", headcount_override: 2, recommended_proportion: null }],
		})
		const out = buildInitialOccasionContent(snack, { isSupportMenu: true, templateType: "apoio", mealTypes, snackMealType })
		expect(out.meals).toEqual([expect.objectContaining({ id: "e1", meal_type_id: "snack" })])
		expect(out.items[0]).toMatchObject({ headcount_override: null, recommended_proportion: 200 })
		expect(out.snack.enabled).toBe(true)

		const emptySnack = buildInitialOccasionContent(template({ snack_family: "bordo", snack_class: "B" }), {
			isSupportMenu: true,
			templateType: "apoio",
			mealTypes,
			snackMealType,
		})
		expect(emptySnack.meals[0].meal_type_id).toBe("snack")
	})

	test("padrão de lanche sem o tipo de sistema mantém o horário gravado", () => {
		const snack = template({ snack_family: "bordo", snack_class: "B", event_meals: [{ id: "e1", name: "Lanche", meal_type_id: "mt2", groups: [] }] })
		const out = buildInitialOccasionContent(snack, { isSupportMenu: true, templateType: "apoio", mealTypes, snackMealType: undefined })
		expect(out.meals[0].meal_type_id).toBe("mt2")
	})

	test("classificação de lanche num evento não converte as porções", () => {
		const evt = template({
			snack_family: "bordo",
			snack_class: "B",
			event_meals: [{ id: "e1", name: "Jantar", meal_type_id: "mt2", groups: [] }],
			items: [{ meal_type_id: "mt2", event_meal_id: "e1", recipe_id: "r1", headcount_override: 2, recommended_proportion: null }],
		})
		const out = buildInitialOccasionContent(evt, { isSupportMenu: false, templateType: "event", mealTypes, snackMealType })
		expect(out.items[0]).toMatchObject({ headcount_override: 2, recommended_proportion: null })
		expect(out.meals[0].meal_type_id).toBe("mt2")
	})
})

describe("describeMealOrigin", () => {
	const folders = [{ id: "f1", parent_id: null, name: "Formaturas", description: null, sort_order: 0 }]
	const templates = [
		{ id: "g1", kitchen_id: null, folder_id: "f1", name: "Coquetel" },
		{ id: "g2", kitchen_id: null, folder_id: null, name: "Sem pasta" },
		{ id: "k1", kitchen_id: 7, folder_id: "f1", name: "Local" },
		{ id: "k2", kitchen_id: 7, folder_id: null, name: null },
	]
	test("sem origem", () => {
		expect(describeMealOrigin(templates, folders, null)).toBeNull()
		expect(describeMealOrigin(templates, folders, undefined)).toBeNull()
		expect(describeMealOrigin(templates, folders, "")).toBeNull()
	})
	test("modelo que não está mais na lista", () => {
		expect(describeMealOrigin(templates, folders, "x")).toBe("modelo removido")
		expect(describeMealOrigin(undefined, folders, "g1")).toBe("modelo removido")
	})
	test("global com pasta, global sem pasta, local e local sem nome", () => {
		expect(describeMealOrigin(templates, folders, "g1")).toBe("Formaturas · Coquetel")
		expect(describeMealOrigin(templates, folders, "g2")).toBe("Sem pasta")
		expect(describeMealOrigin(templates, folders, "k1")).toBe("Local")
		expect(describeMealOrigin(templates, folders, "k2")).toBe("modelo")
	})
})

describe("buildSlotOptions e resolveSlotName", () => {
	const mealTypes = [{ id: "mt1", name: "Almoço" }]
	const snack = { id: "snack", name: null }
	test("horário de sistema só entra com refeição nele", () => {
		expect(buildSlotOptions(mealTypes, snack, [meal({ meal_type_id: "mt1" })])).toEqual(mealTypes)
		expect(buildSlotOptions(mealTypes, snack, [meal({ meal_type_id: "snack" })])).toEqual([...mealTypes, snack])
		expect(buildSlotOptions(mealTypes, null, [meal({ meal_type_id: "snack" })])).toEqual(mealTypes)
		expect(buildSlotOptions([...mealTypes, snack], snack, [meal({ meal_type_id: "snack" })])).toEqual([...mealTypes, snack])
		expect(buildSlotOptions(undefined, snack, [meal({ meal_type_id: "snack" })])).toEqual([snack])
		expect(buildSlotOptions(undefined, undefined, [])).toEqual([])
	})
	test("nome do horário", () => {
		expect(resolveSlotName(mealTypes, snack, "mt1")).toBe("Almoço")
		expect(resolveSlotName(mealTypes, snack, "snack")).toBe(SNACK_MEAL_TYPE_NAME)
		expect(resolveSlotName(mealTypes, { id: "snack", name: "Bordo" }, "snack")).toBe("Bordo")
		expect(resolveSlotName(mealTypes, snack, "x")).toBeNull()
		expect(resolveSlotName(undefined, undefined, "x")).toBeNull()
		expect(resolveSlotName([{ id: "mt1", name: null }], snack, "mt1")).toBeNull()
	})
})

describe("lockedSlotNameFor", () => {
	test("só no padrão de lanche", () => {
		expect(lockedSlotNameFor(false, { id: "s", name: "X" })).toBeNull()
		expect(lockedSlotNameFor(true, { id: "s", name: "X" })).toBe("X")
		expect(lockedSlotNameFor(true, { id: "s", name: null })).toBe(SNACK_MEAL_TYPE_NAME)
		expect(lockedSlotNameFor(true, undefined)).toBe(SNACK_MEAL_TYPE_NAME)
	})
})

describe("mealDialogViewOf", () => {
	test("fechado sem refeição", () => {
		expect(mealDialogViewOf(null)).toEqual({ open: false, meal: null, isNew: false })
	})
	test("repassa o estado", () => {
		const m = meal()
		expect(mealDialogViewOf({ meal: m, isNew: true, open: false })).toEqual({ open: false, meal: m, isNew: true })
	})
})

describe("recipeIdsInMeal", () => {
	test("preparações da refeição aberta, na ordem", () => {
		const items = [item({ recipe_id: "a" }), item({ meal_type_id: "m2", recipe_id: "b" }), item({ recipe_id: "c" })]
		expect(recipeIdsInMeal(items, "m1")).toEqual(["a", "c"])
		expect(recipeIdsInMeal(items, null)).toEqual([])
		expect(recipeIdsInMeal(items, "")).toEqual([])
	})
})

describe("printTooltipLabel", () => {
	test("sem pendência, com pendência e no fork", () => {
		expect(printTooltipLabel(false, true, eventCopy)).toBe("Imprimir / baixar PDF do evento")
		expect(printTooltipLabel(false, false, feminineCopy)).toBe("Imprimir / baixar PDF da ceia")
		expect(printTooltipLabel(true, true, eventCopy)).toBe("Salvar a cópia desta cozinha e imprimir")
		expect(printTooltipLabel(true, false, eventCopy)).toBe("Salvar e imprimir / baixar PDF")
	})
})

describe("saveBlockReason", () => {
	const ok = { name: "Jantar", hasSnackIssues: false, mealWithoutSlot: undefined, copy: eventCopy }
	test("pode salvar", () => {
		expect(saveBlockReason(ok)).toBeNull()
	})
	test("nome em branco vem primeiro, com o artigo do artefato", () => {
		expect(saveBlockReason({ ...ok, name: "  ", hasSnackIssues: true, mealWithoutSlot: { name: "X" } })).toBe("Dê um nome ao evento antes de salvar.")
		expect(saveBlockReason({ ...ok, name: "", copy: feminineCopy })).toBe("Dê um nome à ceia antes de salvar.")
	})
	test("padrão de lanche inválido antes da refeição sem horário", () => {
		expect(saveBlockReason({ ...ok, hasSnackIssues: true, mealWithoutSlot: { name: "X" } })).toBe("Corrija os campos do padrão de lanche antes de salvar.")
	})
	test("refeição sem horário", () => {
		expect(saveBlockReason({ ...ok, mealWithoutSlot: { name: "Kit" } })).toBe('Escolha o horário da refeição "Kit" antes de salvar.')
	})
})
