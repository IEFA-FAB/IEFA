import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@iefa/ui";
import { BarChart3 } from "lucide-react";
import { parseLocalDate } from "@/lib/dashboard";
import type { DailyMealStat } from "@/types/domain/dashboard";

interface MealDistributionChartProps {
	data: DailyMealStat[];
}

export default function MealDistributionChart({
	data,
}: MealDistributionChartProps) {
	if (data.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<BarChart3 className="h-5 w-5" aria-hidden="true" />
						Refeições por Período do Dia
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-center h-40 text-muted-foreground">
						Sem dados para o período selecionado
					</div>
				</CardContent>
			</Card>
		);
	}

	const maxValue = Math.max(
		...data.flatMap((d) => [d.cafe, d.almoco, d.janta, d.ceia]),
	);

	// Container height in pixels (h-40 = 160px)
	const CHART_HEIGHT = 160;

	// Calculate bar height in pixels
	const getBarHeight = (value: number) => {
		if (maxValue === 0) return 0;
		return (value / maxValue) * CHART_HEIGHT;
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<BarChart3 className="h-5 w-5" aria-hidden="true" />
					Refeições por Período do Dia
				</CardTitle>
				<CardDescription>
					Distribuição temporal de previsões por tipo de refeição
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex gap-2 overflow-x-auto pb-4">
					...
					{data.map((day) => {
						const dateObj = parseLocalDate(day.date);
						const formattedDate = dateObj.toLocaleDateString("pt-BR", {
							day: "2-digit",
							month: "2-digit",
						});
						const weekday = dateObj
							.toLocaleDateString("pt-BR", { weekday: "short" })
							.replace(".", "");

						return (
							<div
								key={day.date}
								className="flex flex-col items-center gap-2 min-w-25"
							>
								<div className="flex items-end gap-1 h-40">
									{/* Café */}
									<div className="flex flex-col items-center gap-1">
										<div
											className="w-6 bg-chart-2 rounded-t transition-all hover:opacity-80"
											style={{
												height: getBarHeight(day.cafe),
												minHeight: day.cafe > 0 ? 8 : 0,
											}}
											title={`Café: ${day.cafe}`}
										/>
										{day.cafe > 0 && (
											<span className="text-xs font-medium text-chart-2">
												{day.cafe}
											</span>
										)}
									</div>

									{/* Almoço */}
									<div className="flex flex-col items-center gap-1">
										<div
											className="w-6 bg-chart-3 rounded-t transition-all hover:opacity-80"
											style={{
												height: getBarHeight(day.almoco),
												minHeight: day.almoco > 0 ? 8 : 0,
											}}
											title={`Almoço: ${day.almoco}`}
										/>
										{day.almoco > 0 && (
											<span className="text-xs font-medium text-chart-3">
												{day.almoco}
											</span>
										)}
									</div>

									{/* Janta */}
									<div className="flex flex-col items-center gap-1">
										<div
											className="w-6 bg-chart-5 rounded-t transition-all hover:opacity-80"
											style={{
												height: getBarHeight(day.janta),
												minHeight: day.janta > 0 ? 8 : 0,
											}}
											title={`Janta: ${day.janta}`}
										/>
										{day.janta > 0 && (
											<span className="text-xs font-medium text-chart-5">
												{day.janta}
											</span>
										)}
									</div>

									{/* Ceia */}
									<div className="flex flex-col items-center gap-1">
										<div
											className="w-6 bg-chart-1 rounded-t transition-all hover:opacity-80"
											style={{
												height: getBarHeight(day.ceia),
												minHeight: day.ceia > 0 ? 8 : 0,
											}}
											title={`Ceia: ${day.ceia}`}
										/>
										{day.ceia > 0 && (
											<span className="text-xs font-medium text-chart-1">
												{day.ceia}
											</span>
										)}
									</div>
								</div>

								{/* Date Label */}
								<div className="flex flex-col items-center">
									<span className="text-xs font-medium capitalize">
										{weekday}
									</span>
									<span className="text-xs text-muted-foreground">
										{formattedDate}
									</span>
								</div>
							</div>
						);
					})}
				</div>

				{/* Legend */}
				<div className="flex gap-4 justify-center mt-6 flex-wrap pt-4 border-t">
					<div className="flex items-center gap-2">
						<div className="w-4 h-4 bg-chart-2 rounded" />
						<span className="text-sm">Café</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="w-4 h-4 bg-chart-3 rounded" />
						<span className="text-sm">Almoço</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="w-4 h-4 bg-chart-5 rounded" />
						<span className="text-sm">Janta</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="w-4 h-4 bg-chart-1 rounded" />
						<span className="text-sm">Ceia</span>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
