import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { WeeklyMenuPrint } from "@/components/features/local/planning/WeeklyMenuPrint"
import { useCrumbLabel } from "@/components/layout/crumb-label"
import { useTemplate } from "@/hooks/data/useTemplates"

const printSearchSchema = z.object({
	// Data-início (YYYY-MM-DD) para datar as colunas da semana. Opcional.
	// Restrito ao formato ISO de data para evitar Invalid Date em parseISO.
	week: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
})

/**
 * GLOBAL — Impressão / PDF de Cardápio Semanal Modelo (SDAB)
 * URL: /global/weekly-menus/print/:weeklyMenuId
 */
export const Route = createFileRoute("/_protected/_modules/global/weekly-menus/print/$weeklyMenuId")({
	validateSearch: printSearchSchema,
	beforeLoad: (opts) => requirePermission(opts, "global", 1),
	component: GlobalWeeklyMenuPrintPage,
})

function GlobalWeeklyMenuPrintPage() {
	const { weeklyMenuId } = Route.useParams()
	const { week } = Route.useSearch()
	const { data: template } = useTemplate(weeklyMenuId)
	useCrumbLabel(template?.name)

	return <WeeklyMenuPrint templateId={weeklyMenuId} scope={{ kind: "global" }} initialWeek={week} />
}
