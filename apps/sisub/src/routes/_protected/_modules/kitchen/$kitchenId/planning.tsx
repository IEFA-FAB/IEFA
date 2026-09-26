import { createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { PlanningBoard } from "@/components/features/local/planning/PlanningBoard"
import { PageHeader } from "@/components/layout/PageHeader"

export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/planning")({
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 1),
	component: PlanningPage,
})

function PlanningPage() {
	return (
		<div className="space-y-6">
			<PageHeader
				title="Agendamento da Produção"
				description="O que a cozinha produz em cada dia: cardápios semanais, eventos e apoios aplicados ao calendário — e os ajustes do dia a dia."
			/>

			<PlanningBoard />
		</div>
	)
}
