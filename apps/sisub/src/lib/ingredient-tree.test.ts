/**
 * Montagem da árvore de insumos (`buildIngredientTree`).
 *
 * Testa a lógica que a tela expõe e nenhum linter enxerga: quem é raiz, quem é
 * alcançável, o que o filtro traz junto (ancestrais e descendentes), como o
 * escopo/ordenação/expand se combinam. Puro, sem DB e sem render.
 *
 * O caso que motivou a suíte: a aba "Preparações" abria vazia porque o recorte não
 * continha nenhuma pasta com `parent_id` nulo, e o traversal parte da raiz. Ver
 * "recorte que não alcança a raiz original".
 */

import { describe, expect, test } from "vitest"
import { buildIngredientTree, folderReviewStats } from "@/lib/ingredient-tree"
import type { Folder, Ingredient, IngredientTreeNode } from "@/types/domain/ingredients"

// ── Fixtures ────────────────────────────────────────────────────────────────

function folder(id: string, description: string | null, parentId: string | null = null): Folder {
	return { id, description, parent_id: parentId, created_at: "2026-01-01T00:00:00Z", deleted_at: null, legacy_id: null } as Folder
}

function ingredient(id: string, description: string | null, folderId: string | null = null): Ingredient {
	return {
		id,
		description,
		folder_id: folderId,
		created_at: "2026-01-01T00:00:00Z",
		deleted_at: null,
		measure_unit: "KG",
		correction_factor: null,
		legacy_id: null,
		ceafa_id: null,
		density_factor: null,
		rehydration_index: null,
	} as Ingredient
}

/** IDs na ordem em que o traversal os produziu — a ordem de renderização da lista virtual. */
const order = (nodes: IngredientTreeNode[]) => nodes.map((n) => n.id)
/** Todo nó que passou pelo filtro, expandido ou não (`byId`, não `nodes`). */
const includedIds = (tree: { byId: Record<string, IngredientTreeNode> }) => Object.keys(tree.byId).toSorted()
const levelOf = (nodes: IngredientTreeNode[], id: string) => nodes.find((n) => n.id === id)?.level

// Hierarquia base reaproveitada: raiz → duas subpastas → insumos.
//   f-raiz "Gêneros de Alimentação"
//     f-graos "Grãos"          → i-arroz, i-feijao
//     f-carnes "Carnes"        → i-bife
//   (solto, sem pasta)         → i-sal
const BASE_FOLDERS = [folder("f-raiz", "Gêneros de Alimentação"), folder("f-graos", "Grãos", "f-raiz"), folder("f-carnes", "Carnes", "f-raiz")]
const BASE_INGREDIENTS = [
	ingredient("i-arroz", "Arroz Polido", "f-graos"),
	ingredient("i-feijao", "Feijão Carioca", "f-graos"),
	ingredient("i-bife", "Bife Bovino", "f-carnes"),
	ingredient("i-sal", "Sal Refinado", null),
]

const allExpanded = new Set(["f-raiz", "f-graos", "f-carnes"])

// ── Hierarquia e travessia ──────────────────────────────────────────────────

describe("hierarquia", () => {
	test("aninha por parent_id e calcula nível a partir da raiz", () => {
		const tree = buildIngredientTree({ folders: BASE_FOLDERS, ingredients: BASE_INGREDIENTS, expandedIds: allExpanded })

		expect(levelOf(tree.nodes, "f-raiz")).toBe(0)
		expect(levelOf(tree.nodes, "f-graos")).toBe(1)
		expect(levelOf(tree.nodes, "i-arroz")).toBe(2)
		// Insumo sem pasta é raiz, nível 0 — não herda o nível 1 do campo `level` inicial.
		expect(levelOf(tree.nodes, "i-sal")).toBe(0)
	})

	test("hasChildren reflete o que existe embaixo, não o que está expandido", () => {
		const tree = buildIngredientTree({ folders: BASE_FOLDERS, ingredients: BASE_INGREDIENTS, expandedIds: new Set() })
		expect(tree.byId["f-raiz"].hasChildren).toBe(true)
		// f-graos nem foi visitado (pai recolhido) e continua com o default `false`;
		// o que importa é que a raiz visitada saiba que tem filhos, senão some o chevron.
		expect(tree.nodes.map((n) => n.id)).not.toContain("f-graos")
	})

	test("pasta recolhida esconde a subárvore de `nodes` mas mantém tudo em `byId`", () => {
		const tree = buildIngredientTree({ folders: BASE_FOLDERS, ingredients: BASE_INGREDIENTS, expandedIds: new Set(["f-raiz"]) })

		expect(order(tree.nodes)).toContain("f-graos")
		expect(order(tree.nodes)).not.toContain("i-arroz") // f-graos está recolhida
		// `byId` é o que a tela usa para contar "N insumos" — precisa ignorar expand/collapse.
		expect(includedIds(tree)).toContain("i-arroz")
	})

	test("traversal em profundidade: os filhos vêm logo depois do pai", () => {
		const tree = buildIngredientTree({ folders: BASE_FOLDERS, ingredients: BASE_INGREDIENTS, expandedIds: allExpanded })
		const ids = order(tree.nodes)
		expect(ids.indexOf("i-bife")).toBe(ids.indexOf("f-carnes") + 1)
	})
})

