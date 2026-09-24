import { createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { OccasionMenuEditor } from "@/components/features/local/planning/OccasionMenuEditor"
import { useCrumbLabel } from "@/components/layout/crumb-label"
import { useTemplate } from "@/hooks/data/useTemplates"

/**
 * GLOBAL — Editor de Evento Modelo (SDAB)
 * URL: /global/events/:eventId
 * Acesso: módulo "global" nível 2 (escrita). A edição é do modelo GLOBAL, in-place.
 */
export const Route = createFileRoute("/_protected/_modules/global/events/$eventId")({
	beforeLoad: (opts) => requirePermission(opts, "global", 2),
	component: GlobalEventEditorPage,
})

const GLOBAL_CONTEXT = { scope: "global" } as const

function GlobalEventEditorPage() {
	const { eventId } = Route.useParams()
	const { data: template } = useTemplate(eventId)
	useCrumbLabel(template?.name)
	return (
		<OccasionMenuEditor
			templateId={eventId}
			templateType="event"
			editContext={GLOBAL_CONTEXT}
			listLink={{ to: "/global/events" }}
			editorLink={(id) => ({ to: "/global/events/$eventId", params: { eventId: id } })}
		/>
	)
}
