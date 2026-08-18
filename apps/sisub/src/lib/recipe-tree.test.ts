/**
 * Montagem da árvore de preparações (`buildRecipeTree`).
 *
 * Testa o que a tela expõe e nenhum linter enxerga: onde cai a preparação cuja pasta
 * sumiu, quando a pasta vazia aparece, o que a busca por nome de pasta traz junto,
 * qual pasta nasce aberta. Puro, sem DB e sem render — como em `ingredient-tree.test.ts`.
 */

import { describe, expect, test } from "vitest"
import { allRecipeFolderIds, buildRecipeTree, type RecipeTreeNode, type RecipeTreeRecipe, UNFILED_FOLDER_ID } from "@/lib/recipe-tree"

// ── Fixtures ────────────────────────────────────────────────────────────────

const folder = (id: string, name: string) => ({ id, name })

const recipe = (id: string, name: string, folderId: string | null = null): RecipeTreeRecipe => ({ id, name, folder_id: folderId })

/** Ids na ordem em que a montagem os produziu — a ordem de renderização da lista virtual. */
const order = (nodes: RecipeTreeNode[]) => nodes.map((n) => n.id)

/** Tudo fechado — o oposto do default, para provar que o default é abrir. */
const allCollapsed = new Set([UNFILED_FOLDER_ID, "f1", "f2", "f3"])

// ── Testes ──────────────────────────────────────────────────────────────────

describe("buildRecipeTree", () => {
	test("agrupa cada preparação sob a sua pasta", () => {
		const { nodes } = buildRecipeTree({
			folders: [folder("f1", "Carnes"), folder("f2", "Sobremesas")],
			recipes: [recipe("r1", "Bife", "f1"), recipe("r2", "Pudim", "f2")],
		})

		expect(order(nodes)).toEqual(["f1", "r1", "f2", "r2"])
		expect(nodes[1]).toMatchObject({ type: "recipe", level: 1, parentId: "f1" })
	})

	test("pasta desconhecida nasce ABERTA — só some da tela quem foi fechado", () => {
		// O estado persistido guarda as FECHADAS. Uma pasta criada depois (ou por outro
		// usuário) não está lá, e precisa aparecer aberta em vez de esconder o conteúdo.
		const { nodes } = buildRecipeTree({
			folders: [folder("f1", "Carnes"), folder("f9", "Recém-criada")],
			recipes: [recipe("r1", "Bife", "f1"), recipe("r2", "Novidade", "f9")],
			collapsedIds: new Set(["f1"]),
		})

		expect(order(nodes)).toEqual(["f1", "f9", "r2"])
		expect(nodes[0]).toMatchObject({ isExpanded: false, hasChildren: true, recipeCount: 1 })
	})

	test("pasta fechada esconde as preparações, mas continua contando", () => {
		const { nodes } = buildRecipeTree({
			folders: [folder("f1", "Carnes")],
			recipes: [recipe("r1", "Bife", "f1")],
			collapsedIds: allCollapsed,
		})

		expect(order(nodes)).toEqual(["f1"])
		expect(nodes[0]).toMatchObject({ type: "folder", hasChildren: true, isExpanded: false, recipeCount: 1 })
	})

	test('preparação sem pasta cai no nó sintético "Sem pasta", sempre por último', () => {
		const { nodes, folderCount } = buildRecipeTree({
			folders: [folder("f1", "Zíngaro"), folder("f2", "Assados")],
			recipes: [recipe("r1", "Solta", null), recipe("r2", "Costela", "f2")],
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
		})

		expect(order(nodes)).toEqual(["f2", "f1", UNFILED_FOLDER_ID, "r1"])
	})

	test("pasta excluída não engole a preparação — ela reaparece em Sem pasta", () => {
		// `folder_id` aponta para uma pasta que não veio no catálogo (excluída, ou fora do escopo).
		const { nodes } = buildRecipeTree({
			folders: [folder("f1", "Carnes")],
			recipes: [recipe("r1", "Órfã", "fantasma")],
		})

		expect(order(nodes)).toEqual(["f1", UNFILED_FOLDER_ID, "r1"])
		expect(nodes[0]).toMatchObject({ hasChildren: false, recipeCount: 0 })
	})

	test("sem filtro, pasta vazia aparece (é onde se arquiva a próxima preparação)", () => {
		const { nodes } = buildRecipeTree({ folders: [folder("f1", "Recém-criada")], recipes: [] })

		expect(order(nodes)).toEqual(["f1"])
	})

	test("com `hideEmptyFolders`, pasta sem resultado some", () => {
		// Vale para qualquer filtro restritivo — origem, plano semanal, revisão — não só texto.
		const { nodes } = buildRecipeTree({
			folders: [folder("f1", "Carnes"), folder("f2", "Sobremesas")],
			recipes: [recipe("r1", "Bife", "f1")],
			hideEmptyFolders: true,
		})

		expect(order(nodes)).toEqual(["f1", "r1"])
	})

	test("`autoExpand` abre até o que estava fechado", () => {
		const { nodes } = buildRecipeTree({
			folders: [folder("f1", "Carnes")],
			recipes: [recipe("r1", "Bife", "f1")],
			collapsedIds: allCollapsed,
			autoExpand: true,
		})

		expect(order(nodes)).toEqual(["f1", "r1"])
	})

	test("busca casa nome de preparação, sem acento e sem caixa", () => {
		const { nodes, recipeCount, matched } = buildRecipeTree({
			folders: [folder("f1", "Carnes")],
			recipes: [recipe("r1", "Almôndega", "f1"), recipe("r2", "Bife", "f1")],
			filterText: "almondega",
			hideEmptyFolders: true,
		})

		expect(order(nodes)).toEqual(["f1", "r1"])
		expect(recipeCount).toBe(1)
		expect(matched.map((r) => r.id)).toEqual(["r1"])
	})

	test("busca casa nome de PASTA e traz o conteúdo dela junto", () => {
		// O placeholder promete "pastas ou preparações". Sem isto, digitar o nome da pasta
		// esvaziava a tela: nenhuma preparação casava e a pasta sumia por estar vazia.
		const { nodes, recipeCount } = buildRecipeTree({
			folders: [folder("f1", "Sobremesas"), folder("f2", "Carnes")],
			recipes: [recipe("r1", "Pudim", "f1"), recipe("r2", "Bife", "f2")],
			filterText: "sobremes",
			hideEmptyFolders: true,
		})

		expect(order(nodes)).toEqual(["f1", "r1"])
		expect(recipeCount).toBe(1)
	})

	test("busca sensível a caixa e acento quando pedido", () => {
		const { recipeCount } = buildRecipeTree({
			folders: [],
			recipes: [recipe("r1", "Almôndega")],
			filterText: "almondega",
			sensitivity: { caseSensitive: false, accentSensitive: true },
		})

		expect(recipeCount).toBe(0)
	})

	test("ordena pastas e preparações por nome, respeitando a direção", () => {
		const { nodes } = buildRecipeTree({
			folders: [folder("f2", "Sobremesas"), folder("f1", "Carnes")],
			recipes: [recipe("r2", "Bife", "f1"), recipe("r1", "Almôndega", "f1")],
			sortDirection: "desc",
		})

		expect(order(nodes)).toEqual(["f2", "f1", "r2", "r1"])
	})

	test("ordenação ignora acento e caixa (colator pt-BR)", () => {
		const { nodes } = buildRecipeTree({
			folders: [],
			recipes: [recipe("r1", "Ômelete"), recipe("r2", "arroz")],
		})

		expect(order(nodes)).toEqual([UNFILED_FOLDER_ID, "r2", "r1"])
	})

	test("entrada não-array não quebra a montagem", () => {
		// Um server fn pode resolver com um envelope de erro em vez de rejeitar.
		const { nodes, folderCount, recipeCount, matched } = buildRecipeTree({ folders: undefined, recipes: null })

		expect(nodes).toEqual([])
		expect(folderCount).toBe(0)
		expect(recipeCount).toBe(0)
		expect(matched).toEqual([])
	})

	test("recipeCount conta o recorte inteiro, inclusive o que está fechado", () => {
		const { recipeCount, folderCount } = buildRecipeTree({
			folders: [folder("f1", "Carnes")],
			recipes: [recipe("r1", "Bife", "f1"), recipe("r2", "Solta", null)],
			collapsedIds: allCollapsed,
		})

		expect(recipeCount).toBe(2)
		expect(folderCount).toBe(1)
	})
})

