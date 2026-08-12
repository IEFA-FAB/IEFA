/**
 * Montagem da árvore de preparações (`buildRecipeTree`).
 *
 * Testa o que a tela expõe e nenhum linter enxerga: onde cai a preparação cuja pasta
 * sumiu, quando a pasta vazia aparece, o que o filtro abre, o que a contagem conta.
 * Puro, sem DB e sem render — como em `ingredient-tree.test.ts`.
 */

import { describe, expect, test } from "vitest"
import { allRecipeFolderIds, buildRecipeTree, type RecipeTreeNode, type RecipeTreeRecipe, UNFILED_FOLDER_ID } from "@/lib/recipe-tree"

// ── Fixtures ────────────────────────────────────────────────────────────────

const folder = (id: string, name: string) => ({ id, name })

const recipe = (id: string, name: string, folderId: string | null = null): RecipeTreeRecipe => ({ id, name, folder_id: folderId })

/** Ids na ordem em que a montagem os produziu — a ordem de renderização da lista virtual. */
const order = (nodes: RecipeTreeNode[]) => nodes.map((n) => n.id)

const expandedAll = new Set([UNFILED_FOLDER_ID, "f1", "f2", "f3"])

// ── Testes ──────────────────────────────────────────────────────────────────

describe("buildRecipeTree", () => {
	test("agrupa cada preparação sob a sua pasta", () => {
		const { nodes } = buildRecipeTree({
			folders: [folder("f1", "Carnes"), folder("f2", "Sobremesas")],
			recipes: [recipe("r1", "Bife", "f1"), recipe("r2", "Pudim", "f2")],
			expandedIds: expandedAll,
		})

		expect(order(nodes)).toEqual(["f1", "r1", "f2", "r2"])
		expect(nodes[1]).toMatchObject({ type: "recipe", level: 1, parentId: "f1" })
	})

	test("pasta recolhida esconde as preparações, mas continua contando", () => {
		const { nodes } = buildRecipeTree({
			folders: [folder("f1", "Carnes")],
			recipes: [recipe("r1", "Bife", "f1")],
			expandedIds: new Set(),
		})

		expect(order(nodes)).toEqual(["f1"])
		expect(nodes[0]).toMatchObject({ type: "folder", hasChildren: true, isExpanded: false, recipeCount: 1 })
	})

	test('preparação sem pasta cai no nó sintético "Sem pasta", sempre por último', () => {
		const { nodes, folderCount } = buildRecipeTree({
			folders: [folder("f1", "Zíngaro"), folder("f2", "Assados")],
			recipes: [recipe("r1", "Solta", null), recipe("r2", "Costela", "f2")],
			expandedIds: expandedAll,
		})

		expect(order(nodes)).toEqual(["f2", "r2", "f1", UNFILED_FOLDER_ID, "r1"])
		// O nó sintético não é pasta de verdade: não entra na contagem da listagem.
		expect(folderCount).toBe(2)
	})

	test('"Sem pasta" continua por último na ordenação decrescente', () => {
		const { nodes } = buildRecipeTree({
			folders: [folder("f1", "Assados"), folder("f2", "Zíngaro")],
			recipes: [recipe("r1", "Solta", null)],
			sortDirection: "desc",
			expandedIds: expandedAll,
		})

		expect(order(nodes)).toEqual(["f2", "f1", UNFILED_FOLDER_ID, "r1"])
	})

	test("pasta excluída não engole a preparação — ela reaparece em Sem pasta", () => {
		// `folder_id` aponta para uma pasta que não veio no catálogo (excluída, ou fora do escopo).
		const { nodes } = buildRecipeTree({
			folders: [folder("f1", "Carnes")],
			recipes: [recipe("r1", "Órfã", "fantasma")],
			expandedIds: expandedAll,
		})

		expect(order(nodes)).toEqual(["f1", UNFILED_FOLDER_ID, "r1"])
		expect(nodes[0]).toMatchObject({ hasChildren: false, recipeCount: 0 })
	})

	test("sem filtro, pasta vazia aparece (é onde se arquiva a próxima preparação)", () => {
		const { nodes } = buildRecipeTree({
			folders: [folder("f1", "Recém-criada")],
			recipes: [],
			expandedIds: expandedAll,
		})

		expect(order(nodes)).toEqual(["f1"])
	})

	test("sob filtro, pasta sem resultado some e o resto abre sozinho", () => {
		const { nodes } = buildRecipeTree({
			folders: [folder("f1", "Carnes"), folder("f2", "Sobremesas")],
			recipes: [recipe("r1", "Bife", "f1")],
			// Nenhuma pasta marcada como aberta: o filtro precisa abrir mesmo assim.
			expandedIds: new Set(),
			isFiltering: true,
		})

		expect(order(nodes)).toEqual(["f1", "r1"])
	})

	test("ordena pastas e preparações por nome, respeitando a direção", () => {
		const { nodes } = buildRecipeTree({
			folders: [folder("f2", "Sobremesas"), folder("f1", "Carnes")],
			recipes: [recipe("r2", "Bife", "f1"), recipe("r1", "Almôndega", "f1")],
			sortDirection: "desc",
			expandedIds: expandedAll,
		})

		expect(order(nodes)).toEqual(["f2", "f1", "r2", "r1"])
	})

	test("ordenação ignora acento e caixa (colator pt-BR)", () => {
		const { nodes } = buildRecipeTree({
			folders: [],
			recipes: [recipe("r1", "Ômelete"), recipe("r2", "arroz")],
			expandedIds: expandedAll,
		})

		expect(order(nodes)).toEqual([UNFILED_FOLDER_ID, "r2", "r1"])
	})

	test("entrada não-array não quebra a montagem", () => {
		// Um server fn pode resolver com um envelope de erro em vez de rejeitar.
		const { nodes, folderCount, recipeCount } = buildRecipeTree({
			folders: undefined,
			recipes: null,
		})

		expect(nodes).toEqual([])
		expect(folderCount).toBe(0)
		expect(recipeCount).toBe(0)
	})

	test("recipeCount conta o recorte inteiro, inclusive o que está recolhido", () => {
		const { recipeCount, folderCount } = buildRecipeTree({
			folders: [folder("f1", "Carnes")],
			recipes: [recipe("r1", "Bife", "f1"), recipe("r2", "Solta", null)],
			expandedIds: new Set(),
		})

		expect(recipeCount).toBe(2)
		expect(folderCount).toBe(1)
	})
})

describe("allRecipeFolderIds", () => {
	test('inclui o nó sintético para que "Expandir Tudo" também abra Sem pasta', () => {
		expect(allRecipeFolderIds([folder("f1", "Carnes")])).toEqual(new Set(["f1", UNFILED_FOLDER_ID]))
	})

	test("tolera catálogo ausente", () => {
		expect(allRecipeFolderIds(null)).toEqual(new Set([UNFILED_FOLDER_ID]))
	})
})
