import { createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { OccasionMenuEditor } from "@/components/features/local/planning/OccasionMenuEditor"
import { useCrumbLabel } from "@/components/layout/crumb-label"
import { useTemplate } from "@/hooks/data/useTemplates"

/**
 * GLOBAL — Editor de Cardápio de Apoio Modelo (SDAB)
 * URL: /global/support-menus/:supportMenuId
 * Acesso: módulo "global" nível 2 (escrita). A edição é do modelo GLOBAL, in-place.
 */
export const Route = createFileRoute("/_protected/_modules/global/support-menus/$supportMenuId")({
	beforeLoad: (opts) => requirePermission(opts, "global", 2),
	component: GlobalSupportMenuEditorPage,
})

const GLOBAL_CONTEXT = { scope: "global" } as const

function GlobalSupportMenuEditorPage() {
	const { supportMenuId } = Route.useParams()
	const { data: template } = useTemplate(supportMenuId)
	useCrumbLabel(template?.name)
	return (
		<OccasionMenuEditor
			templateId={supportMenuId}
			templateType="apoio"
			editContext={GLOBAL_CONTEXT}
			listLink={{ to: "/global/support-menus" }}
			editorLink={(id) => ({ to: "/global/support-menus/$supportMenuId", params: { supportMenuId: id } })}
		/>
	)
}
