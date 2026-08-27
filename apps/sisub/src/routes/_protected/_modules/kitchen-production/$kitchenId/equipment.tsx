import { createFileRoute, useParams } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { ProductionEquipmentBoard } from "@/components/features/kitchen-production/ProductionEquipmentBoard"
import { PageHeader } from "@/components/layout/PageHeader"

export const Route = createFileRoute("/_protected/_modules/kitchen-production/$kitchenId/equipment")({
	beforeLoad: (opts) => requirePermission(opts, "kitchen-production", 1),
	component: ProductionEquipmentPage,
	head: () => ({
		meta: [{ title: "Equipamentos — Produção" }],
	}),
})

function ProductionEquipmentPage() {
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const kitchenId = Number(kitchenIdStr)

	return (
		<div className="space-y-6">
			<PageHeader
				title="Equipamentos"
				description="Como está cada equipamento agora. Relatar pane aqui tira o equipamento do planejamento das preparações na mesma hora."
			/>
			<ProductionEquipmentBoard kitchenId={kitchenId} />
		</div>
	)
}
