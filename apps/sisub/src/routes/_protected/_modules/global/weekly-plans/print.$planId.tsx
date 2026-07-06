import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { WeeklyMenuPrint } from "@/components/features/local/planning/WeeklyMenuPrint"

const printSearchSchema = z.object({
	// Data-início (YYYY-MM-DD) para datar as colunas da semana. Opcional.
	// Restrito ao formato ISO de data para evitar Invalid Date em parseISO.
	week: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
})

/**
 * GLOBAL — Impressão / PDF de Plano Semanal Modelo (SDAB)
 * URL: /global/weekly-plans/print/:planId
 */
export const Route = createFileRoute("/_protected/_modules/global/weekly-plans/print/$planId")({
	validateSearch: printSearchSchema,
	beforeLoad: (opts) => requirePermission(opts, "global", 1),
	component: GlobalPlanPrintPage,
	head: () => ({
		meta: [{ title: "Imprimir Plano Semanal - SISUB" }],
	}),
})

function GlobalPlanPrintPage() {
	const { planId } = Route.useParams()
	const { week } = Route.useSearch()

	return <WeeklyMenuPrint templateId={planId} scope={{ kind: "global" }} initialWeek={week} />
}
