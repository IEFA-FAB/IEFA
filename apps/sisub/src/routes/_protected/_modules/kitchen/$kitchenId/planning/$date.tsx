import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { addDays, eachDayOfInterval, endOfWeek, format, isSameDay, parseISO, startOfWeek } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { DayPlanner } from "@/components/features/local/planning/DayPlanner"
import { AvailabilityStatusNote } from "@/components/features/local/planning/MenuAvailabilityAlert"
import { Button } from "@/components/ui/button"
import { useDailyMenus } from "@/hooks/data/usePlanning"
import { usePlanningAvailability } from "@/hooks/data/usePlanningAvailability"
import { cn } from "@/lib/cn"

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/

/** "quarta-feira, 28 de outubro" → "Quarta-feira, 28 de outubro" (o `capitalize` do CSS subiria toda palavra). */
const capitalizeFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * GESTÃO COZINHA — o agendamento de UM dia
 * URL: /kitchen/:kitchenId/planning/:date (YYYY-MM-DD)
 *
 * O calendário aberto no dia: as refeições, os ajustes do dia e o aviso de insumo que pode faltar,
 * com a semana no topo para andar de um dia ao outro sem voltar ao mês.
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/planning/$date")({
	beforeLoad: (opts) => {
		if (!CIVIL_DATE.test(opts.params.date) || Number.isNaN(parseISO(opts.params.date).getTime())) {
			throw redirect({ to: "/kitchen/$kitchenId/planning", params: { kitchenId: opts.params.kitchenId }, search: {} })
		}
		return requirePermission(opts, "kitchen", 1)
	},
	head: ({ params }) => ({ meta: [{ title: `${format(parseISO(params.date), "dd/MM/yyyy")} — Agendamento da Produção — SISUB` }] }),
	component: DayPage,
})

function DayPage() {
	const { kitchenId: kitchenIdStr, date } = Route.useParams()
	const kitchenId = Number(kitchenIdStr)
	// `parseISO` lê YYYY-MM-DD como data LOCAL; `new Date(str)` seria meia-noite UTC, o dia anterior.
	const day = parseISO(date)
	const weekStart = startOfWeek(day, { weekStartsOn: 1 })
	const weekEnd = endOfWeek(day, { weekStartsOn: 1 })
	const week = eachDayOfInterval({ start: weekStart, end: weekEnd })
	const iso = (d: Date) => format(d, "yyyy-MM-dd")

	const { data: menus } = useDailyMenus(kitchenId, weekStart, weekEnd)
	const { data: availability, error } = usePlanningAvailability(kitchenId, iso(weekStart), iso(weekEnd))
	const warningsOfDay = error ? null : (availability?.warnings ?? []).filter((w) => w.date === date)

	return (
		<div className="space-y-6">
			<header className="space-y-3 border-b border-border/60 pb-4">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h1 className="text-display">{capitalizeFirst(format(day, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR }))}</h1>
					<Button
						variant="outline"
						size="sm"
						nativeButton={false}
						render={
							<Link to="/kitchen/$kitchenId/planning" params={{ kitchenId: kitchenIdStr }} search={{ month: date.slice(0, 7) }}>
								<CalendarDays />
								Calendário do mês
							</Link>
						}
					/>
				</div>

				{/* A semana do dia: anterior e seguinte a um clique, e o que cada dia tem. */}
				<nav aria-label="Dias da semana" className="flex items-stretch gap-1">
					<Button
						variant="ghost"
						size="icon"
						nativeButton={false}
						aria-label="Dia anterior"
						render={
							<Link to="/kitchen/$kitchenId/planning/$date" params={{ kitchenId: kitchenIdStr, date: iso(addDays(day, -1)) }}>
								<ChevronLeft />
							</Link>
						}
					/>
					<div className="grid flex-1 grid-cols-7 gap-1">
						{week.map((d) => {
							const key = iso(d)
							const meals = (menus ?? []).filter((m) => m.service_date === key).length
							const warned = (availability?.warnings ?? []).some((w) => w.date === key)
							const current = key === date
							return (
								<Link
									key={key}
									to="/kitchen/$kitchenId/planning/$date"
									params={{ kitchenId: kitchenIdStr, date: key }}
									aria-current={current ? "date" : undefined}
									aria-label={`${format(d, "EEEE, d 'de' MMMM", { locale: ptBR })}${meals ? ` — ${meals} ${meals === 1 ? "refeição" : "refeições"}` : ""}${warned ? " — insumo pode faltar" : ""}`}
									className={cn(
										"flex flex-col items-center rounded-md border px-1 py-1.5 text-xs transition-colors",
										"focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring",
										current ? "border-primary bg-primary/10 text-foreground" : "border-transparent text-muted-foreground hover:bg-muted/50",
										isSameDay(d, new Date()) && !current && "text-primary"
									)}
								>
									<span className="capitalize">{format(d, "EEE", { locale: ptBR }).replace(".", "")}</span>
									<span className="text-subheading flex items-center gap-1">
										{format(d, "d")}
										{warned && <AlertTriangle className="size-3 text-warning" aria-hidden="true" />}
									</span>
									<span className="text-caption">{meals ? `${meals} ref.` : "—"}</span>
								</Link>
							)
						})}
					</div>
					<Button
						variant="ghost"
						size="icon"
						nativeButton={false}
						aria-label="Dia seguinte"
						render={
							<Link to="/kitchen/$kitchenId/planning/$date" params={{ kitchenId: kitchenIdStr, date: iso(addDays(day, 1)) }}>
								<ChevronRight />
							</Link>
						}
					/>
				</nav>
				<AvailabilityStatusNote checks={availability?.checks ?? null} error={error} />
			</header>

			<DayPlanner key={date} date={day} kitchenId={kitchenId} availabilityWarnings={warningsOfDay} />
		</div>
	)
}
