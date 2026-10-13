import { STOCK_LEVEL_LABELS } from "@iefa/sisprov-domain/inventory"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { PageHeader } from "@/components/layout/PageHeader"
import { HandlingUnitsPanel } from "@/components/stock/HandlingUnitsPanel"
import { LocationSettingsForm } from "@/components/stock/LocationSettingsForm"
import { LotsPanel } from "@/components/stock/LotsPanel"
import { PickingPanel } from "@/components/stock/PickingPanel"
import { PositionsPanel } from "@/components/stock/PositionsPanel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fetchStockLocationFn } from "@/server/stock.fn"

export const Route = createFileRoute("/_protected/stock/$locationId")({
	component: StockLocationPage,
})

/**
 * Um local de estoque: endereços, lotes (guardados e pendentes), pallets e caixas, separação e
 * configuração. Local sem endereçamento (a cozinha) mostra só os lotes e a configuração.
 */
function StockLocationPage() {
	const { locationId } = Route.useParams()
	const id = Number(locationId)
	const location = useQuery({ queryKey: ["sisprov", "stockLocation", id], queryFn: () => fetchStockLocationFn({ data: { locationId: id } }) })

	if (location.isPending) return <Skeleton className="h-48 w-full" />
	if (location.isError) {
		return (
			<Alert variant="destructive">
				<AlertTitle>Não foi possível abrir o local</AlertTitle>
				<AlertDescription>{location.error instanceof Error ? location.error.message : "Tente de novo."}</AlertDescription>
			</Alert>
		)
	}
	const data = location.data
	const description = [
		STOCK_LEVEL_LABELS[data.level],
		data.unitCode,
		data.suppliedByName ? `abastecido por ${data.suppliedByName}` : null,
		data.receivesDirect ? "recebe direto do fornecedor" : null,
		data.gln ? `GLN ${data.gln}` : null,
	]
		.filter(Boolean)
		.join(" · ")

	return (
		<div className="space-y-6">
			<PageHeader title={data.name} description={description} />
			<Tabs defaultValue={data.usesPositions ? "positions" : "lots"}>
				<TabsList>
					{data.usesPositions && <TabsTrigger value="positions">Endereços</TabsTrigger>}
					<TabsTrigger value="lots">Lotes</TabsTrigger>
					{data.usesPositions && <TabsTrigger value="units">Pallets e caixas</TabsTrigger>}
					{data.usesPositions && <TabsTrigger value="picking">Separação</TabsTrigger>}
					{data.canManage && <TabsTrigger value="settings">Configuração</TabsTrigger>}
				</TabsList>
				{data.usesPositions && (
					<TabsContent value="positions" className="pt-4">
						<PositionsPanel locationId={id} canManage={data.canManage} />
					</TabsContent>
				)}
				<TabsContent value="lots" className="pt-4">
					<LotsPanel locationId={id} canOperate={data.canOperate && data.usesPositions} />
				</TabsContent>
				{data.usesPositions && (
					<TabsContent value="units" className="pt-4">
						<HandlingUnitsPanel locationId={id} canOperate={data.canOperate} />
					</TabsContent>
				)}
				{data.usesPositions && (
					<TabsContent value="picking" className="pt-4">
						<PickingPanel locationId={id} canOperate={data.canOperate} />
					</TabsContent>
				)}
				{data.canManage && (
					<TabsContent value="settings" className="pt-4">
						<LocationSettingsForm key={data.updatedAt} location={data} />
					</TabsContent>
				)}
			</Tabs>
		</div>
	)
}
