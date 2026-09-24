import { createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { OccasionMenuEditor } from "@/components/features/local/planning/OccasionMenuEditor"
import { useCrumbLabel } from "@/components/layout/crumb-label"
import { useTemplate } from "@/hooks/data/useTemplates"

/**
 * GLOBAL — Editor de Exceção Modelo (SDAB)
 * URL: /global/exceptions/:exceptionId
 * Acesso: módulo "global" nível 2 (escrita). A edição é do modelo GLOBAL, in-place.
 */
export const Route = createFileRoute("/_protected/_modules/global/exceptions/$exceptionId")({
	beforeLoad: (opts) => requirePermission(opts, "global", 2),
	component: GlobalExceptionEditorPage,
})

const GLOBAL_CONTEXT = { scope: "global" } as const

function GlobalExceptionEditorPage() {
	const { exceptionId } = Route.useParams()
	const { data: template } = useTemplate(exceptionId)
	useCrumbLabel(template?.name)
	return (
		<OccasionMenuEditor
			templateId={exceptionId}
			templateType="exception"
			editContext={GLOBAL_CONTEXT}
			listLink={{ to: "/global/exceptions" }}
			editorLink={(id) => ({ to: "/global/exceptions/$exceptionId", params: { exceptionId: id } })}
		/>
	)
}
