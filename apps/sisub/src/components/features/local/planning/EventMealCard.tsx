import { ArrowDown, ArrowUp, Clock, Pencil, Plus, Trash2 } from "lucide-react"
import { type BoardArrangement, type BoardItem, MealGroupBoard } from "@/components/features/local/planning/MealGroupBoard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { EventMealDraft } from "@/lib/event-meals"
import type { MenuItemGroup } from "@/lib/menu-item-groups"

/**
 * Uma refeição do evento: cabeçalho (nome, horário, ações) e o quadro de preparações nas
 * colunas da composição DELA. O quantitativo é sempre por preparação — evento não tem efetivo
 * de refeição para a porcentagem medir.
 */
export function EventMealCard({
	meal,
	mealTypeName,
	items,
	isFirst,
	isLast,
	onEdit,
	onRemove,
	onMove,
	onAdd,
	onArrange,
	onHeadcountChange,
	onRemoveItem,
	selectionMode,
	selectedIds,
	onSelectChange,
}: {
	meal: EventMealDraft
	/** Nome do horário no calendário; `null` quando o tipo de refeição não carregou (ou saiu do escopo). */
	mealTypeName: string | null
	items: BoardItem[]
	isFirst: boolean
	isLast: boolean
	onEdit: () => void
	onRemove: () => void
	onMove: (delta: -1 | 1) => void
	onAdd: (group: MenuItemGroup) => void
	onArrange: (arrangement: BoardArrangement) => void
	onHeadcountChange: (recipeId: string, value: number | null) => void
	onRemoveItem: (recipeId: string) => void
	selectionMode: boolean
	selectedIds: ReadonlySet<string>
	onSelectChange: (recipeId: string, checked: boolean) => void
}) {
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle className="min-w-0 text-subheading">
					<div className="flex min-w-0 flex-wrap items-center gap-2">
						<span className="truncate">{meal.name}</span>
						<Badge variant="outline">
							<Clock />
							{mealTypeName ?? "Horário indisponível"}
						</Badge>
						{items.length > 0 && <Badge variant="secondary">{items.length}</Badge>}
					</div>
				</CardTitle>
				<CardAction>
					<div className="flex items-center gap-1">
						<Button type="button" size="sm" variant="ghost" onClick={() => onAdd(meal.groups[0]?.key ?? "")} disabled={meal.groups.length === 0}>
							<Plus />
							Adicionar
						</Button>
						<Button type="button" size="icon-sm" variant="ghost" onClick={() => onMove(-1)} disabled={isFirst} aria-label={`Subir ${meal.name}`}>
							<ArrowUp />
						</Button>
						<Button type="button" size="icon-sm" variant="ghost" onClick={() => onMove(1)} disabled={isLast} aria-label={`Descer ${meal.name}`}>
							<ArrowDown />
						</Button>
						<Button type="button" size="icon-sm" variant="ghost" onClick={onEdit} aria-label={`Editar ${meal.name}`}>
							<Pencil />
						</Button>
						<Button type="button" size="icon-sm" variant="ghost" onClick={onRemove} aria-label={`Remover ${meal.name}`}>
							<Trash2 />
						</Button>
					</div>
				</CardAction>
			</CardHeader>
			<CardContent>
				<MealGroupBoard
					items={items}
					groups={meal.groups}
					onArrange={onArrange}
					// Sem porcentagem no evento (`allowProportion={false}`): este callback nunca é chamado.
					onProportionChange={() => {}}
					onHeadcountChange={onHeadcountChange}
					allowProportion={false}
					onRemove={onRemoveItem}
					onAdd={onAdd}
					selectionMode={selectionMode}
					selectedIds={selectedIds}
					onSelectChange={onSelectChange}
				/>
			</CardContent>
		</Card>
	)
}
