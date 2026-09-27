import { createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { KitchenOccasionMenuList } from "@/components/features/local/planning/KitchenOccasionMenuList"

/**
 * KITCHEN — Cardápios de Apoio
 * Lista os cardápios de apoio previsíveis da cozinha (lanches de bordo e de apoio, coffee breaks,
 * cafés de reunião) e os modelos do catálogo global, disponíveis para adaptar.
 * Esses templates (template_type='apoio') alimentam o Step 3 do anexo quantitativo do TR,
 * multiplicados pela recorrência mensal esperada.
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/support-menus/")({
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 1),
	component: SupportMenusPage,
	head: () => ({
		meta: [{ name: "description", content: "Gerencie os cardápios de apoio previsíveis (lanches de bordo e de apoio, coffee breaks, cafés de reunião)" }],
	}),
})

function SupportMenusPage() {
	const { kitchenId } = Route.useParams()
	return (
		<KitchenOccasionMenuList
			templateType="apoio"
			kitchenId={Number(kitchenId)}
			description="Refeições previsíveis fora da rotina semanal — lanches de bordo e de apoio, coffee breaks, cafés de reunião. Compõem o anexo quantitativo do TR pela recorrência mensal."
			newLink={{ to: "/kitchen/$kitchenId/support-menus/new", params: { kitchenId } }}
			forkLink={(forkFrom) => ({ to: "/kitchen/$kitchenId/support-menus/new", params: { kitchenId }, search: { forkFrom } })}
			editorLink={(supportMenuId) => ({ to: "/kitchen/$kitchenId/support-menus/$supportMenuId", params: { kitchenId, supportMenuId } })}
		/>
	)
}
