import {
	Button,
	Label,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@iefa/ui";
import { Calendar } from "lucide-react";
import { formatDateRange } from "@/lib/dashboard";
import type { MessHallAPI } from "@/types/domain/dashboard";

interface DashboardFiltersProps {
	dateRange: { start: string; end: string };
	onDateRangeChange: (range: { start: string; end: string }) => void;
	messHalls: MessHallAPI[];
	selectedMessHall: string;
	onMessHallChange: (id: string) => void;
}

export default function DashboardFilters({
	dateRange,
	onDateRangeChange,
	messHalls,
	selectedMessHall,
	onMessHallChange,
}: DashboardFiltersProps) {
	const setToday = () => {
		const today = new Date().toISOString().split("T")[0];
		onDateRangeChange({ start: today, end: today });
	};

	const setNext7Days = () => {
		const today = new Date();
		const nextWeek = new Date(today);
		nextWeek.setDate(today.getDate() + 6);

		onDateRangeChange({
			start: today.toISOString().split("T")[0],
			end: nextWeek.toISOString().split("T")[0],
		});
	};

	const setThisMonth = () => {
		const today = new Date();
		const start = new Date(today.getFullYear(), today.getMonth(), 1);
		const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);

		onDateRangeChange({
			start: start.toISOString().split("T")[0],
			end: end.toISOString().split("T")[0],
		});
	};

	return (
		<div className="flex flex-col gap-4 p-4 bg-muted/20 rounded-lg border">
			<div className="flex items-center gap-2 text-sm font-medium">
				<Calendar className="h-4 w-4" aria-hidden="true" />
				Filtros
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{/* Date Range Selector */}
				<div className="flex flex-col gap-2">
					<Label htmlFor="date-start">Período</Label>
					<div className="flex gap-2">
						<input
							id="date-start"
							type="date"
							value={dateRange.start}
							onChange={(e) =>
								onDateRangeChange({ ...dateRange, start: e.target.value })
							}
							className="flex-1 px-3 py-2 border rounded-md text-sm"
							aria-label="Data inicial"
						/>
						<span className="flex items-center text-sm text-muted-foreground">
							até
						</span>
						<input
							id="date-end"
							type="date"
							value={dateRange.end}
							onChange={(e) =>
								onDateRangeChange({ ...dateRange, end: e.target.value })
							}
							className="flex-1 px-3 py-2 border rounded-md text-sm"
							aria-label="Data final"
						/>
					</div>
					<div className="text-xs text-muted-foreground">
						{formatDateRange(dateRange.start, dateRange.end)}
					</div>
				</div>

				{/* Mess Hall Selector */}
				<div className="flex flex-col gap-2">
					<Label htmlFor="mess-hall-select">Rancho</Label>
					<Select value={selectedMessHall} onValueChange={onMessHallChange}>
						<SelectTrigger id="mess-hall-select">
							<SelectValue placeholder="Selecione o rancho" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Todos os Ranchos</SelectItem>
							{messHalls.map((mh) => (
								<SelectItem key={mh.id} value={mh.id.toString()}>
									{mh.display_name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{/* Quick Actions */}
				<div className="flex flex-col gap-2">
					<Label>Atalhos</Label>
					<div className="flex gap-2 flex-wrap">
						<Button
							variant="outline"
							size="sm"
							onClick={setToday}
							className="text-xs"
						>
							Hoje
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={setNext7Days}
							className="text-xs"
						>
							Próximos 7 dias
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={setThisMonth}
							className="text-xs"
						>
							Este mês
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
