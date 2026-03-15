import { createFileRoute } from "@tanstack/react-router"
import { ChevronLeft, ChevronRight, UtensilsCrossed } from "lucide-react"
import { useState } from "react"
import { PageHeader } from "@/components/common/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { type DishDetails, useDailyMenuContent } from "@/hooks/data/useDailyMenuContent"
import { useMealForecast } from "@/hooks/data/useMealForecast"
import { useMessHalls } from "@/hooks/data/useMessHalls"
import { cn } from "@/lib/cn"

export const Route = createFileRoute("/_protected/_modules/diner/menu")({
	component: MenuPage,
	head: () => ({
		meta: [
			{ title: "Cardápio - SISUB" },
			{ name: "description", content: "Visualize o cardápio do rancho" },
		],
	}),
})

const MEAL_LABELS: Record<string, string> = {
	cafe: "Café da Manhã",
	almoco: "Almoço",
	janta: "Jantar",
	ceia: "Ceia",
}

const MEAL_ORDER = ["cafe", "almoco", "janta", "ceia"]

/** Retorna os próximos N dias a partir de hoje (inclusive) como strings ISO */
function getDateRange(daysAhead: number): string[] {
	const dates: string[] = []
	for (let i = 0; i < daysAhead; i++) {
		const d = new Date()
		d.setDate(d.getDate() + i)
		dates.push(d.toISOString().split("T")[0])
	}
	return dates
}

function todayISO(): string {
	return new Date().toISOString().split("T")[0]
}

function formatDateLabel(dateStr: string): string {
	const [year, month, day] = dateStr.split("-").map(Number)
	const d = new Date(year, month - 1, day)
	return d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
}

function DishCard({ dish }: { dish: DishDetails }) {
	const hasIngredients = dish.ingredients && dish.ingredients.length > 0
	return (
		<div className="rounded-md border bg-card p-3 space-y-2">
			<p className="text-sm font-medium text-foreground">{dish.name}</p>
			{hasIngredients && (
				<div className="flex flex-wrap gap-1">
					{dish.ingredients.map((ing) => (
						<Badge key={ing.product_name} variant="secondary" className="text-xs">
							{ing.product_name}
						</Badge>
					))}
				</div>
			)}
		</div>
	)
}

function MealSection({ mealKey, dishes }: { mealKey: string; dishes: DishDetails[] }) {
	return (
		<div className="space-y-2">
			<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
				{MEAL_LABELS[mealKey] ?? mealKey}
			</h3>
			{dishes.length === 0 ? (
				<p className="text-sm text-muted-foreground italic">Sem cardápio planejado.</p>
			) : (
				<div className="space-y-2">
					{dishes.map((dish) => (
						<DishCard key={dish.id} dish={dish} />
					))}
				</div>
			)}
		</div>
	)
}

function MenuPage() {
	const [selectedDate, setSelectedDate] = useState(todayISO())
	const dates = getDateRange(7)
	const selectedIndex = dates.indexOf(selectedDate)

	const canGoPrev = selectedIndex > 0
	const canGoNext = selectedIndex < dates.length - 1

	const { messHalls } = useMessHalls()
	const { defaultMessHallId } = useMealForecast()

	const defaultMessHall = messHalls.find((m) => String(m.id) === String(defaultMessHallId))
	const kitchenIds = defaultMessHall?.kitchen_id ? [defaultMessHall.kitchen_id] : []

	const { data: menuContent, isLoading } = useDailyMenuContent(
		kitchenIds,
		dates[0],
		dates[dates.length - 1]
	)

	const dayMenu = menuContent?.[selectedDate] ?? {}
	const hasMeals = MEAL_ORDER.some((k) => (dayMenu[k]?.length ?? 0) > 0)

	return (
		<div className="space-y-6">
			<PageHeader title="Cardápio" />

			{/* Navegação de datas */}
			<div className="flex items-center justify-between gap-2 rounded-lg border bg-card p-3">
				<Button
					variant="ghost"
					size="icon"
					onClick={() => setSelectedDate(dates[selectedIndex - 1])}
					disabled={!canGoPrev}
					aria-label="Dia anterior"
				>
					<ChevronLeft className="h-5 w-5" />
				</Button>

				<div className="text-center">
					<p className="text-sm font-semibold capitalize">{formatDateLabel(selectedDate)}</p>
					{selectedDate === todayISO() && (
						<span className="text-xs text-primary font-medium">Hoje</span>
					)}
				</div>

				<Button
					variant="ghost"
					size="icon"
					onClick={() => setSelectedDate(dates[selectedIndex + 1])}
					disabled={!canGoNext}
					aria-label="Próximo dia"
				>
					<ChevronRight className="h-5 w-5" />
				</Button>
			</div>

			{/* Seleção rápida de dias */}
			<div className="flex gap-2 overflow-x-auto pb-1">
				{dates.map((d) => {
					const [, , day] = d.split("-")
					const isSelected = d === selectedDate
					return (
						<Button
							key={d}
							variant="outline"
							onClick={() => setSelectedDate(d)}
							className={cn(
								"flex flex-col items-center justify-center h-auto min-w-[3.5rem] py-2 shrink-0 transition-colors",
								isSelected
									? "border-primary bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
									: "hover:bg-muted font-normal"
							)}
						>
							<span className="text-sm">{Number(day)}</span>
							<span
								className={cn(
									"text-xs",
									isSelected ? "text-primary/80" : "text-muted-foreground opacity-80"
								)}
							>
								{new Date(`${d}T00:00:00`).toLocaleDateString("pt-BR", { month: "short" })}
							</span>
						</Button>
					)
				})}
			</div>

			{/* Conteúdo */}
			{!defaultMessHall && !isLoading ? (
				<div className="rounded-md border border-dashed p-6 text-center space-y-2">
					<UtensilsCrossed className="h-8 w-8 mx-auto text-muted-foreground" />
					<p className="text-sm text-muted-foreground">
						Defina seu rancho padrão em <strong>Previsão</strong> para ver o cardápio.
					</p>
				</div>
			) : isLoading ? (
				<div className="space-y-4">
					{MEAL_ORDER.map((k) => (
						<div key={k} className="space-y-2">
							<div className="h-4 w-24 rounded bg-muted animate-pulse" />
							<div className="h-16 rounded-md bg-muted animate-pulse" />
						</div>
					))}
				</div>
			) : !hasMeals ? (
				<div className="rounded-md border border-dashed p-6 text-center">
					<p className="text-sm text-muted-foreground">Nenhum cardápio planejado para este dia.</p>
				</div>
			) : (
				<div className="space-y-6">
					{MEAL_ORDER.filter((k) => dayMenu[k]?.length > 0).map((mealKey) => (
						<MealSection key={mealKey} mealKey={mealKey} dishes={dayMenu[mealKey] ?? []} />
					))}
				</div>
			)}
		</div>
	)
}
