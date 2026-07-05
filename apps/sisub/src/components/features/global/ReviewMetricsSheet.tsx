import type { ReviewActivityEntry, ReviewTypeMetrics } from "@iefa/sisub-domain"
import { Activity, CalendarCheck, Loader2, Package, UtensilsCrossed } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useReviewMetrics } from "@/services/ReviewMetricsService"

type Preset = "6m" | "12m" | "custom"
type MetricType = "ingredient" | "recipe"

const PRESET_LABELS: Record<Preset, string> = {
	"6m": "Últimos 6 meses",
	"12m": "Últimos 12 meses",
	custom: "Intervalo personalizado",
}

/** Configuração por tipo — cada painel mostra apenas o seu domínio (insumos OU preparações). */
const TYPE_CONFIG: Record<MetricType, { label: string; icon: React.ReactNode; description: string }> = {
	ingredient: {
		label: "Insumos",
		icon: <Package className="size-4" />,
		description: "Progresso da conferência de insumos pelos nutricionistas.",
	},
	recipe: {
		label: "Preparações",
		icon: <UtensilsCrossed className="size-4" />,
		description: "Progresso da conferência de preparações pelos nutricionistas.",
	},
}

interface ReviewMetricsSheetProps {
	open: boolean
	onOpenChange: (open: boolean) => void
}

/** Subtrai meses sem o overflow do `setMonth` (ex.: 31/03 − 6 meses → 30/09, não 01/10). */
function subMonthsClamped(date: Date, months: number): Date {
	const d = new Date(date)
	const targetDay = d.getDate()
	d.setDate(1)
	d.setMonth(d.getMonth() - months)
	const daysInTarget = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
	d.setDate(Math.min(targetDay, daysInTarget))
	return d
}

/** Janela ISO a partir do preset/custom. `null` quando o intervalo custom está incompleto. */
function resolveWindow(preset: Preset, customFrom: string, customTo: string): { from?: string; to?: string } | null {
	if (preset === "custom") {
		if (!customFrom || !customTo) return null
		const from = new Date(`${customFrom}T00:00:00`)
		const to = new Date(`${customTo}T23:59:59`)
		if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return null
		return { from: from.toISOString(), to: to.toISOString() }
	}
	const months = preset === "6m" ? 6 : 12
	const to = new Date()
	const from = subMonthsClamped(to, months)
	return { from: from.toISOString(), to: to.toISOString() }
}

function pct(reviewed: number, total: number): number {
	if (total <= 0) return 0
	return Math.round((reviewed / total) * 100)
}

