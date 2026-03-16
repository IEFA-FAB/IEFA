import { createFileRoute, useParams } from "@tanstack/react-router"
import { useEffect } from "react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/common/layout/PageHeader"
import { PlanningBoard } from "@/components/features/local/planning/PlanningBoard"
import { useKitchenPreference } from "@/hooks/data/useKitchens"

export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/planning")({
	beforeLoad: ({ context }) => requirePermission(context, "kitchen", 1),
	component: PlanningPage,
	head: () => ({
		meta: [{ title: "Planejamento - SISUB" }],
	}),
})

function PlanningPage() {
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const kitchenId = Number(kitchenIdStr)
	const { setKitchenId } = useKitchenPreference()

	// Sync URL-based scope to the preference store used by PlanningBoard internally
	useEffect(() => {
		if (kitchenId) setKitchenId(kitchenId)
	}, [kitchenId, setKitchenId])

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
