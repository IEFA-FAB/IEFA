import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { requirePermission, usePBAC } from "@/auth/pbac"
import { OccasionMenuPrint } from "@/components/features/local/planning/OccasionMenuPrint"
import { useCrumbLabel } from "@/components/layout/crumb-label"
import { useTemplate } from "@/hooks/data/useTemplates"
import { occasionPrintSearchSchema } from "@/lib/occasion-print"

/**
 * GLOBAL — Impressão / PDF de Cardápio de Apoio Modelo (SDAB)
 * URL: /global/support-menus/print/:supportMenuId
 */
export const Route = createFileRoute("/_protected/_modules/global/support-menus/print/$supportMenuId")({
	validateSearch: occasionPrintSearchSchema,
	beforeLoad: (opts) => requirePermission(opts, "global", 1),
	component: GlobalSupportMenuPrintPage,
})

const GLOBAL_SCOPE = { kind: "global" } as const

function GlobalSupportMenuPrintPage() {
	const { supportMenuId } = Route.useParams()
	const { date } = Route.useSearch()
	const navigate = useNavigate({ from: Route.fullPath })
	const { data: template } = useTemplate(supportMenuId)
	useCrumbLabel(template?.name)
	const { can } = usePBAC()

	return (
		<OccasionMenuPrint
			templateId={supportMenuId}
			templateType="apoio"
			scope={GLOBAL_SCOPE}
			date={date}
			onDateChange={(next) => void navigate({ search: next ? { date: next } : {}, replace: true })}
			editorLink={{ to: "/global/support-menus/$supportMenuId", params: { supportMenuId } }}
			listLink={{ to: "/global/support-menus" }}
			canEdit={can("global", 2)}
		/>
	)
}
