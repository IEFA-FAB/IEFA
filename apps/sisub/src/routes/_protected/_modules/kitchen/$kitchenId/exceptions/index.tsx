import { createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { KitchenOccasionMenuList } from "@/components/features/local/planning/KitchenOccasionMenuList"

/**
 * KITCHEN — Exceções
 * Lista os cardápios de exceções previsíveis da cozinha (lanches de bordo, cafés de reunião) e
 * as exceções modelo do catálogo global, disponíveis para adaptar.
 * Esses templates (template_type='exception') alimentam o Step 3 do anexo quantitativo do TR,
 * multiplicados pela recorrência mensal esperada.
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/exceptions/")({
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 1),
	component: ExceptionsPage,
	head: () => ({
		meta: [{ name: "description", content: "Gerencie os cardápios de apoio previsíveis (lanches de bordo e de apoio, coffee breaks, cafés de reunião)" }],
	}),
})

function ExceptionsPage() {
	const { kitchenId } = Route.useParams()
	return (
		<KitchenOccasionMenuList
			templateType="exception"
			kitchenId={Number(kitchenId)}
			description="Refeições previsíveis fora da rotina semanal — lanches de bordo e de apoio, coffee breaks, cafés de reunião. Compõem o anexo quantitativo do TR pela recorrência mensal."
			newLink={{ to: "/kitchen/$kitchenId/exceptions/new", params: { kitchenId } }}
			forkLink={(forkFrom) => ({ to: "/kitchen/$kitchenId/exceptions/new", params: { kitchenId }, search: { forkFrom } })}
			editorLink={(exceptionId) => ({ to: "/kitchen/$kitchenId/exceptions/$exceptionId", params: { kitchenId, exceptionId } })}
		/>
	)
}
