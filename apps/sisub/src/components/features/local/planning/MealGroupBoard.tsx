import {
	closestCorners,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Percent, Plus, X } from "lucide-react"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/cn"
import { MENU_ITEM_GROUP_LABELS, MENU_ITEM_GROUPS, type MenuItemGroup, UNGROUPED_KEY, UNGROUPED_LABEL } from "@/lib/menu-item-groups"

/** Item genérico exibido no board. `id` é a chave estável de drag (recipe_id no template, menu_item.id no dia). */
export type BoardItem = {
	id: string
	title: string
	subtitle?: string | null
	group: MenuItemGroup | null
	sortOrder: number
	proportion: number | null
}

type ColumnKey = MenuItemGroup | typeof UNGROUPED_KEY

/** Resultado de um rearranjo: cada item com seu grupo e ordem já reindexados. */
export type BoardArrangement = { id: string; group: MenuItemGroup | null; sortOrder: number }[]

function columnKeyOf(group: MenuItemGroup | null): ColumnKey {
	return group ?? UNGROUPED_KEY
}

function buildColumns(items: BoardItem[]): Record<ColumnKey, string[]> {
	const cols = {} as Record<ColumnKey, string[]>
	for (const g of MENU_ITEM_GROUPS) cols[g] = []
	cols[UNGROUPED_KEY] = []
	const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder)
	for (const item of sorted) cols[columnKeyOf(item.group)].push(item.id)
	return cols
}

function columnsToArrangement(cols: Record<ColumnKey, string[]>): BoardArrangement {
	const out: BoardArrangement = []
	for (const key of [...MENU_ITEM_GROUPS, UNGROUPED_KEY] as ColumnKey[]) {
		const group = key === UNGROUPED_KEY ? null : key
		cols[key].forEach((id, index) => {
			out.push({ id, group, sortOrder: index })
		})
	}
	return out
}

function SortableItem({
	item,
	onProportionChange,
	onRemove,
	renderExtra,
}: {
	item: BoardItem
	onProportionChange: (id: string, value: number | null) => void
	onRemove: (id: string) => void
	renderExtra?: (item: BoardItem) => ReactNode
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
	const style = { transform: CSS.Translate.toString(transform), transition }

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn("flex items-center gap-2 px-2.5 py-2 rounded-md bg-muted/30 hover:bg-muted/60 transition-colors", isDragging && "opacity-40")}
		>
			<button
				type="button"
				className="shrink-0 text-muted-foreground/60 hover:text-foreground cursor-grab touch-none active:cursor-grabbing"
				aria-label="Arrastar para reordenar"
				{...attributes}
				{...listeners}
			>
				<GripVertical className="size-4" />
			</button>

			<div className="flex-1 min-w-0">
				<p className="text-sm truncate">{item.title}</p>
				{item.subtitle && <p className="text-xs text-muted-foreground font-mono truncate">{item.subtitle}</p>}
			</div>

			{renderExtra?.(item)}

			<div className="flex items-center gap-1 shrink-0">
				<Tooltip>
					<TooltipTrigger render={<span className="inline-flex" />}>
						<Percent className="size-3 text-muted-foreground" />
					</TooltipTrigger>
					<TooltipContent>Proporção recomendada de consumo (%)</TooltipContent>
				</Tooltip>
				<Input
					type="number"
					min="0"
					max="100"
					step="1"
					className="h-6 w-16 text-xs"
					value={item.proportion ?? ""}
					placeholder="%"
					aria-label="Proporção recomendada de consumo (%)"
					onChange={(e) => {
						const raw = e.target.value
						if (raw === "") return onProportionChange(item.id, null)
						const parsed = Number.parseInt(raw, 10)
						if (Number.isNaN(parsed)) return
						onProportionChange(item.id, Math.max(0, Math.min(100, parsed)))
					}}
					onClick={(e) => e.stopPropagation()}
				/>
			</div>

			<Button
				type="button"
				size="icon"
				variant="ghost"
				className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
				onClick={() => onRemove(item.id)}
				aria-label="Remover preparação"
			>
				<X className="size-3.5" />
			</Button>
		</div>
	)
}

function GroupColumn({
	columnKey,
	label,
	itemIds,
	itemMap,
	onAdd,
	onProportionChange,
	onRemove,
	renderExtra,
}: {
	columnKey: ColumnKey
	label: string
	itemIds: string[]
	itemMap: Map<string, BoardItem>
	onAdd?: (group: MenuItemGroup) => void
	onProportionChange: (id: string, value: number | null) => void
	onRemove: (id: string) => void
	renderExtra?: (item: BoardItem) => ReactNode
}) {
	const { setNodeRef, isOver } = useDroppable({ id: `col:${columnKey}`, data: { isColumn: true, columnKey } })
	const canAdd = onAdd && columnKey !== UNGROUPED_KEY

	return (
		<div className="rounded-md border bg-card">
			<div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
				<div className="flex items-center gap-2">
					<span className="text-xs text-subheading uppercase tracking-wide text-muted-foreground">{label}</span>
					{itemIds.length > 0 && <span className="text-xs text-muted-foreground/60 tabular-nums">{itemIds.length}</span>}
				</div>
				{canAdd && (
					<Button
						type="button"
						size="sm"
						variant="ghost"
						className="text-xs h-6 gap-1 text-muted-foreground hover:text-foreground"
						onClick={() => onAdd?.(columnKey as MenuItemGroup)}
					>
						<Plus className="size-3.5" />
						Adicionar
					</Button>
				)}
			</div>
			<div ref={setNodeRef} className={cn("p-2 space-y-1.5 min-h-14", isOver && "bg-primary/5")}>
				<SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
					{itemIds.length === 0 ? (
						<p className="px-2 py-3 text-xs text-muted-foreground/50 text-center">Arraste preparações para cá</p>
					) : (
						itemIds.map((id) => {
							const item = itemMap.get(id)
							if (!item) return null
							return <SortableItem key={id} item={item} onProportionChange={onProportionChange} onRemove={onRemove} renderExtra={renderExtra} />
						})
					)}
				</SortableContext>
			</div>
		</div>
	)
}

