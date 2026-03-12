import { createFileRoute, useParams } from "@tanstack/react-router"
import { useEffect } from "react"
import { requirePermission } from "@/auth/pbac"
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
		<div className="p-6">
			<div className="mb-6">
				<h1 className="text-3xl font-bold tracking-tight text-foreground">Planejamento</h1>
				<p className="text-muted-foreground">
					Aplique cardápios semanais ao calendário mensal da unidade.
				</p>
			</div>

			<PlanningBoard />
		</div>
	)
}
