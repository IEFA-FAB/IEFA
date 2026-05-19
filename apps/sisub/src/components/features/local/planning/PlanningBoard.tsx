import { Link, useNavigate, useParams } from "@tanstack/react-router"
import {
	addDays,
	addMonths,
	eachDayOfInterval,
	endOfMonth,
	endOfWeek,
	format,
	isSameDay,
	isSameMonth,
	startOfDay,
	startOfMonth,
	startOfWeek,
	subMonths,
} from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarDays, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Settings, Trash2, Users } from "lucide-react"
import { useReducer } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDailyMenus } from "@/hooks/data/usePlanning"
import { useMenuTemplates } from "@/hooks/data/useTemplates"
import { cn } from "@/lib/cn"
import { ApplyTemplateDialog } from "./ApplyTemplateDialog"
import { DayDrawer } from "./DayDrawer"
import { MealTypeManager } from "./MealTypeManager"
import { TemplatePalette } from "./TemplatePalette"
import { TrashDrawer } from "./TrashDrawer"

// ─── Reducer ─────────────────────────────────────────────────────────────────

type PlanningBoardState = {
	currentMonth: Date
	selectedDay: Date | null
	selectedDays: Set<string>
	isDrawerOpen: boolean
	isTemplateModalOpen: boolean
	isTrashOpen: boolean
	isMealTypeManagerOpen: boolean
	selectedTemplateId: string | null
	templateTargetDates: string[]
}

type PlanningBoardAction =
	| { type: "SET_CURRENT_MONTH"; value: Date }
	| { type: "SET_SELECTED_DAY"; value: Date | null }
	| { type: "SET_SELECTED_DAYS"; value: Set<string> }
	| { type: "SET_DRAWER_OPEN"; value: boolean }
	| { type: "SET_TEMPLATE_MODAL_OPEN"; value: boolean }
	| { type: "SET_TRASH_OPEN"; value: boolean }
	| { type: "SET_MEAL_TYPE_MANAGER_OPEN"; value: boolean }
	| { type: "SET_SELECTED_TEMPLATE_ID"; value: string | null }
	| { type: "SET_TEMPLATE_TARGET_DATES"; value: string[] }

