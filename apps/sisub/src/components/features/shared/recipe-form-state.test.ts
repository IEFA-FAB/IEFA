import { describe, expect, it } from "vitest"
import {
	describeSupersedingVersion,
	findSupersedingHead,
	formatDateTime,
	isFlowEnabled,
	isForkingGlobalRecipe,
	isRecipeFieldsTab,
	lineageRecipeIdOf,
	RECIPE_FORM_TABS,
	recipeDraftBarCaption,
	recipeDraftTitle,
	recipeSaveCaption,
	resolveEditContext,
	resolveRecipeFormTab,
	reviewRecipeIdOf,
} from "./recipe-form-state"

const globalRecipe = { id: "r1", name: "Arroz", version: 3, kitchen_id: null }
const localRecipe = { id: "r2", name: "Feijão", version: 2, kitchen_id: 7 }
const KITCHEN = { scope: "kitchen", kitchenId: 7 } as const
const GLOBAL = { scope: "global" } as const

describe("resolveRecipeFormTab", () => {
	it.each([...RECIPE_FORM_TABS])("aceita %s", (tab) => {
		expect(resolveRecipeFormTab(tab)).toBe(tab)
	})
	it.each([undefined, "", "substituicoes", 1])("cai em detalhes com %s", (tab) => {
		expect(resolveRecipeFormTab(tab)).toBe("detalhes")
	})
})

describe("isRecipeFieldsTab", () => {
	it("fluxo e equipamentos têm Salvar próprio", () => {
		expect(isRecipeFieldsTab("fluxo")).toBe(false)
		expect(isRecipeFieldsTab("equipamentos")).toBe(false)
	})
	it.each(["detalhes", "ingredientes", "preparo", "nutricao"] as const)("%s é aba da preparação", (tab) => {
		expect(isRecipeFieldsTab(tab)).toBe(true)
	})
})

describe("resolveEditContext", () => {
	it("rota de cozinha: escopo da cozinha, id numérico", () => {
		expect(resolveEditContext("7")).toEqual({ scope: "kitchen", kitchenId: 7 })
	})
	it("sem cozinha (ou vazio): global", () => {
		expect(resolveEditContext(undefined)).toEqual({ scope: "global" })
		expect(resolveEditContext("")).toEqual({ scope: "global" })
	})
})

describe("isForkingGlobalRecipe", () => {
	it("global aberta numa cozinha, em edição ou fork: forka", () => {
		expect(isForkingGlobalRecipe("edit", globalRecipe, KITCHEN)).toBe(true)
		expect(isForkingGlobalRecipe("fork", globalRecipe, KITCHEN)).toBe(true)
	})
	it("criar nunca forka", () => {
		expect(isForkingGlobalRecipe("create", globalRecipe, KITCHEN)).toBe(false)
	})
	it("sem dado carregado não forka", () => {
		expect(isForkingGlobalRecipe("edit", null, KITCHEN)).toBe(false)
		expect(isForkingGlobalRecipe("edit", undefined, KITCHEN)).toBe(false)
	})
	it("preparação da cozinha não forka", () => {
		expect(isForkingGlobalRecipe("edit", localRecipe, KITCHEN)).toBe(false)
	})
	it("na tela global, versiona o global", () => {
		expect(isForkingGlobalRecipe("edit", globalRecipe, GLOBAL)).toBe(false)
	})
})

describe("lineageRecipeIdOf", () => {
	it("criar não consulta linhagem", () => {
		expect(lineageRecipeIdOf("create", globalRecipe)).toBeUndefined()
	})
	it("edição e fork consultam pelo id carregado", () => {
		expect(lineageRecipeIdOf("edit", globalRecipe)).toBe("r1")
		expect(lineageRecipeIdOf("fork", globalRecipe)).toBe("r1")
		expect(lineageRecipeIdOf("edit", null)).toBeUndefined()
	})
})

describe("findSupersedingHead", () => {
	const head = { id: "r9", version: 4, created_at: "2026-09-28T17:29:00Z", kitchen_id: null }
	it("vigente com outro id: superada", () => {
		expect(findSupersedingHead("edit", globalRecipe, head)).toBe(head)
		expect(findSupersedingHead("fork", globalRecipe, head)).toBe(head)
	})
	it("vigente é a aberta: não superada", () => {
		expect(findSupersedingHead("edit", globalRecipe, { ...head, id: "r1" })).toBeNull()
	})
	it("criar nunca é superada", () => {
		expect(findSupersedingHead("create", globalRecipe, head)).toBeNull()
	})
	it("sem dado carregado: não superada", () => {
		expect(findSupersedingHead("edit", null, head)).toBeNull()
	})
	it("vigente ausente ou sem id string (erro que chegou como dado): não bloqueia", () => {
		expect(findSupersedingHead("edit", globalRecipe, undefined)).toBeNull()
		expect(findSupersedingHead("edit", globalRecipe, null)).toBeNull()
		expect(findSupersedingHead("edit", globalRecipe, { error: "x" } as { id?: unknown })).toBeNull()
		expect(findSupersedingHead("edit", globalRecipe, { id: 42 })).toBeNull()
	})
})

