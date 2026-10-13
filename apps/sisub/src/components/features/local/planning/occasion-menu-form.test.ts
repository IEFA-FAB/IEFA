import { describe, expect, test } from "vitest"
import { OCCASION_MENU_COPY } from "@/lib/occasion-menu"
import {
	buildNewOccasionDraftKey,
	describeAfterCreateHint,
	describeForkSource,
	describeNewOccasionExplainerTail,
	formatCreatedOccasionMessage,
	getOccasionFormTitle,
	getOccasionNamePlaceholder,
	isNoMealChosen,
} from "./occasion-menu-form"

const event = OCCASION_MENU_COPY.event
const support = OCCASION_MENU_COPY.apoio
const feminine = { ...event, singular: "Ceia", noun: "ceia", article: "a" as const }

describe("buildNewOccasionDraftKey", () => {
	test("por tipo e por cozinha", () => {
		expect(buildNewOccasionDraftKey("event", 7)).toBe("events-new-draft-7")
		expect(buildNewOccasionDraftKey("apoio", null)).toBe("support-menus-new-draft-global")
		expect(buildNewOccasionDraftKey("event", 0)).toBe("events-new-draft-0")
	})
})

describe("getOccasionFormTitle", () => {
	test("adaptação, modelo global e cozinha", () => {
		expect(getOccasionFormTitle({ isFork: true, isGlobal: true, copy: event })).toBe("Adaptar Evento Global")
		expect(getOccasionFormTitle({ isFork: false, isGlobal: true, copy: event })).toBe("Novo Evento Modelo")
		expect(getOccasionFormTitle({ isFork: false, isGlobal: false, copy: support })).toBe("Novo Cardápio de Apoio")
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

describe("describeForkSource", () => {
	test("modelo global leva só o relativo", () => {
		expect(describeForkSource(true, true)).toBe("A cópia leva as preparações, os grupos e as proporções. O efetivo e as ocorrências por mês você define aqui.")
	})
	test("cardápio de cozinha leva tudo; o apoio também as ocorrências", () => {
		expect(describeForkSource(false, false)).toBe("A cópia leva tudo: preparações, grupos, proporções e o efetivo de cada refeição.")
		expect(describeForkSource(false, true)).toBe("A cópia leva tudo: preparações, grupos, proporções e o efetivo de cada refeição, e as ocorrências por mês.")
	})
})

describe("describeNewOccasionExplainerTail", () => {
	test("evento global é uma opção de um formato", () => {
		expect(describeNewOccasionExplainerTail({ isGlobal: true, templateType: "event", copy: event })).toMatch(
			/^No catálogo global, cada modelo de evento é UMA opção/
		)
	})
	test("apoio global", () => {
		expect(describeNewOccasionExplainerTail({ isGlobal: true, templateType: "apoio", copy: support })).toBe(
			"Modelos do catálogo global ficam disponíveis para todas as cozinhas adaptarem."
		)
	})
	test("na cozinha, com o gênero do artefato", () => {
		expect(describeNewOccasionExplainerTail({ isGlobal: false, templateType: "event", copy: event })).toBe(
			"O evento poderá ser selecionado na composição dos anexos quantitativos do TR."
		)
		expect(describeNewOccasionExplainerTail({ isGlobal: false, templateType: "event", copy: feminine })).toBe(
			"A ceia poderá ser selecionada na composição dos anexos quantitativos do TR."
		)
	})
})

describe("getOccasionNamePlaceholder", () => {
	const year = new Date().getFullYear()
	test("adaptação usa o nome do modelo e o ano", () => {
		expect(getOccasionNamePlaceholder(true, "Coquetel", event)).toBe(`Ex.: Coquetel — ${year}`)
		expect(getOccasionNamePlaceholder(true, undefined, event)).toBe(`Ex.: Cópia — ${year}`)
		expect(getOccasionNamePlaceholder(true, null, event)).toBe(`Ex.: Cópia — ${year}`)
		expect(getOccasionNamePlaceholder(true, "", event)).toBe(`Ex.:  — ${year}`)
	})
	test("criação usa o exemplo do artefato", () => {
		expect(getOccasionNamePlaceholder(false, "Coquetel", event)).toBe(event.namePlaceholder)
	})
})

describe("describeAfterCreateHint e formatCreatedOccasionMessage", () => {
	test("dica depois de criar", () => {
		expect(describeAfterCreateHint(true, event)).toBe("Após criar, você poderá editar o evento livremente.")
		expect(describeAfterCreateHint(false, feminine)).toBe("Após criar, você será redirecionado para montar as preparações da ceia.")
	})
	test("mensagem de criado, com gênero", () => {
		expect(formatCreatedOccasionMessage(event, "Jantar")).toBe('Evento "Jantar" criado!')
		expect(formatCreatedOccasionMessage(feminine, null)).toBe('Ceia "null" criada!')
	})
})
