import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@iefa/ui"
import { Building2, ChefHat } from "lucide-react"
import { useKitchenSelector } from "@/hooks/data/useKitchens"

/**
 * Kitchen Selector Component
 *
 * Dropdown para seleção da kitchen no contexto de planejamento.
 * Persiste seleção em localStorage e query params.
 * Auto-seleciona se usuário tem apenas uma kitchen.
 *
 * @example
 * ```tsx
 * <KitchenSelector />
 * ```
 */
export function KitchenSelector() {
	const { kitchens, kitchenId, setKitchenId, isLoading } = useKitchenSelector()

	if (isLoading) {
		return <div className="w-[280px] h-10 bg-muted animate-pulse rounded-md" />
	}

	if (kitchens.length === 0) {
		return (
			<div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground bg-muted/50 rounded-md">
				<Building2 className="w-4 h-4" />
				<span>Nenhuma cozinha disponível</span>
			</div>
		)
	}

	const selectedKitchen = kitchens.find((k) => k.id === kitchenId)

	return (
		<Select
			value={kitchenId?.toString() || ""}
			onValueChange={(value) => {
				const id = Number.parseInt(value, 10)
				if (!Number.isNaN(id)) {
					setKitchenId(id)
				}
			}}
		>
			<SelectTrigger className="w-[280px]">
				<SelectValue placeholder="Selecione uma cozinha">
					{selectedKitchen && (
						<div className="flex items-center gap-2">
							<ChefHat className="w-4 h-4 text-muted-foreground" />
							<span className="font-medium">
								{selectedKitchen.unit?.display_name || `Kitchen #${selectedKitchen.id}`}
							</span>
							<span className="text-xs text-muted-foreground capitalize">
								({selectedKitchen.type})
							</span>
						</div>
					)}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{kitchens.map((kitchen) => (
					<SelectItem key={kitchen.id} value={kitchen.id.toString()}>
						<div className="flex items-center gap-3 py-1">
							<ChefHat className="w-4 h-4 text-muted-foreground" />
							<div className="flex flex-col gap-0.5">
								<span className="font-medium">
									{kitchen.unit?.display_name || `Kitchen #${kitchen.id}`}
								</span>
								<div className="flex items-center gap-2 text-xs text-muted-foreground">
									<span className="capitalize">{kitchen.type}</span>
									{kitchen.unit?.code && (
										<>
											<span>•</span>
											<span className="font-mono">{kitchen.unit.code}</span>
										</>
									)}
								</div>
							</div>
						</div>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}
