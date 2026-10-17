import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { PlanningBoard } from "@/components/features/local/planning/PlanningBoard"
import { PageHeader } from "@/components/layout/PageHeader"

export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/planning/")({
	// O mês vai na URL: voltar da página do dia cai no mês daquele dia, não no mês corrente.
	validateSearch: z.object({
		month: z
			.string()
			.regex(/^\d{4}-\d{2}$/)
			.optional(),
	}),
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 1),
	component: PlanningPage,
})

function PlanningPage() {
	const { month } = Route.useSearch()
	const navigate = useNavigate({ from: Route.fullPath })
	return (
		<div className="space-y-6">
			<PageHeader
				title="Agendamento da Produção"
				description="O que a cozinha produz em cada dia: cardápios semanais, eventos e cardápios de apoio aplicados ao calendário — e os ajustes do dia a dia."
			/>

			<PlanningBoard month={month} onMonthChange={(next) => navigate({ search: { month: next }, replace: true })} />
		</div>
	)
}
