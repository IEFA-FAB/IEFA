import { useNavigate } from "@tanstack/react-router"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Loader2, Search } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { normalizeForSearch } from "@/lib/text-search"
import { useIngredientsTree } from "@/services/IngredientsService"
import type { Folder, Ingredient } from "@/types/domain/ingredients"

/**
 * Tabela do grupo "Preparações" herdado do SISUBWEB.
 *
 * São linhas de `kitchen.ingredient` que não são insumos — são preparações, com nomes
 * que colidem com os das receitas. Ficam fora de toda listagem de insumo (árvore,
 * seletor da ficha técnica, CSV, denominador da conferência) e vivem aqui, numa tabela
 * plana: sem hierarquia de pastas, porque era justamente a pasta dentro de insumos que
 * confundia. A pasta de origem vira uma COLUNA — dado de proveniência, não navegação.
 *
 * Somente leitura. Continuam existindo porque receitas antigas apontam para elas por FK;
 * quem precisa corrigir uma abre a página de detalhe do insumo, que segue funcionando.
 */

const ROW_HEIGHT = 44

/** Uma linha da tabela, já com a pasta de origem resolvida. */
interface PreparationRow {
	id: string
	description: string
	folderPath: string
	measureUnit: string | null
	legacyId: number | null
	lastReviewedAt: string | null
}

function formatDate(iso: string | null): string {
	if (!iso) return "—"
	return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
}

/**
 * Caminho "Raiz > Sub" da pasta. Cache top-down reaproveitando o caminho do pai;
 * `resolving` quebra ciclos de `parent_id` (a FK self-referente não os impede).
 */
function buildFolderPaths(folders: readonly Folder[]): Record<string, string> {
	const byId: Record<string, Folder> = {}
	for (const f of folders) byId[f.id] = f
	const cache: Record<string, string> = {}
	const resolving = new Set<string>()
	const resolve = (id: string | null): string => {
		if (!id) return ""
		const cached = cache[id]
		if (cached != null) return cached
		const folder = byId[id]
		if (!folder || resolving.has(id)) {
			cache[id] = ""
			return ""
		}
		resolving.add(id)
		const label = folder.description || "(sem nome)"
		const parent = resolve(folder.parent_id)
		resolving.delete(id)
		const path = parent ? `${parent} > ${label}` : label
		cache[id] = path
		return path
	}
	for (const f of folders) resolve(f.id)
	return cache
}

