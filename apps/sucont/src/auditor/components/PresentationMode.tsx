import { Activity, ChevronLeft, ChevronRight, Layers, LayoutDashboard, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ComparisonChart, EvolutionChart } from "#/auditor/components/Charts"
import { CompositionDonuts } from "#/auditor/components/CompositionDonuts"
import { HealthScoreGauge } from "#/auditor/components/HealthScoreGauge"
import { formatCurrency, toShortDate } from "#/auditor/services/dataProcessor"
import { iccColor, iccLabel } from "#/auditor/theme"
import { AccountGroup, type FinancialRecord, type TimeFilter } from "#/auditor/types"
import { Button } from "#/components/ui/button"
import { StatTile } from "#/components/ui/stat-tile"
import { cn } from "#/lib/utils"

interface PresentationModeProps {
	isOpen: boolean
	onClose: () => void
	/** Série já filtrada pelo recorte da tela, com todas as competências. */
	data: FinancialRecord[]
	selectedMonth: string
	availableMonths: string[]
	timeFilter: TimeFilter
	/** Recorte ativo, em uma linha — vai no rodapé de cada lâmina. */
	scopeLabel: string
}

type SlideKind = "summary" | "report" | "evolution" | "composition"
type SlideGroup = "ALL" | AccountGroup

interface Slide {
	id: string
	kind: SlideKind
	group: SlideGroup
	title: string
}

const GROUP_ORDER: AccountGroup[] = [AccountGroup.BMP, AccountGroup.CONSUMO, AccountGroup.INTANGIVEL]

const GROUP_LABEL: Record<SlideGroup, string> = {
	ALL: "Consolidado",
	[AccountGroup.BMP]: "Bens Móveis Permanentes",
	[AccountGroup.CONSUMO]: "Bens de Consumo",
	[AccountGroup.INTANGIVEL]: "Bens Intangíveis",
}

/** Quantas competências entram no gráfico de evolução da lâmina. */
const EVOLUTION_WINDOW = 12

/** Quantas unidades cabem na tabela da lâmina de prestação de contas. */
const REPORT_ROWS = 8

const SLIDES: Slide[] = [
	{ id: "summary", kind: "summary", group: "ALL", title: "Visão global das divergências" },
	...GROUP_ORDER.flatMap((group): Slide[] => [
		{ id: `${group}-report`, kind: "report", group, title: "Prestação de contas" },
		{ id: `${group}-evolution`, kind: "evolution", group, title: `Evolução temporal (${EVOLUTION_WINDOW} competências)` },
		{ id: `${group}-composition`, kind: "composition", group, title: "Diferenças e composição" },
	]),
]

interface GroupStats {
	difference: number
	siafi: number
	siloms: number
	icc: number
	/** Variação da divergência contra o período anterior, em %. `null` sem base. */
	variation: number | null
}

function statsFor(records: FinancialRecord[], previous: FinancialRecord[]): GroupStats {
	const sum = (rows: FinancialRecord[], pick: (r: FinancialRecord) => number) => rows.reduce((acc, r) => acc + pick(r), 0)

	const difference = sum(records, (r) => r.difference)
	const siafi = sum(records, (r) => r.siafiValue)
	const siloms = sum(records, (r) => r.silomsValue)
	const previousDifference = sum(previous, (r) => r.difference)

	return {
		difference,
		siafi,
		siloms,
		icc: siafi > 0 ? Math.max(0, (1 - difference / siafi) * 100) : difference === 0 ? 100 : 0,
		// Sem competência anterior carregada, ou com ela zerada, não há percentual a
		// declarar. O telão é lido de longe e um "+100%" inventado não se desfaz.
		variation: previous.length > 0 && previousDifference > 0 ? ((difference - previousDifference) / previousDifference) * 100 : null,
	}
}

function VariationBadge({ variation }: { variation: number | null }) {
	if (variation === null) return <span className="text-body text-muted-foreground">sem base de comparação</span>
	const reduced = variation <= 0
	return (
		<span className={cn("text-body", reduced ? "text-success" : "text-destructive")}>
			{reduced ? "Redução" : "Aumento"} de {Math.abs(variation).toFixed(1)}%
		</span>
	)
}

