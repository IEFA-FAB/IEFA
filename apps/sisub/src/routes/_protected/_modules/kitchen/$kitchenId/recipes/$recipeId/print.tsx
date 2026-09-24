import { createFileRoute } from "@tanstack/react-router"
import { RecipeTechnicalSheetPrint } from "@/components/features/shared/RecipeTechnicalSheetPrint"
import { useCrumbLabel } from "@/components/layout/crumb-label"
import { useRecipe } from "@/hooks/data/useRecipe"

/**
 * COZINHA — Impressão / PDF da Ficha Técnica de Preparação (FTP)
 * URL: /kitchen/:kitchenId/recipes/:recipeId/print
 *
 * O guard de módulo/cozinha já é aplicado no layout de `/kitchen/$kitchenId`; aqui a
 * folha é a mesma da rota global, só com o caminho de volta apontando para a cozinha.
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/recipes/$recipeId/print")({
	component: KitchenRecipePrintPage,
})

function KitchenRecipePrintPage() {
	const { kitchenId, recipeId } = Route.useParams()
	const { data: recipe } = useRecipe(recipeId)
	useCrumbLabel(recipe?.name)
	return <RecipeTechnicalSheetPrint recipeId={recipeId} back={{ to: "/kitchen/$kitchenId/recipes/$recipeId", params: { kitchenId, recipeId } }} />
}
