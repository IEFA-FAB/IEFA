import type { EditScope } from "@iefa/sisub-domain"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo } from "react"
import { requirePermission } from "@/auth/pbac"
import { OccasionMenuEditor } from "@/components/features/local/planning/OccasionMenuEditor"
import { useCrumbLabel } from "@/components/layout/crumb-label"
import { useTemplate } from "@/hooks/data/useTemplates"

/**
 * KITCHEN — Editor de Exceção
 * URL: /kitchen/:kitchenId/exceptions/:exceptionId
 *
 * Exceções são refeições previsíveis fora da rotina semanal (lanche de bordo, café de reunião),
 * com ocorrências mensais que multiplicam o custeio na Ata. Uma exceção modelo do catálogo
 * global aberta aqui vira cópia local desta cozinha ao salvar.
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/exceptions/$exceptionId")({
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 2),
	component: ExceptionEditorPage,
})

function ExceptionEditorPage() {
	const { kitchenId, exceptionId } = Route.useParams()
	const { data: template } = useTemplate(exceptionId)
	useCrumbLabel(template?.name)
	// Contexto da edição = a rota. Referência estável: entra nas dependências do auto-save.
	const editContext = useMemo<EditScope>(() => ({ scope: "kitchen", kitchenId: Number(kitchenId) }), [kitchenId])
	return (
		<OccasionMenuEditor
			templateId={exceptionId}
			templateType="exception"
			editContext={editContext}
			listLink={{ to: "/kitchen/$kitchenId/exceptions", params: { kitchenId } }}
			editorLink={(id) => ({ to: "/kitchen/$kitchenId/exceptions/$exceptionId", params: { kitchenId, exceptionId: id } })}
		/>
	)
}
