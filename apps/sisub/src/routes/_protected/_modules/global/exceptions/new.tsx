import { createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { OccasionMenuForm } from "@/components/features/local/planning/OccasionMenuForm"

/**
 * GLOBAL — Novo Apoio Modelo
 * URL: /global/exceptions/new
 * Acesso: módulo "global" nível 2 (escrita)
 */
export const Route = createFileRoute("/_protected/_modules/global/exceptions/new")({
	beforeLoad: (opts) => requirePermission(opts, "global", 2),
	component: NewGlobalExceptionPage,
})

function NewGlobalExceptionPage() {
	return (
		<OccasionMenuForm
			templateType="exception"
			kitchenId={null}
			listLink={{ to: "/global/exceptions" }}
			editorLink={(exceptionId) => ({ to: "/global/exceptions/$exceptionId", params: { exceptionId } })}
		/>
	)
}
