import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { civilDateSearchParam, todayBrasilia } from "@/components/features/local/snack-requests/format"
import { SnackProductionDay } from "@/components/features/local/snack-requests/SnackProductionDay"

const productionSearchSchema = z.object({
	// Data de retirada (YYYY-MM-DD, Brasília). Ausente ou inválida = hoje.
	date: civilDateSearchParam,
})

/**
 * KITCHEN — Produção do dia dos Lanches de Bordo/Apoio.
 * URL: /kitchen/:kitchenId/snack-requests/production?date=YYYY-MM-DD
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/snack-requests/production")({
	validateSearch: productionSearchSchema,
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 1),
	component: SnackProductionPage,
})

function SnackProductionPage() {
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const { date } = Route.useSearch()
	const navigate = useNavigate({ from: Route.fullPath })
	const today = todayBrasilia()

	return (
		<SnackProductionDay
			kitchenId={Number(kitchenIdStr)}
			kitchenIdStr={kitchenIdStr as string}
			date={date ?? today}
			today={today}
			onDateChange={(next) => void navigate({ search: { date: next }, replace: true })}
		/>
	)
}
