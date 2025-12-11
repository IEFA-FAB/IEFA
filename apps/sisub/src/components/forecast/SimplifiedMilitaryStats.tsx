// components/rancho/SimplifiedMilitaryStats.tsx

import { Badge, Card, CardContent, Skeleton } from "@iefa/ui";
import {
	CalendarDays,
	CheckCircle2,
	Clock,
	MinusCircle,
	Utensils,
} from "lucide-react";
import type { DayMeals } from "@/utils/RanchoUtils";

interface Selections {
	[date: string]: DayMeals;
}

interface SimplifiedStatsProps {
	selections: Selections;
	dates: string[];
	// Quando true, exibe skeleton no próprio componente (ex.: durante refetch)
	isLoading?: boolean;
}

function SimplifiedMilitaryStats({
	selections,
	dates,
	isLoading = false,
}: SimplifiedStatsProps) {
	// React Compiler handles optimization - no manual useMemo needed
	const next7Days = dates.slice(0, 7);

	let totalMealsNext7Days = 0;
	let daysWithMealsNext7Days = 0;

	next7Days.forEach((date) => {
		const daySelections = selections[date];
		if (daySelections) {
			const mealsCount = Object.values(daySelections).filter(Boolean).length;
			if (mealsCount > 0) {
				daysWithMealsNext7Days++;
				totalMealsNext7Days += mealsCount;
			}
		}
	});

	// Próxima refeição
	let nextMeal: { date: string; meal: string } | null = null;
	const mealOrder = ["cafe", "almoco", "janta", "ceia"] as const;

	for (const date of dates) {
		const daySelections = selections[date];
		if (daySelections) {
			for (const meal of mealOrder) {
				if (daySelections[meal]) {
					nextMeal = { date, meal };
					break;
				}
			}
			if (nextMeal) break;
		}
	}

	const consideredDays = next7Days.length || 1; // evita divisão por zero
	const progressPct = Math.round(
		(daysWithMealsNext7Days / consideredDays) * 100,
	);

	const stats = {
		totalMealsNext7Days,
		daysWithMealsNext7Days,
		nextMeal,
		consideredDays,
		progressPct,
	};

	const formatDate = (dateStr: string) => {
		const [year, month, day] = dateStr.split("-").map(Number);
		const date = new Date(year, month - 1, day);
		return date.toLocaleDateString("pt-BR", {
			weekday: "short",
			day: "2-digit",
			month: "2-digit",
		});
	};

	const formatMeal = (meal: string) => {
		const mealNames = {
			cafe: "Café",
			almoco: "Almoço",
			janta: "Janta",
			ceia: "Ceia",
		};
		return mealNames[meal as keyof typeof mealNames] || meal;
	};

	// Skeleton interno
	if (isLoading) {
		return (
			<div className="space-y-4">
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
					<Card className="bg-card text-card-foreground border border-border border-l-4 border-l-primary/70">
						<CardContent className="p-4">
							<div className="flex items-center gap-3">
								<div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
									<Utensils className="h-5 w-5 text-primary" />
								</div>
								<div className="flex-1">
									<p className="text-sm font-medium text-muted-foreground">
										Próxima Refeição
									</p>
									<Skeleton className="h-6 w-28 mt-1" />
									<Skeleton className="h-4 w-20 mt-2" />
								</div>
							</div>
						</CardContent>
					</Card>

					<Card className="bg-card text-card-foreground border border-border border-l-4 border-l-accent/70">
						<CardContent className="p-4">
							<div className="flex items-center gap-3">
								<div className="h-9 w-9 rounded-full bg-accent/10 flex items-center justify-center">
									<Clock className="h-5 w-5 text-accent" />
								</div>
								<div className="flex-1">
									<p className="text-sm font-medium text-muted-foreground">
										Próximos 7 Dias
									</p>
									<Skeleton className="h-6 w-36 mt-1" />
									<Skeleton className="h-2 w-full mt-3 rounded-full" />
									<Skeleton className="h-4 w-24 mt-2" />
								</div>
							</div>
						</CardContent>
					</Card>

					<Card className="bg-card text-card-foreground border border-border border-l-4 border-l-secondary/70">
						<CardContent className="p-4">
							<div className="flex items-center gap-3">
								<div className="h-9 w-9 rounded-full bg-secondary/10 flex items-center justify-center">
									<CalendarDays className="h-5 w-5 text-secondary" />
								</div>
								<div>
									<p className="text-sm font-medium text-muted-foreground">
										Status
									</p>
									<Skeleton className="h-7 w-40 mt-2 rounded-full" />
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		);
	}

	// UI normal
	return (
		<div className="space-y-4">
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
				{/* Próxima Refeição */}
				<Card className="bg-card text-card-foreground border border-border border-l-4 border-l-primary hover:shadow-sm transition-shadow">
					<CardContent className="p-4">
						<div className="flex items-center gap-3">
							<div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
								<Utensils className="h-5 w-5 text-primary" />
							</div>
							<div>
								<p className="text-sm font-medium text-muted-foreground">
									Próxima Refeição
								</p>
								{stats.nextMeal ? (
									<div className="mt-0.5">
										<p className="text-lg font-semibold text-foreground leading-tight">
											{formatMeal(stats.nextMeal.meal)}
										</p>
										<p className="text-sm text-muted-foreground leading-tight">
											{formatDate(stats.nextMeal.date)}
										</p>
									</div>
								) : (
									<div className="mt-0.5 flex items-center gap-2 text-muted-foreground">
										<MinusCircle className="h-4 w-4" />
										<p className="text-sm font-medium">
											Nenhuma refeição agendada
										</p>
									</div>
								)}
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Próximos 7 Dias */}
				<Card className="bg-card text-card-foreground border border-border border-l-4 border-l-accent hover:shadow-sm transition-shadow">
					<CardContent className="p-4">
						<div className="flex items-center gap-3">
							<div className="h-9 w-9 rounded-full bg-accent/10 flex items-center justify-center">
								<Clock className="h-5 w-5 text-accent" />
							</div>
							<div className="flex-1">
								<p className="text-sm font-medium text-muted-foreground">
									Próximos 7 Dias
								</p>
								<p className="text-lg font-semibold text-foreground leading-tight">
									{stats.totalMealsNext7Days} refeições
								</p>
								<p className="text-xs text-muted-foreground leading-tight">
									em {stats.daysWithMealsNext7Days} de {stats.consideredDays}{" "}
									dias
								</p>

								{/* Barra de progresso */}
								<div className="mt-3">
									<div className="h-2 w-full rounded-full bg-muted overflow-hidden">
										<div
											className="h-full bg-accent rounded-full transition-all"
											style={{ width: `${stats.progressPct}%` }}
										/>
									</div>
									<div className="mt-1.5 text-xs text-muted-foreground">
										{stats.progressPct}% dos dias com ao menos 1 refeição
									</div>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Status Geral */}
				<Card className="bg-card text-card-foreground border border-border border-l-4 border-l-secondary hover:shadow-sm transition-shadow">
					<CardContent className="p-4">
						<div className="flex items-center gap-3">
							<div className="h-9 w-9 rounded-full bg-secondary/10 flex items-center justify-center">
								<CalendarDays className="h-5 w-5 text-secondary" />
							</div>
							<div>
								<p className="text-sm font-medium text-muted-foreground">
									Status
								</p>
								<div className="mt-1 flex items-center gap-2">
									<Badge
										variant={
											stats.totalMealsNext7Days > 0 ? "default" : "secondary"
										}
										className="px-2.5 py-1"
									>
										{stats.totalMealsNext7Days > 0 ? (
											<span className="inline-flex items-center gap-1">
												<CheckCircle2 className="h-4 w-4" />
												Refeições Agendadas
											</span>
										) : (
											"Sem Refeições"
										)}
									</Badge>
									{stats.totalMealsNext7Days > 0 && (
										<span className="text-xs text-muted-foreground">
											{stats.totalMealsNext7Days} no total
										</span>
									)}
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

SimplifiedMilitaryStats.displayName = "SimplifiedMilitaryStats";

export default SimplifiedMilitaryStats;