function planningBoardReducer(state: PlanningBoardState, action: PlanningBoardAction): PlanningBoardState {
	switch (action.type) {
		case "SET_CURRENT_MONTH":
			return { ...state, currentMonth: action.value }
		case "SET_SELECTED_DAY":
			return { ...state, selectedDay: action.value }
		case "SET_SELECTED_DAYS":
			return { ...state, selectedDays: action.value }
		case "SET_DRAWER_OPEN":
			return { ...state, isDrawerOpen: action.value }
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
	currentMonth: new Date(),
	selectedDay: null,
	selectedDays: new Set(),
	isDrawerOpen: false,
	isTemplateModalOpen: false,
	isTrashOpen: false,
	isMealTypeManagerOpen: false,
	selectedTemplateId: null,
	templateTargetDates: [],
}

export function PlanningBoard() {
	const navigate = useNavigate()
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const kitchenId = Number(kitchenIdStr)
	const [boardState, dispatch] = useReducer(planningBoardReducer, initialPlanningBoardState)
	const {
		currentMonth,
		selectedDay,
		selectedDays,
		isDrawerOpen,
		isTemplateModalOpen,
		isTrashOpen,
		isMealTypeManagerOpen,
		selectedTemplateId,
		templateTargetDates,
	} = boardState

	const monthStart = startOfMonth(currentMonth)
	const monthEnd = endOfMonth(monthStart)
	const startDate = startOfWeek(monthStart)
	const endDate = endOfWeek(monthEnd)

	const { data: menus } = useDailyMenus(kitchenId, startDate, endDate)
	const { data: templates, isLoading: templatesLoading } = useMenuTemplates(kitchenId)

	const calendarDays = eachDayOfInterval({ start: startDate, end: endDate })

	const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

	// Week calculation helpers
	const getWeekStart = (date: Date): Date => {
		const d = startOfDay(date)
		const day = d.getDay()
		const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday
		return new Date(d.setDate(diff))
	}

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

		const dayStr = day.toISOString()

		if (e.ctrlKey || e.metaKey || e.shiftKey) {
			// Multi-selection mode
			const newSelected = new Set(selectedDays)
			if (newSelected.has(dayStr)) {
				newSelected.delete(dayStr)
			} else {
				newSelected.add(dayStr)
			}
			dispatch({ type: "SET_SELECTED_DAYS", value: newSelected })
		} else {
			// Single selection (View Drawer)
			dispatch({ type: "SET_SELECTED_DAY", value: day })
			dispatch({ type: "SET_DRAWER_OPEN", value: true })
		}
	}

	const handleMonthChange = (direction: -1 | 0 | 1) => {
		if (direction === -1) {
			dispatch({ type: "SET_CURRENT_MONTH", value: subMonths(currentMonth, 1) })
		} else if (direction === 1) {
			dispatch({ type: "SET_CURRENT_MONTH", value: addMonths(currentMonth, 1) })
		} else {
			dispatch({ type: "SET_CURRENT_MONTH", value: new Date() })
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
											<h2 suppressHydrationWarning className="w-sm text-xl sm:text-2xl font-bold tracking-tight capitalize">
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
								<Button variant="ghost" size="sm" onClick={() => dispatch({ type: "SET_MEAL_TYPE_MANAGER_OPEN", value: true })} className="size-9 p-0">
									<Settings className="size-4" />
								</Button>
							}
						></TooltipTrigger>
						<TooltipContent>Gerenciar Tipos de Refeição</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger
							render={
								<Button variant="ghost" size="sm" onClick={() => dispatch({ type: "SET_TRASH_OPEN", value: true })} className="size-9 p-0">
									<Trash2 className="size-4" />
								</Button>
							}
						></TooltipTrigger>
						<TooltipContent>Lixeira</TooltipContent>
					</Tooltip>
					<Button
						variant="outline"
						size="sm"
						onClick={() => dispatch({ type: "SET_TEMPLATE_MODAL_OPEN", value: true })}
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
				templates={templates || []}
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

			{/* Calendar Grid */}
			<div className="border rounded-md bg-card overflow-hidden select-none">
				{/* Week Days Header */}
				<div className="grid grid-cols-7 border-b bg-muted/40 text-center">
					{weekDays.map((day) => (
						<div key={day} className="py-2 text-sm font-medium text-muted-foreground uppercase tracking-wider">
							{day}
						</div>
					))}
				</div>

				{/* Days */}
				<div className="grid grid-cols-7 auto-rows-[140px] divide-x divide-y">
					{calendarDays.map((day, _dayIdx) => {
						const dayMenus = getMenusForDay(day)
						const isCurrentMonth = isSameMonth(day, monthStart)
						const isToday = isSameDay(day, new Date())
						const isSelected = selectedDays.has(day.toISOString())

						const totalHeadcount = dayMenus.reduce((acc, m) => acc + (m.forecasted_headcount || 0), 0)
						const hasMenus = dayMenus.length > 0

						return (
							<button
								key={day.toString()}
								type="button"
								onClick={(e) => handleDayClick(day, e)}
								className={cn(
									"p-2 relative transition-colors cursor-pointer group text-left",
									"focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2",
									!isCurrentMonth && "bg-muted/10 text-muted-foreground",
									isCurrentMonth && "bg-background",
									isToday && "bg-primary/5",
									isSelected ? "ring-2 ring-primary ring-inset bg-primary/10" : "hover:bg-muted/50"
								)}
							>
								<div className="flex items-center justify-between mb-2">
									<span
										className={cn("text-sm font-medium size-7 flex items-center justify-center rounded-full", isToday && "bg-primary text-primary-foreground")}
									>
										{format(day, "d")}
									</span>
									{hasMenus && (
										<Badge variant="outline" className="text-[10px] h-5 px-1 font-normal text-muted-foreground gap-1">
											<Users className="size-3" />
											{totalHeadcount > 0 ? totalHeadcount : "-"}
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
												<span className="font-medium text-foreground/80">{mealName.substring(0, 3)}</span>
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

			<DayDrawer open={isDrawerOpen} onClose={() => dispatch({ type: "SET_DRAWER_OPEN", value: false })} date={selectedDay} kitchenId={kitchenId} />

			<ApplyTemplateDialog
				open={isTemplateModalOpen}
				onClose={() => {
					dispatch({ type: "SET_TEMPLATE_MODAL_OPEN", value: false })
					dispatch({ type: "SET_TEMPLATE_TARGET_DATES", value: [] })
				}}
				targetDates={templateTargetDates}
				kitchenId={kitchenId || 0}
			/>

			<TrashDrawer open={isTrashOpen} onClose={() => dispatch({ type: "SET_TRASH_OPEN", value: false })} kitchenId={kitchenId || 0} />

			<MealTypeManager open={isMealTypeManagerOpen} onClose={() => dispatch({ type: "SET_MEAL_TYPE_MANAGER_OPEN", value: false })} kitchenId={kitchenId} />
		</div>
	)
}
