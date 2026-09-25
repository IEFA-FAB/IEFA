import type { EditScope } from "@iefa/sisub-domain"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo } from "react"
import { requirePermission } from "@/auth/pbac"
import { OccasionMenuEditor } from "@/components/features/local/planning/OccasionMenuEditor"
import { useCrumbLabel } from "@/components/layout/crumb-label"
import { useTemplate } from "@/hooks/data/useTemplates"

/**
 * KITCHEN — Editor de Evento
 * URL: /kitchen/:kitchenId/events/:eventId
 *
 * Eventos são cardápios de ocasião única (jantar de formatura, rancho de manobra…). Um evento
 * modelo do catálogo global aberto aqui vira cópia local desta cozinha ao salvar.
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/events/$eventId")({
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 2),
	component: EventEditorPage,
})

function EventEditorPage() {
	const { kitchenId, eventId } = Route.useParams()
	const { data: template } = useTemplate(eventId)
	useCrumbLabel(template?.name)
	// Contexto da edição = a rota. Referência estável: entra nas dependências do auto-save.
	const editContext = useMemo<EditScope>(() => ({ scope: "kitchen", kitchenId: Number(kitchenId) }), [kitchenId])
	return (
		// `key`: salvar um evento global na cozinha cria a cópia e troca a rota para ela. O
		// rascunho aberto ainda cita as refeições do MOLDE pelo id; remontar recarrega a cópia,
		// com as refeições dela — sem isto o salvamento seguinte citaria ids de outro evento.
		<OccasionMenuEditor
			key={eventId}
			templateId={eventId}
			templateType="event"
			editContext={editContext}
			listLink={{ to: "/kitchen/$kitchenId/events", params: { kitchenId } }}
			editorLink={(id) => ({ to: "/kitchen/$kitchenId/events/$eventId", params: { kitchenId, eventId: id } })}
		/>
	)
}
