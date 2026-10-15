import { STOCK_LEVEL_LABELS } from "@iefa/sisprov-domain/inventory"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ChevronRight, Plus, Warehouse } from "lucide-react"
import { useState } from "react"
import { useSisprovAccess } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { LocationSettingsForm } from "@/components/stock/LocationSettingsForm"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { listMyStockLocationsFn } from "@/server/stock.fn"

export const Route = createFileRoute("/_protected/stock/")({
	component: StockPage,
})

const CLASS_LABEL: Record<string, string> = {
	alimentacao: "Alimentação",
	auxiliar: "Auxiliar",
	permanente: "Permanente",
	fardamento: "Fardamento",
}

function StockPage() {
	const navigate = useNavigate()
	const { canAdmin } = useSisprovAccess()
	const [creating, setCreating] = useState(false)
	const locations = useQuery({ queryKey: ["sisprov", "stockLocations"], queryFn: () => listMyStockLocationsFn(), staleTime: 60_000 })

	return (
		<div className="space-y-6">
			<PageHeader
				title="Estoque"
				description="Um estoque só, de toda classe. Aqui estão os locais que o seu acesso alcança, por nível; a cozinha continua operando a alimentação no SISUB."
			/>

			{canAdmin && !creating && (
				<Button variant="outline" onClick={() => setCreating(true)}>
					<Plus className="size-4" />
					Novo local de estoque
				</Button>
			)}
			{creating && (
				<Card>
					<CardHeader>
						<CardTitle>Novo local de estoque</CardTitle>
						<CardDescription>Depósito central, distribuidor regional ou almoxarifado. O local da cozinha nasce com a cozinha, no SISUB.</CardDescription>
					</CardHeader>
					<CardContent>
						<LocationSettingsForm onDone={(id) => navigate({ to: "/stock/$locationId", params: { locationId: String(id) } })} />
					</CardContent>
				</Card>
			)}

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
						<Item key={location.id} variant="outline" render={<Link to="/stock/$locationId" params={{ locationId: String(location.id) }} />}>
							<ItemMedia variant="icon">
								<Warehouse />
							</ItemMedia>
							<ItemContent>
								<ItemTitle>{location.name}</ItemTitle>
								<ItemDescription>
									{STOCK_LEVEL_LABELS[location.level]} · {location.unitCode}
									{location.suppliedByName ? ` · abastecido por ${location.suppliedByName}` : ""}
									{location.usesPositions ? " · endereçado" : ""}
								</ItemDescription>
							</ItemContent>
							<ItemActions>
								<div className="flex flex-wrap gap-1">
									{location.supplyClasses.map((supplyClass) => (
										<Badge key={supplyClass} variant="secondary">
											{CLASS_LABEL[supplyClass] ?? supplyClass}
										</Badge>
									))}
								</div>
								<ChevronRight className="size-4 text-muted-foreground" />
							</ItemActions>
						</Item>
					))}
				</ItemGroup>
			)}
		</div>
	)
}
