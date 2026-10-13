import { describe, expect, test } from "vitest"
import { OCCASION_MENU_COPY } from "@/lib/occasion-menu"
import {
	afterCreateHint,
	createdOccasionMessage,
	forkSourceSummary,
	isNoMealChosen,
	newOccasionDraftKey,
	newOccasionExplainerTail,
	occasionFormTitle,
	occasionNamePlaceholder,
} from "./occasion-menu-form"

const event = OCCASION_MENU_COPY.event
const support = OCCASION_MENU_COPY.apoio
const feminine = { ...event, singular: "Ceia", noun: "ceia", article: "a" as const }

describe("newOccasionDraftKey", () => {
	test("por tipo e por cozinha", () => {
		expect(newOccasionDraftKey("event", 7)).toBe("events-new-draft-7")
		expect(newOccasionDraftKey("apoio", null)).toBe("support-menus-new-draft-global")
		expect(newOccasionDraftKey("event", 0)).toBe("events-new-draft-0")
	})
})

describe("occasionFormTitle", () => {
	test("adaptação, modelo global e cozinha", () => {
		expect(occasionFormTitle({ isFork: true, isGlobal: true, copy: event })).toBe("Adaptar Evento Global")
		expect(occasionFormTitle({ isFork: false, isGlobal: true, copy: event })).toBe("Novo Evento Modelo")
		expect(occasionFormTitle({ isFork: false, isGlobal: false, copy: support })).toBe("Novo Cardápio de Apoio")
	})
})

describe("isNoMealChosen", () => {
	test("só cobra na adaptação de modelo com refeições", () => {
		expect(isNoMealChosen(true, 2, 0)).toBe(true)
		expect(isNoMealChosen(true, 2, 1)).toBe(false)
		expect(isNoMealChosen(true, 0, 0)).toBe(false)
		expect(isNoMealChosen(false, 2, 0)).toBe(false)
	})
})

describe("forkSourceSummary", () => {
	test("modelo global leva só o relativo", () => {
		expect(forkSourceSummary(true, true)).toBe("A cópia leva as preparações, os grupos e as proporções. O efetivo e as ocorrências por mês você define aqui.")
	})
	test("cardápio de cozinha leva tudo; o apoio também as ocorrências", () => {
		expect(forkSourceSummary(false, false)).toBe("A cópia leva tudo: preparações, grupos, proporções e o efetivo de cada refeição.")
		expect(forkSourceSummary(false, true)).toBe("A cópia leva tudo: preparações, grupos, proporções e o efetivo de cada refeição, e as ocorrências por mês.")
	})
})

describe("newOccasionExplainerTail", () => {
	test("evento global é uma opção de um formato", () => {
		expect(newOccasionExplainerTail({ isGlobal: true, templateType: "event", copy: event })).toMatch(/^No catálogo global, cada modelo de evento é UMA opção/)
	})
	test("apoio global", () => {
		expect(newOccasionExplainerTail({ isGlobal: true, templateType: "apoio", copy: support })).toBe(
			"Modelos do catálogo global ficam disponíveis para todas as cozinhas adaptarem."
		)
	})
	test("na cozinha, com o gênero do artefato", () => {
		expect(newOccasionExplainerTail({ isGlobal: false, templateType: "event", copy: event })).toBe(
			"O evento poderá ser selecionado na composição dos anexos quantitativos do TR."
		)
		expect(newOccasionExplainerTail({ isGlobal: false, templateType: "event", copy: feminine })).toBe(
			"A ceia poderá ser selecionada na composição dos anexos quantitativos do TR."
		)
	})
})

describe("occasionNamePlaceholder", () => {
	const year = new Date().getFullYear()
	test("adaptação usa o nome do modelo e o ano", () => {
		expect(occasionNamePlaceholder(true, "Coquetel", event)).toBe(`Ex.: Coquetel — ${year}`)
		expect(occasionNamePlaceholder(true, undefined, event)).toBe(`Ex.: Cópia — ${year}`)
		expect(occasionNamePlaceholder(true, null, event)).toBe(`Ex.: Cópia — ${year}`)
		expect(occasionNamePlaceholder(true, "", event)).toBe(`Ex.:  — ${year}`)
	})
	test("criação usa o exemplo do artefato", () => {
		expect(occasionNamePlaceholder(false, "Coquetel", event)).toBe(event.namePlaceholder)
	})
})

describe("afterCreateHint e createdOccasionMessage", () => {
	test("dica depois de criar", () => {
		expect(afterCreateHint(true, event)).toBe("Após criar, você poderá editar o evento livremente.")
		expect(afterCreateHint(false, feminine)).toBe("Após criar, você será redirecionado para montar as preparações da ceia.")
	})
	test("mensagem de criado, com gênero", () => {
		expect(createdOccasionMessage(event, "Jantar")).toBe('Evento "Jantar" criado!')
		expect(createdOccasionMessage(feminine, null)).toBe('Ceia "null" criada!')
	})
})
