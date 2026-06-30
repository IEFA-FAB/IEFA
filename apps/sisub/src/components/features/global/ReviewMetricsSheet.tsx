import type { ReviewActivityEntry, ReviewTypeMetrics } from "@iefa/sisub-domain"
import { Activity, CalendarCheck, Loader2, Package, UtensilsCrossed } from "lucide-react"
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useReviewMetrics } from "@/services/ReviewMetricsService"

type Preset = "6m" | "12m" | "custom"

const PRESET_LABELS: Record<Preset, string> = {
	"6m": "Últimos 6 meses",
	"12m": "Últimos 12 meses",
	custom: "Intervalo personalizado",
}

interface ReviewMetricsSheetProps {
	open: boolean
	onOpenChange: (open: boolean) => void
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
	const from = new Date()
	from.setMonth(from.getMonth() - months)
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

/** Cobertura geral de um tipo (insumos ou preparações): % já revisado + pendentes. */
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

export function ReviewMetricsSheet({ open, onOpenChange }: ReviewMetricsSheetProps) {
	const [preset, setPreset] = useState<Preset>("6m")
	const [customFrom, setCustomFrom] = useState("")
	const [customTo, setCustomTo] = useState("")

	const window = useMemo(() => resolveWindow(preset, customFrom, customTo), [preset, customFrom, customTo])
	const enabled = open && window !== null
	const { data, isLoading, isError } = useReviewMetrics(window?.from, window?.to, enabled)

	const maxDaily = useMemo(() => {
		if (!data) return 0
		return data.daily.reduce((m, d) => Math.max(m, d.ingredient_count + d.recipe_count), 0)
	}, [data])

	const periodTotal = useMemo(() => {
		if (!data) return 0
		return data.daily.reduce((sum, d) => sum + d.ingredient_count + d.recipe_count, 0)
	}, [data])

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
				<SheetHeader className="border-b border-border px-5 py-4">
					<SheetTitle className="flex items-center gap-2">
						<Activity className="size-4" />
						Métricas de revisão
					</SheetTitle>
					<SheetDescription>Progresso da conferência de insumos e preparações pelos nutricionistas.</SheetDescription>
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

				<ScrollArea className="flex-1">
					{isLoading ? (
						<div className="flex items-center justify-center py-16">
							<Loader2 className="size-6 animate-spin text-muted-foreground" />
						</div>
					) : isError ? (
						<div className="px-6 py-12 text-center text-sm text-muted-foreground">Não foi possível carregar as métricas.</div>
					) : !data ? (
						<div className="px-6 py-12 text-center text-sm text-muted-foreground">Selecione um período para ver as métricas.</div>
					) : (
						<div className="space-y-6 px-5 py-4">
							{/* Cobertura geral (independente do período) */}
							<section className="space-y-3">
								<h3 className="text-caption font-medium uppercase tracking-wide text-muted-foreground">Cobertura geral</h3>
								<CoverageCard label="Insumos" icon={<Package className="size-4 text-muted-foreground" />} metrics={data.ingredients} />
								<CoverageCard label="Preparações" icon={<UtensilsCrossed className="size-4 text-muted-foreground" />} metrics={data.recipes} />
							</section>

							{/* Atividade no período (estilo GitHub) */}
							<section className="space-y-3">
								<div className="flex items-center justify-between">
									<h3 className="text-caption font-medium uppercase tracking-wide text-muted-foreground">Atividade no período</h3>
									<span className="text-caption text-muted-foreground tabular-nums">{periodTotal} revisões</span>
								</div>
								{data.daily.length === 0 ? (
									<p className="rounded-lg border border-dashed border-border py-6 text-center text-caption text-muted-foreground">
										Nenhuma revisão registrada neste período.
									</p>
								) : (
									<ul className="space-y-1.5">
										{[...data.daily].reverse().map((d) => {
											const total = d.ingredient_count + d.recipe_count
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
							{data.recent.length > 0 && (
								<section className="space-y-3">
									<h3 className="text-caption font-medium uppercase tracking-wide text-muted-foreground">Revisões recentes</h3>
									<ol className="space-y-2.5">
										{data.recent.map((entry) => (
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
	const isIngredient = entry.type === "ingredient"
	return (
		<li className="flex items-start gap-2.5">
			<CalendarCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate text-sm text-foreground">{entry.name}</span>
					<Badge variant="outline" className="shrink-0 text-[11px]">
						{isIngredient ? "Insumo" : "Preparação"}
					</Badge>
				</div>
				<p className="text-caption text-muted-foreground">
					{formatStamp(entry.reviewed_at)}
					{entry.reviewed_by_name ? ` · ${entry.reviewed_by_name}` : ""}
				</p>
			</div>
		</li>
	)
}
