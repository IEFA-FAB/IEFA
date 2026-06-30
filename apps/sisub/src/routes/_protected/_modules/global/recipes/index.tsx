import { createFileRoute, Link } from "@tanstack/react-router"
import { Activity, Plus } from "lucide-react"
import { useState } from "react"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { ReviewMetricsSheet } from "@/components/features/global/ReviewMetricsSheet"
import { RecipesManager } from "@/components/features/shared/RecipesManager"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
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
			</PageHeader>
			<RecipesManager />
			<ReviewMetricsSheet open={metricsOpen} onOpenChange={setMetricsOpen} />
		</div>
	)
}
