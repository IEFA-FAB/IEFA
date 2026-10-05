import { describe, expect, test } from "vitest"
import { buildCatalogTree, type CatalogFolder, catalogFolderOptions, catalogFolderPath, UNFILED_CATALOG_FOLDER_ID } from "./template-catalog-tree"

const folder = (id: string, name: string, parent_id: string | null, sort_order: number): CatalogFolder => ({
	id,
	name,
	parent_id,
	sort_order,
	description: null,
})

const FOLDERS: CatalogFolder[] = [
	folder("b", "Padrão B — Institucional/Intermediário", null, 1),
	folder("a", "Padrão A — Especial/Solene", null, 0),
	folder("b-jantar", "Jantar", "b", 4),
	folder("b-cafe", "Café da Manhã", "b", 0),
	folder("b-coquetel", "Coquetel", "b", 3),
]

describe("buildCatalogTree", () => {
	test("pastas na ordem gravada, não alfabética; modelos dentro da subpasta", () => {
		const rows = buildCatalogTree({
			folders: FOLDERS,
			templates: [
				{ id: "t1", name: "Evento Coquetel Padrão B", folder_id: "b-coquetel" },
				{ id: "t2", name: "Café da Manhã Padrão B", folder_id: "b-cafe" },
			],
			expanded: null,
		})
		expect(rows.map((r) => (r.type === "folder" ? `${r.level}:${r.label}` : `t:${r.template.name}`))).toEqual([
			"0:Padrão A — Especial/Solene",
			"0:Padrão B — Institucional/Intermediário",
			"1:Café da Manhã",
			"t:Café da Manhã Padrão B",
			"1:Coquetel",
			"t:Evento Coquetel Padrão B",
			"1:Jantar",
		])
		const coquetel = rows.find((r) => r.type === "template" && r.id === "t1")
		expect(coquetel?.type === "template" && coquetel.path).toBe("Padrão B — Institucional/Intermediário › Coquetel")
		const padraoB = rows.find((r) => r.id === "b")
		expect(padraoB?.type === "folder" && padraoB.templateCount).toBe(2)
	})

	test("pasta recolhida esconde subpastas e modelos", () => {
		const rows = buildCatalogTree({
			folders: FOLDERS,
			templates: [{ id: "t1", name: "Coquetel", folder_id: "b-coquetel" }],
			expanded: new Set(["a"]),
		})
		expect(rows.map((r) => r.id)).toEqual(["a", "b"])
	})

	test("modelo sem pasta ou com pasta removida vai para 'Sem pasta', no fim", () => {
		const rows = buildCatalogTree({
			folders: FOLDERS,
			templates: [
				{ id: "t1", name: "Solto", folder_id: null },
				{ id: "t2", name: "Órfão", folder_id: "removida" },
			],
			expanded: null,
		})
		const unfiledIndex = rows.findIndex((r) => r.id === UNFILED_CATALOG_FOLDER_ID)
		expect(unfiledIndex).toBe(rows.length - 3)
		expect(rows.slice(unfiledIndex + 1).map((r) => r.id)).toEqual(["t2", "t1"])
	})

	test("sem modelo sem pasta, não há nó 'Sem pasta'", () => {
		const rows = buildCatalogTree({ folders: FOLDERS, templates: [], expanded: null })
		expect(rows.some((r) => r.id === UNFILED_CATALOG_FOLDER_ID)).toBe(false)
	})
})

describe("catalogFolderPath / catalogFolderOptions", () => {
	test("caminho com o pai", () => {
		expect(catalogFolderPath(FOLDERS, "b-coquetel")).toBe("Padrão B — Institucional/Intermediário › Coquetel")
		expect(catalogFolderPath(FOLDERS, "a")).toBe("Padrão A — Especial/Solene")
		expect(catalogFolderPath(FOLDERS, null)).toBeNull()
		expect(catalogFolderPath(FOLDERS, "x")).toBeNull()
	})

	test("opções na ordem da árvore", () => {
		expect(catalogFolderOptions(FOLDERS).map((o) => o.value)).toEqual(["a", "b", "b-cafe", "b-coquetel", "b-jantar"])
	})
})