/**
 * Modo apresentação: o painel do auditor em lâminas, para projeção.
 *
 * Dez lâminas — uma consolidada e três por natureza de bem (prestação de contas,
 * evolução, composição) —, na mesma ordem da ferramenta de origem, que é a ordem
 * em que a SUCONT-4 apresenta a competência.
 *
 * Os gráficos são os MESMOS componentes da tela (`EvolutionChart`,
 * `ComparisonChart`), não cópias redesenhadas para o telão: uma segunda versão de
 * cada gráfico divergiria da primeira no primeiro ajuste, e a lâmina passaria a
 * mostrar um número que a tela não mostra.
 *
 * Sem exportação para PPTX ou PNG, que na origem eram `pptxgenjs` e `html2canvas`.
 * O que a apresentação precisa é do telão; o documento para anexar é a Nota
 * Analítica, que já sai em Markdown.
 */
export function PresentationMode({ isOpen, onClose, data, selectedMonth, availableMonths, timeFilter, scopeLabel }: PresentationModeProps) {
	const [index, setIndex] = useState(0)
	const containerRef = useRef<HTMLDivElement>(null)

	const slide = SLIDES[index] ?? SLIDES[0]

	const previousMonth = useMemo(() => {
		const position = availableMonths.indexOf(selectedMonth)
		return position > 0 ? availableMonths[position - 1] : null
	}, [availableMonths, selectedMonth])

	/** Recortes por grupo, calculados uma vez para todas as lâminas. */
	const byGroup = useMemo(() => {
		const current = data.filter((r) => r.date === selectedMonth)
		const previous = previousMonth ? data.filter((r) => r.date === previousMonth) : []

		const pick = (group: SlideGroup, rows: FinancialRecord[]) => (group === "ALL" ? rows : rows.filter((r) => r.group === group))

		const entries = (["ALL", ...GROUP_ORDER] as SlideGroup[]).map((group) => {
			const rows = pick(group, current)
			return [group, { rows, stats: statsFor(rows, pick(group, previous)) }] as const
		})

		return Object.fromEntries(entries) as Record<SlideGroup, { rows: FinancialRecord[]; stats: GroupStats }>
	}, [data, selectedMonth, previousMonth])

	/** Janela de competências do gráfico de evolução, terminando na selecionada. */
	const evolutionRows = useMemo(() => {
		const position = availableMonths.indexOf(selectedMonth)
		const window = position === -1 ? availableMonths : availableMonths.slice(Math.max(0, position - (EVOLUTION_WINDOW - 1)), position + 1)
		const inWindow = new Set(window)
		return data.filter((r) => inWindow.has(r.date))
	}, [data, availableMonths, selectedMonth])

	const go = useCallback((delta: number) => setIndex((current) => Math.min(SLIDES.length - 1, Math.max(0, current + delta))), [])

	useEffect(() => {
		if (!isOpen) return
		setIndex(0)
		containerRef.current?.focus()
	}, [isOpen])

	useEffect(() => {
		if (!isOpen) return

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose()
			else if (event.key === "ArrowRight" || event.key === "PageDown") go(1)
			else if (event.key === "ArrowLeft" || event.key === "PageUp") go(-1)
			// Espaço avança, como em qualquer projetor — e por isso precisa impedir o
			// scroll padrão da página por baixo do telão.
			else if (event.key === " ") {
				event.preventDefault()
				go(1)
			} else return
		}

		window.addEventListener("keydown", onKeyDown)
		return () => window.removeEventListener("keydown", onKeyDown)
	}, [isOpen, onClose, go])

	if (!isOpen) return null

	const groupRows = byGroup[slide.group]?.rows ?? []
	const groupStats = byGroup[slide.group]?.stats
	const evolutionForGroup = slide.group === "ALL" ? evolutionRows : evolutionRows.filter((r) => r.group === slide.group)

	return (
		<div
			ref={containerRef}
			role="dialog"
			aria-modal="true"
			aria-label={`Apresentação — ${slide.title}`}
			// -1: recebe foco por código ao abrir, para o leitor de tela anunciar o telão, sem entrar na ordem de tabulação.
			tabIndex={-1}
			className="fixed inset-0 z-[70] flex flex-col bg-background outline-none"
		>
			<header className="flex items-center justify-between gap-4 border-border border-b px-6 py-4">
				<div className="min-w-0">
					<p className="text-label text-muted-foreground">Divisão de Contabilidade Patrimonial — SUCONT-4/DIREF</p>
					<h2 className="truncate text-display text-foreground">
						{slide.title}
						<span className="text-muted-foreground"> · {GROUP_LABEL[slide.group]}</span>
					</h2>
				</div>
				<div className="flex shrink-0 items-center gap-3">
					<span className="text-caption text-muted-foreground">
						{index + 1} / {SLIDES.length}
					</span>
					<Button variant="ghost" size="icon" onClick={onClose} aria-label="Sair da apresentação">
						<X className="size-5" />
					</Button>
				</div>
			</header>

			<main className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
				{slide.kind === "summary" && (
					<div className="mx-auto grid h-full max-w-6xl grid-cols-1 content-center gap-6 md:grid-cols-3">
						{GROUP_ORDER.map((group) => {
							const stats = byGroup[group].stats
							return (
								<div key={group} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
									<div className="flex items-center gap-2 text-muted-foreground">
										<Activity className="size-4" />
										<span className="text-label">{GROUP_LABEL[group]}</span>
									</div>
									<div>
										<p className="text-caption text-muted-foreground">Divergência total</p>
										<p className="text-display text-foreground">{formatCurrency(stats.difference)}</p>
									</div>
									<div className="border-border border-t pt-4">
										<p className="text-caption text-muted-foreground">Índice de Conciliação Contábil</p>
										<p className="text-heading" style={{ color: iccColor(stats.icc) }}>
											{stats.icc.toFixed(1)}% · {iccLabel(stats.icc)}
										</p>
									</div>
									<VariationBadge variation={stats.variation} />
								</div>
							)
						})}
					</div>
				)}

				{slide.kind === "report" && groupStats && (
					<div className="mx-auto flex max-w-6xl flex-col gap-6">
						<div className="grid grid-cols-1 gap-4 md:grid-cols-4">
							<StatTile label="Divergência total" value={formatCurrency(groupStats.difference)} status="destructive" icon={<Activity />} />
							<StatTile label="Saldo SIAFI" value={formatCurrency(groupStats.siafi)} icon={<LayoutDashboard />} />
							<StatTile label="Saldo SILOMS" value={formatCurrency(groupStats.siloms)} icon={<Layers />} />
							<div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card p-4">
								<span className="text-label text-muted-foreground">ICC</span>
								<HealthScoreGauge score={groupStats.icc} />
							</div>
						</div>

						<div className="overflow-x-auto rounded-lg border border-border">
							<table className="w-full border-collapse">
								<thead className="bg-muted/50">
									<tr>
										{["UG", "Cód.", "Divergência", "SIAFI", "SILOMS", "Situação"].map((label) => (
											<th key={label} className="whitespace-nowrap px-4 py-2 text-left text-label text-muted-foreground">
												{label}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{[...groupRows]
										.sort((a, b) => b.difference - a.difference)
										.slice(0, REPORT_ROWS)
										.map((row) => (
											<tr key={row.id} className="border-border border-t">
												<td className="px-4 py-2 text-body text-foreground">{row.ug}</td>
												<td className="px-4 py-2 text-body text-muted-foreground">{row.cod}</td>
												<td className="px-4 py-2 text-body text-foreground">{formatCurrency(row.difference)}</td>
												<td className="px-4 py-2 text-body text-muted-foreground">{formatCurrency(row.siafiValue)}</td>
												<td className="px-4 py-2 text-body text-muted-foreground">{formatCurrency(row.silomsValue)}</td>
												<td className="px-4 py-2 text-body text-muted-foreground">
													{row.preponderance === "EQUAL" ? "Equilibrado" : row.preponderance === "SIAFI" ? "SIAFI > SILOMS" : "SILOMS > SIAFI"}
												</td>
											</tr>
										))}
									{groupRows.length === 0 && (
										<tr>
											<td colSpan={6} className="px-4 py-6 text-center text-body text-muted-foreground">
												Nenhum saldo desta natureza na competência.
											</td>
										</tr>
									)}
								</tbody>
							</table>
						</div>
					</div>
				)}

				{slide.kind === "evolution" && (
					<div className="mx-auto h-full max-w-6xl">
						<EvolutionChart data={evolutionForGroup} selectedMonth={selectedMonth} timeFilter={timeFilter} />
					</div>
				)}

				{slide.kind === "composition" && (
					<div className="mx-auto grid h-full max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
						<div className="min-h-0">
							<ComparisonChart data={groupRows} />
						</div>
						<div className="min-h-0">
							<CompositionDonuts data={groupRows} />
						</div>
					</div>
				)}
			</main>

			<footer className="flex items-center justify-between gap-4 border-border border-t px-6 py-3">
				<p className="truncate text-caption text-muted-foreground">
					{toShortDate(selectedMonth)} · {scopeLabel}
				</p>
				<div className="flex shrink-0 items-center gap-2">
					<Button variant="outline" size="sm" onClick={() => go(-1)} disabled={index === 0}>
						<ChevronLeft className="size-4" />
						Anterior
					</Button>
					<Button variant="outline" size="sm" onClick={() => go(1)} disabled={index === SLIDES.length - 1}>
						Próxima
						<ChevronRight className="size-4" />
					</Button>
				</div>
			</footer>
		</div>
	)
}