// ── Quem é raiz ─────────────────────────────────────────────────────────────

describe("resolução de raiz", () => {
	test("recorte que não alcança a raiz original ainda renderiza (regressão: aba Preparações vazia)", () => {
		// Espelha o escopo `preparations: "only"`: a pasta-topo do recorte é filha de uma
		// pasta que o recorte NÃO devolve. Antes, nada tinha parent_id nulo e a árvore saía
		// vazia — com nós em `byId` e `nodes` zerado, que é o pior sintoma possível.
		const tree = buildIngredientTree({
			folders: [folder("f-prep", "Preparações - Sisubweb", "f-fora-do-recorte"), folder("f-elaboradas", "Elaboradas", "f-prep")],
			ingredients: [ingredient("i-feijoada", "Feijoada", "f-elaboradas")],
			expandedIds: new Set(["f-prep", "f-elaboradas"]),
		})

		expect(order(tree.nodes)).toEqual(["f-prep", "f-elaboradas", "i-feijoada"])
		expect(levelOf(tree.nodes, "f-prep")).toBe(0)
	})

	test("pasta com pai soft-deleted vira raiz em vez de sumir", () => {
		// `listFolders` não devolve a pasta deletada; os filhos vivos ficavam presos a um id
		// sem nó, invisíveis e sem caminho pela tela.
		const tree = buildIngredientTree({
			folders: [folder("f-orfa", "Órfã", "f-apagada")],
			ingredients: [ingredient("i-solto", "Insumo Solto", "f-orfa")],
			expandedIds: new Set(["f-orfa"]),
		})
		expect(order(tree.nodes)).toEqual(["f-orfa", "i-solto"])
	})

	test("insumo cuja pasta não veio no recorte aparece no nível raiz", () => {
		const tree = buildIngredientTree({ folders: [], ingredients: [ingredient("i-perdido", "Insumo Perdido", "f-inexistente")] })
		expect(order(tree.nodes)).toEqual(["i-perdido"])
	})

	test("ciclo em parent_id não trava e não engole os nós", () => {
		// A FK auto-referente não impede ciclo. Sem promover os membros a raiz, o grupo
		// inteiro ficaria inalcançável — ou o traversal recursivo estouraria a pilha.
		const tree = buildIngredientTree({
			folders: [folder("f-a", "A", "f-b"), folder("f-b", "B", "f-a"), folder("f-c", "C", "f-a")],
			ingredients: [ingredient("i-x", "X", "f-c")],
			expandedIds: new Set(["f-a", "f-b", "f-c"]),
		})

		const ids = order(tree.nodes)
		expect(ids).toContain("f-a")
		expect(ids).toContain("f-b")
		// Pendurado no ciclo, mas alcançável por f-a, que virou raiz.
		expect(ids).toContain("f-c")
		expect(ids).toContain("i-x")
		// Cada nó exatamente uma vez — promover ambos os membros não pode duplicar.
		expect(new Set(ids).size).toBe(ids.length)
	})

	test("auto-referência (pasta que é o próprio pai) também é promovida", () => {
		const tree = buildIngredientTree({ folders: [folder("f-self", "Self", "f-self")], ingredients: [] })
		expect(order(tree.nodes)).toEqual(["f-self"])
	})
})

// ── Filtro de texto ─────────────────────────────────────────────────────────

