import { ArrowDown, ArrowUp, Clock, Pencil, Plus, Trash2, Users } from "lucide-react"
import { type BoardArrangement, type BoardItem, MealGroupBoard } from "@/components/features/local/planning/MealGroupBoard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { EventMealDraft } from "@/lib/event-meals"
import type { MenuItemGroup } from "@/lib/menu-item-groups"

/**
 * Uma refeição do evento: cabeçalho (nome, horário, efetivo, ações) e o quadro de preparações
 * nas colunas da composição DELA.
 *
 * Dimensionamento igual ao do cardápio semanal: o efetivo é da refeição ("coquetel = 300"), e
 * cada preparação diz a % desse efetivo que come dela — ou o número direto de pessoas, que
 * vence a porcentagem (`resolveItemDemand`).
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
	onProportionChange,
	onBaseHeadcountChange,
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
	onProportionChange: (recipeId: string, value: number | null) => void
	onBaseHeadcountChange: (value: number | null) => void
	onRemoveItem: (recipeId: string) => void
	selectionMode: boolean
	selectedIds: ReadonlySet<string>
	onSelectChange: (recipeId: string, checked: boolean) => void
}) {
	// A porcentagem só dimensiona sobre um efetivo: sem ele, a preparação em % não entra na compra.
	const proportionWithoutBase = meal.base_headcount == null && items.some((i) => i.proportion != null && i.headcount == null)

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
						<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
							<Users className="size-3.5" />
							<label htmlFor={`event-meal-base-${meal.id}`} className="hidden sm:inline">
								Efetivo
							</label>
							<Input
								id={`event-meal-base-${meal.id}`}
								type="number"
								min="1"
								step="1"
								inputMode="numeric"
								className="w-24"
								placeholder="pessoas"
								aria-label={`Efetivo de ${meal.name}`}
								value={meal.base_headcount ?? ""}
								onChange={(e) => {
									const parsed = Number.parseInt(e.target.value, 10)
									// Mesmo piso do semanal: efetivo é positivo; vazio limpa.
									onBaseHeadcountChange(Number.isFinite(parsed) && parsed > 0 ? parsed : null)
								}}
							/>
						</div>
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
			<CardContent className="space-y-2">
				{proportionWithoutBase && <p className="text-xs text-warning">Informe o efetivo da refeição: sem ele, as preparações em % não dimensionam a compra.</p>}
				<MealGroupBoard
					items={items}
					groups={meal.groups}
					onArrange={onArrange}
					onProportionChange={onProportionChange}
					onHeadcountChange={onHeadcountChange}
					// Com efetivo, a preparação nova nasce em % dele; sem, em número de pessoas.
					defaultDemandType={meal.base_headcount != null ? "proportion" : "headcount"}
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
