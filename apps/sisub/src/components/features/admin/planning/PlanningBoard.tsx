import { Badge, Button } from "@iefa/ui";
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
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
	Calendar as CalendarIcon,
	ChevronLeft,
	ChevronRight,
	Settings,
	Trash2,
	Users,
} from "lucide-react";
import { useState } from "react";
import { useKitchenSelector } from "@/hooks/data/useKitchens";
import { useDailyMenus } from "@/hooks/data/usePlanning";
import { useMenuTemplates } from "@/hooks/data/useTemplates";
import { ApplyTemplateDialog } from "./ApplyTemplateDialog";
import { DayDrawer } from "./DayDrawer";
import { KitchenSelector } from "./KitchenSelector";
import { MealTypeManager } from "./MealTypeManager";
import { TemplateManager } from "./TemplateManager";
import { TemplatePalette } from "./TemplatePalette";
import { TrashDrawer } from "./TrashDrawer";

export function PlanningBoard() {
	const { kitchenId } = useKitchenSelector();
	const [currentMonth, setCurrentMonth] = useState(new Date());
	const [selectedDay, setSelectedDay] = useState<Date | null>(null); // For Drawer
	const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set()); // For Bulk Actions
	const [isDrawerOpen, setIsDrawerOpen] = useState(false);
	const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
	const [isTrashOpen, setIsTrashOpen] = useState(false);
	const [isMealTypeManagerOpen, setIsMealTypeManagerOpen] = useState(false);
	const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);

	// Template Brush System states
	const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
		null,
	);
	const [templateTargetDates, setTemplateTargetDates] = useState<string[]>([]);

	const monthStart = startOfMonth(currentMonth);
	const monthEnd = endOfMonth(monthStart);
	const startDate = startOfWeek(monthStart);
	const endDate = endOfWeek(monthEnd);

	const { data: menus } = useDailyMenus(kitchenId, startDate, endDate);
	const { data: templates, isLoading: templatesLoading } =
		useMenuTemplates(kitchenId);

	const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

	const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

	// Week calculation helpers
	const getWeekStart = (date: Date): Date => {
		const d = startOfDay(date);
		const day = d.getDay();
		const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
		return new Date(d.setDate(diff));
	};

	const getWeekDays = (weekStart: Date): Date[] => {
		return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
	};

	const getWeekKey = (date: Date): string => {
		return format(getWeekStart(date), "yyyy-MM-dd");
	};

	const isInWeek = (date: Date, weekKey: string | null): boolean => {
		if (!weekKey) return false;
		return getWeekKey(date) === weekKey;
	};

	const handleApplyTemplateToWeek = async (clickedDate: Date) => {
		if (!selectedTemplateId || !kitchenId) return;

		const weekStart = getWeekStart(clickedDate);
		const weekDays = getWeekDays(weekStart);
		const targetDates = weekDays.map((d) => format(d, "yyyy-MM-dd"));

		// Set dates and open dialog
		setTemplateTargetDates(targetDates);
		setIsTemplateModalOpen(true);
	};

	const handleDayClick = (day: Date, e: React.MouseEvent) => {
		// If template is selected, apply it to the week
		if (selectedTemplateId) {
			handleApplyTemplateToWeek(day);
			return;
		}

		const dayStr = day.toISOString();

		if (e.ctrlKey || e.metaKey || e.shiftKey) {
			// Multi-selection mode
			const newSelected = new Set(selectedDays);
			if (newSelected.has(dayStr)) {
				newSelected.delete(dayStr);
			} else {
				newSelected.add(dayStr);
			}
			setSelectedDays(newSelected);
		} else {
			// Single selection (View Drawer)
			setSelectedDay(day);
			setIsDrawerOpen(true);
		}
	};

	const handleMonthChange = (direction: -1 | 0 | 1) => {
		if (direction === -1) {
			setCurrentMonth((prev) => subMonths(prev, 1));
		} else if (direction === 1) {
			setCurrentMonth((prev) => addMonths(prev, 1));
		} else {
			setCurrentMonth(new Date());
		}
	};

	const getMenusForDay = (day: Date) => {
		if (!menus) return [];
		const dayStr = format(day, "yyyy-MM-dd");
		return menus.filter((m) => m.service_date === dayStr);
	};

	return (
		<div className="space-y-4 h-full flex flex-col">
			{/* Header */}
			<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				{/* Left side: Kitchen selector + Month navigation */}
				<div className="flex flex-col gap-2 sm:gap-3 sm:flex-row sm:items-center">
					<KitchenSelector />
					<div className="flex items-center gap-2">
						<h2 className="text-xl sm:text-2xl font-bold tracking-tight capitalize">
							{format(currentMonth, "MMMM yyyy", { locale: ptBR })}
						</h2>
						<div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => handleMonthChange(-1)}
								aria-label="Mês anterior"
								className="h-8 w-8 p-0"
							>
								<ChevronLeft className="w-4 h-4" />
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => handleMonthChange(0)}
								className="h-8 px-2 text-xs"
							>
								Hoje
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => handleMonthChange(1)}
								aria-label="Próximo mês"
								className="h-8 w-8 p-0"
							>
								<ChevronRight className="w-4 h-4" />
							</Button>
						</div>
					</div>
				</div>

				{/* Right side: Action buttons */}
				<div className="flex flex-wrap gap-1.5">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setIsTemplateManagerOpen(true)}
						title="Gerenciar Templates"
						className="h-9"
					>
						<CalendarIcon className="w-4 h-4 sm:mr-2" />
						<span className="hidden sm:inline">Templates</span>
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setIsMealTypeManagerOpen(true)}
						title="Gerenciar Tipos de Refeição"
						className="h-9 w-9 p-0"
					>
						<Settings className="w-4 h-4" />
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setIsTrashOpen(true)}
						title="Lixeira"
						className="h-9 w-9 p-0"
					>
						<Trash2 className="w-4 h-4" />
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setIsTemplateModalOpen(true)}
						disabled={selectedDays.size === 0}
						className="h-9"
					>
						<CalendarIcon className="w-4 h-4 sm:mr-2" />
						<span className="hidden sm:inline">Aplicar</span>
						<span className="ml-1">({selectedDays.size})</span>
					</Button>
				</div>
			</div>

			{/* Template Palette - New! */}
			<TemplatePalette
				templates={templates || []}
				selectedTemplateId={selectedTemplateId}
				onSelectTemplate={setSelectedTemplateId}
				onCreateNew={() => setIsTemplateManagerOpen(true)}
				isLoading={templatesLoading}
			/>

			{/* Calendar Grid */}
			<div className="border rounded-lg bg-card shadow-sm overflow-hidden select-none">
				{/* Week Days Header */}
				<div className="grid grid-cols-7 border-b bg-muted/40 text-center">
					{weekDays.map((day) => (
						<div
							key={day}
							className="py-2 text-sm font-medium text-muted-foreground uppercase tracking-wider"
						>
							{day}
						</div>
					))}
				</div>

				{/* Days */}
				<div className="grid grid-cols-7 auto-rows-[140px] divide-x divide-y">
					{calendarDays.map((day, dayIdx) => {
						const dayMenus = getMenusForDay(day);
						const isCurrentMonth = isSameMonth(day, monthStart);
						const isToday = isSameDay(day, new Date());
						const isSelected = selectedDays.has(day.toISOString());

						// Calculate total headcount for the day (sum of max headcount or simple sum logic depending on business rule)
						// Assuming simplified view: sum of all meals
						const totalHeadcount = dayMenus.reduce(
							(acc, m) => acc + (m.forecasted_headcount || 0),
							0,
						);
						const hasMenus = dayMenus.length > 0;

						return (
							<div
								key={day.toString()}
								onClick={(e) => handleDayClick(day, e)}
								className={`
                  p-2 relative transition-colors cursor-pointer group
                  ${!isCurrentMonth ? "bg-muted/10 text-muted-foreground" : "bg-background"}
                  ${isToday ? "bg-primary/5" : ""}
                  ${isSelected ? "ring-2 ring-primary ring-inset bg-primary/10" : "hover:bg-muted/50"}
                `}
							>
								<div className="flex items-center justify-between mb-2">
									<span
										className={`
                    text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full
                    ${isToday ? "bg-primary text-primary-foreground" : ""}
                  `}
									>
										{format(day, "d")}
									</span>
									{hasMenus && (
										<Badge
											variant="outline"
											className="text-[10px] h-5 px-1 font-normal text-muted-foreground gap-1"
										>
											<Users className="w-3 h-3" />
											{totalHeadcount > 0 ? totalHeadcount : "-"}
										</Badge>
									)}
								</div>

								{/* Day Content Summary */}
								<div className="space-y-1">
									{dayMenus.map((menu) => {
										const mealName = menu.meal_type?.name || "Refeição";
										const itemCount = menu.menu_items?.length || 0;
										const statusColor =
											menu.status === "PUBLISHED"
												? "bg-green-500"
												: "bg-amber-500";

										return (
											<div
												key={menu.id}
												className="text-xs truncate flex items-center gap-1.5 px-1.5 py-0.5 rounded-sm hover:bg-accent"
											>
												<span
													className={`w-1.5 h-1.5 rounded-full ${statusColor}`}
												/>
												<span className="font-medium text-foreground/80">
													{mealName.substring(0, 3)}
												</span>
												<span className="text-muted-foreground ml-auto">
													{itemCount}
												</span>
											</div>
										);
									})}
								</div>
							</div>
						);
					})}
				</div>
			</div>

			<DayDrawer
				open={isDrawerOpen}
				onClose={() => setIsDrawerOpen(false)}
				date={selectedDay}
			/>

			<ApplyTemplateDialog
				open={isTemplateModalOpen}
				onClose={() => {
					setIsTemplateModalOpen(false);
					setTemplateTargetDates([]);
				}}
				targetDates={templateTargetDates}
				kitchenId={kitchenId || 0}
			/>

			<TrashDrawer
				open={isTrashOpen}
				onClose={() => setIsTrashOpen(false)}
				kitchenId={kitchenId || 0}
			/>

			<MealTypeManager
				open={isMealTypeManagerOpen}
				onClose={() => setIsMealTypeManagerOpen(false)}
				kitchenId={kitchenId}
			/>

			<TemplateManager
				open={isTemplateManagerOpen}
				onClose={() => setIsTemplateManagerOpen(false)}
				kitchenId={kitchenId}
			/>
		</div>
	);
}