describe("filtro de texto", () => {
	test("insumo que casa traz os ancestrais e descarta o resto", () => {
		const tree = buildIngredientTree({ folders: BASE_FOLDERS, ingredients: BASE_INGREDIENTS, filterText: "arroz" })

		expect(order(tree.nodes)).toEqual(["f-raiz", "f-graos", "i-arroz"])
		expect(includedIds(tree)).not.toContain("f-carnes")
	})

	test("pasta que casa traz TODA a subárvore, senão apareceria vazia", () => {
		const tree = buildIngredientTree({ folders: BASE_FOLDERS, ingredients: BASE_INGREDIENTS, filterText: "grãos" })
		expect(includedIds(tree)).toEqual(["f-graos", "f-raiz", "i-arroz", "i-feijao"].toSorted())
	})

	test("sob filtro, tudo abre — o resultado não pode ficar atrás de uma pasta recolhida", () => {
		const tree = buildIngredientTree({ folders: BASE_FOLDERS, ingredients: BASE_INGREDIENTS, filterText: "arroz", expandedIds: new Set() })
		expect(order(tree.nodes)).toContain("i-arroz")
		expect(tree.byId["f-graos"].isExpanded).toBe(true)
	})

	test("por padrão ignora acento e caixa", () => {
		const tree = buildIngredientTree({ folders: BASE_FOLDERS, ingredients: BASE_INGREDIENTS, filterText: "FEIJAO" })
		expect(includedIds(tree)).toContain("i-feijao")
	})

	test("accentSensitive faz 'feijao' deixar de casar 'Feijão'", () => {
		const tree = buildIngredientTree({
			folders: BASE_FOLDERS,
			ingredients: BASE_INGREDIENTS,
			filterText: "feijao",
			sensitivity: { caseSensitive: false, accentSensitive: true },
		})
		expect(includedIds(tree)).not.toContain("i-feijao")
	})

	test("caseSensitive faz 'arroz' deixar de casar 'Arroz'", () => {
		const tree = buildIngredientTree({
			folders: BASE_FOLDERS,
			ingredients: BASE_INGREDIENTS,
			filterText: "arroz",
			sensitivity: { caseSensitive: true, accentSensitive: false },
		})
		expect(includedIds(tree)).not.toContain("i-arroz")
	})

	test("filtro sem resultado devolve árvore vazia, não a árvore inteira", () => {
		const tree = buildIngredientTree({ folders: BASE_FOLDERS, ingredients: BASE_INGREDIENTS, filterText: "zzzznaoexiste" })
		expect(tree.nodes).toEqual([])
		expect(includedIds(tree)).toEqual([])
	})

	test("filtro só de espaços não filtra nada", () => {
		const tree = buildIngredientTree({ folders: BASE_FOLDERS, ingredients: BASE_INGREDIENTS, filterText: "   ", expandedIds: allExpanded })
		expect(order(tree.nodes)).toHaveLength(BASE_FOLDERS.length + BASE_INGREDIENTS.length)
	})

	test("filtro alcança um insumo órfão promovido a raiz", () => {
		const tree = buildIngredientTree({ folders: [], ingredients: [ingredient("i-perdido", "Insumo Perdido", "f-inexistente")], filterText: "perdido" })
		expect(order(tree.nodes)).toEqual(["i-perdido"])
	})
})

// ── Filtro de conferência ───────────────────────────────────────────────────

describe("somente não revisados", () => {
	const lastReviews = [{ ingredient_id: "i-arroz", reviewed_at: "2026-06-01T00:00:00Z" }]

	test("some com os já conferidos e com as pastas que ficaram sem insumo", () => {
		const tree = buildIngredientTree({ folders: BASE_FOLDERS, ingredients: BASE_INGREDIENTS, lastReviews, onlyNotReviewed: true })

		expect(includedIds(tree)).not.toContain("i-arroz")
		expect(includedIds(tree)).toContain("i-feijao")
		expect(includedIds(tree)).toContain("f-carnes")
	})

	test("combina com o texto por interseção, não por união", () => {
		const tree = buildIngredientTree({
			folders: BASE_FOLDERS,
			ingredients: BASE_INGREDIENTS,
			lastReviews,
			onlyNotReviewed: true,
			filterText: "arroz",
		})
		// "Arroz Polido" casa o texto mas já foi conferido → não sobra nada.
		expect(tree.nodes).toEqual([])
	})

	test("pasta que casa o texto não readmite insumo já conferido pela via dos descendentes", () => {
		const tree = buildIngredientTree({
			folders: BASE_FOLDERS,
			ingredients: BASE_INGREDIENTS,
			lastReviews,
			onlyNotReviewed: true,
			filterText: "grãos",
		})
		expect(includedIds(tree)).toContain("i-feijao")
		expect(includedIds(tree)).not.toContain("i-arroz")
	})
})

// ── Categorias ocultas (chips) ──────────────────────────────────────────────

