import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { OccasionMenuPrint } from "@/components/features/local/planning/OccasionMenuPrint"
import { useCrumbLabel } from "@/components/layout/crumb-label"
import { useTemplate } from "@/hooks/data/useTemplates"
import { occasionPrintSearchSchema } from "@/lib/occasion-print"

/**
 * GLOBAL — Impressão / PDF de Evento Modelo (SDAB)
 * URL: /global/events/print/:eventId
 */
export const Route = createFileRoute("/_protected/_modules/global/events/print/$eventId")({
	validateSearch: occasionPrintSearchSchema,
	beforeLoad: (opts) => requirePermission(opts, "global", 1),
	component: GlobalEventPrintPage,
})

const GLOBAL_SCOPE = { kind: "global" } as const

function GlobalEventPrintPage() {
	const { eventId } = Route.useParams()
	const { date } = Route.useSearch()
	const navigate = useNavigate({ from: Route.fullPath })
	const { data: template } = useTemplate(eventId)
	useCrumbLabel(template?.name)

	return (
		<OccasionMenuPrint
			templateId={eventId}
			templateType="event"
			scope={GLOBAL_SCOPE}
			date={date}
			onDateChange={(next) => void navigate({ search: next ? { date: next } : {}, replace: true })}
			editorLink={{ to: "/global/events/$eventId", params: { eventId } }}
			listLink={{ to: "/global/events" }}
		/>
	)
}
