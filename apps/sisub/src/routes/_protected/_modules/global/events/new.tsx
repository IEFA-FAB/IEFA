import { createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { OccasionMenuForm } from "@/components/features/local/planning/OccasionMenuForm"

/**
 * GLOBAL — Novo Evento Modelo
 * URL: /global/events/new
 * Acesso: módulo "global" nível 2 (escrita)
 */
export const Route = createFileRoute("/_protected/_modules/global/events/new")({
	beforeLoad: (opts) => requirePermission(opts, "global", 2),
	component: NewGlobalEventPage,
})

function NewGlobalEventPage() {
	return (
		<OccasionMenuForm
			templateType="event"
			kitchenId={null}
			listLink={{ to: "/global/events" }}
			editorLink={(eventId) => ({ to: "/global/events/$eventId", params: { eventId } })}
		/>
	)
}
