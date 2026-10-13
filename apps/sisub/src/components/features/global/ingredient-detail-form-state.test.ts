import type { Folder } from "@iefa/database/sisub"
import { describe, expect, it } from "vitest"
import { computeIngredientDiff } from "@/lib/ingredient-diff"
import type { IngredientSnapshot, IngredientVersion } from "@/types/domain/ingredient-versions"
import {
	buildBaseNutrientValues,
	buildFolderOptions,
	resolveIngredientFormTab,
	resolveNutritionReference,
	selectVersionPreview,
} from "./ingredient-detail-form-state"

describe("resolveIngredientFormTab", () => {
	it.each(["detalhes", "nutricao", "compra", "produto"])("aceita %s", (tab) => {
		expect(resolveIngredientFormTab(tab)).toBe(tab)
	})
	it.each([undefined, "", "substituicoes", 3, null])("cai em detalhes com %s", (tab) => {
		expect(resolveIngredientFormTab(tab)).toBe("detalhes")
	})
})

const folder = (id: string, description: string | null, parent_id: string | null = null) => ({ id, description, parent_id }) as unknown as Folder

describe("buildFolderOptions", () => {
	it("monta o caminho pelos ancestrais e ordena pelo caminho", () => {
		const options = buildFolderOptions([folder("c", "Cítricas", "f"), folder("h", "Hortifruti"), folder("f", "Frutas", "h"), folder("a", "Açougue")])
		expect(options).toEqual([
			{ id: "a", name: "Açougue", path: "Açougue" },
			{ id: "h", name: "Hortifruti", path: "Hortifruti" },
			{ id: "f", name: "Frutas", path: "Hortifruti / Frutas" },
			{ id: "c", name: "Cítricas", path: "Hortifruti / Frutas / Cítricas" },
		])
	})
	it("sem descrição vira 'Sem Nome' no nome e no caminho", () => {
		expect(buildFolderOptions([folder("x", null)])).toEqual([{ id: "x", name: "Sem Nome", path: "Sem Nome" }])
	})
	it("pai inexistente encerra o caminho", () => {
		expect(buildFolderOptions([folder("x", "Órfã", "sumiu")])[0]?.path).toBe("Órfã")
	})
	it("ciclo não trava: cada pasta entra uma vez no caminho", () => {
		const options = buildFolderOptions([folder("a", "A", "b"), folder("b", "B", "a")])
		expect(options.map((o) => o.path)).toEqual(["A / B", "B / A"])
	})
})

describe("buildBaseNutrientValues", () => {
	const nutrients = [{ id: "n1" }, { id: "n2" }, { id: "n3" }]
	it("sem nutrientes ou sem valores do insumo: vazio", () => {
		expect(buildBaseNutrientValues(undefined, [])).toEqual({})
		expect(buildBaseNutrientValues(nutrients, undefined)).toEqual({})
		expect(buildBaseNutrientValues(null, null)).toEqual({})
	})
	it("um campo por nutriente do sistema; ausente ou null vira vazio, zero vira '0'", () => {
		expect(
			buildBaseNutrientValues(nutrients, [
				{ nutrient_id: "n1", nutrient_value: 12.5 },
				{ nutrient_id: "n2", nutrient_value: null },
				{ nutrient_id: "outro", nutrient_value: 9 },
			])
		).toEqual({ n1: "12.5", n2: "", n3: "" })
		expect(buildBaseNutrientValues([{ id: "z" }], [{ nutrient_id: "z", nutrient_value: 0 }])).toEqual({ z: "0" })
	})
})

describe("resolveNutritionReference", () => {
	it("sem override: a do servidor", () => {
		expect(resolveNutritionReference(undefined, "srv")).toBe("srv")
	})
	it("override null (desvincular) vence a do servidor", () => {
		expect(resolveNutritionReference(null, "srv")).toBeNull()
	})
	it("override escolhido vence", () => {
		expect(resolveNutritionReference("nova", null)).toBe("nova")
	})
})

const snapshot = (description: string): IngredientSnapshot => ({
	ingredient: {
		description,
		folder_id: null,
		folder_description: null,
		measure_unit: "KG",
		correction_factor: 1,
		ceafa_id: null,
		ceafa_description: null,
	},
	nutrients: [],
	product_items: [],
	purchase_links: [],
})

const version = (id: string, n: number, description: string): IngredientVersion => ({
	id,
	ingredient_id: "ing",
	version_number: n,
	snapshot: snapshot(description),
	change_summary: null,
	changed_by: null,
	changed_by_name: null,
	created_at: "2026-06-09T12:00:00Z",
})

describe("selectVersionPreview", () => {
	// Mais nova primeiro, como o histórico vem do servidor.
	const versions = [version("v3", 3, "Arroz tipo 1"), version("v2", 2, "Arroz"), version("v1", 1, "arroz")]

	it("nada selecionado: sem preview", () => {
		expect(selectVersionPreview(versions, null)).toEqual({
			versionList: versions,
			selectedIndex: -1,
			selectedVersion: null,
			previousVersion: undefined,
			isPreviewing: false,
			previewDiff: null,
		})
	})
	it("sem histórico carregado: lista vazia", () => {
		const preview = selectVersionPreview(undefined, "v2")
		expect(preview.versionList).toEqual([])
		expect(preview.selectedIndex).toBe(-1)
		expect(preview.isPreviewing).toBe(false)
	})
	it("id que não está na lista: sem preview", () => {
		expect(selectVersionPreview(versions, "sumiu").selectedVersion).toBeNull()
	})
	it("versão do meio: diff contra a anterior a ela (a próxima da lista)", () => {
		const preview = selectVersionPreview(versions, "v2")
		expect(preview.selectedIndex).toBe(1)
		expect(preview.selectedVersion).toBe(versions[1])
		expect(preview.previousVersion).toBe(versions[2])
		expect(preview.isPreviewing).toBe(true)
		expect(preview.previewDiff).toEqual(computeIngredientDiff(versions[2]?.snapshot ?? null, snapshot("Arroz")))
	})
	it("primeira versão (a mais antiga): diff contra nada", () => {
		const preview = selectVersionPreview(versions, "v1")
		expect(preview.previousVersion).toBeUndefined()
		expect(preview.previewDiff).toEqual(computeIngredientDiff(null, snapshot("arroz")))
	})
})
