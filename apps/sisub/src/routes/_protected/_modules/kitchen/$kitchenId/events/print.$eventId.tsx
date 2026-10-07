import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { OccasionMenuPrint } from "@/components/features/local/planning/OccasionMenuPrint"
import { useCrumbLabel } from "@/components/layout/crumb-label"
import { useTemplate } from "@/hooks/data/useTemplates"
import { occasionPrintSearchSchema } from "@/lib/occasion-print"

/**
 * KITCHEN — Impressão / PDF de Evento
 * URL: /kitchen/:kitchenId/events/print/:eventId
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/events/print/$eventId")({
	validateSearch: occasionPrintSearchSchema,
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 1),
	component: EventPrintPage,
})

function EventPrintPage() {
	const { kitchenId, eventId } = Route.useParams()
	const { date } = Route.useSearch()
	const navigate = useNavigate({ from: Route.fullPath })
	const { data: template } = useTemplate(eventId)
	useCrumbLabel(template?.name)

	return (
		<OccasionMenuPrint
			templateId={eventId}
			templateType="event"
			scope={{ kind: "kitchen", kitchenId: Number(kitchenId), kitchenIdStr: kitchenId }}
			date={date}
			onDateChange={(next) => void navigate({ search: next ? { date: next } : {}, replace: true })}
			editorLink={{ to: "/kitchen/$kitchenId/events/$eventId", params: { kitchenId, eventId } }}
			listLink={{ to: "/kitchen/$kitchenId/events", params: { kitchenId } }}
		/>
	)
}
