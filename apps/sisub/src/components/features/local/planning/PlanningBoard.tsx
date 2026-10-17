import { Link, useNavigate, useParams } from "@tanstack/react-router"
import {
	addDays,
	addMonths,
	differenceInCalendarDays,
	eachDayOfInterval,
	endOfMonth,
	endOfWeek,
	format,
	isSameDay,
	isSameMonth,
	parseISO,
	startOfMonth,
	startOfWeek,
	subMonths,
} from "date-fns"
import { ptBR } from "date-fns/locale"
import { AlertTriangle, CalendarDays, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Settings, Trash2, Users } from "lucide-react"
import { useReducer, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDailyMenus } from "@/hooks/data/usePlanning"
import { usePlanningAvailability } from "@/hooks/data/usePlanningAvailability"
import { useMenuTemplates } from "@/hooks/data/useTemplates"
import { cn } from "@/lib/cn"
import { isHeadcountPending } from "@/lib/headcount-pending"
import { ApplyTemplateDialog } from "./ApplyTemplateDialog"
import { BulkDayToolbar, FindRecipeBar, ShiftDaysDialog, type ShiftRequest } from "./BulkDayActions"
import { ExpiringInPeriod } from "./ExpiringInPeriod"
import { MealTypeManager } from "./MealTypeManager"
import { AvailabilityStatusNote, DayAvailabilityList } from "./MenuAvailabilityAlert"
import { TemplatePalette } from "./TemplatePalette"
import { TrashDrawer } from "./TrashDrawer"

// ─── Reducer ─────────────────────────────────────────────────────────────────

type PlanningBoardState = {
	selectedDays: Set<string>
	isTemplateModalOpen: boolean
	isTrashOpen: boolean
	isMealTypeManagerOpen: boolean
	selectedTemplateId: string | null
	templateTargetDates: string[]
}

type PlanningBoardAction =
	| { type: "SET_SELECTED_DAYS"; value: Set<string> }
	| { type: "SET_TEMPLATE_MODAL_OPEN"; value: boolean }
	| { type: "SET_TRASH_OPEN"; value: boolean }
	| { type: "SET_MEAL_TYPE_MANAGER_OPEN"; value: boolean }
	| { type: "SET_SELECTED_TEMPLATE_ID"; value: string | null }
	| { type: "SET_TEMPLATE_TARGET_DATES"; value: string[] }

function planningBoardReducer(state: PlanningBoardState, action: PlanningBoardAction): PlanningBoardState {
	switch (action.type) {
		case "SET_SELECTED_DAYS":
			return { ...state, selectedDays: action.value }
		case "SET_TEMPLATE_MODAL_OPEN":
			return { ...state, isTemplateModalOpen: action.value }
		case "SET_TRASH_OPEN":
			return { ...state, isTrashOpen: action.value }
		case "SET_MEAL_TYPE_MANAGER_OPEN":
			return { ...state, isMealTypeManagerOpen: action.value }
		case "SET_SELECTED_TEMPLATE_ID":
			return { ...state, selectedTemplateId: action.value }
		case "SET_TEMPLATE_TARGET_DATES":
			return { ...state, templateTargetDates: action.value }
		default:
			return state
	}
}

const initialPlanningBoardState: PlanningBoardState = {
	selectedDays: new Set(),
	isTemplateModalOpen: false,
	isTrashOpen: false,
	isMealTypeManagerOpen: false,
	selectedTemplateId: null,
	templateTargetDates: [],
}

/**
 * Calendário do mês. `month` (YYYY-MM) vem da URL e `onMonthChange` a atualiza: voltar da página do
 * dia cai no mês daquele dia. Clicar num dia abre a página dele; Ctrl/Shift+clique seleciona.
 */
