import { createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { OccasionMenuForm } from "@/components/features/local/planning/OccasionMenuForm"

/**
 * GLOBAL — Novo Cardápio de Apoio Modelo
 * URL: /global/support-menus/new
 * Acesso: módulo "global" nível 2 (escrita)
 */
export const Route = createFileRoute("/_protected/_modules/global/support-menus/new")({
	beforeLoad: (opts) => requirePermission(opts, "global", 2),
	component: NewGlobalSupportMenuPage,
})

function NewGlobalSupportMenuPage() {
	return (
		<OccasionMenuForm
			templateType="apoio"
			kitchenId={null}
			listLink={{ to: "/global/support-menus" }}
			editorLink={(supportMenuId) => ({ to: "/global/support-menus/$supportMenuId", params: { supportMenuId } })}
		/>
	)
}
