import { createFileRoute, useParams } from "@tanstack/react-router"
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
 * KITCHEN — Impressão / PDF de Cardápio Semanal
 * URL: /kitchen/:kitchenId/weekly-menus/print/:weeklyMenuId
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/weekly-menus/print/$weeklyMenuId")({
	validateSearch: printSearchSchema,
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 1),
	component: WeeklyMenuPrintPage,
	head: () => ({
		meta: [{ title: "Imprimir Cardápio Semanal - SISUB" }],
	}),
})

function WeeklyMenuPrintPage() {
	const { kitchenId: kitchenIdStr, weeklyMenuId } = useParams({ strict: false })
	const { week } = Route.useSearch()
	const kitchenId = Number(kitchenIdStr)

	return <WeeklyMenuPrint templateId={weeklyMenuId as string} kitchenId={kitchenId} kitchenIdStr={kitchenIdStr as string} initialWeek={week} />
}
