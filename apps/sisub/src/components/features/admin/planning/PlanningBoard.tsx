import { Badge, Button } from "@iefa/ui";
import {
	addMonths,
	eachDayOfInterval,
	endOfMonth,
	endOfWeek,
	format,
	isSameDay,
	isSameMonth,
	startOfMonth,
	startOfWeek,
	subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
	Calendar as CalendarIcon,
	ChevronLeft,
	ChevronRight,
	Trash2,
	Users,
} from "lucide-react";
import { useState } from "react";
import { useDailyMenus } from "@/hooks/data/usePlanning";
import type { DailyMenuWithItems } from "@/types/domain/planning";
import { ApplyTemplateDialog } from "./ApplyTemplateDialog";
import { DayDrawer } from "./DayDrawer";
import { TrashDrawer } from "./TrashDrawer";

// Mock kitchen ID for development
const KITCHEN_ID = 1;

export function PlanningBoard() {
	const [currentMonth, setCurrentMonth] = useState(new Date());
	const [selectedDay, setSelectedDay] = useState<Date | null>(null); // For Drawer
	const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set()); // For Bulk Actions
	const [isDrawerOpen, setIsDrawerOpen] = useState(false);
	const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
	const [isTrashOpen, setIsTrashOpen] = useState(false);

	const monthStart = startOfMonth(currentMonth);
	const monthEnd = endOfMonth(monthStart);
	const startDate = startOfWeek(monthStart);
	const endDate = endOfWeek(monthEnd);

	const { data: menus, isLoading } = useDailyMenus(
		KITCHEN_ID,
		startDate,
		endDate,
	);

	const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

	const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

	const handleDayClick = (day: Date, e: React.MouseEvent) => {
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
			// If we have multi-selection active, clearing it might be annoying, but standard behavior usually clears.
			// Let's keep it simple: Click opens drawer.
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
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<h2 className="text-2xl font-bold tracking-tight">
						Planejamento: {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
					</h2>
					<div className="flex items-center gap-1 bg-muted rounded-md p-1">
						<Button
							variant="ghost"
							size="icon"
							onClick={() => handleMonthChange(-1)}
						>
							<ChevronLeft className="w-4 h-4" />
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => handleMonthChange(0)}
						>
							Hoje
						</Button>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => handleMonthChange(1)}
						>
							<ChevronRight className="w-4 h-4" />
						</Button>
					</div>
				</div>

				<div className="flex gap-2">
					<Button
						variant="ghost"
						size="icon"
						onClick={() => setIsTrashOpen(true)}
						title="Lixeira"
					>
						<Trash2 className="w-4 h-4 text-muted-foreground" />
					</Button>
					<Button
						variant="outline"
						onClick={() => setIsTemplateModalOpen(true)}
						disabled={selectedDays.size === 0}
					>
						<CalendarIcon className="w-4 h-4 mr-2" />
						Aplicar Template ({selectedDays.size})
					</Button>
				</div>
			</div>

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
				onClose={() => setIsTemplateModalOpen(false)}
				targetDates={Array.from(selectedDays)}
				kitchenId={KITCHEN_ID}
			/>

			<TrashDrawer
				open={isTrashOpen}
				onClose={() => setIsTrashOpen(false)}
				kitchenId={KITCHEN_ID}
			/>
		</div>
	);
}
