import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { OccasionMenuForm } from "@/components/features/local/planning/OccasionMenuForm"

/**
 * KITCHEN — Novo Cardápio de Apoio
 * Cria um cardápio de apoio previsível (template_type = 'apoio') vinculado à cozinha, do
 * zero ou adaptando um modelo do catálogo global.
 * - Search param `forkFrom`: ID do modelo global a ser adaptado
 * Esses templates são selecionados no Step 3 do anexo quantitativo do TR, multiplicados
 * pela recorrência mensal esperada.
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/support-menus/new")({
	validateSearch: z.object({
		forkFrom: z.string().optional(),
	}),
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 2),
	component: NewSupportMenuPage,
})

function NewSupportMenuPage() {
	const { kitchenId } = Route.useParams()
	const { forkFrom } = Route.useSearch()
	return (
		<OccasionMenuForm
			templateType="apoio"
			kitchenId={Number(kitchenId)}
			forkFrom={forkFrom}
			listLink={{ to: "/kitchen/$kitchenId/support-menus", params: { kitchenId } }}
			editorLink={(supportMenuId) => ({ to: "/kitchen/$kitchenId/support-menus/$supportMenuId", params: { kitchenId, supportMenuId } })}
		/>
	)
}
