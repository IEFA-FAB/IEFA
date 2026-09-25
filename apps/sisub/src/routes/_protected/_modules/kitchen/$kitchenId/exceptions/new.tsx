import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { OccasionMenuForm } from "@/components/features/local/planning/OccasionMenuForm"

/**
 * KITCHEN — Novo Apoio
 * Cria um cardápio de apoio previsível (template_type = 'exception') vinculado à cozinha, do
 * zero ou adaptando um apoio modelo do catálogo global.
 * - Search param `forkFrom`: ID do apoio global a ser adaptado
 * Esses templates são selecionados no Step 3 do anexo quantitativo do TR, multiplicados
 * pela recorrência mensal esperada.
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/exceptions/new")({
	validateSearch: z.object({
		forkFrom: z.string().optional(),
	}),
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 2),
	component: NewExceptionPage,
})

function NewExceptionPage() {
	const { kitchenId } = Route.useParams()
	const { forkFrom } = Route.useSearch()
	return (
		<OccasionMenuForm
			templateType="exception"
			kitchenId={Number(kitchenId)}
			forkFrom={forkFrom}
			listLink={{ to: "/kitchen/$kitchenId/exceptions", params: { kitchenId } }}
			editorLink={(exceptionId) => ({ to: "/kitchen/$kitchenId/exceptions/$exceptionId", params: { kitchenId, exceptionId } })}
		/>
	)
}
