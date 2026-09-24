import { createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { RecipeTechnicalSheetPrint } from "@/components/features/shared/RecipeTechnicalSheetPrint"
import { useCrumbLabel } from "@/components/layout/crumb-label"
import { useRecipe } from "@/hooks/data/useRecipe"

/**
 * GLOBAL — Impressão / PDF da Ficha Técnica de Preparação (FTP)
 * URL: /global/recipes/:recipeId/print
 *
 * Leitura (`global:1`), não edição: imprimir a ficha do catálogo é o que o nutricionista
 * que só consulta precisa fazer, e a rota de edição ao lado já exige `global:2`.
 */
export const Route = createFileRoute("/_protected/_modules/global/recipes/$recipeId/print")({
	beforeLoad: (opts) => requirePermission(opts, "global", 1),
	component: GlobalRecipePrintPage,
})

function GlobalRecipePrintPage() {
	const { recipeId } = Route.useParams()
	const { data: recipe } = useRecipe(recipeId)
	useCrumbLabel(recipe?.name)
	return <RecipeTechnicalSheetPrint recipeId={recipeId} back={{ to: "/global/recipes/$recipeId", params: { recipeId } }} />
}
