import type { EditScope } from "@iefa/sisub-domain"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo } from "react"
import { requirePermission } from "@/auth/pbac"
import { OccasionMenuEditor } from "@/components/features/local/planning/OccasionMenuEditor"
import { useCrumbLabel } from "@/components/layout/crumb-label"
import { useTemplate } from "@/hooks/data/useTemplates"

/**
 * KITCHEN — Editor de Cardápio de Apoio
 * URL: /kitchen/:kitchenId/support-menus/:supportMenuId
 *
 * Cardápios de apoio são refeições previsíveis fora da rotina semanal (lanche de bordo, café de
 * reunião), com ocorrências mensais que multiplicam o custeio no anexo quantitativo. Um modelo do
 * catálogo global aberto aqui vira cópia local desta cozinha ao salvar.
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/support-menus/$supportMenuId")({
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 2),
	component: SupportMenuEditorPage,
})

function SupportMenuEditorPage() {
	const { kitchenId, supportMenuId } = Route.useParams()
	const { data: template } = useTemplate(supportMenuId)
	useCrumbLabel(template?.name)
	// Contexto da edição = a rota. Referência estável: entra nas dependências do auto-save.
	const editContext = useMemo<EditScope>(() => ({ scope: "kitchen", kitchenId: Number(kitchenId) }), [kitchenId])
	return (
		<OccasionMenuEditor
			templateId={supportMenuId}
			templateType="apoio"
			editContext={editContext}
			listLink={{ to: "/kitchen/$kitchenId/support-menus", params: { kitchenId } }}
			editorLink={(id) => ({ to: "/kitchen/$kitchenId/support-menus/$supportMenuId", params: { kitchenId, supportMenuId: id } })}
		/>
	)
}
