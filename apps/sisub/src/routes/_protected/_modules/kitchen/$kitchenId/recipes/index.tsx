import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { PageHeader } from "@/components/common/layout/PageHeader"
import { RecipesManager } from "@/components/features/shared/RecipesManager"

const recipesSearchSchema = z.object({
	search: z.string().optional(),
	type: z.enum(["all", "global", "local"]).optional(),
})

export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/recipes/")({
	component: RecipesPage,
	validateSearch: recipesSearchSchema,
	head: () => ({
		meta: [{ title: "Catálogo de Preparações - SISUB" }],
	}),
})

function RecipesPage() {
	return (
		<div className="space-y-6">
			<PageHeader title="Catálogo de Preparações" />
			<RecipesManager />
		</div>
	)
}