describe("categorias ocultas", () => {
	const folders = [...BASE_FOLDERS, folder("f-pratos", "Pratos Prontos"), folder("f-sub", "Congelados", "f-pratos")]
	const ingredients = [...BASE_INGREDIENTS, ingredient("i-lasanha", "Lasanha Congelada", "f-sub")]

	test("ocultar a categoria remove a raiz e toda a subárvore", () => {
		const tree = buildIngredientTree({ folders, ingredients, hiddenCategoryKeys: ["pratos-prontos"], expandedIds: allExpanded })

		for (const id of ["f-pratos", "f-sub", "i-lasanha"]) expect(includedIds(tree)).not.toContain(id)
		expect(includedIds(tree)).toContain("i-arroz")
	})

	test("chave desconhecida não oculta nada", () => {
		const tree = buildIngredientTree({ folders, ingredients, hiddenCategoryKeys: ["categoria-que-nao-existe"], expandedIds: allExpanded })
		expect(includedIds(tree)).toContain("f-pratos")
	})

	test("a categoria oculta some também sob busca de texto", () => {
		const tree = buildIngredientTree({ folders, ingredients, hiddenCategoryKeys: ["pratos-prontos"], filterText: "lasanha" })
		expect(tree.nodes).toEqual([])
	})
})

// ── Ordenação ───────────────────────────────────────────────────────────────

describe("ordenação", () => {
	test("pastas antes de insumos, cada grupo em ordem alfabética", () => {
		const tree = buildIngredientTree({
			folders: [folder("f-z", "Zebra"), folder("f-a", "Abacate")],
			ingredients: [ingredient("i-z", "Zurique"), ingredient("i-a", "Abacaxi")],
		})
		expect(order(tree.nodes)).toEqual(["f-a", "f-z", "i-a", "i-z"])
	})

	test("desc inverte dentro de cada grupo, sem misturar pasta com insumo", () => {
		const tree = buildIngredientTree({
			folders: [folder("f-z", "Zebra"), folder("f-a", "Abacate")],
			ingredients: [ingredient("i-z", "Zurique"), ingredient("i-a", "Abacaxi")],
			sortDirection: "desc",
		})
		expect(order(tree.nodes)).toEqual(["f-z", "f-a", "i-z", "i-a"])
	})

	test("ordena por acento/caixa como pt-BR e numericamente", () => {
		const tree = buildIngredientTree({
			folders: [],
			ingredients: [ingredient("i-10", "Item 10"), ingredient("i-2", "Item 2"), ingredient("i-acai", "Açaí"), ingredient("i-abac", "Abacate")],
		})
		expect(order(tree.nodes)).toEqual(["i-abac", "i-acai", "i-2", "i-10"])
	})

	test("cada nível ordena independente do outro", () => {
		const tree = buildIngredientTree({
			folders: [folder("f-a", "A"), folder("f-a-sub2", "Zulu", "f-a"), folder("f-a-sub1", "Alfa", "f-a")],
			ingredients: [],
			expandedIds: new Set(["f-a"]),
		})
		expect(order(tree.nodes)).toEqual(["f-a", "f-a-sub1", "f-a-sub2"])
	})
})

// ── Entradas degeneradas ────────────────────────────────────────────────────

describe("entradas degeneradas", () => {
	test("null/undefined no lugar dos arrays não explode", () => {
		const tree = buildIngredientTree({ folders: null, ingredients: undefined })
		expect(tree).toEqual({ nodes: [], byId: {}, byParentId: {} })
	})

	test("objeto não-array (envelope de erro materializado) é tratado como vazio", () => {
		// `?? []` não cobre este caso; `for...of` sobre o objeto lançaria "not iterable".
		const tree = buildIngredientTree({ folders: { error: "boom" } as never, ingredients: BASE_INGREDIENTS })
		expect(order(tree.nodes)).toEqual(["i-arroz", "i-bife", "i-feijao", "i-sal"])
	})

	test("descrição nula rende um rótulo legível em vez de vazio", () => {
		const tree = buildIngredientTree({
			folders: [folder("f-nula", null)],
			ingredients: [ingredient("i-nulo", null, "f-nula")],
			expandedIds: new Set(["f-nula"]),
		})
		expect(tree.byId["f-nula"].label).toBe("Pasta f-nula...")
		expect(tree.byId["i-nulo"].label).toBe("Sem descrição")
	})

	test("catálogo vazio devolve estrutura vazia, não null", () => {
		const tree = buildIngredientTree({ folders: [], ingredients: [] })
		expect(tree.nodes).toEqual([])
		expect(tree.byParentId).toEqual({})
	})

	test("hierarquia profunda não estoura a pilha nem perde nós", () => {
		const depth = 500
		const folders = Array.from({ length: depth }, (_, i) => folder(`f-${i}`, `Nível ${i}`, i === 0 ? null : `f-${i - 1}`))
		const tree = buildIngredientTree({
			folders,
			ingredients: [ingredient("i-fundo", "Fundo do Poço", `f-${depth - 1}`)],
			expandedIds: new Set(folders.map((f) => f.id)),
		})
		expect(tree.nodes).toHaveLength(depth + 1)
		expect(levelOf(tree.nodes, "i-fundo")).toBe(depth)
	})
})

