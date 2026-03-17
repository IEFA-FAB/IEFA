import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/common/layout/PageHeader"
import { RecipesManager } from "@/components/features/shared/RecipesManager"
import { Button } from "@/components/ui/button"

const searchSchema = z.object({
	search: z.string().optional(),
	type: z.enum(["all", "global", "local"]).optional(),
})

/**
 * GLOBAL-02 — Catálogo de Preparações Globais (Padrão FAB)
 * URL: /global/recipes
 * Acesso: módulo "global" nível 1+
 */
export const Route = createFileRoute("/_protected/_modules/global/recipes/")({
	beforeLoad: ({ context }) => requirePermission(context, "global", 1),
	validateSearch: searchSchema,
	component: GlobalRecipesPage,
	head: () => ({
		meta: [{ title: "Preparações Globais - SISUB" }, { name: "description", content: "Catálogo de preparações padrão FAB" }],
	}),
})

function GlobalRecipesPage() {
	return (
		<div className="space-y-6">
			<PageHeader title="Preparações Globais">
				<Button
					size="sm"
					nativeButton={false}
					render={
						<Link to="/global/recipes/new">
							<Plus className="h-4 w-4 mr-2" />
							Nova Preparação
						</Link>
					}
				/>
			</PageHeader>
			<RecipesManager />
		</div>
	)
}
