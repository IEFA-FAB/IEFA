import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { ComposeEventForm } from "@/components/features/local/planning/ComposeEventForm"
import { OccasionMenuForm } from "@/components/features/local/planning/OccasionMenuForm"

/**
 * KITCHEN — Novo Evento
 * Cria um cardápio de evento especial (template_type = 'event') vinculado à cozinha atual, do
 * zero ou adaptando um evento modelo do catálogo global.
 * - Search param `forkFrom`: ID do evento global a ser adaptado
 * - Search param `compose`: IDs (vírgula) dos modelos que montam o evento, um por refeição
 * Esses templates são selecionados no Step 2 do anexo quantitativo do TR.
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/events/new")({
	validateSearch: z.object({
		forkFrom: z.string().optional(),
		compose: z.string().optional(),
	}),
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 2),
	component: NewEventPage,
})

function NewEventPage() {
	const { kitchenId } = Route.useParams()
	const { forkFrom, compose } = Route.useSearch()
	const composeIds = compose?.split(",").filter(Boolean) ?? []
	if (composeIds.length > 0) {
		return (
			<ComposeEventForm
				kitchenId={Number(kitchenId)}
				templateIds={composeIds}
				listLink={{ to: "/kitchen/$kitchenId/events", params: { kitchenId } }}
				editorLink={(eventId) => ({ to: "/kitchen/$kitchenId/events/$eventId", params: { kitchenId, eventId } })}
			/>
		)
	}
	return (
		<OccasionMenuForm
			templateType="event"
			kitchenId={Number(kitchenId)}
			forkFrom={forkFrom}
			listLink={{ to: "/kitchen/$kitchenId/events", params: { kitchenId } }}
			editorLink={(eventId) => ({ to: "/kitchen/$kitchenId/events/$eventId", params: { kitchenId, eventId } })}
		/>
	)
}
