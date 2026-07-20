import { ArrowLeftRight, Trash2 } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useUpdateMenuItem } from "@/hooks/data/usePlanning"
import { isMenuItemGroup, MENU_ITEM_GROUP_LABELS, MENU_ITEM_GROUPS, type MenuItemGroup, UNGROUPED_KEY, UNGROUPED_LABEL } from "@/lib/menu-item-groups"
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

	const recipeName = (item.recipe as { name?: string })?.name || "Preparação sem nome"

	const [portionQty, setPortionQty] = useState<number | null>(item.planned_portion_quantity)
	const [excludedQty, setExcludedQty] = useState<number | null>(item.excluded_from_procurement)
	const [proportion, setProportion] = useState<number | null>(item.recommended_proportion)
	const [prevPortion, setPrevPortion] = useState(item.planned_portion_quantity)
	const [prevExcluded, setPrevExcluded] = useState(item.excluded_from_procurement)
	const [prevProportion, setPrevProportion] = useState(item.recommended_proportion)

	// Sync state with prop changes (adjust during render, not in effect)
	if (prevPortion !== item.planned_portion_quantity) {
		setPrevPortion(item.planned_portion_quantity)
		setPortionQty(item.planned_portion_quantity)
	}
	if (prevExcluded !== item.excluded_from_procurement) {
		setPrevExcluded(item.excluded_from_procurement)
		setExcludedQty(item.excluded_from_procurement)
	}
	if (prevProportion !== item.recommended_proportion) {
		setPrevProportion(item.recommended_proportion)
		setProportion(item.recommended_proportion)
	}

	const groupValue: MenuItemGroup | typeof UNGROUPED_KEY = isMenuItemGroup(item.item_group) ? item.item_group : UNGROUPED_KEY

	const handleGroupChange = (value: string | null) => {
		const nextGroup = value == null || value === UNGROUPED_KEY ? null : (value as MenuItemGroup)
		updateMenuItem({ id: item.id, updates: { item_group: nextGroup } })
	}

	const handleUpdateProportion = () => {
		updateMenuItem({ id: item.id, updates: { recommended_proportion: proportion } })
	}

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
		<div className="border rounded-md p-3 bg-background space-y-3">
			{/* Recipe Name Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<p className="text-subheading">{recipeName}</p>
					{item.origin_template_type === "event" && (
						<Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
							Evento
						</Badge>
					)}
					{item.origin_template_type === "exception" && (
						<Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
							Exceção
						</Badge>
					)}
					{item.substitutions && (
						<Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30">
							Substituição Ativa
						</Badge>
					)}
				</div>
				<div className="flex items-center gap-1">
					<Tooltip>
						<TooltipTrigger
							render={
								<Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-primary" onClick={() => onSubstitute(item)}>
									<ArrowLeftRight className="size-3.5" />
								</Button>
							}
						></TooltipTrigger>
						<TooltipContent>Substituir ingredientes</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger
							render={
								<Button size="icon" variant="ghost" className="size-7 text-destructive hover:bg-destructive/10" onClick={() => onDelete(item.id, recipeName)}>
									<Trash2 className="size-3.5" />
								</Button>
							}
						></TooltipTrigger>
						<TooltipContent>Remover</TooltipContent>
					</Tooltip>
				</div>
			</div>

			{/* Portion Controls */}
			<div className="grid grid-cols-2 gap-3 text-xs">
				{/* Planned Portion Quantity */}
				<div className="space-y-1">
					<Label htmlFor={`portion-${item.id}`} className="text-xs text-muted-foreground">
						Comensais planejados
					</Label>
					<Input
						id={`portion-${item.id}`}
						type="number"
						value={portionQty ?? ""}
						onChange={(e) => setPortionQty(e.target.value === "" ? null : Number.parseInt(e.target.value, 10))}
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
						onChange={(e) => setExcludedQty(e.target.value === "" ? null : Number.parseInt(e.target.value, 10))}
						onBlur={handleUpdateExcludedQuantity}
						placeholder="Ex: 10"
						className="h-8 text-xs"
					/>
				</div>
			</div>

			{/* Grupo + Proporção recomendada */}
			<div className="grid grid-cols-2 gap-3 text-xs">
				<div className="space-y-1">
					<Label className="text-xs text-muted-foreground">Grupo</Label>
					<Select value={groupValue} onValueChange={handleGroupChange}>
						<SelectTrigger className="h-8 text-xs">
							<SelectValue>{groupValue === UNGROUPED_KEY ? UNGROUPED_LABEL : MENU_ITEM_GROUP_LABELS[groupValue]}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={UNGROUPED_KEY}>{UNGROUPED_LABEL}</SelectItem>
							{MENU_ITEM_GROUPS.map((g) => (
								<SelectItem key={g} value={g}>
									{MENU_ITEM_GROUP_LABELS[g]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-1">
					<Label htmlFor={`proportion-${item.id}`} className="text-xs text-muted-foreground">
						Proporção (%)
					</Label>
					<Input
						id={`proportion-${item.id}`}
						type="number"
						min="0"
						max="100"
						value={proportion ?? ""}
						onChange={(e) => {
							if (e.target.value === "") return setProportion(null)
							const parsed = Number.parseInt(e.target.value, 10)
							if (!Number.isNaN(parsed)) setProportion(Math.max(0, Math.min(100, parsed)))
						}}
						onBlur={handleUpdateProportion}
						placeholder="Ex: 70"
						className="h-8 text-xs"
					/>
				</div>
			</div>

			{/* Calculated Net Quantity */}
			{netQuantity !== null && (
				<div className="flex items-center gap-2 text-xs text-muted-foreground pt-1 border-t">
					<span>Para Compra:</span>
					<span className="text-subheading text-foreground">{netQuantity} comensais</span>
				</div>
			)}
		</div>
	)
}
