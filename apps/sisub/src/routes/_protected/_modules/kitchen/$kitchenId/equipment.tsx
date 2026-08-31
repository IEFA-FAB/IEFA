import { createFileRoute, useParams } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { KitchenEquipmentCondition } from "@/components/features/kitchen/KitchenEquipmentCondition"
import { KitchenEquipmentManager } from "@/components/features/kitchen/KitchenEquipmentManager"
import { KitchenMaintenanceMatrix } from "@/components/features/kitchen/KitchenMaintenanceMatrix"
import { PageHeader } from "@/components/layout/PageHeader"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
				description="O parque instalado desta cozinha, como ele está e o que já venceu de rotina. É contra isto que o sistema decide se uma preparação é executável aqui."
			/>

			{/* Três perguntas, três abas: o que existe, como está, e o que está em atraso. */}
			<Tabs defaultValue="parque">
				<TabsList className="grid w-full max-w-xl grid-cols-3">
					<TabsTrigger value="parque">Parque</TabsTrigger>
					<TabsTrigger value="condicao">Condição</TabsTrigger>
					<TabsTrigger value="manutencao">Manutenção</TabsTrigger>
				</TabsList>

				<TabsContent value="parque" className="pt-4">
					<KitchenEquipmentManager kitchenId={kitchenId} />
				</TabsContent>
				<TabsContent value="condicao" className="pt-4">
					<KitchenEquipmentCondition kitchenId={kitchenId} />
				</TabsContent>
				<TabsContent value="manutencao" className="pt-4">
					<KitchenMaintenanceMatrix kitchenId={kitchenId} />
				</TabsContent>
			</Tabs>
		</div>
	)
}
