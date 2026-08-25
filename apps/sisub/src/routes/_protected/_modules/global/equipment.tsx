import { createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { EquipmentCatalogManager } from "@/components/features/global/EquipmentCatalogManager"
import { PageHeader } from "@/components/layout/PageHeader"

export const Route = createFileRoute("/_protected/_modules/global/equipment")({
	beforeLoad: (opts) => requirePermission(opts, "global", 2),
	component: EquipmentCatalogPage,
	head: () => ({
		meta: [{ title: "Equipamentos — SISUB" }, { name: "description", content: "Catálogo global de tipos e modelos de equipamento de cozinha." }],
	}),
})

function EquipmentCatalogPage() {
	return (
		<div className="space-y-6">
			<PageHeader
				title="Equipamentos"
				description="Tipos e modelos que as cozinhas usam para cadastrar o parque e que as preparações usam para declarar o que exigem."
			/>
			<EquipmentCatalogManager />
		</div>
	)
}
