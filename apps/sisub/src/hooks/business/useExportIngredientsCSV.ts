import { toast } from "sonner"
import { useIngredientsTree } from "@/services/IngredientsService"
import type { Folder, Ingredient, IngredientItem } from "@/types/domain/ingredients"

/**
 * Hook de negócio para exportar dados de ingredientes em CSV.
 *
 * Varre os DADOS CRUS da árvore (`tree.folders` / `tree.ingredients` /
 * `tree.ingredientItems` / `tree.lastReviews`) — NÃO a árvore virtualizada de UI.
 * A árvore de UI só materializa nós de pastas expandidas e nunca inclui itens de
 * compra, então reusá-la deixava de fora subpastas colapsadas, todos os itens de
 * compra e os dados de revisão. Aqui exportamos tudo, em todos os níveis.
 *
 * Segue padrão: hooks/business/ contém lógica de negócio complexa.
 */
export function useExportIngredientsCSV() {
	const { tree } = useIngredientsTree()

	const exportCSV = () => {
		const folders = asArray<Folder>(tree?.folders)
		const ingredients = asArray<Ingredient>(tree?.ingredients)
		const items = asArray<IngredientItem>(tree?.ingredientItems)
		const reviews = asArray<{ ingredient_id: string | null; reviewed_at: string | null; reviewed_by_name: string | null }>(tree?.lastReviews)

		if (!tree) {
			toast.error("Aguarde o carregamento dos dados")
			return
		}
		if (folders.length === 0 && ingredients.length === 0) {
			toast.error("Nenhum dado para exportar")
			return
		}

		// Índices para traversal hierárquico (todos os níveis, independente de expand/collapse)
		const folderById: Record<string, Folder> = {}
		for (const f of folders) folderById[f.id] = f

		const pushInto = <T>(bucketMap: Record<string, T[]>, key: string, value: T) => {
			const bucket = bucketMap[key]
			if (bucket) bucket.push(value)
			else bucketMap[key] = [value]
		}

		const childFoldersByParent: Record<string, Folder[]> = {}
		for (const f of folders) pushInto(childFoldersByParent, f.parent_id ?? "root", f)

		const ingredientsByFolder: Record<string, Ingredient[]> = {}
		for (const i of ingredients) pushInto(ingredientsByFolder, i.folder_id ?? "root", i)

		const itemsByIngredient: Record<string, IngredientItem[]> = {}
		for (const it of items) {
			if (!it.ingredient_id) continue
			pushInto(itemsByIngredient, it.ingredient_id, it)
		}

		const reviewByIngredientId: Record<string, { reviewed_at: string | null; reviewed_by_name: string | null }> = {}
		for (const r of reviews) {
			if (r.ingredient_id) reviewByIngredientId[r.ingredient_id] = { reviewed_at: r.reviewed_at, reviewed_by_name: r.reviewed_by_name }
		}

		// Ordenação alfabética estável (pt-BR, numérica) — mesma regra da árvore de UI
		const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true })
		const byDescription = (a: { description: string | null }, b: { description: string | null }) => collator.compare(a.description ?? "", b.description ?? "")
		for (const key of Object.keys(childFoldersByParent)) childFoldersByParent[key].sort(byDescription)
		for (const key of Object.keys(ingredientsByFolder)) ingredientsByFolder[key].sort(byDescription)
		for (const key of Object.keys(itemsByIngredient)) itemsByIngredient[key].sort(byDescription)

		// Caminho completo (raiz → folder, inclusivo) de uma pasta, separado por " > ".
		// Recursivo top-down: reutiliza o caminho do pai já cacheado, evitando re-traversal
		// O(depth²). O `resolving` quebra ciclos de parent_id (FK self-ref não os impede).
		const folderPathCache: Record<string, string> = {}
		const resolving = new Set<string>()
		const folderPath = (folderId: string | null): string => {
			if (!folderId) return ""
			const cached = folderPathCache[folderId]
			if (cached != null) return cached
			const f: Folder | undefined = folderById[folderId]
			// Pasta ausente ou ciclo detectado → encerra sem recursão.
			if (!f || resolving.has(folderId)) {
				folderPathCache[folderId] = ""
				return ""
			}
			resolving.add(folderId)
			const parentPath = folderPath(f.parent_id)
			resolving.delete(folderId)
			const name = f.description ?? "(sem nome)"
			const path = parentPath ? `${parentPath} > ${name}` : name
			folderPathCache[folderId] = path
			return path
		}

		const formatDate = (iso: string | null | undefined): string => {
			if (!iso) return ""
			const d = new Date(iso)
			return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR")
		}

		const num = (n: number | null | undefined): string => (n == null ? "" : String(n))

		// Linha CSV: 13 colunas, sempre na mesma ordem
		const rows: string[] = []
		const pushRow = (cols: (string | null | undefined)[]) => {
			rows.push(cols.map((c) => `"${escapeCSV(c == null ? "" : String(c))}"`).join(","))
		}

		const emitIngredient = (ingredient: Ingredient) => {
			const review = reviewByIngredientId[ingredient.id]
			pushRow([
				"Insumo",
				folderPath(ingredient.folder_id), // Caminho (pasta, todos os níveis)
				"", // Insumo (vazio: a própria linha é o insumo)
				ingredient.description ?? "Sem descrição", // Nome
				ingredient.measure_unit, // Unidade Medida
				num(ingredient.correction_factor), // Fator Correção
				num(ingredient.density_factor), // Fator Densidade
				"", // Qtd Conteúdo (só item de compra)
				"", // Código Barras (só item de compra)
				ingredient.ceafa_id, // CEAFA
				num(ingredient.legacy_id), // Código Legado
				formatDate(review?.reviewed_at), // Revisado Em
				review?.reviewed_by_name, // Revisado Por
			])

			for (const item of itemsByIngredient[ingredient.id] ?? []) {
				pushRow([
					"Item de Compra",
					folderPath(ingredient.folder_id), // Caminho (herda do insumo)
					ingredient.description ?? "Sem descrição", // Insumo (pai)
					item.description ?? "Sem descrição", // Nome
					item.purchase_measure_unit, // Unidade Medida
					num(item.correction_factor), // Fator Correção
					"", // Fator Densidade (só insumo)
					num(item.unit_content_quantity), // Qtd Conteúdo
					item.barcode, // Código Barras
					"", // CEAFA (só insumo)
					"", // Código Legado (só insumo)
					"", // Revisado Em (só insumo)
					"", // Revisado Por (só insumo)
				])
			}
		}

		const emitFolder = (folder: Folder) => {
			pushRow([
				"Pasta",
				folderPath(folder.parent_id), // Caminho (ancestrais)
				"",
				folder.description ?? "(sem nome)", // Nome
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				"",
			])
			for (const child of childFoldersByParent[folder.id] ?? []) emitFolder(child)
			for (const ingredient of ingredientsByFolder[folder.id] ?? []) emitIngredient(ingredient)
		}

		// Pastas raiz (e seus descendentes), depois insumos órfãos (sem pasta)
		for (const folder of childFoldersByParent.root ?? []) emitFolder(folder)
		for (const ingredient of ingredientsByFolder.root ?? []) emitIngredient(ingredient)

		const header =
			"Tipo,Caminho,Insumo,Nome,Unidade Medida,Fator Correção,Fator Densidade,Qtd Conteúdo,Código Barras,CEAFA,Código Legado,Revisado Em,Revisado Por\n"

		// BOM UTF-8 para compatibilidade com Excel
		const csv = `\uFEFF${header}${rows.join("\n")}`

		const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
		const url = URL.createObjectURL(blob)
		const link = document.createElement("a")
		link.href = url
		link.download = `insumos_${new Date().toISOString().split("T")[0]}.csv`
		link.click()
		URL.revokeObjectURL(url)

		toast.success("CSV exportado com sucesso!")
	}

	return { exportCSV }
}

/** Escapa aspas duplas para CSV (duplicando-as). */
function escapeCSV(value: string): string {
	return value.replace(/"/g, '""')
}

/**
 * Garante um array iterável. Um server fn pode resolver com um objeto não-array
 * (envelope de erro materializado pelo client) — `?? []` só cobre null/undefined.
 */
function asArray<T>(value: readonly T[] | null | undefined): readonly T[] {
	return Array.isArray(value) ? value : []
}