function formatDay(dateStr: string): string {
	// dateStr no formato YYYY-MM-DD (bucket) — interpreta como data local.
	return new Date(`${dateStr}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

function formatStamp(dateStr: string): string {
	return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
}

/** Cobertura geral do tipo do painel: % já revisado + pendentes. */
function CoverageCard({ label, icon, metrics }: { label: string; icon: React.ReactNode; metrics: ReviewTypeMetrics }) {
	const coverage = pct(metrics.reviewed_ever, metrics.total)
	const pending = Math.max(0, metrics.total - metrics.reviewed_ever)
	return (
		<div className="rounded-lg border border-border p-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2 text-sm font-medium text-foreground">
					{icon}
					{label}
				</div>
				<span className="text-lg font-semibold tabular-nums text-foreground">{coverage}%</span>
			</div>
			<Progress value={coverage} className="mt-3" />
			<div className="mt-2 flex items-center justify-between text-caption text-muted-foreground tabular-nums">
				<span>
					{metrics.reviewed_ever} de {metrics.total} revisados
				</span>
				<span>{pending} pendentes</span>
			</div>
			{metrics.reviewed_in_period > 0 && (
				<p className="mt-1 text-caption text-muted-foreground">
					{metrics.reviewed_in_period} revisado{metrics.reviewed_in_period === 1 ? "" : "s"} no período
				</p>
			)}
		</div>
	)
}

/**
 * Painel lateral de métricas de revisão de um único tipo (insumos OU preparações).
 * Base compartilhada; cada tela instancia o seu painel via os wrappers exportados abaixo.
 */
function ReviewMetricsSheetBase({ open, onOpenChange, type }: ReviewMetricsSheetProps & { type: MetricType }) {
	const config = TYPE_CONFIG[type]
	const [preset, setPreset] = useState<Preset>("6m")
	const [customFrom, setCustomFrom] = useState("")
	const [customTo, setCustomTo] = useState("")

	const window = useMemo(() => resolveWindow(preset, customFrom, customTo), [preset, customFrom, customTo])
	const enabled = open && window !== null
	const { data, isLoading, isError } = useReviewMetrics(window?.from, window?.to, enabled)

	// Cobertura, atividade diária e feed do tipo deste painel — payload traz ambos separados.
	const metrics = type === "ingredient" ? data?.ingredients : data?.recipes
	const countFor = useCallback((d: { ingredient_count: number; recipe_count: number }) => (type === "ingredient" ? d.ingredient_count : d.recipe_count), [type])

	const maxDaily = useMemo(() => {
		if (!data) return 0
		return data.daily.reduce((m, d) => Math.max(m, countFor(d)), 0)
	}, [data, countFor])

	const periodTotal = useMemo(() => {
		if (!data) return 0
		return data.daily.reduce((sum, d) => sum + countFor(d), 0)
	}, [data, countFor])

	const recent = useMemo(() => (data ? data.recent.filter((e) => e.type === type) : []), [data, type])

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
				<SheetHeader className="border-b border-border px-5 py-4">
					<SheetTitle className="flex items-center gap-2">
						<Activity className="size-4" />
						Revisão de {config.label}
					</SheetTitle>
					<SheetDescription>{config.description}</SheetDescription>
				</SheetHeader>

				{/* Filtro temporal */}
				<div className="border-b border-border px-5 py-3 space-y-3">
					<Select value={preset} onValueChange={(v) => setPreset((v as Preset) ?? "6m")}>
						<SelectTrigger className="w-full">
							<SelectValue>{PRESET_LABELS[preset]}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="6m">{PRESET_LABELS["6m"]}</SelectItem>
							<SelectItem value="12m">{PRESET_LABELS["12m"]}</SelectItem>
							<SelectItem value="custom">{PRESET_LABELS.custom}</SelectItem>
						</SelectContent>
					</Select>
					{preset === "custom" && (
						<div className="flex items-center gap-2">
							<Input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} aria-label="Data inicial" />
							<span className="text-caption text-muted-foreground">até</span>
							<Input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} aria-label="Data final" />
						</div>
					)}
					{preset === "custom" && window === null && <p className="text-caption text-muted-foreground">Selecione um intervalo de datas válido.</p>}
				</div>

				<ScrollArea className="min-h-0 flex-1">
					{isLoading ? (
						<div className="flex items-center justify-center py-16">
							<Loader2 className="size-6 animate-spin text-muted-foreground" />
						</div>
					) : isError ? (
						<div className="px-6 py-12 text-center text-sm text-muted-foreground">Não foi possível carregar as métricas.</div>
					) : !data || !metrics ? (
						<div className="px-6 py-12 text-center text-sm text-muted-foreground">Selecione um período para ver as métricas.</div>
					) : (
						<div className="space-y-6 px-5 py-4">
							{/* Cobertura geral (independente do período) */}
							<section className="space-y-3">
								<h3 className="text-caption font-medium uppercase tracking-wide text-muted-foreground">Cobertura geral</h3>
								<CoverageCard label={config.label} icon={<span className="text-muted-foreground">{config.icon}</span>} metrics={metrics} />
							</section>

							{/* Atividade no período (estilo GitHub) */}
							<section className="space-y-3">
								<div className="flex items-center justify-between">
									<h3 className="text-caption font-medium uppercase tracking-wide text-muted-foreground">Atividade no período</h3>
									<span className="text-caption text-muted-foreground tabular-nums">{periodTotal} revisões</span>
								</div>
								{periodTotal === 0 ? (
									<p className="rounded-lg border border-dashed border-border py-6 text-center text-caption text-muted-foreground">
										Nenhuma revisão registrada neste período.
									</p>
								) : (
									<ul className="space-y-1.5">
										{[...data.daily]
											.filter((d) => countFor(d) > 0)
											.reverse()
											.map((d) => {
												const total = countFor(d)
												const width = maxDaily > 0 ? Math.max(4, Math.round((total / maxDaily) * 100)) : 0
												return (
													<li key={d.date} className="flex items-center gap-3">
														<span className="w-14 shrink-0 text-caption text-muted-foreground tabular-nums">{formatDay(d.date)}</span>
														<div className="flex h-4 flex-1 overflow-hidden rounded-sm bg-muted">
															<div className="h-full bg-primary" style={{ width: `${width}%` }} />
														</div>
														<span className="w-8 shrink-0 text-right text-caption text-foreground tabular-nums">{total}</span>
													</li>
												)
											})}
									</ul>
								)}
							</section>

							{/* Feed recente */}
							{recent.length > 0 && (
								<section className="space-y-3">
									<h3 className="text-caption font-medium uppercase tracking-wide text-muted-foreground">Revisões recentes</h3>
									<ol className="space-y-2.5">
										{recent.map((entry) => (
											<ActivityRow key={`${entry.type}-${entry.id}-${entry.reviewed_at}`} entry={entry} />
										))}
									</ol>
								</section>
							)}
						</div>
					)}
				</ScrollArea>
			</SheetContent>
		</Sheet>
	)
}

function ActivityRow({ entry }: { entry: ReviewActivityEntry }) {
	return (
		<li className="flex items-start gap-2.5">
			<CalendarCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
			<div className="min-w-0 flex-1">
				<span className="block truncate text-sm text-foreground">{entry.name}</span>
				<p className="text-caption text-muted-foreground">
					{formatStamp(entry.reviewed_at)}
					{entry.reviewed_by_name ? ` · ${entry.reviewed_by_name}` : ""}
				</p>
			</div>
		</li>
	)
}

/** Painel de métricas de revisão de insumos — usado na tela de Gestão de Insumos. */
export function IngredientReviewMetricsSheet(props: ReviewMetricsSheetProps) {
	return <ReviewMetricsSheetBase {...props} type="ingredient" />
}

/** Painel de métricas de revisão de preparações — usado na tela de Preparações Globais. */
export function RecipeReviewMetricsSheet(props: ReviewMetricsSheetProps) {
	return <ReviewMetricsSheetBase {...props} type="recipe" />
}
