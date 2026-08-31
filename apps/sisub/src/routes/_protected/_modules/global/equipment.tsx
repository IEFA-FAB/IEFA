import { createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { EquipmentCatalogManager } from "@/components/features/global/EquipmentCatalogManager"
import { MaintenancePlansManager } from "@/components/features/global/MaintenancePlansManager"
import { PageHeader } from "@/components/layout/PageHeader"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
			<Tabs defaultValue="catalogo">
				<TabsList className="grid w-full max-w-md grid-cols-2">
					<TabsTrigger value="catalogo">Catálogo</TabsTrigger>
					<TabsTrigger value="rotinas">Rotinas</TabsTrigger>
				</TabsList>
				<TabsContent value="catalogo" className="pt-4">
					<EquipmentCatalogManager />
				</TabsContent>
				<TabsContent value="rotinas" className="pt-4">
					<MaintenancePlansManager />
				</TabsContent>
			</Tabs>
		</div>
	)
}