describe("allRecipeFolderIds", () => {
	test('inclui o nó sintético para que "Recolher Tudo" também feche Sem pasta', () => {
		expect(allRecipeFolderIds([folder("f1", "Carnes")])).toEqual(new Set(["f1", UNFILED_FOLDER_ID]))
	})

	test("tolera catálogo ausente", () => {
		expect(allRecipeFolderIds(null)).toEqual(new Set([UNFILED_FOLDER_ID]))
	})
})

describe("extraSearchText", () => {
	// O seletor do plano semanal buscava por `rational_id` quando era lista plana. A
	// árvore só casava nome de preparação e de pasta — sem este gancho, quem digita o
	// código do SISUBWEB deixa de achar a preparação, e nada na tela diz por quê.
	const recipes = [
		{ id: "r1", name: "Arroz Carreteiro", folder_id: null, rational_id: "SB-4210" },
		{ id: "r2", name: "Feijão Tropeiro", folder_id: null, rational_id: "SB-9001" },
	]

	test("casa o texto extra além do nome", () => {
		const tree = buildRecipeTree({
			folders: [],
			recipes,
			filterText: "SB-4210",
			extraSearchText: (r) => r.rational_id,
		})
		expect(tree.matched.map((r) => r.id)).toEqual(["r1"])
	})

	test("sem o gancho, o código não casa nada", () => {
		expect(buildRecipeTree({ folders: [], recipes, filterText: "SB-4210" }).matched).toEqual([])
	})

	test("texto extra ausente não derruba o casamento por nome", () => {
		const tree = buildRecipeTree({
			folders: [],
			recipes: [{ id: "r3", name: "Arroz Branco", folder_id: null, rational_id: null }],
			filterText: "arroz",
			extraSearchText: (r) => r.rational_id,
		})
		expect(tree.matched.map((r) => r.id)).toEqual(["r3"])
	})
})
