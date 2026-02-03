import { Badge, Button, Input, Label } from "@iefa/ui"
import { ArrowLeftRight, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useUpdateMenuItem } from "@/hooks/data/usePlanning"
import type { MenuItem } from "@/types/domain/planning"

interface MenuItemCardProps {
	item: MenuItem
	onSubstitute: (item: MenuItem) => void
	onDelete: (itemId: string, recipeName: string) => void
}

/**
 * Menu Item Card com controles editáveis para porção planejada e quantidade excluída
 */
export function MenuItemCard({ item, onSubstitute, onDelete }: MenuItemCardProps) {
	const { mutate: updateMenuItem } = useUpdateMenuItem()

	const recipeName = (item.recipe as any)?.name || "Receita sem nome"

	const [portionQty, setPortionQty] = useState<number | null>(item.planned_portion_quantity)
	const [excludedQty, setExcludedQty] = useState<number | null>(item.excluded_from_procurement)

	// Sync state with prop changes
	useEffect(() => {
		setPortionQty(item.planned_portion_quantity)
		setExcludedQty(item.excluded_from_procurement)
	}, [item.planned_portion_quantity, item.excluded_from_procurement])

	const handleUpdatePortionQuantity = () => {
		updateMenuItem({
			id: item.id,
			updates: { planned_portion_quantity: portionQty },
		})
	}

	const handleUpdateExcludedQuantity = () => {
		updateMenuItem({
			id: item.id,
			updates: { excluded_from_procurement: excludedQty },
		})
	}

	const netQuantity = portionQty !== null ? portionQty - (excludedQty || 0) : null

	return (
		<div className="border rounded-lg p-3 bg-background space-y-3">
			{/* Recipe Name Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<p className="font-medium text-sm">{recipeName}</p>
					{item.substitutions && (
						<Badge
							variant="outline"
							className="text-[10px] bg-yellow-50 text-yellow-700 border-yellow-200"
						>
							Substituição Ativa
						</Badge>
					)}
				</div>
				<div className="flex items-center gap-1">
					<Button
						size="icon"
						variant="ghost"
						className="h-7 w-7 text-muted-foreground hover:text-primary"
						onClick={() => onSubstitute(item)}
						title="Substituir ingredientes"
					>
						<ArrowLeftRight className="w-3.5 h-3.5" />
					</Button>
					<Button
						size="icon"
						variant="ghost"
						className="h-7 w-7 text-destructive hover:bg-destructive/10"
						onClick={() => onDelete(item.id, recipeName)}
						title="Remover"
					>
						<Trash2 className="w-3.5 h-3.5" />
					</Button>
				</div>
			</div>

			{/* Portion Controls */}
			<div className="grid grid-cols-2 gap-3 text-xs">
				{/* Planned Portion Quantity */}
				<div className="space-y-1">
					<Label htmlFor={`portion-${item.id}`} className="text-xs text-muted-foreground">
						Porção Planejada (g)
					</Label>
					<Input
						id={`portion-${item.id}`}
						type="number"
						value={portionQty ?? ""}
						onChange={(e) =>
							setPortionQty(e.target.value === "" ? null : Number.parseInt(e.target.value, 10))
						}
						onBlur={handleUpdatePortionQuantity}
						placeholder="Ex: 150"
						className="h-8 text-xs"
					/>
				</div>

				{/* Excluded from Procurement */}
				<div className="space-y-1">
					<Label htmlFor={`excluded-${item.id}`} className="text-xs text-muted-foreground">
						Qtd. Não Comprar
					</Label>
					<Input
						id={`excluded-${item.id}`}
						type="number"
						value={excludedQty ?? ""}
						onChange={(e) =>
							setExcludedQty(e.target.value === "" ? null : Number.parseInt(e.target.value, 10))
						}
						onBlur={handleUpdateExcludedQuantity}
						placeholder="Ex: 10"
						className="h-8 text-xs"
					/>
				</div>
			</div>

			{/* Calculated Net Quantity */}
			{netQuantity !== null && (
				<div className="flex items-center gap-2 text-xs text-must-foreground pt-1 border-t">
					<span>Para Compra:</span>
					<span className="font-medium text-foreground">{netQuantity}g</span>
				</div>
			)}
		</div>
	)
}
