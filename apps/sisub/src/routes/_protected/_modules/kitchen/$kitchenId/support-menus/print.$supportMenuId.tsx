import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { OccasionMenuPrint } from "@/components/features/local/planning/OccasionMenuPrint"
import { useCrumbLabel } from "@/components/layout/crumb-label"
import { useTemplate } from "@/hooks/data/useTemplates"
import { occasionPrintSearchSchema } from "@/lib/occasion-print"

/**
 * KITCHEN — Impressão / PDF de Cardápio de Apoio
 * URL: /kitchen/:kitchenId/support-menus/print/:supportMenuId
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/support-menus/print/$supportMenuId")({
	validateSearch: occasionPrintSearchSchema,
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 1),
	component: SupportMenuPrintPage,
})

function SupportMenuPrintPage() {
	const { kitchenId, supportMenuId } = Route.useParams()
	const { date } = Route.useSearch()
	const navigate = useNavigate({ from: Route.fullPath })
	const { data: template } = useTemplate(supportMenuId)
	useCrumbLabel(template?.name)

	return (
		<OccasionMenuPrint
			templateId={supportMenuId}
			templateType="apoio"
			scope={{ kind: "kitchen", kitchenId: Number(kitchenId), kitchenIdStr: kitchenId }}
			date={date}
			onDateChange={(next) => void navigate({ search: next ? { date: next } : {}, replace: true })}
			editorLink={{ to: "/kitchen/$kitchenId/support-menus/$supportMenuId", params: { kitchenId, supportMenuId } }}
			listLink={{ to: "/kitchen/$kitchenId/support-menus", params: { kitchenId } }}
		/>
	)
}
