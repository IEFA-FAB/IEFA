import { createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { KitchenOccasionMenuList } from "@/components/features/local/planning/KitchenOccasionMenuList"

/**
 * KITCHEN — Eventos
 * Lista os cardápios de eventos especiais da cozinha do escopo atual e os eventos modelo do
 * catálogo global, disponíveis para adaptar.
 * Esses templates (template_type='event') alimentam o Step 2 da Ata de Registro de Preços.
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/events/")({
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 1),
	component: EventsPage,
	head: () => ({
		meta: [{ name: "description", content: "Gerencie cardápios de eventos especiais da sua cozinha" }],
	}),
})

function EventsPage() {
	const { kitchenId } = Route.useParams()
	return (
		<KitchenOccasionMenuList
			templateType="event"
			kitchenId={Number(kitchenId)}
			description="Cardápios de refeições especiais que compõem o Step 2 da Ata de Registro de Preços."
			newLink={{ to: "/kitchen/$kitchenId/events/new", params: { kitchenId } }}
			forkLink={(forkFrom) => ({ to: "/kitchen/$kitchenId/events/new", params: { kitchenId }, search: { forkFrom } })}
			editorLink={(eventId) => ({ to: "/kitchen/$kitchenId/events/$eventId", params: { kitchenId, eventId } })}
		/>
	)
}
