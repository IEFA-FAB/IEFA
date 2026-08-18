import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Activity, DownloadIcon, FolderPlus, PackagePlus } from "lucide-react"
import { useRef, useState } from "react"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { IngredientsTreeManager, type IngredientsTreeManagerHandle } from "@/components/features/global/IngredientsTreeManager"
import { PreparationsTreeManager } from "@/components/features/global/PreparationsTreeManager"
import { IngredientReviewMetricsSheet } from "@/components/features/global/ReviewMetricsSheet"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useGlobalWrite } from "@/hooks/auth/useGlobalWrite"
import { useExportIngredientsCSV } from "@/hooks/business/useExportIngredientsCSV"
import { ingredientsTreeQueryOptions } from "@/services/IngredientsService"

/**
 * Rota: /global/ingredients
 * ACL: módulo "global" nível 1+ (GLOBAL-01)
 *
 * Três abas sobre a mesma tabela `kitchen.ingredient`, separadas por escopo:
 *
 * - "Insumos" — gêneros de alimentação, o catálogo de verdade.
 * - "Preparações (SISUBWEB)" — o grupo herdado do legado, que não é insumo. Vive em
 *   `kitchen.preparation_group`, fora da árvore de pastas (`preparation-scope.ts`).
 * - "Itens auxiliares" — material não alimentar (EPI, limpeza, embalagem, copa, gás,
 *   combustível). Mesma árvore de `kitchen.folder` dos gêneros, recortada pela coluna
 *   `catalog_scope` (`catalog-scope.ts`).
 *
 * O recorte é DESTA tela: o seletor de insumo da ficha técnica continua enxergando
 * gêneros e auxiliares juntos — copo descartável, palito e fósforo já são ingrediente
 * de 29 linhas de preparação, e escondê-los aqui não os tira de lá.
 */
const TABS = ["insumos", "preparacoes", "auxiliares"] as const
type IngredientsTab = (typeof TABS)[number]

const searchSchema = z.object({
	search: z.string().optional(),
	tab: z.enum(TABS).optional(),
})

export const Route = createFileRoute("/_protected/_modules/global/ingredients/")({
	validateSearch: searchSchema,
	// `loaderDeps` antes de `beforeLoad`: fora dessa ordem o TanStack Router perde a
	// inferência de tipo do `deps` que chega no loader.
	loaderDeps: ({ search }) => ({ tab: search.tab }),
	beforeLoad: (opts) => requirePermission(opts, "global", 1),
	// Cada aba tem seu próprio escopo de leitura (query key distinta): pré-carregar a
	// árvore de insumos ao abrir direto em outra aba só atrasaria o TTFB.
	loader: ({ context, deps }) => context.queryClient.ensureQueryData(treeOptionsForTab(deps.tab ?? "insumos")),
	component: IngredientsPage,
	head: () => ({
		meta: [
			{ title: "Gestão de Insumos - SISUB" },
			{
				name: "description",
				content: "Gerenciar hierarquia de produtos: insumos, preparações do SISUBWEB e itens auxiliares",
			},
		],
	}),
})

/** Escopo de leitura da aba. Uma função só, usada pelo loader e pela tela. */
function treeOptionsForTab(tab: IngredientsTab) {
	if (tab === "preparacoes") return ingredientsTreeQueryOptions(false, "only")
	if (tab === "auxiliares") return ingredientsTreeQueryOptions(false, "exclude", "only")
	return ingredientsTreeQueryOptions(false, "exclude", "exclude")
}

function IngredientsPage() {
	const { exportCSV } = useExportIngredientsCSV()
	// global:1 navega a tela inteira; só não vê os controles de escrita.
	const canWrite = useGlobalWrite()
	const managerRef = useRef<IngredientsTreeManagerHandle>(null)
	const auxManagerRef = useRef<IngredientsTreeManagerHandle>(null)
	const [metricsOpen, setMetricsOpen] = useState(false)
	const { tab = "insumos" } = Route.useSearch()
	// Só o grupo do SISUBWEB é somente-leitura; item auxiliar é cadastro vivo (é comprado
	// e estocado), então mantém as mesmas ações do catálogo — apontadas para a outra árvore.
	const activeManagerRef = tab === "auxiliares" ? auxManagerRef : managerRef
	const navigate = useNavigate({ from: Route.fullPath })

	return (
		<div className="space-y-6">
			<PageHeader title="Gestão de Insumos">
				<Button variant="outline" size="sm" onClick={() => setMetricsOpen(true)} className="gap-2">
					<Activity className="size-4" />
					<span className="hidden sm:inline">Métricas de revisão</span>
					<span className="sm:hidden">Métricas</span>
				</Button>
				{/* Exportar e criar são ações de cadastro — não do grupo legado, que é só leitura. */}
				{tab !== "preparacoes" && (
					<>
						{tab === "insumos" && (
							<Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
								<DownloadIcon className="size-4" />
								<span className="hidden sm:inline">Exportar CSV</span>
								<span className="sm:hidden">CSV</span>
							</Button>
						)}
						{canWrite && (
							<ButtonGroup>
								<Button variant="outline" size="sm" onClick={() => activeManagerRef.current?.openCreateFolder()} className="gap-2">
									<FolderPlus className="size-4" />
									Nova Pasta
								</Button>
								<Button size="sm" onClick={() => activeManagerRef.current?.openCreateIngredient()} className="gap-2">
									<PackagePlus className="size-4" />
									{tab === "auxiliares" ? "Novo Item" : "Novo Insumo"}
								</Button>
							</ButtonGroup>
						)}
					</>
				)}
			</PageHeader>

			<Tabs
				value={tab}
				onValueChange={(value) =>
					navigate({
						// "insumos" é o default da rota → sai da URL, para o link limpo continuar
						// abrindo a aba principal.
						search: (prev) => ({ ...prev, tab: value === "insumos" ? undefined : (value as Exclude<IngredientsTab, "insumos">) }),
						replace: true,
					})
				}
			>
				<TabsList>
					<TabsTrigger value="insumos">Insumos</TabsTrigger>
					<TabsTrigger value="preparacoes">Preparações (SISUBWEB)</TabsTrigger>
					<TabsTrigger value="auxiliares">Itens auxiliares</TabsTrigger>
				</TabsList>
				<TabsContent value="insumos" className="pt-4">
					<IngredientsTreeManager ref={managerRef} catalog="exclude" />
				</TabsContent>
				<TabsContent value="preparacoes" className="pt-4">
					<PreparationsTreeManager />
				</TabsContent>
				<TabsContent value="auxiliares" className="pt-4">
					<IngredientsTreeManager ref={auxManagerRef} catalog="only" />
				</TabsContent>
			</Tabs>

			<IngredientReviewMetricsSheet open={metricsOpen} onOpenChange={setMetricsOpen} />
		</div>
	)
}
