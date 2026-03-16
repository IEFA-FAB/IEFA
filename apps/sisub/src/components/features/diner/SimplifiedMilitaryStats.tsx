// components/rancho/SimplifiedMilitaryStats.tsx

import { CalendarX2, Clock, MinusCircle, Utensils } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { DayMeals } from "@/lib/meal"

interface Selections {
	[date: string]: DayMeals
}

interface SimplifiedStatsProps {
	selections: Selections
	dates: string[]
	// Quando true, exibe skeleton no próprio componente (ex.: durante refetch)
	isLoading?: boolean
}

function SimplifiedMilitaryStats({ selections, dates, isLoading = false }: SimplifiedStatsProps) {
	"use no memo"
	const next7Days = dates.slice(0, 7)

	const { totalMealsNext7Days, daysWithMealsNext7Days } = next7Days.reduce(
		(acc, date) => {
			const daySelections = selections[date]
			if (daySelections) {
				const mealsCount = Object.values(daySelections).filter(Boolean).length
				if (mealsCount > 0) {
					return {
						daysWithMealsNext7Days: acc.daysWithMealsNext7Days + 1,
						totalMealsNext7Days: acc.totalMealsNext7Days + mealsCount,
					}
				}
			}
			return acc
		},
		{ totalMealsNext7Days: 0, daysWithMealsNext7Days: 0 }
	)

	let nextMeal: { date: string; meal: string } | null = null
	const mealOrder = ["cafe", "almoco", "janta", "ceia"] as const

	for (let di = 0; di < dates.length; di++) {
		const date = dates[di]
		const daySelections = selections[date]
		if (daySelections) {
			for (let mi = 0; mi < mealOrder.length; mi++) {
				const meal = mealOrder[mi]
				if (daySelections[meal]) {
					nextMeal = { date, meal }
					break
				}
			}
			if (nextMeal) break
		}
	}

	const consideredDays = next7Days.length || 1
	const uncoveredDays = consideredDays - daysWithMealsNext7Days

	const stats = {
		totalMealsNext7Days,
		nextMeal,
		uncoveredDays,
	}

	const formatDate = (dateStr: string) => {
		const [year, month, day] = dateStr.split("-").map(Number)
		const date = new Date(year, month - 1, day)
		return date.toLocaleDateString("pt-BR", {
			weekday: "short",
			day: "2-digit",
			month: "2-digit",
		})
	}

	const formatMeal = (meal: string) => {
		const mealNames = {
			cafe: "Café",
			almoco: "Almoço",
			janta: "Janta",
			ceia: "Ceia",
		}
		return mealNames[meal as keyof typeof mealNames] || meal
	}

	// Skeleton parcial: ícone e label permanecem visíveis (sempre estáticos),
	// apenas o dado dinâmico é substituído — evita layout shift e mantém contexto.
	// Estrutura DOM idêntica ao estado real para fidelidade pixel-perfeita.
	if (isLoading) {
		return (
			<section className="space-y-4" aria-busy="true" aria-label="Carregando estatísticas">
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{/* Card 1 skeleton — Próxima Refeição */}
					<Card className="bg-card text-card-foreground border border-border/50 border-l-4 border-l-primary">
						<CardContent className="p-5">
							<div className="flex items-start gap-3">
								<div className="h-12 w-12 shrink-0 rounded bg-primary/15 flex items-center justify-center ring-1 ring-inset ring-primary/30">
									<Utensils className="h-6 w-6 text-primary" />
								</div>
								<div className="flex-1 min-w-0">
									<p className="text-sm font-medium text-muted-foreground">Próxima Refeição</p>
									<div className="mt-1">
										<Skeleton className="h-6 w-20" />
										<Skeleton className="h-4 w-28 mt-0.5" />
									</div>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Card 2 skeleton — Próximos 7 Dias */}
					<Card className="bg-card text-card-foreground border border-border/50 border-l-4 border-l-success">
						<CardContent className="p-5">
							<div className="flex items-start gap-3">
								<div className="h-12 w-12 shrink-0 rounded bg-success/15 flex items-center justify-center ring-1 ring-inset ring-success/30">
									<Clock className="h-6 w-6 text-success" />
								</div>
								<div className="flex-1 min-w-0">
									<p className="text-sm font-medium text-muted-foreground">Próximos 7 Dias</p>
									<div className="mt-1">
										<Skeleton className="h-6 w-8" />
										<Skeleton className="h-4 w-24 mt-0.5" />
									</div>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Card 3 skeleton — Dias Descobertos */}
					<Card className="bg-card text-card-foreground border border-border/50 border-l-4 border-l-warning">
						<CardContent className="p-5">
							<div className="flex items-start gap-3">
								<div className="h-12 w-12 shrink-0 rounded bg-warning/15 flex items-center justify-center ring-1 ring-inset ring-warning/30">
									<CalendarX2 className="h-6 w-6 text-warning" />
								</div>
								<div className="flex-1 min-w-0">
									<p className="text-sm font-medium text-muted-foreground">Dias Descobertos</p>
									<div className="mt-1">
										<Skeleton className="h-6 w-8" />
										<Skeleton className="h-4 w-32 mt-0.5" />
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			</section>
		)
	}

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{/* Próxima Refeição */}
				<Card className="bg-card text-card-foreground border border-border/50 border-l-4 border-l-primary">
					<CardContent className="p-5">
						<div className="flex items-start gap-3">
							<div className="h-12 w-12 shrink-0 rounded bg-primary/15 flex items-center justify-center ring-1 ring-inset ring-primary/30">
								<Utensils className="h-6 w-6 text-primary" />
							</div>
							<div className="flex-1 min-w-0">
								<p className="text-sm font-medium text-muted-foreground">Próxima Refeição</p>
								<div className="mt-1">
									{stats.nextMeal ? (
										<>
											<p className="text-xl font-bold text-foreground leading-tight">{formatMeal(stats.nextMeal.meal)}</p>
											<p className="text-sm text-muted-foreground leading-tight mt-0.5">{formatDate(stats.nextMeal.date)}</p>
										</>
									) : (
										<div className="flex items-center gap-2 text-muted-foreground">
											<MinusCircle className="h-4 w-4 shrink-0" />
											<p className="text-sm font-medium">Nenhuma refeição agendada</p>
										</div>
									)}
								</div>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Próximos 7 Dias */}
				<Card className="bg-card text-card-foreground border border-border/50 border-l-4 border-l-success">
					<CardContent className="p-5">
						<div className="flex items-start gap-3">
							<div className="h-12 w-12 shrink-0 rounded bg-success/15 flex items-center justify-center ring-1 ring-inset ring-success/30">
								<Clock className="h-6 w-6 text-success" />
							</div>
							<div className="flex-1 min-w-0">
								<p className="text-sm font-medium text-muted-foreground">Próximos 7 Dias</p>
								<div className="mt-1">
									<p className="text-xl font-bold text-foreground leading-tight">{stats.totalMealsNext7Days}</p>
									<p className="text-sm text-muted-foreground leading-tight mt-0.5">refeições planejadas</p>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Dias Descobertos */}
				<Card className="bg-card text-card-foreground border border-border/50 border-l-4 border-l-warning">
					<CardContent className="p-5">
						<div className="flex items-start gap-3">
							<div className="h-12 w-12 shrink-0 rounded bg-warning/15 flex items-center justify-center ring-1 ring-inset ring-warning/30">
								<CalendarX2 className="h-6 w-6 text-warning" />
							</div>
							<div className="flex-1 min-w-0">
								<p className="text-sm font-medium text-muted-foreground">Dias Descobertos</p>
								<div className="mt-1">
									<p className="text-xl font-bold text-foreground leading-tight">{stats.uncoveredDays}</p>
									<p className="text-sm text-muted-foreground leading-tight mt-0.5">{stats.uncoveredDays === 0 ? "semana coberta" : "dias sem refeição"}</p>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	)
}

SimplifiedMilitaryStats.displayName = "SimplifiedMilitaryStats"

export default SimplifiedMilitaryStats
