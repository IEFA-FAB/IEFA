import { ArrowDown, ArrowUp, Clock, Layers, Pencil, Plus, Trash2, Users } from "lucide-react"
import { type BoardArrangement, type BoardItem, MealGroupBoard } from "@/components/features/local/planning/MealGroupBoard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { type EventMealDraft, parseEventMealHeadcount } from "@/lib/event-meals"
import type { MenuItemGroup } from "@/lib/menu-item-groups"
import type { ProportionMode } from "@/lib/occasion-menu"

/**
 * Uma refeição do evento ou do apoio: cabeçalho (nome, horário, efetivo, ações) e o quadro de
 * preparações nas colunas da composição DELA — ou em lista, quando a refeição não tem grupos
 * (o kit simples do apoio).
 *
 * Dimensionamento igual ao do cardápio semanal: o efetivo é da refeição ("coquetel = 300"), e
 * cada preparação diz a % desse efetivo que come dela — ou o número direto de pessoas, que
 * vence a porcentagem (`resolveItemDemand`). No apoio o efetivo é o número de KITS e a
 * proporção é lida como porções por kit.
 *
 * Efetivo e pax são quantidade absoluta: o modelo global não os mostra (`allowAbsolutes`), e o
 * padrão de lanche também não — os kits vêm do pedido.
 */
export function EventMealCard({
	meal,
	mealTypeName,
	originLabel = null,
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
	proportionMode = "percent",
	allowAbsolutes = true,
}: {
	meal: EventMealDraft
	/** Nome do horário no calendário; `null` quando o tipo de refeição não carregou (ou saiu do escopo). */
	mealTypeName: string | null
	/** De qual modelo a refeição veio ("Padrão B › Coquetel"); `null` = criada aqui. */
	originLabel?: string | null
	items: BoardItem[]
	isFirst: boolean
	isLast: boolean
	onEdit: () => void
	onRemove: () => void
	onMove: (delta: -1 | 1) => void
	/** `null` = refeição sem grupos: a preparação entra na lista, sem grupo. */
	onAdd: (group: MenuItemGroup | null) => void
	onArrange: (arrangement: BoardArrangement) => void
	onHeadcountChange: (recipeId: string, value: number | null) => void
	onProportionChange: (recipeId: string, value: number | null) => void
	onBaseHeadcountChange: (value: number | null) => void
	onRemoveItem: (recipeId: string) => void
	selectionMode: boolean
	selectedIds: ReadonlySet<string>
	onSelectChange: (recipeId: string, checked: boolean) => void
	/** % do efetivo (evento) ou porções por kit (apoio). */
	proportionMode?: ProportionMode
	/** `false` no modelo global e no padrão de lanche: sem efetivo da refeição e sem pax. */
	allowAbsolutes?: boolean
}) {
	const isPerKit = proportionMode === "portionsPerKit"
	const baseLabel = isPerKit ? "Kits" : "Efetivo"
	// A porcentagem só dimensiona sobre um efetivo: sem ele, a preparação em % não entra na compra.
	const proportionWithoutBase = allowAbsolutes && meal.base_headcount == null && items.some((i) => i.proportion != null && i.headcount == null)
	const hasGroups = meal.groups.length > 0

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
						{originLabel && (
							<Badge variant="outline">
								<Layers />
								de {originLabel}
							</Badge>
						)}
					</div>
				</CardTitle>
				<CardAction>
					<div className="flex items-center gap-1">
						{allowAbsolutes && (
							<div className="flex items-center gap-1.5">
								<Users className="size-3.5 text-muted-foreground" />
								<label htmlFor={`event-meal-base-${meal.id}`} className="hidden text-xs text-muted-foreground sm:inline">
									{baseLabel}
								</label>
								<Input
									id={`event-meal-base-${meal.id}`}
									type="number"
									min="1"
									step="1"
									inputMode="numeric"
									className="w-24"
									placeholder={isPerKit ? "kits" : "pessoas"}
									aria-label={`${baseLabel} de ${meal.name}`}
									value={meal.base_headcount ?? ""}
									onChange={(e) => onBaseHeadcountChange(parseEventMealHeadcount(e.target.value))}
								/>
							</div>
						)}
						<Button type="button" size="sm" variant="ghost" onClick={() => onAdd(hasGroups ? (meal.groups[0]?.key ?? null) : null)}>
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
				{proportionWithoutBase && (
					<p className="text-xs text-warning">
						{isPerKit
							? "Informe os kits da refeição: sem eles, as porções por kit não dimensionam a compra."
							: "Informe o efetivo da refeição: sem ele, as preparações em % não dimensionam a compra."}
					</p>
				)}
				<MealGroupBoard
					items={items}
					groups={meal.groups}
					onArrange={onArrange}
					onProportionChange={onProportionChange}
					onHeadcountChange={onHeadcountChange}
					allowHeadcount={allowAbsolutes}
					proportionMode={proportionMode}
					// Com efetivo, a preparação nova nasce em % dele; sem, em número de pessoas. No apoio
					// nasce em porções por kit: é o que o kit diz, e os kits chegam depois.
					defaultDemandType={isPerKit || meal.base_headcount != null ? "proportion" : "headcount"}
					baseHeadcount={allowAbsolutes ? meal.base_headcount : null}
					onRemove={onRemoveItem}
					onAdd={onAdd}
					onAddToList={() => onAdd(null)}
					selectionMode={selectionMode}
					selectedIds={selectedIds}
					onSelectChange={onSelectChange}
				/>
			</CardContent>
		</Card>
	)
}
