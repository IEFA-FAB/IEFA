import { createFileRoute } from "@tanstack/react-router"
import { RecipeTechnicalSheetPrint } from "@/components/features/shared/RecipeTechnicalSheetPrint"

/**
 * COZINHA — Impressão / PDF da Ficha Técnica de Preparação (FTP)
 * URL: /kitchen/:kitchenId/recipes/:recipeId/print
 *
 * O guard de módulo/cozinha já é aplicado no layout de `/kitchen/$kitchenId`; aqui a
 * folha é a mesma da rota global, só com o caminho de volta apontando para a cozinha.
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/recipes/$recipeId/print")({
	component: KitchenRecipePrintPage,
	head: () => ({
		meta: [{ title: "Ficha Técnica de Preparação - SISUB" }],
	}),
})

function KitchenRecipePrintPage() {
	const { kitchenId, recipeId } = Route.useParams()
	return <RecipeTechnicalSheetPrint recipeId={recipeId} back={{ to: "/kitchen/$kitchenId/recipes/$recipeId", params: { kitchenId, recipeId } }} />
}
