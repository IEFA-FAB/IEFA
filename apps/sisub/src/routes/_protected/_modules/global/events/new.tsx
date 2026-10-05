import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { OccasionMenuForm } from "@/components/features/local/planning/OccasionMenuForm"

/**
 * GLOBAL — Novo Evento Modelo
 * URL: /global/events/new
 * Acesso: módulo "global" nível 2 (escrita)
 * - Search param `folderId`: pasta do catálogo onde o modelo nasce ("Novo modelo aqui")
 */
export const Route = createFileRoute("/_protected/_modules/global/events/new")({
	validateSearch: z.object({
		folderId: z.string().optional(),
	}),
	beforeLoad: (opts) => requirePermission(opts, "global", 2),
	component: NewGlobalEventPage,
})

function NewGlobalEventPage() {
	const { folderId } = Route.useSearch()
	return (
		<OccasionMenuForm
			folderId={folderId}
			templateType="event"
			kitchenId={null}
			listLink={{ to: "/global/events" }}
			editorLink={(eventId) => ({ to: "/global/events/$eventId", params: { eventId } })}
		/>
	)
}
