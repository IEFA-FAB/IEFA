import { createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/common/layout/PageHeader"
import { PlanningBoard } from "@/components/features/local/planning/PlanningBoard"

export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/planning")({
	beforeLoad: ({ context }) => requirePermission(context, "kitchen", 1),
	component: PlanningPage,
	head: () => ({
		meta: [{ title: "Planejamento - SISUB" }],
	}),
})

function PlanningPage() {
	return (
		<div className="space-y-6">
			<PageHeader
				title="Planejamento"
				description="Aplique cardápios semanais ao calendário mensal da unidade."
			/>

			<PlanningBoard />
		</div>
	)
}
