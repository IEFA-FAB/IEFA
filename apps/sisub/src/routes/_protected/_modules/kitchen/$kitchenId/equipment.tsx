import { createFileRoute, useParams } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { KitchenEquipmentManager } from "@/components/features/kitchen/KitchenEquipmentManager"
import { PageHeader } from "@/components/layout/PageHeader"

export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/equipment")({
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 1),
	component: KitchenEquipmentPage,
	head: () => ({
		meta: [{ title: "Equipamentos da Cozinha" }],
	}),
})

function KitchenEquipmentPage() {
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const kitchenId = Number(kitchenIdStr)

	return (
		<div className="space-y-6">
			<PageHeader
				title="Equipamentos"
				description="O parque instalado desta cozinha. É contra esta lista que o sistema decide se uma preparação é executável aqui."
			/>
			<KitchenEquipmentManager kitchenId={kitchenId} />
		</div>
	)
}
