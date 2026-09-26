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
import { MAX_RECOMMENDED_PROPORTION } from "@iefa/sisub-domain/schemas"
import { ArrowRightLeft, ClipboardPaste, Copy, GripVertical, Percent, Plus, Users, X } from "lucide-react"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ContextMenu, ContextMenuContent, ContextMenuGroupLabel, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/cn"
import { DEFAULT_MENU_GROUPS, type MenuGroup, type MenuItemGroup, menuItemGroupLabel, UNGROUPED_KEY, UNGROUPED_LABEL } from "@/lib/menu-item-groups"

/** Item genérico exibido no board. `id` é a chave estável de drag (recipe_id no template, menu_item.id no dia). */
export type BoardItem = {
	id: string
	title: string
	subtitle?: string | null
	/** Selo ao lado do título (ex.: versão desatualizada da preparação). */
	badge?: ReactNode
	group: MenuItemGroup | null
	sortOrder: number
	/** Percentual do efetivo da refeição (ex.: 30% de 800 = 240 comensais). */
	proportion: number | null
	/** Quantidade direta de comensais da preparação. Excludente com `proportion`. */
	headcount?: number | null
	/** `id` do DOM para o localizar rolar até o item. */
	anchorId?: string
	/** Aparição corrente do localizar. */
	highlighted?: boolean
}

type ColumnKey = string

/**
 * Como a demanda da preparação é dita: percentual do efetivo da refeição ou quantidade
 * direta de pessoas. São EXCLUDENTES — a porcentagem só significa alguma coisa em cima do
 * efetivo da refeição, e informar as duas fazia a porcentagem ser ignorada pela compra.
 */
export type DemandType = "proportion" | "headcount"

export function demandTypeOf(item: Pick<BoardItem, "proportion" | "headcount">, fallback: DemandType): DemandType {
	if (item.headcount != null) return "headcount"
	if (item.proportion != null) return "proportion"
	return fallback
}

/** Resultado de um rearranjo: cada item com seu grupo e ordem já reindexados. */
export type BoardArrangement = { id: string; group: MenuItemGroup | null; sortOrder: number }[]

function columnKeyOf(group: MenuItemGroup | null): ColumnKey {
	return group ?? UNGROUPED_KEY
}

/**
 * Colunas do board: as do conjunto da refeição, MAIS uma por chave que o
 * conjunto não conhece, mais "Sem grupo".
 *
 * A coluna extra é o item que ficou para trás quando o conjunto mudou. Ele
 * precisa de um lugar visível: sem ela o item sumiria da tela continuando no
 * cardápio — e some do editor não é some do banco.
 */
function columnKeysOf(groups: readonly MenuGroup[], items: BoardItem[]): ColumnKey[] {
	const known = new Set(groups.map((g) => g.key))
	const extras: string[] = []
	for (const item of items) {
		if (item.group != null && !known.has(item.group) && !extras.includes(item.group)) extras.push(item.group)
	}
	return [...groups.map((g) => g.key), ...extras, UNGROUPED_KEY]
}

function buildColumns(items: BoardItem[], keys: ColumnKey[]): Record<ColumnKey, string[]> {
	const cols = {} as Record<ColumnKey, string[]>
	for (const key of keys) cols[key] = []
	const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder)
	for (const item of sorted) {
		const key = columnKeyOf(item.group)
		// Chave que não virou coluna não pode sumir: vai para "Sem grupo" em vez de
		// derrubar o item num objeto sem a propriedade.
		;(cols[key] ?? cols[UNGROUPED_KEY]).push(item.id)
	}
	return cols
}

function columnsToArrangement(cols: Record<ColumnKey, string[]>, keys: ColumnKey[]): BoardArrangement {
	const out: BoardArrangement = []
	for (const key of keys) {
		const group = key === UNGROUPED_KEY ? null : key
		cols[key]?.forEach((id, index) => {
			out.push({ id, group, sortOrder: index })
		})
	}
	return out
}