export function PreparationsCatalogTable() {
	const navigate = useNavigate()
	// `"only"` inverte o escopo padrão do catálogo: aqui SÓ o grupo legado aparece.
	const { tree, error, refetch } = useIngredientsTree(false, "only")
	const [search, setSearch] = useState("")
	const parentRef = useRef<HTMLElement>(null)

	const rows = useMemo<PreparationRow[]>(() => {
		if (!tree) return []
		const folders = Array.isArray(tree.folders) ? (tree.folders as Folder[]) : []
		const ingredients = Array.isArray(tree.ingredients) ? (tree.ingredients as Ingredient[]) : []
		const reviews = Array.isArray(tree.lastReviews) ? tree.lastReviews : []
		const paths = buildFolderPaths(folders)
		const lastReviewById: Record<string, string> = {}
		for (const r of reviews) {
			if (r.ingredient_id) lastReviewById[r.ingredient_id] = r.reviewed_at
		}
		const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true })
		return ingredients
			.map((i) => ({
				id: i.id,
				description: i.description || "Sem descrição",
				folderPath: i.folder_id ? (paths[i.folder_id] ?? "—") : "—",
				measureUnit: i.measure_unit,
				legacyId: i.legacy_id,
				lastReviewedAt: lastReviewById[i.id] ?? null,
			}))
			.sort((a, b) => collator.compare(a.description, b.description))
	}, [tree])

	const filtered = useMemo(() => {
		const term = normalizeForSearch(search, { caseSensitive: false, accentSensitive: false }).trim()
		if (!term) return rows
		return rows.filter((r) => normalizeForSearch(r.description, { caseSensitive: false, accentSensitive: false }).includes(term))
	}, [rows, search])

	const rowVirtualizer = useVirtualizer({
		count: filtered.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: 10,
		getItemKey: (index) => filtered[index]?.id ?? index,
	})

	if (!tree && !error) {
		return (
			<div className="flex items-center justify-center h-96">
				<Loader2 className="size-8 animate-spin text-muted-foreground" />
			</div>
		)
	}

	if (error) {
		return (
			<Card className="p-6">
				<div className="text-center space-y-4">
					<p className="text-destructive">Erro ao carregar as preparações</p>
					<p className="text-sm text-muted-foreground">{error.message}</p>
					<Button onClick={() => refetch()}>Tentar Novamente</Button>
				</div>
			</Card>
		)
	}

	// Mesma grade no cabeçalho e nas linhas — o cabeçalho fica fora do container rolável.
	const gridCols = "grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)_6rem_7rem_9rem] items-center gap-3 px-4"

	return (
		<div className="space-y-6">
			<Card className="flex-col lg:flex-row lg:items-center gap-3 p-4">
				<div className="relative flex-1 min-w-56">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
					<Input
						type="search"
						placeholder="Buscar preparação..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-10"
						aria-label="Buscar nas preparações do SISUBWEB"
					/>
				</div>
				<p className="text-sm text-muted-foreground lg:max-w-md">
					Itens migrados do SISUBWEB como insumo, mas que são preparações. Ficam fora do catálogo de insumos e da conferência.
				</p>
			</Card>

			{/* py-0/gap-0: cabeçalho, lista e rodapé encostam nas bordas do Card — a régua de
			    colunas só alinha se nada acrescentar padding vertical entre eles. */}
			<Card className="py-0 gap-0">
				{/* Cabeçalho apenas visual: a lista é virtualizada, então não existe <table> para
				    ancorar `columnheader`. Cada linha carrega o próprio rótulo acessível. */}
				<div className={`${gridCols} h-10 border-b bg-muted/40 text-xs font-medium text-muted-foreground`} aria-hidden="true">
					<span>Preparação</span>
					<span>Pasta de origem</span>
					<span>Unidade</span>
					<span>Cód. legado</span>
					<span>Última conferência</span>
				</div>
				<section ref={parentRef} className="h-150 overflow-auto" aria-label="Preparações do SISUBWEB">
					{filtered.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
							<p className="font-sans">{rows.length === 0 ? "Nenhuma preparação migrada" : "Nenhuma preparação encontrada"}</p>
							{rows.length > 0 && <p className="text-sm mt-2">Tente ajustar a busca</p>}
						</div>
					) : (
						<div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: "100%", position: "relative" }}>
							{rowVirtualizer.getVirtualItems().map((virtualRow) => {
								const row = filtered[virtualRow.index]
								if (!row) return null
								return (
									<button
										key={virtualRow.key}
										type="button"
										aria-label={`Abrir ${row.description}${row.folderPath !== "—" ? ` — pasta ${row.folderPath}` : ""}`}
										onClick={() => navigate({ to: "/global/ingredients/$ingredientId", params: { ingredientId: row.id } })}
										className={`${gridCols} absolute left-0 w-full border-b text-left text-sm hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none`}
										style={{ top: 0, height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)` }}
									>
										<span className="truncate font-medium">{row.description}</span>
										<span className="truncate text-muted-foreground">{row.folderPath}</span>
										<span className="text-muted-foreground">{row.measureUnit || "—"}</span>
										<span className="text-muted-foreground tabular-nums">{row.legacyId ?? "—"}</span>
										<span className="text-muted-foreground">{formatDate(row.lastReviewedAt)}</span>
									</button>
								)
							})}
						</div>
					)}
				</section>
				<CardFooter className="text-xs text-muted-foreground select-none">
					<span>
						{filtered.length} {filtered.length === 1 ? "preparação" : "preparações"}
						{filtered.length !== rows.length && <span className="text-muted-foreground/60"> de {rows.length}</span>}
					</span>
				</CardFooter>
			</Card>
		</div>
	)
}
