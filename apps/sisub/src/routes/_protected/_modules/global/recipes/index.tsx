import { createFileRoute, Link } from "@tanstack/react-router"
import { Activity, FolderCog, Plus } from "lucide-react"
import { useRef, useState } from "react"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { RecipeReviewMetricsSheet } from "@/components/features/global/ReviewMetricsSheet"
import { RecipesManager, type RecipesManagerHandle } from "@/components/features/shared/RecipesManager"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { useGlobalWrite } from "@/hooks/auth/useGlobalWrite"
import { useRealtimeSubscription } from "@/hooks/realtime/useRealtime"

const searchSchema = z.object({
	search: z.string().optional(),
	type: z.enum(["all", "global", "local"]).optional(),
})

export const Route = createFileRoute("/_protected/_modules/global/recipes/")({
	validateSearch: searchSchema,
	beforeLoad: (opts) => requirePermission(opts, "global", 1),
	component: GlobalRecipesPage,
	head: () => ({
		meta: [{ title: "Preparações Globais - SISUB" }, { name: "description", content: "Catálogo de preparações padrão FAB" }],
	}),
})

function GlobalRecipesPage() {
	const [metricsOpen, setMetricsOpen] = useState(false)
	// O catálogo de pastas é escrita global — o leitor (global:1) navega a árvore sem ele.
	const canManageFolders = useGlobalWrite()
	const managerRef = useRef<RecipesManagerHandle>(null)

	useRealtimeSubscription({
		table: "recipes",
		queryKeyPrefix: ["recipes"],
		message: "Preparação atualizada por outro usuário",
		filter: "kitchen_id=is.null",
	})

	return (
		<div className="space-y-6">
			<PageHeader title="Preparações Globais">
				<Button variant="outline" size="sm" onClick={() => setMetricsOpen(true)} className="gap-2">
					<Activity className="size-4" />
					<span className="hidden sm:inline">Métricas de revisão</span>
					<span className="sm:hidden">Métricas</span>
				</Button>
				{/* Pastas e criação ficam juntas no header, como em Insumos (Nova Pasta + Novo Insumo). */}
				<ButtonGroup>
					{canManageFolders && (
						<Button variant="outline" size="sm" onClick={() => managerRef.current?.openFoldersDialog()} className="gap-2">
							<FolderCog className="size-4" />
							Pastas
						</Button>
					)}
					<Button
						size="sm"
						nativeButton={false}
						render={
							<Link to="/global/recipes/new">
								<Plus className="size-4 mr-2" />
								Nova Preparação
							</Link>
						}
					/>
				</ButtonGroup>
			</PageHeader>
			<RecipesManager ref={managerRef} />
			<RecipeReviewMetricsSheet open={metricsOpen} onOpenChange={setMetricsOpen} />
		</div>
	)
}
