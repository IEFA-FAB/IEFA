import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Warehouse } from "lucide-react"
import { PageHeader } from "@/components/layout/PageHeader"
import { ModuleFoundation } from "@/components/ModuleFoundation"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { listMyStockLocationsFn, type StockLocationTier } from "@/server/stock.fn"

export const Route = createFileRoute("/_protected/stock/")({
	component: StockPage,
})

const TIER_LABEL: Record<StockLocationTier, string> = {
	central_depot: "Depósito central",
	unit_storeroom: "Almoxarifado da OM",
	kitchen: "Cozinha",
}

const CLASS_LABEL: Record<string, string> = {
	alimentacao: "Alimentação",
	auxiliar: "Auxiliar",
	permanente: "Permanente",
	fardamento: "Fardamento",
}

function StockPage() {
	const locations = useQuery({ queryKey: ["sisprov", "stockLocations"], queryFn: () => listMyStockLocationsFn(), staleTime: 60_000 })

	return (
		<div className="space-y-6">
			<PageHeader
				title="Estoque"
				description="Um estoque só, de toda classe. Aqui estão os locais que o seu acesso alcança; a cozinha continua operando a alimentação no SISUB."
			/>

			{locations.isPending ? (
				<div className="space-y-2">
					<Skeleton className="h-14 w-full" />
					<Skeleton className="h-14 w-full" />
				</div>
			) : locations.isError ? (
				<Alert variant="destructive">
					<AlertTitle>Não foi possível ler os locais de estoque</AlertTitle>
					<AlertDescription>A lista não foi carregada; isso não quer dizer que você não tenha locais. Tente de novo em instantes.</AlertDescription>
				</Alert>
			) : locations.data.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Warehouse />
						</EmptyMedia>
						<EmptyTitle>Nenhum local de estoque no seu acesso</EmptyTitle>
						<EmptyDescription>O acesso ao Estoque existe, mas não alcança nenhum local cadastrado.</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<ItemGroup>
					{locations.data.map((location) => (
						<Item key={location.id} variant="outline">
							<ItemMedia variant="icon">
								<Warehouse />
							</ItemMedia>
							<ItemContent>
								<ItemTitle>{location.name}</ItemTitle>
								<ItemDescription>
									{TIER_LABEL[location.tier]} · {location.unitCode}
								</ItemDescription>
							</ItemContent>
							<div className="flex flex-wrap gap-1">
								{location.supplyClasses.map((supplyClass) => (
									<Badge key={supplyClass} variant="secondary">
										{CLASS_LABEL[supplyClass] ?? supplyClass}
									</Badge>
								))}
							</div>
						</Item>
					))}
				</ItemGroup>
			)}

			<ModuleFoundation
				title="Operação do fardamento em construção"
				description="O estoque já é multiclasse. As telas que operam o fardamento chegam com o catálogo e a distribuição."
				upcoming={[
					{
						title: "Catálogo de fardamento",
						description: "Famílias, variantes por gênero, grade de tamanhos e itens sobre core.item, e os almoxarifados das OMs.",
						change: "sisprov-catalog",
					},
					{
						title: "Ordem de fornecimento e recebimento",
						description: "Necessidade líquida da OM, OF ao depósito e entrada no estoque do almoxarifado.",
						change: "sisprov-engine",
					},
					{
						title: "Distribuição ao militar",
						description: "Saída do estoque por SARAM, troca, devolução e avulsa com justificativa.",
						change: "sisprov-distribution",
					},
				]}
			/>
		</div>
	)
}