// ── Progresso de conferência por pasta ──────────────────────────────────────

describe("progresso de conferência da pasta", () => {
	const review = (id: string, at: string) => ({ ingredient_id: id, reviewed_at: at })

	test("conta a subárvore inteira, não só os filhos diretos", () => {
		const stats = folderReviewStats({ folders: BASE_FOLDERS, ingredients: BASE_INGREDIENTS, lastReviews: [] })

		// f-raiz não tem insumo direto nenhum — os 3 vêm das subpastas.
		expect(stats.get("f-raiz")?.total).toBe(3)
		expect(stats.get("f-graos")?.total).toBe(2)
		expect(stats.get("f-carnes")?.total).toBe(1)
	})

	test("insumo solto (sem pasta) não é creditado a ninguém", () => {
		const stats = folderReviewStats({ folders: BASE_FOLDERS, ingredients: BASE_INGREDIENTS, lastReviews: [] })
		// i-sal existe, mas não infla o total de nenhuma pasta.
		const somaDasRaizes = stats.get("f-raiz")?.total ?? 0
		expect(somaDasRaizes).toBe(BASE_INGREDIENTS.length - 1)
	})

	test("a data da pasta é a conferência MAIS ANTIGA, não a mais recente", () => {
		const stats = folderReviewStats({
			folders: BASE_FOLDERS,
			ingredients: BASE_INGREDIENTS,
			lastReviews: [review("i-arroz", "2026-06-01T00:00:00Z"), review("i-feijao", "2026-08-01T00:00:00Z")],
		})

		// Dizer 08/2026 esconderia que metade do conteúdo não é checado desde 06/2026.
		expect(stats.get("f-graos")).toEqual({ total: 2, reviewed: 2, oldestReviewedAt: "2026-06-01T00:00:00Z" })
	})

	test("pasta só fecha quando todo o conteúdo foi conferido, inclusive o das subpastas", () => {
		const lastReviews = [review("i-arroz", "2026-06-01T00:00:00Z"), review("i-feijao", "2026-06-02T00:00:00Z")]
		const stats = folderReviewStats({ folders: BASE_FOLDERS, ingredients: BASE_INGREDIENTS, lastReviews })

		// Grãos completa; a raiz não, porque i-bife (em Carnes) segue pendente.
		expect(stats.get("f-graos")?.reviewed).toBe(stats.get("f-graos")?.total)
		expect(stats.get("f-raiz")).toEqual({ total: 3, reviewed: 2, oldestReviewedAt: "2026-06-01T00:00:00Z" })
	})

	test("insumo excluído sai da conta — não é pendência de conferência", () => {
		const removido = { ...ingredient("i-velho", "Insumo Extinto", "f-carnes"), deleted_at: "2026-07-01T00:00:00Z" }
		const stats = folderReviewStats({ folders: BASE_FOLDERS, ingredients: [...BASE_INGREDIENTS, removido], lastReviews: [] })

		expect(stats.get("f-carnes")?.total).toBe(1)
	})

	test("pasta vazia não aparece — sem insumo não há progresso a afirmar", () => {
		const folders = [...BASE_FOLDERS, folder("f-vazia", "Pasta Sem Nada", "f-raiz")]
		const stats = folderReviewStats({ folders, ingredients: BASE_INGREDIENTS, lastReviews: [] })

		expect(stats.has("f-vazia")).toBe(false)
	})

	test("ciclo de parent_id não trava o acúmulo", () => {
		// a → b → a. A FK auto-referente permite; sem guarda, o laço não termina.
		const folders = [folder("f-a", "A", "f-b"), folder("f-b", "B", "f-a")]
		const stats = folderReviewStats({ folders, ingredients: [ingredient("i-x", "X", "f-a")], lastReviews: [] })

		expect(stats.get("f-a")?.total).toBe(1)
		expect(stats.get("f-b")?.total).toBe(1)
	})

	test("entrada degenerada não lança", () => {
		expect(folderReviewStats({ folders: null, ingredients: null }).size).toBe(0)
		// Server fn pode resolver com envelope não-array; `asArray` defende.
		expect(folderReviewStats({ folders: {} as never, ingredients: {} as never, lastReviews: {} as never }).size).toBe(0)
	})
})