function SortableItem({
	item,
	onProportionChange,
	onHeadcountChange,
	onRemove,
	selectionMode,
	selected,
	onSelectChange,
	allowHeadcount,
	allowProportion,
	baseHeadcount,
	demandType,
	onSwitchDemandType,
	onCopy,
	onPaste,
	canPaste,
	onMoveToGroup,
	groups,
}: {
	item: BoardItem
	onProportionChange: (id: string, value: number | null) => void
	onHeadcountChange?: (id: string, value: number | null) => void
	onRemove: (id: string) => void
	selectionMode?: boolean
	selected?: boolean
	onSelectChange?: (checked: boolean) => void
	allowHeadcount: boolean
	allowProportion: boolean
	baseHeadcount?: number | null
	demandType: DemandType
	onSwitchDemandType: () => void
	onCopy?: (id: string) => void
	onPaste?: () => void
	canPaste?: boolean
	onMoveToGroup: (id: string, group: MenuItemGroup | null) => void
	groups: readonly MenuGroup[]
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
	const style = { transform: CSS.Translate.toString(transform), transition }

	const row = (
		<div
			ref={setNodeRef}
			id={item.anchorId}
			style={style}
			className={cn(
				"flex items-center gap-2 px-2.5 py-2 rounded-md bg-muted/30 hover:bg-muted/60 transition-colors",
				isDragging && "opacity-40",
				selected && "bg-primary/10 hover:bg-primary/15",
				item.highlighted && "ring-2 ring-ring"
			)}
		>
			{selectionMode && (
				<Checkbox className="shrink-0" checked={!!selected} onCheckedChange={(checked) => onSelectChange?.(checked)} aria-label={`Selecionar ${item.title}`} />
			)}
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
				<div className="flex items-center gap-1.5 min-w-0">
					<p className="text-sm truncate">{item.title}</p>
					{item.badge}
				</div>
				{item.subtitle && <p className="text-xs text-muted-foreground font-mono truncate">{item.subtitle}</p>}
			</div>

			<div className="flex items-center gap-1 shrink-0">
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								type="button"
								size="icon-xs"
								variant="ghost"
								className="text-muted-foreground"
								disabled={!allowHeadcount || !allowProportion}
								onClick={onSwitchDemandType}
								aria-label={demandType === "headcount" ? "Medir por porcentagem do efetivo" : "Medir por número de pessoas"}
							/>
						}
					>
						{demandType === "headcount" ? <Users className="size-3" /> : <Percent className="size-3" />}
					</TooltipTrigger>
					<TooltipContent>
						{!allowProportion
							? "Comensais desta preparação — aqui não há efetivo de refeição para a porcentagem medir."
							: demandType === "headcount"
								? "Comensais desta preparação. Clique para medir por % do efetivo da refeição."
								: allowHeadcount
									? "% do efetivo da refeição. Clique para informar o número de pessoas."
									: "% do efetivo da refeição (definido pela cozinha que adotar este plano)."}
					</TooltipContent>
				</Tooltip>
				{demandType === "headcount" ? (
					<Input
						type="number"
						min="1"
						step="1"
						className="h-6 w-16 text-xs"
						value={item.headcount ?? ""}
						placeholder="pax"
						aria-label="Comensais desta preparação"
						onChange={(e) => {
							const raw = e.target.value
							if (raw === "") return onHeadcountChange?.(item.id, null)
							const parsed = Number.parseInt(raw, 10)
							if (Number.isNaN(parsed)) return
							// Mesmo piso do auxiliador e da barra de seleção: comensais é positivo. Zero
							// aqui entrava na compra como "ninguém come" sem ninguém ter dito isso.
							onHeadcountChange?.(item.id, parsed >= 1 ? parsed : null)
						}}
						onClick={(e) => e.stopPropagation()}
					/>
				) : (
					<Input
						type="number"
						min="0"
						max={MAX_RECOMMENDED_PROPORTION}
						step="1"
						className="h-6 w-16 text-xs"
						value={item.proportion ?? ""}
						placeholder="%"
						aria-label="Porcentagem do efetivo da refeição"
						onChange={(e) => {
							const raw = e.target.value
							if (raw === "") return onProportionChange(item.id, null)
							const parsed = Number.parseInt(raw, 10)
							if (Number.isNaN(parsed)) return
							onProportionChange(item.id, Math.max(0, Math.min(MAX_RECOMMENDED_PROPORTION, parsed)))
						}}
						onClick={(e) => e.stopPropagation()}
					/>
				)}
				{/* A % só vira gente sobre o efetivo: mostra quantas pessoas ela dá. */}
				{demandType === "proportion" && item.headcount == null && item.proportion != null && baseHeadcount != null && (
					<span className="text-xs text-muted-foreground tabular-nums" title={`${item.proportion}% de ${baseHeadcount} pessoas`}>
						= {Math.round((baseHeadcount * item.proportion) / 100)}
					</span>
				)}
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

	// Botão direito na preparação: copiar/colar sem precisar entrar no modo de seleção.
	return (
		<ContextMenu>
			<ContextMenuTrigger render={row} />
			<ContextMenuContent>
				<ContextMenuItem onClick={() => onCopy?.(item.id)} disabled={!onCopy}>
					<Copy className="size-4" />
					Copiar
				</ContextMenuItem>
				<ContextMenuItem onClick={() => onPaste?.()} disabled={!canPaste}>
					<ClipboardPaste className="size-4" />
					Colar aqui
				</ContextMenuItem>
				<ContextMenuGroupLabel>Mover para</ContextMenuGroupLabel>
				{/* Trocar o grupo só era possível arrastando — no celular as colunas empilham e
				    arrastar de "Prato principal" para "Guarnição" é atravessar a tela inteira. */}
				{groups
					.filter((g) => g.key !== item.group)
					.map((g) => (
						<ContextMenuItem key={g.key} onClick={() => onMoveToGroup(item.id, g.key)}>
							<ArrowRightLeft className="size-4" />
							{g.label}
						</ContextMenuItem>
					))}
				<ContextMenuItem onClick={() => onRemove(item.id)}>
					<X className="size-4" />
					Remover
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	)
}

function GroupColumn({
	columnKey,
	label,
	itemIds,
	itemMap,
	onAdd,
	onProportionChange,
	onHeadcountChange,
	onRemove,
	selectionMode,
	selectedIds,
	onSelectChange,
	allowHeadcount,
	allowProportion,
	baseHeadcount,
	demandTypeOfItem,
	onSwitchDemandType,
	onCopy,
	onPaste,
	canPaste,
	onMoveToGroup,
	groups,
}: {
	columnKey: ColumnKey
	label: string
	itemIds: string[]
	itemMap: Map<string, BoardItem>
	onAdd?: (group: MenuItemGroup) => void
	onProportionChange: (id: string, value: number | null) => void
	onHeadcountChange?: (id: string, value: number | null) => void
	onRemove: (id: string) => void
	selectionMode?: boolean
	selectedIds?: ReadonlySet<string>
	onSelectChange?: (id: string, checked: boolean) => void
	allowHeadcount: boolean
	allowProportion: boolean
	baseHeadcount?: number | null
	demandTypeOfItem: (item: BoardItem) => DemandType
	onSwitchDemandType: (id: string) => void
	onCopy?: (id: string) => void
	onPaste?: () => void
	canPaste?: boolean
	onMoveToGroup: (id: string, group: MenuItemGroup | null) => void
	groups: readonly MenuGroup[]
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
							return (
								<SortableItem
									key={id}
									item={item}
									onProportionChange={onProportionChange}
									onHeadcountChange={onHeadcountChange}
									onRemove={onRemove}
									selectionMode={selectionMode}
									selected={selectedIds?.has(id)}
									onSelectChange={(checked) => onSelectChange?.(id, checked)}
									allowHeadcount={allowHeadcount}
									allowProportion={allowProportion}
									baseHeadcount={baseHeadcount}
									demandType={demandTypeOfItem(item)}
									onSwitchDemandType={() => onSwitchDemandType(id)}
									onCopy={onCopy}
									onPaste={onPaste}
									canPaste={canPaste}
									onMoveToGroup={onMoveToGroup}
									groups={groups}
								/>
							)
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
	groups = DEFAULT_MENU_GROUPS,
	onArrange,
	onProportionChange,
	onRemove,
	onAdd,
	selectionMode,
	selectedIds,
	onSelectChange,
	onHeadcountChange,
	allowHeadcount = true,
	allowProportion = true,
	baseHeadcount,
	defaultDemandType = "headcount",
	onCopy,
	onPaste,
	canPaste,
}: {
	items: BoardItem[]
	/** Grupos do conjunto DESTA refeição, na ordem de leitura. Padrão = conjunto do almoço. */
	groups?: readonly MenuGroup[]
	onArrange: (arrangement: BoardArrangement) => void
	onProportionChange: (id: string, value: number | null) => void
	onRemove: (id: string) => void
	onAdd?: (group: MenuItemGroup) => void
	onHeadcountChange?: (id: string, value: number | null) => void
	/** `false` no plano global, que não tem efetivo de refeição para a porcentagem morder. */
	allowHeadcount?: boolean
	/**
	 * `false` no evento: lá não existe efetivo de refeição, o quantitativo é por preparação.
	 * A porcentagem só significa alguma coisa em cima de um efetivo.
	 */
	allowProportion?: boolean
	/** Efetivo da refeição — com ele, a preparação em % mostra quantas pessoas a % dá. */
	baseHeadcount?: number | null
	/** Tipo dos itens que ainda não têm nem % nem pax — ajustável no editor. */
	defaultDemandType?: DemandType
	onCopy?: (id: string) => void
	onPaste?: () => void
	canPaste?: boolean
	/** Seleção em massa (dia+refeição atravessados pela barra inferior do editor). */
	selectionMode?: boolean
	selectedIds?: ReadonlySet<string>
	onSelectChange?: (id: string, checked: boolean) => void
}) {
	const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

	// Tipo escolhido à mão, por item. Sem isto, trocar o tipo de um item que JÁ tem valor
	// só limpava o campo: com os dois valores nulos o tipo voltava a ser o padrão, e o
	// número era perdido sem o usuário nunca alcançar o outro campo.
	const [demandTypeById, setDemandTypeById] = useState<Record<string, DemandType>>({})

	const resolveDemandType = (item: BoardItem): DemandType => {
		if (!allowProportion) return "headcount"
		// Pax preenchido é o que vale na demanda (`resolveItemDemand`), mesmo que a escolha
		// guardada diga %: a barra de seleção grava pax sem passar por aqui, e a linha seguia
		// mostrando a porcentagem que a compra já não usa.
		if (allowHeadcount && item.headcount != null) return "headcount"
		return allowHeadcount ? (demandTypeById[item.id] ?? demandTypeOf(item, defaultDemandType)) : "proportion"
	}

	/** Troca o tipo e zera o campo que fica para trás — os dois preenchidos é o estado que
	 * fazia a porcentagem ser ignorada pela compra. */
	const switchDemandType = (id: string) => {
		if (!allowHeadcount || !allowProportion) return
		const item = itemMap.get(id)
		if (!item) return
		const next: DemandType = resolveDemandType(item) === "headcount" ? "proportion" : "headcount"
		setDemandTypeById((prev) => ({ ...prev, [id]: next }))
		if (next === "proportion") onHeadcountChange?.(id, null)
		else onProportionChange(id, null)
	}

	// As colunas mudam com o conjunto da refeição (e com item órfão que aparece).
	const columnKeys = useMemo(() => columnKeysOf(groups, items), [groups, items])

	// Estado local das colunas para permitir movimento cross-group durante o drag; ressincroniza
	// com as props após cada commit (onArrange) ou edição externa.
	const [columns, setColumns] = useState<Record<ColumnKey, string[]>>(() => buildColumns(items, columnKeysOf(groups, items)))
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
		setColumns(buildColumns(items, columnKeys))
	}, [items, columnKeys])

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
		if (!commit && pending) setColumns(buildColumns(pending, columnKeys))
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
		onArrange(columnsToArrangement(next, columnKeys))
	}

	/** Mesmo efeito de arrastar o item para o fim de outra coluna, sem arrastar. */
	const moveToGroup = (id: string, group: MenuItemGroup | null) => {
		const target = columnKeyOf(group)
		const next = {} as Record<ColumnKey, string[]>
		for (const key of Object.keys(columns) as ColumnKey[]) next[key] = columns[key].filter((itemId) => itemId !== id)
		next[target] = [...(next[target] ?? []), id]
		setColumns(next)
		onArrange(columnsToArrangement(next, [...columnKeys, ...(columnKeys.includes(target) ? [] : [target])]))
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
				{columnKeys.map((key) => {
					// Coluna "sem grupo" só aparece quando há itens legados nela.
					if (key === UNGROUPED_KEY && (columns[UNGROUPED_KEY]?.length ?? 0) === 0) return null
					const label = key === UNGROUPED_KEY ? UNGROUPED_LABEL : menuItemGroupLabel(key, groups)
					return (
						<GroupColumn
							key={key}
							columnKey={key}
							label={label}
							itemIds={columns[key] ?? []}
							itemMap={itemMap}
							// Coluna órfã não recebe preparação nova: ela existe para esvaziar,
							// não para crescer.
							onAdd={groups.some((g) => g.key === key) ? onAdd : undefined}
							onProportionChange={onProportionChange}
							onHeadcountChange={onHeadcountChange}
							onRemove={onRemove}
							selectionMode={selectionMode}
							selectedIds={selectedIds}
							onSelectChange={onSelectChange}
							allowHeadcount={allowHeadcount}
							allowProportion={allowProportion}
							baseHeadcount={baseHeadcount}
							demandTypeOfItem={resolveDemandType}
							onSwitchDemandType={switchDemandType}
							onCopy={onCopy}
							onPaste={onPaste}
							canPaste={canPaste}
							onMoveToGroup={moveToGroup}
							groups={groups}
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
