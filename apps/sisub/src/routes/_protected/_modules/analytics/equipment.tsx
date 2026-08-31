import { createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { FleetEquipmentReport } from "@/components/features/analytics/FleetEquipmentReport"
import { PageHeader } from "@/components/layout/PageHeader"

export const Route = createFileRoute("/_protected/_modules/analytics/equipment")({
	beforeLoad: (opts) => requirePermission(opts, "analytics", 2),
	component: FleetEquipmentPage,
	head: () => ({
		meta: [
			{ title: "Equipamentos da Frota — SISUB" },
			{ name: "description", content: "Cobertura de equipamento por função, panes abertas e distribuição do parque na FAB." },
		],
	}),
})

function FleetEquipmentPage() {
	return (
		<div className="space-y-6">
			<PageHeader
				title="Equipamentos da frota"
				description="Cobertura por função em todas as cozinhas. Somente leitura — a correção do dado é de cada cozinha."
			/>
			<FleetEquipmentReport />
		</div>
	)
}