describe("reviewRecipeIdOf", () => {
	it("só em edição de preparação persistida", () => {
		expect(reviewRecipeIdOf("edit", globalRecipe)).toBe("r1")
		expect(reviewRecipeIdOf("edit", null)).toBeNull()
		expect(reviewRecipeIdOf("fork", globalRecipe)).toBeNull()
		expect(reviewRecipeIdOf("create", globalRecipe)).toBeNull()
	})
})

describe("isFlowEnabled", () => {
	it("só em edição com id", () => {
		expect(isFlowEnabled("edit", globalRecipe)).toBe(true)
		expect(isFlowEnabled("edit", { ...globalRecipe, id: "" })).toBe(false)
		expect(isFlowEnabled("edit", undefined)).toBe(false)
		expect(isFlowEnabled("fork", globalRecipe)).toBe(false)
		expect(isFlowEnabled("create", globalRecipe)).toBe(false)
	})
})

describe("recipeSaveCaption", () => {
	it("criar", () => {
		expect(recipeSaveCaption("create", true)).toBe("Salvar cria a preparação.")
	})
	it("forkando", () => {
		expect(recipeSaveCaption("edit", true)).toBe("Salvar cria uma cópia local desta cozinha. A preparação global não é alterada.")
	})
	it("versionando", () => {
		expect(recipeSaveCaption("edit", false)).toBe("Salvar gera automaticamente uma nova versão desta preparação.")
		expect(recipeSaveCaption("fork", false)).toBe("Salvar gera automaticamente uma nova versão desta preparação.")
	})
})

describe("recipeDraftBarCaption", () => {
	it("versão superada vence", () => {
		expect(recipeDraftBarCaption({ version: 5 }, true, "X")).toBe("Salvar está bloqueado: abra a versão vigente (v5) para levar suas alterações.")
	})
	it("aba da preparação: a legenda do Salvar", () => {
		expect(recipeDraftBarCaption(null, true, "X")).toBe("X")
	})
	it("fora das abas da preparação: só o aviso de pendência", () => {
		expect(recipeDraftBarCaption(null, false, "X")).toBe("Há alterações na preparação ainda não salvas.")
	})
})

describe("recipeDraftTitle", () => {
	it("criar", () => {
		expect(recipeDraftTitle("create", globalRecipe)).toBe("Nova preparação")
	})
	it("editar/fork leva o nome; sem dado, vazio", () => {
		expect(recipeDraftTitle("edit", globalRecipe)).toBe("Preparação: Arroz")
		expect(recipeDraftTitle("fork", null)).toBe("Preparação: ")
	})
})

describe("describeSupersedingVersion", () => {
	const at = "2026-09-28T12:00:00Z"
	it("a cozinha já tem fork próprio de uma global", () => {
		expect(describeSupersedingVersion({ version: 1, created_at: at, kitchen_id: 7 }, globalRecipe)).toBe(
			`Esta cozinha já tem a própria versão desta preparação (v1, de ${formatDateTime(at)}).`
		)
	})
	it("versão mais nova da mesma linhagem", () => {
		expect(describeSupersedingVersion({ version: 4, created_at: at, kitchen_id: null }, globalRecipe)).toBe(
			`A v4 foi gravada em ${formatDateTime(at)}, depois da versão que você abriu (v3).`
		)
	})
	it("fork local superado por outro fork local: mesma frase da linhagem", () => {
		expect(describeSupersedingVersion({ version: 3, created_at: at, kitchen_id: 7 }, localRecipe)).toBe(
			`A v3 foi gravada em ${formatDateTime(at)}, depois da versão que você abriu (v2).`
		)
	})
	it("sem dado carregado: cai no ramo do fork (kitchen_id do aberto é tratado como ausente)", () => {
		expect(describeSupersedingVersion({ version: 1, created_at: at, kitchen_id: 7 }, undefined)).toBe(
			`Esta cozinha já tem a própria versão desta preparação (v1, de ${formatDateTime(at)}).`
		)
	})
})

describe("formatDateTime", () => {
	it("dia/mês, hora:minuto em pt-BR", () => {
		expect(formatDateTime("2026-09-28T12:00:00Z")).toMatch(/^28\/09,? \d{2}:\d{2}$/)
	})
})