/**
 * Board de preparações de uma refeição, agrupadas em colunas canônicas (prato principal →
 * … → sobremesa) com drag-and-drop entre grupos e reordenação dentro de cada grupo.
 * O grupo e a ordem resultantes voltam pelo `onArrange` (todos os itens reindexados).
 */
export function MealGroupBoard({
	items,
	onArrange,
	onProportionChange,
	onRemove,
	onAdd,
	renderExtra,
}: {
	items: BoardItem[]
	onArrange: (arrangement: BoardArrangement) => void
	onProportionChange: (id: string, value: number | null) => void
	onRemove: (id: string) => void
	onAdd?: (group: MenuItemGroup) => void
	renderExtra?: (item: BoardItem) => ReactNode
}) {
	const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

	// Estado local das colunas para permitir movimento cross-group durante o drag; ressincroniza
	// com as props após cada commit (onArrange) ou edição externa.
	const [columns, setColumns] = useState<Record<ColumnKey, string[]>>(() => buildColumns(items))
	const [activeId, setActiveId] = useState<string | null>(null)

	// Refs (não deps do efeito): um re-render do pai no meio do drag não pode descartar
	// o arranjo em curso; itens que chegarem durante o drag ficam pendentes e são
	// aplicados só se o drag for cancelado (no drop, o eco do onArrange ressincroniza).
	const draggingRef = useRef(false)
	const pendingItemsRef = useRef<BoardItem[] | null>(null)

	useEffect(() => {
		if (draggingRef.current) {
			pendingItemsRef.current = items
			return
		}
		setColumns(buildColumns(items))
	}, [items])

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
	)

	const findColumn = (id: string): ColumnKey | null => {
		if (id.startsWith("col:")) return id.slice(4) as ColumnKey
		for (const key of Object.keys(columns) as ColumnKey[]) {
			if (columns[key].includes(id)) return key
		}
		return null
	}

	function handleDragStart(event: DragStartEvent) {
		draggingRef.current = true
		setActiveId(String(event.active.id))
	}

	/** Encerra o drag. Sem commit, volta ao estado externo mais recente (mudanças chegadas durante o drag). */
	function finishDrag(commit: boolean) {
		draggingRef.current = false
		setActiveId(null)
		const pending = pendingItemsRef.current
		pendingItemsRef.current = null
		if (!commit && pending) setColumns(buildColumns(pending))
	}

	function handleDragOver(event: DragOverEvent) {
		const { active, over } = event
		if (!over) return
		const activeId = String(active.id)
		const overId = String(over.id)
		const from = findColumn(activeId)
		const to = findColumn(overId)
		if (!from || !to || from === to) return

		setColumns((prev) => {
			const fromItems = [...prev[from]]
			const toItems = [...prev[to]]
			const activeIndex = fromItems.indexOf(activeId)
			if (activeIndex === -1) return prev
			fromItems.splice(activeIndex, 1)
			const overIndex = toItems.indexOf(overId)
			const insertAt = overIndex === -1 ? toItems.length : overIndex
			toItems.splice(insertAt, 0, activeId)
			return { ...prev, [from]: fromItems, [to]: toItems }
		})
	}

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event
		if (!over) {
			finishDrag(false)
			return
		}
		const activeId = String(active.id)
		const overId = String(over.id)
		const from = findColumn(activeId)
		const to = findColumn(overId)
		if (!from || !to) {
			finishDrag(false)
			return
		}
		finishDrag(true)

		let next = columns
		if (from === to) {
			const items = columns[from]
			const oldIndex = items.indexOf(activeId)
			const newIndex = overId.startsWith("col:") ? items.length - 1 : items.indexOf(overId)
			if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
				next = { ...columns, [from]: arrayMove(items, oldIndex, newIndex) }
				setColumns(next)
			}
		}
		onArrange(columnsToArrangement(next))
	}

	const activeItem = activeId ? itemMap.get(activeId) : null

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCorners}
			onDragStart={handleDragStart}
			onDragOver={handleDragOver}
			onDragEnd={handleDragEnd}
			onDragCancel={() => finishDrag(false)}
		>
			<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
				{([...MENU_ITEM_GROUPS, UNGROUPED_KEY] as ColumnKey[]).map((key) => {
					// Coluna "sem grupo" só aparece quando há itens legados nela.
					if (key === UNGROUPED_KEY && columns[UNGROUPED_KEY].length === 0) return null
					const label = key === UNGROUPED_KEY ? UNGROUPED_LABEL : MENU_ITEM_GROUP_LABELS[key]
					return (
						<GroupColumn
							key={key}
							columnKey={key}
							label={label}
							itemIds={columns[key]}
							itemMap={itemMap}
							onAdd={onAdd}
							onProportionChange={onProportionChange}
							onRemove={onRemove}
							renderExtra={renderExtra}
						/>
					)
				})}
			</div>

			<DragOverlay>
				{activeItem ? (
					<div className="flex items-center gap-2 px-2.5 py-2 rounded-md border bg-card shadow-lg">
						<GripVertical className="size-4 text-muted-foreground/60" />
						<span className="text-sm">{activeItem.title}</span>
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	)
}