export function PlanningBoard({ month, onMonthChange }: { month?: string; onMonthChange: (month: string) => void }) {
	const navigate = useNavigate()
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const kitchenId = Number(kitchenIdStr)
	const [boardState, dispatch] = useReducer(planningBoardReducer, initialPlanningBoardState)
	const { selectedDays, isTemplateModalOpen, isTrashOpen, isMealTypeManagerOpen, selectedTemplateId, templateTargetDates } = boardState

	const currentMonth = month ? parseISO(`${month}-01`) : new Date()
	const monthStart = startOfMonth(currentMonth)
	const monthEnd = endOfMonth(monthStart)
	// Semana de segunda a domingo, a mesma do cardápio semanal (dia 1 = segunda): com o grid
	// começando no domingo, tocar num domingo aplicava o cardápio na semana da linha de cima.
	const startDate = startOfWeek(monthStart, { weekStartsOn: 1 })
	const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 })

	const { data: menus } = useDailyMenus(kitchenId, startDate, endDate)
	const { data: templates, isLoading: templatesLoading } = useMenuTemplates(kitchenId)
	const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null)
	const [foundRecipeId, setFoundRecipeId] = useState<string | null>(null)
	const [dropTarget, setDropTarget] = useState<string | null>(null)
	const [shiftRequest, setShiftRequest] = useState<ShiftRequest | null>(null)
	const foundDays = new Set(
		(menus ?? [])
			.filter((m) => foundRecipeId && m.service_date && (m.menu_items ?? []).some((i) => i.recipe_origin_id === foundRecipeId))
			.map((m) => m.service_date as string)
	)
	const { data: availability, error: availabilityError } = usePlanningAvailability(kitchenId, format(startDate, "yyyy-MM-dd"), format(endDate, "yyyy-MM-dd"))
	// Insumos distintos com aviso, por dia: o marcador diz "olhe este dia", o detalhe fica no painel.
	const shortagesByDay = new Map<string, Set<string>>()
	for (const warning of availability?.warnings ?? []) {
		const set = shortagesByDay.get(warning.date) ?? new Set()
		set.add(warning.ingredientId)
		shortagesByDay.set(warning.date, set)
	}

	const calendarDays = eachDayOfInterval({ start: startDate, end: endDate })

	const weekDays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]

	// Week calculation helpers
	const getWeekStart = (date: Date): Date => startOfWeek(date, { weekStartsOn: 1 })

	const getWeekDays = (weekStart: Date): Date[] => {
		return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
	}

	const handleApplyTemplateToWeek = async (clickedDate: Date) => {
		if (!selectedTemplateId || !kitchenId) return

		const weekStart = getWeekStart(clickedDate)
		const weekDays = getWeekDays(weekStart)
		const targetDates = weekDays.map((d) => format(d, "yyyy-MM-dd"))

		// Set dates and open dialog
		dispatch({ type: "SET_TEMPLATE_TARGET_DATES", value: targetDates })
		dispatch({ type: "SET_TEMPLATE_MODAL_OPEN", value: true })
	}

	const handleDayClick = (day: Date, e: React.MouseEvent) => {
		// If template is selected, apply it to the week
		if (selectedTemplateId) {
			handleApplyTemplateToWeek(day)
			return
		}

		// Chave é a data civil: `toISOString()` de meia-noite local já é o dia anterior em UTC.
		const dayStr = format(day, "yyyy-MM-dd")

		if (e.shiftKey && selectionAnchor) {
			// Shift+clique estende do último dia escolhido até este (a semana inteira num gesto).
			const [from, to] = [selectionAnchor, dayStr].toSorted()
			const range = eachDayOfInterval({ start: parseISO(from as string), end: parseISO(to as string) }).map((d) => format(d, "yyyy-MM-dd"))
			dispatch({ type: "SET_SELECTED_DAYS", value: new Set([...selectedDays, ...range]) })
		} else if (e.ctrlKey || e.metaKey || e.shiftKey) {
			const newSelected = new Set(selectedDays)
			if (newSelected.has(dayStr)) newSelected.delete(dayStr)
			else newSelected.add(dayStr)
			dispatch({ type: "SET_SELECTED_DAYS", value: newSelected })
			setSelectionAnchor(dayStr)
		} else {
			// Single selection (View Drawer)
			// O dia abre na página dele: lá cabe o dia inteiro, com a semana no topo para navegar.
			if (kitchenIdStr) navigate({ to: "/kitchen/$kitchenId/planning/$date", params: { kitchenId: kitchenIdStr, date: format(day, "yyyy-MM-dd") } })
		}
	}

	const handleMonthChange = (direction: -1 | 0 | 1) => {
		if (direction === -1) {
			onMonthChange(format(subMonths(currentMonth, 1), "yyyy-MM"))
		} else if (direction === 1) {
			onMonthChange(format(addMonths(currentMonth, 1), "yyyy-MM"))
		} else {
			onMonthChange(format(new Date(), "yyyy-MM"))
		}
	}

	const getMenusForDay = (day: Date) => {
		if (!menus) return []
		const dayStr = format(day, "yyyy-MM-dd")
		return menus.filter((m) => m.service_date === dayStr)
	}

	return (
		<div className="space-y-4 h-full flex flex-col">
			{/* Header */}
			<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				{/* Left side: Month navigation */}
				<div className="flex flex-col gap-2 sm:gap-3 sm:flex-row sm:items-center">
					<div className="flex items-center gap-2">
						<div className="flex items-center ">
							<Button variant="ghost" size="sm" onClick={() => handleMonthChange(-1)} aria-label="Mês anterior" className="size-8 p-0">
								<ChevronLeft className="size-4" />
							</Button>
							<Tooltip>
								<TooltipTrigger
									render={
										<Button variant="ghost" size="sm" onClick={() => handleMonthChange(0)} className="h-8 px-2 text-xs">
											<h2 suppressHydrationWarning className="text-xl capitalize sm:w-sm sm:text-display">
												{format(currentMonth, "MMMM yyyy", { locale: ptBR })}
											</h2>
										</Button>
									}
								></TooltipTrigger>
								<TooltipContent>Voltar ao mês atual</TooltipContent>
							</Tooltip>
							<Button variant="ghost" size="sm" onClick={() => handleMonthChange(1)} aria-label="Próximo mês" className="size-8 p-0">
								<ChevronRight className="size-4" />
							</Button>
						</div>
					</div>
				</div>

				{/* Right side: Action buttons */}
				<div className="flex flex-wrap gap-1.5">
					{kitchenIdStr && (
						<Tooltip>
							<TooltipTrigger
								render={
									<Button
										variant="outline"
										size="sm"
										className="h-9"
										nativeButton={false}
										render={
											<Link to="/kitchen/$kitchenId/weekly-menus" params={{ kitchenId: kitchenIdStr }}>
												<CalendarDays className="size-4 sm:mr-2" />
												<span className="hidden sm:inline">Cardápios Semanais</span>
											</Link>
										}
									/>
								}
							></TooltipTrigger>
							<TooltipContent>Gerenciar Cardápios Semanais</TooltipContent>
						</Tooltip>
					)}
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									aria-label="Gerenciar Tipos de Refeição"
									variant="ghost"
									size="sm"
									onClick={() => dispatch({ type: "SET_MEAL_TYPE_MANAGER_OPEN", value: true })}
									className="size-9 p-0"
								>
									<Settings className="size-4" />
								</Button>
							}
						></TooltipTrigger>
						<TooltipContent>Gerenciar Tipos de Refeição</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger
							render={
								<Button aria-label="Lixeira" variant="ghost" size="sm" onClick={() => dispatch({ type: "SET_TRASH_OPEN", value: true })} className="size-9 p-0">
									<Trash2 className="size-4" />
								</Button>
							}
						></TooltipTrigger>
						<TooltipContent>Lixeira</TooltipContent>
					</Tooltip>
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							// Sem isto o diálogo abria com a lista VAZIA: dizia "aos 0 dias
							// selecionados" e o servidor recusava. A multisseleção não servia para nada.
							dispatch({ type: "SET_TEMPLATE_TARGET_DATES", value: [...selectedDays].toSorted() })
							dispatch({ type: "SET_TEMPLATE_MODAL_OPEN", value: true })
						}}
						disabled={selectedDays.size === 0}
						className="h-9"
					>
						<CalendarIcon className="size-4 sm:mr-2" />
						<span className="hidden sm:inline">Aplicar</span>
						<span className="ml-1">({selectedDays.size})</span>
					</Button>
				</div>
			</div>

			{/* Cardápios Semanais Palette */}
			<TemplatePalette
				// Só semanais: evento/exceção não se aplicam por aqui (o aplicador recusa com
				// NOT_WEEKLY_TEMPLATE) — oferecê-los era levar o usuário a um beco sem saída.
				templates={(templates || []).filter((t) => t.template_type === "weekly")}
				selectedTemplateId={selectedTemplateId}
				onSelectTemplate={(id) => dispatch({ type: "SET_SELECTED_TEMPLATE_ID", value: id })}
				onCreateNew={() =>
					kitchenIdStr
						? navigate({
								to: "/kitchen/$kitchenId/weekly-menus/new",
								params: { kitchenId: kitchenIdStr },
							})
						: undefined
				}
				isLoading={templatesLoading}
			/>

			{/* Busca e edição em lote: localizar uma preparação marca os dias dela; com dias
			    selecionados (Ctrl/Shift+clique ou "selecionar os dias") aparecem as ações. */}
			<FindRecipeBar
				menus={menus ?? []}
				highlighted={foundRecipeId}
				onHighlight={setFoundRecipeId}
				onSelectDays={(dates) => {
					dispatch({ type: "SET_SELECTED_DAYS", value: new Set(dates) })
					setSelectionAnchor(dates.at(-1) ?? null)
				}}
			/>
			{selectedDays.size > 0 ? (
				<BulkDayToolbar
					kitchenId={kitchenId}
					dates={[...selectedDays].toSorted()}
					menus={menus ?? []}
					onClearSelection={() => dispatch({ type: "SET_SELECTED_DAYS", value: new Set() })}
					onShift={() => setShiftRequest({ dates: [...selectedDays].toSorted(), offsetDays: 7 })}
				/>
			) : (
				<p className="text-caption text-muted-foreground">
					Ctrl+clique seleciona dias; Shift+clique, o intervalo. Arraste um dia (ou a seleção) sobre outro para mover ou copiar.
				</p>
			)}

			{/* Calendar Grid */}
			<div className="border rounded-md bg-card overflow-hidden select-none">
				{/* Week Days Header */}
				<div className="grid grid-cols-7 border-b bg-muted/40 text-center">
					{weekDays.map((day) => (
						<div key={day} className="py-2 text-label text-muted-foreground">
							{day}
						</div>
					))}
				</div>

				{/* Days */}
				<div className="grid grid-cols-7 auto-rows-[minmax(140px,auto)] divide-x divide-y">
					{calendarDays.map((day, _dayIdx) => {
						const dayMenus = getMenusForDay(day)
						const isCurrentMonth = isSameMonth(day, monthStart)
						const isToday = isSameDay(day, new Date())
						const dayKey = format(day, "yyyy-MM-dd")
						const isSelected = selectedDays.has(dayKey)
						// Dia em que está a preparação procurada na busca.
						const isFound = foundDays.has(dayKey)
						const isDropTarget = dropTarget === dayKey

						const totalHeadcount = dayMenus.reduce((acc, m) => acc + (m.forecasted_headcount || 0), 0)
						const hasMenus = dayMenus.length > 0
						// Refeição aplicada sem efetivo: o total do dia estaria incompleto, então o selo diz "a definir".
						const pendingMeals = dayMenus.filter(isHeadcountPending).map((m) => m.meal_type?.name || "Refeição")
						const shortages = shortagesByDay.get(format(day, "yyyy-MM-dd"))?.size ?? 0

						return (
							<button
								key={day.toString()}
								type="button"
								// Nome acessível com a data inteira: "25" sozinho não diz de que mês é o dia.
								aria-label={`${format(day, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}${hasMenus ? ` — ${dayMenus.length} ${dayMenus.length === 1 ? "refeição planejada" : "refeições planejadas"}` : ""}${pendingMeals.length > 0 ? ` — efetivo a definir: ${pendingMeals.join(", ")}` : ""}${shortages > 0 ? ` — ${shortages} ${shortages === 1 ? "insumo pode faltar" : "insumos podem faltar"}` : ""}`}
								data-date={format(day, "yyyy-MM-dd")}
								onClick={(e) => handleDayClick(day, e)}
								// Arrastar um dia (ou a seleção que o contém) sobre outro abre o mover/copiar.
								draggable={hasMenus}
								onDragStart={(e) => {
									e.dataTransfer.setData("text/plain", dayKey)
									e.dataTransfer.effectAllowed = "copyMove"
								}}
								onDragOver={(e) => {
									e.preventDefault()
									if (dropTarget !== dayKey) setDropTarget(dayKey)
								}}
								onDragLeave={() => setDropTarget((current) => (current === dayKey ? null : current))}
								onDrop={(e) => {
									e.preventDefault()
									setDropTarget(null)
									const source = e.dataTransfer.getData("text/plain")
									if (!source || source === dayKey) return
									const dates = selectedDays.has(source) ? [...selectedDays].toSorted() : [source]
									setShiftRequest({ dates, offsetDays: differenceInCalendarDays(parseISO(dayKey), parseISO(source)) })
								}}
								className={cn(
									"p-2 relative transition-colors cursor-pointer group text-left",
									"focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2",
									!isCurrentMonth && "bg-muted/10 text-muted-foreground",
									isCurrentMonth && "bg-background",
									isToday && "bg-primary/5",
									isFound && !isSelected && "ring-2 ring-warning ring-inset",
									isDropTarget && "ring-2 ring-primary ring-inset bg-primary/15",
									isSelected ? "ring-2 ring-primary ring-inset bg-primary/10" : "hover:bg-muted/50"
								)}
							>
								<div className="flex items-center justify-between mb-2">
									<span className="flex items-center gap-1">
										<span
											className={cn("text-subheading size-7 flex items-center justify-center rounded-full", isToday && "bg-primary text-primary-foreground")}
										>
											{format(day, "d")}
										</span>
										{/* Insumo sem ata, empenho ou estoque no horizonte do dia: não impede, avisa. */}
										{/* Insumo que pode faltar: o resumo abre ao passar o mouse; o detalhe, na página do dia. */}
										{shortages > 0 && (
											<HoverCard>
												<HoverCardTrigger delay={150} render={<span className="inline-flex" />}>
													<AlertTriangle className="size-3.5 text-warning" aria-hidden="true" />
												</HoverCardTrigger>
												<HoverCardContent side="right" align="start" className="w-80">
													<DayAvailabilityList warnings={(availability?.warnings ?? []).filter((w) => w.date === format(day, "yyyy-MM-dd"))} />
												</HoverCardContent>
											</HoverCard>
										)}
									</span>
									{hasMenus && (
										<Badge
											variant={pendingMeals.length > 0 ? "warning" : "outline"}
											className={cn("text-[10px] h-5 px-1 font-normal gap-1", pendingMeals.length === 0 && "text-muted-foreground")}
										>
											<Users className="size-3" />
											{pendingMeals.length > 0 ? "a definir" : totalHeadcount > 0 ? totalHeadcount : "-"}
										</Badge>
									)}
								</div>

								<div className="space-y-1">
									{dayMenus.map((menu) => {
										const mealName = menu.meal_type?.name || "Refeição"
										const itemCount = menu.menu_items?.length || 0
										// Usa token semântico: success = publicado, warning = rascunho
										const statusColor = menu.status === "PUBLISHED" ? "bg-success" : "bg-warning"

										return (
											<div key={menu.id} className="text-xs truncate flex items-center gap-1.5 px-1.5 py-0.5 rounded-sm hover:bg-accent">
												<span className={cn("size-1.5 rounded-full", statusColor)} />
												<span className="text-subheading">{mealName.substring(0, 3)}</span>
												<span className="text-muted-foreground ml-auto">{itemCount}</span>
											</div>
										)
									})}
								</div>
							</button>
						)
					})}
				</div>
			</div>

			<AvailabilityStatusNote checks={availability?.checks ?? null} error={availabilityError} />

			{/*
			 * O período é o do calendário na tela (inclui a semana que transborda o
			 * mês), e não o mês civil: é o que a nutricionista está de fato olhando.
			 */}
			{Number.isInteger(kitchenId) && kitchenId > 0 && (
				<ExpiringInPeriod kitchenId={kitchenId} from={format(startDate, "yyyy-MM-dd")} until={format(endDate, "yyyy-MM-dd")} />
			)}

			<ShiftDaysDialog
				key={shiftRequest ? `shift:${shiftRequest.dates.join(",")}:${shiftRequest.offsetDays}` : "shift:closed"}
				kitchenId={kitchenId}
				request={shiftRequest}
				onClose={() => setShiftRequest(null)}
				onDone={() => dispatch({ type: "SET_SELECTED_DAYS", value: new Set() })}
			/>

			<ApplyTemplateDialog
				// Remonta a cada abertura: o estado interno (template, modo de conflito) nasce da
				// escolha atual da paleta, e não da abertura anterior.
				key={isTemplateModalOpen ? `open:${selectedTemplateId ?? ""}` : "closed"}
				initialTemplateId={selectedTemplateId}
				open={isTemplateModalOpen}
				onClose={() => {
					dispatch({ type: "SET_TEMPLATE_MODAL_OPEN", value: false })
					dispatch({ type: "SET_TEMPLATE_TARGET_DATES", value: [] })
				}}
				targetDates={templateTargetDates}
				kitchenId={kitchenId || 0}
				plannedDates={(menus ?? []).flatMap((m) => (m.service_date ? [m.service_date] : []))}
			/>

			<TrashDrawer open={isTrashOpen} onClose={() => dispatch({ type: "SET_TRASH_OPEN", value: false })} kitchenId={kitchenId || 0} />

			<MealTypeManager open={isMealTypeManagerOpen} onClose={() => dispatch({ type: "SET_MEAL_TYPE_MANAGER_OPEN", value: false })} kitchenId={kitchenId} />
		</div>
	)
}
