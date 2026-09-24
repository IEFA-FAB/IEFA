import { createFileRoute } from "@tanstack/react-router"
import { ChevronLeft, ChevronRight, UtensilsCrossed } from "lucide-react"
import { useEffect, useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { MealSection } from "@/components/features/diner/MealSection"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { useDailyMenuContent } from "@/hooks/data/useDailyMenuContent"
import { useMealForecast } from "@/hooks/data/useMealForecast"
import { useMessHalls } from "@/hooks/data/useMessHalls"
import { cn } from "@/lib/cn"

export const Route = createFileRoute("/_protected/_modules/diner/menu")({
	beforeLoad: (opts) => requirePermission(opts, "diner", 1),
	component: MenuPage,
	head: () => ({
		meta: [{ name: "description", content: "Visualize o cardápio do rancho" }],
	}),
})

const MEAL_ORDER = ["cafe", "almoco", "janta", "ceia"]

/**
 * `YYYY-MM-DD` da data no fuso LOCAL. `toISOString()` converte para UTC: em UTC-3, a partir das
 * 21h o "hoje" do comensal já era amanhã — enquanto o rótulo, formatado em hora local, dizia hoje.
 */
function localISODate(d: Date): string {
	const month = String(d.getMonth() + 1).padStart(2, "0")
	const day = String(d.getDate()).padStart(2, "0")
	return `${d.getFullYear()}-${month}-${day}`
}

/** Retorna os próximos N dias a partir de hoje (inclusive) como strings ISO */
function getDateRange(daysAhead: number): string[] {
	const dates: string[] = []
	for (let i = 0; i < daysAhead; i++) {
		const d = new Date()
		d.setDate(d.getDate() + i)
		dates.push(localISODate(d))
	}
	return dates
}

function todayISO(): string {
	return localISODate(new Date())
}

function formatDateLabel(dateStr: string): string {
	const [year, month, day] = dateStr.split("-").map(Number)
	const d = new Date(year, month - 1, day)
	return d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
}

function MenuPage() {
	// Datas resolvidas SÓ no navegador. A página renderiza primeiro no servidor, que roda em UTC:
	// calculando "hoje" nos dois lados, das 21h à meia-noite (UTC-3) servidor e navegador
	// discordariam do dia — erro de hidratação e o dia errado piscando na tela.
	const [today, setToday] = useState<string | null>(null)
	const [chosenDate, setChosenDate] = useState<string | null>(null)
	useEffect(() => setToday(todayISO()), [])

	const dates = today ? getDateRange(7) : []
	const selectedDate = chosenDate ?? today ?? ""
	const setSelectedDate = setChosenDate
	const selectedIndex = dates.indexOf(selectedDate)

	const canGoPrev = selectedIndex > 0
	const canGoNext = selectedIndex < dates.length - 1

	const { messHalls } = useMessHalls()
	const { defaultMessHallId } = useMealForecast()

	const defaultMessHall = messHalls.find((m) => String(m.id) === String(defaultMessHallId))
	const kitchenIds = defaultMessHall?.kitchen_id ? [defaultMessHall.kitchen_id] : []

	const { data: menuContent, isLoading: contentLoading } = useDailyMenuContent(kitchenIds, dates[0] ?? "", dates[dates.length - 1] ?? "")
	// Antes de o navegador resolver a data, a tela é de carregamento — não "sem cardápio".
	const isLoading = contentLoading || today === null

	const dayMenu = menuContent?.[selectedDate] ?? {}
	const hasMeals = MEAL_ORDER.some((k) => (dayMenu[k]?.length ?? 0) > 0)

	return (
		<div className="space-y-6">
			<PageHeader title="Cardápio" />

			{/* Navegação de datas */}
			<div className="flex items-center justify-between gap-2 rounded-md border bg-card p-3">
				<Button variant="ghost" size="icon" onClick={() => setSelectedDate(dates[selectedIndex - 1])} disabled={!canGoPrev} aria-label="Dia anterior">
					<ChevronLeft className="size-5" />
				</Button>

				<div className="text-center">
					<p className="text-subheading capitalize">{selectedDate ? formatDateLabel(selectedDate) : "\u00a0"}</p>
					{selectedDate !== "" && selectedDate === today && <span className="text-caption text-primary">Hoje</span>}
				</div>

				<Button variant="ghost" size="icon" onClick={() => setSelectedDate(dates[selectedIndex + 1])} disabled={!canGoNext} aria-label="Próximo dia">
					<ChevronRight className="size-5" />
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
								isSelected ? "border-primary bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary" : "hover:bg-muted font-normal"
							)}
						>
							<span className="text-sm">{Number(day)}</span>
							<span className={cn("text-xs", isSelected ? "text-primary/80" : "text-muted-foreground opacity-80")}>
								{new Date(`${d}T00:00:00`).toLocaleDateString("pt-BR", { month: "short" })}
							</span>
						</Button>
					)
				})}
			</div>

			{/* Conteúdo */}
			{!defaultMessHall && !isLoading ? (
				<div className="rounded-md border border-dashed p-6 text-center space-y-2">
					<UtensilsCrossed className="size-8 mx-auto text-muted-foreground" />
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
