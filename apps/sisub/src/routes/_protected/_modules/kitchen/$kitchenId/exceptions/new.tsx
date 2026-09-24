import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { OccasionMenuForm } from "@/components/features/local/planning/OccasionMenuForm"

/**
 * KITCHEN — Nova Exceção
 * Cria um cardápio de exceção previsível (template_type = 'exception') vinculado à cozinha, do
 * zero ou adaptando uma exceção modelo do catálogo global.
 * - Search param `forkFrom`: ID da exceção global a ser adaptada
 * Esses templates são selecionados no Step 2 da Ata de Registro de Preços, multiplicados
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
