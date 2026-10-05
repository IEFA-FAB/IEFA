import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { OccasionMenuForm } from "@/components/features/local/planning/OccasionMenuForm"

/**
 * GLOBAL — Novo Cardápio de Apoio Modelo
 * URL: /global/support-menus/new
 * Acesso: módulo "global" nível 2 (escrita)
 * - Search param `folderId`: pasta do catálogo onde o modelo nasce ("Novo modelo aqui")
 */
export const Route = createFileRoute("/_protected/_modules/global/support-menus/new")({
	validateSearch: z.object({
		folderId: z.string().optional(),
	}),
	beforeLoad: (opts) => requirePermission(opts, "global", 2),
	component: NewGlobalSupportMenuPage,
})

function NewGlobalSupportMenuPage() {
	const { folderId } = Route.useSearch()
	return (
		<OccasionMenuForm
			folderId={folderId}
			templateType="apoio"
			kitchenId={null}
			listLink={{ to: "/global/support-menus" }}
			editorLink={(supportMenuId) => ({ to: "/global/support-menus/$supportMenuId", params: { supportMenuId } })}
		/>
	)
}
