import { createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { OccasionMenuEditor } from "@/components/features/local/planning/OccasionMenuEditor"

/**
 * GLOBAL — Editor de Exceção Modelo (SDAB)
 * URL: /global/exceptions/:exceptionId
 * Acesso: módulo "global" nível 2 (escrita). A edição é do modelo GLOBAL, in-place.
 */
export const Route = createFileRoute("/_protected/_modules/global/exceptions/$exceptionId")({
	beforeLoad: (opts) => requirePermission(opts, "global", 2),
	component: GlobalExceptionEditorPage,
	head: () => ({
		meta: [{ title: "Editar Exceção Modelo - SISUB" }],
	}),
})

const GLOBAL_CONTEXT = { scope: "global" } as const

function GlobalExceptionEditorPage() {
	const { exceptionId } = Route.useParams()
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
