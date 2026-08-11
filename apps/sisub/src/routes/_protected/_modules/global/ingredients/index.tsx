import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Activity, DownloadIcon, FolderPlus, PackagePlus } from "lucide-react"
import { useRef, useState } from "react"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { IngredientsTreeManager, type IngredientsTreeManagerHandle } from "@/components/features/global/IngredientsTreeManager"
import { PreparationsCatalogTable } from "@/components/features/global/PreparationsCatalogTable"
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
 * Duas abas sobre a mesma tabela `kitchen.ingredient`, separadas por escopo:
 * "Insumos" (o catálogo de verdade) e "Preparações" (o grupo herdado do SISUBWEB,
 * que não é insumo — ver `preparation-folders.ts` no domínio).
 */
const searchSchema = z.object({
	search: z.string().optional(),
	tab: z.enum(["insumos", "preparacoes"]).optional(),
})

export const Route = createFileRoute("/_protected/_modules/global/ingredients/")({
	validateSearch: searchSchema,
	beforeLoad: (opts) => requirePermission(opts, "global", 1),
	loaderDeps: ({ search }) => ({ tab: search.tab }),
	// Cada aba tem seu próprio escopo de leitura (query key distinta): pré-carregar a
	// árvore de insumos ao abrir direto em "Preparações" só atrasaria o TTFB.
	loader: ({ context, deps }) =>
		deps.tab === "preparacoes"
			? context.queryClient.ensureQueryData(ingredientsTreeQueryOptions(false, "only"))
			: context.queryClient.ensureQueryData(ingredientsTreeQueryOptions()),
	component: IngredientsPage,
	head: () => ({
		meta: [
			{ title: "Gestão de Insumos - SISUB" },
			{
				name: "description",
				content: "Gerenciar hierarquia de produtos: pastas, produtos e itens de compra",
			},
		],
	}),
})

function IngredientsPage() {
	const { exportCSV } = useExportIngredientsCSV()
	// global:1 navega a tela inteira; só não vê os controles de escrita.
	const canWrite = useGlobalWrite()
	const managerRef = useRef<IngredientsTreeManagerHandle>(null)
	const [metricsOpen, setMetricsOpen] = useState(false)
	const { tab = "insumos" } = Route.useSearch()
	const navigate = useNavigate({ from: Route.fullPath })

	return (
		<div className="space-y-6">
			<PageHeader title="Gestão de Insumos">
				<Button variant="outline" size="sm" onClick={() => setMetricsOpen(true)} className="gap-2">
					<Activity className="size-4" />
					<span className="hidden sm:inline">Métricas de revisão</span>
					<span className="sm:hidden">Métricas</span>
				</Button>
				{/* Exportar e criar são ações do catálogo de insumos — não do grupo legado, que é só leitura. */}
				{tab === "insumos" && (
					<>
						<Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
							<DownloadIcon className="size-4" />
							<span className="hidden sm:inline">Exportar CSV</span>
							<span className="sm:hidden">CSV</span>
						</Button>
						{canWrite && (
							<ButtonGroup>
								<Button variant="outline" size="sm" onClick={() => managerRef.current?.openCreateFolder()} className="gap-2">
									<FolderPlus className="size-4" />
									Nova Pasta
								</Button>
								<Button size="sm" onClick={() => managerRef.current?.openCreateIngredient()} className="gap-2">
									<PackagePlus className="size-4" />
									Novo Insumo
								</Button>
							</ButtonGroup>
						)}
					</>
				)}
			</PageHeader>

			<Tabs
				value={tab}
				onValueChange={(value) => navigate({ search: (prev) => ({ ...prev, tab: value === "insumos" ? undefined : "preparacoes" }), replace: true })}
			>
				<TabsList>
					<TabsTrigger value="insumos">Insumos</TabsTrigger>
					<TabsTrigger value="preparacoes">Preparações (SISUBWEB)</TabsTrigger>
				</TabsList>
				<TabsContent value="insumos" className="pt-4">
					<IngredientsTreeManager ref={managerRef} />
				</TabsContent>
				<TabsContent value="preparacoes" className="pt-4">
					<PreparationsCatalogTable />
				</TabsContent>
			</Tabs>

			<IngredientReviewMetricsSheet open={metricsOpen} onOpenChange={setMetricsOpen} />
		</div>
	)
}
