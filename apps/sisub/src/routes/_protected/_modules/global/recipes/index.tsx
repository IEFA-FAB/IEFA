import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
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
	beforeLoad: ({ context }) => requirePermission(context, "global", 1),
	component: GlobalRecipesPage,
	head: () => ({
		meta: [{ title: "Preparações Globais - SISUB" }, { name: "description", content: "Catálogo de preparações padrão FAB" }],
	}),
})

function GlobalRecipesPage() {
	useRealtimeSubscription({
		table: "recipes",
		queryKeyPrefix: ["recipes"],
		message: "Preparação atualizada por outro usuário",
		filter: "kitchen_id=is.null",
	})

	return (
		<div className="space-y-6">
			<PageHeader title="Preparações Globais">
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
		</div>
	)
}
