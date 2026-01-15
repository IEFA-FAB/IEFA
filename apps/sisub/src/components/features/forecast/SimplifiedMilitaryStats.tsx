// components/rancho/SimplifiedMilitaryStats.tsx

import { Badge, Card, CardContent, Skeleton } from "@iefa/ui";
import {
	CalendarDays,
	CheckCircle2,
	Clock,
	MinusCircle,
	Utensils,
} from "lucide-react";
import type { DayMeals } from "@/lib/meal";

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
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

	// UI normal - Enhanced with Industrial-Technical aesthetic
	return (
		<div className="space-y-4">
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{/* Próxima Refeição */}
				<Card className="group bg-gradient-to-br from-card to-muted/10 text-card-foreground border border-border/50 border-l-4 border-l-primary hover:shadow-lg hover:-translate-y-1 transition-all duration-200">
					<CardContent className="p-5">
						<div className="flex items-center gap-3">
							<div className="h-12 w-12 rounded-xl bg-primary/15 flex items-center justify-center ring-2 ring-inset ring-primary/30 transition-transform duration-200 group-hover:scale-110">
								<Utensils className="h-6 w-6 text-primary dark:text-primary/90" />
							</div>
							<div className="flex-1 min-w-0">
								<p className="text-sm font-sans font-medium text-muted-foreground">
									Próxima Refeição
								</p>
								{stats.nextMeal ? (
									<div className="mt-1">
										<p className="text-xl font-sans font-bold text-foreground leading-tight">
											{formatMeal(stats.nextMeal.meal)}
										</p>
										<p className="text-sm font-sans text-muted-foreground leading-tight mt-0.5">
											{formatDate(stats.nextMeal.date)}
										</p>
									</div>
								) : (
									<div className="mt-1 flex items-center gap-2 text-muted-foreground">
										<MinusCircle className="h-4 w-4" />
										<p className="text-sm font-sans font-medium">
											Nenhuma refeição agendada
										</p>
									</div>
								)}
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Próximos 7 Dias */}
				<Card className="group bg-gradient-to-br from-card to-muted/10 text-card-foreground border border-border/50 border-l-4 border-l-emerald-500 hover:shadow-lg hover:-translate-y-1 transition-all duration-200">
					<CardContent className="p-5">
						<div className="flex items-center gap-3">
							<div className="h-12 w-12 rounded-xl bg-emerald-500/15 flex items-center justify-center ring-2 ring-inset ring-emerald-500/30 transition-transform duration-200 group-hover:scale-110">
								<Clock className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
							</div>
							<div className="flex-1 min-w-0">
								<p className="text-sm font-sans font-medium text-muted-foreground">
									Próximos 7 Dias
								</p>
								<p className="text-xl font-mono font-bold text-foreground leading-tight mt-1">
									{stats.totalMealsNext7Days}
								</p>
								<p className="text-xs font-sans text-muted-foreground leading-tight">
									em {stats.daysWithMealsNext7Days} de {stats.consideredDays}{" "}
									dias
								</p>

								{/* Barra de progresso */}
								<div className="mt-3">
									<div className="h-2 w-full rounded-full bg-muted overflow-hidden">
										<div
											className="h-full bg-emerald-500 rounded-full transition-all duration-500"
											style={{ width: `${stats.progressPct}%` }}
										/>
									</div>
									<div className="mt-1.5 text-xs font-mono text-muted-foreground">
										{stats.progressPct}%
									</div>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Status Geral */}
				<Card className="group bg-gradient-to-br from-card to-muted/10 text-card-foreground border border-border/50 border-l-4 border-l-amber-500 hover:shadow-lg hover:-translate-y-1 transition-all duration-200">
					<CardContent className="p-5">
						<div className="flex items-center gap-3">
							<div className="h-12 w-12 rounded-xl bg-amber-500/15 flex items-center justify-center ring-2 ring-inset ring-amber-500/30 transition-transform duration-200 group-hover:scale-110">
								<CalendarDays className="h-6 w-6 text-amber-600 dark:text-amber-400" />
							</div>
							<div className="flex-1 min-w-0">
								<p className="text-sm font-sans font-medium text-muted-foreground">
									Status
								</p>
								<div className="mt-2 flex flex-col gap-1.5">
									<Badge
										variant={
											stats.totalMealsNext7Days > 0 ? "default" : "secondary"
										}
										className="px-2.5 py-1 font-sans w-fit text-xs"
									>
										{stats.totalMealsNext7Days > 0 ? (
											<span className="inline-flex items-center gap-1.5">
												<CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
												<span className="truncate">Agendadas</span>
											</span>
										) : (
											"Sem Refeições"
										)}
									</Badge>
									{stats.totalMealsNext7Days > 0 && (
										<span className="text-xs font-mono text-muted-foreground truncate">
											{stats.totalMealsNext7Days} total
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
