import { createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { RecipeForm } from "@/components/features/shared/RecipeForm"

/**
 * GLOBAL-02 — Criar Preparação Global (Padrão FAB)
 * URL: /global/recipes/new
 * Acesso: módulo "global" nível 2 (escrita)
 */
export const Route = createFileRoute("/_protected/_modules/global/recipes/new")({
	beforeLoad: ({ context }) => requirePermission(context, "global", 2),
	component: GlobalRecipeNewPage,
	head: () => ({
		meta: [{ title: "Nova Preparação Global - SISUB" }],
	}),
})

function GlobalRecipeNewPage() {
	return <RecipeForm mode="create" />
}
