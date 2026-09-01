import { BarChart3, Building2, Layers, LayoutList, Network, User } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type { BarShapeProps } from "recharts"
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	Brush,
	CartesianGrid,
	ComposedChart,
	LabelList,
	Legend,
	Line,
	Rectangle,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	Treemap,
	XAxis,
	YAxis,
} from "recharts"
import { formatCompactNumber, formatCurrency, toShortDate } from "../services/dataProcessor"
import { chartChrome, chartSeries } from "../theme"
import type { FinancialRecord, TimeFilter } from "../types"
import { AccountGroup, RiskLevel } from "../types"

/**
 * Opacidade da barra por posição na curva de Pareto: cheia até 80% do acumulado,
 * apagada depois. Era um `<Cell>` por ponto — o `shape` recebe o mesmo dado em
 * `payload` e sobrevive à remoção do `Cell` no recharts 4.
 */
function paretoOpacity(payload: { accumulatedPct?: number } | undefined) {
	return payload?.accumulatedPct && payload.accumulatedPct <= 80 ? 1 : 0.4
}

interface ChartProps {
	data: FinancialRecord[]
	isExpanded?: boolean
	setHierarchy?: (h: "ODS" | "ORGAO" | "UG") => void
	hierarchyLevel?: "ODS" | "ORGAO" | "UG"
	hierarchyFilter?: string[]
	selectedMonth?: string
	timeFilter?: TimeFilter
}

// --- Constants & Styles ---
// Cromo do treemap: superfície, borda e texto. Sai de token para acompanhar o
// tema, ao contrário da paleta por ODS abaixo, que é escala categórica de dado.
const TREEMAP_COLORS = {
	base: chartChrome.surfaceMuted,
	dark: chartChrome.surface,
	border: chartChrome.grid,
	text: chartChrome.label,
}

// Standardized ODS Palette (Solid Military Tones)
const ODS_SOLID_COLORS: Record<string, string> = {
	SEFA: "#172554",
	DCTA: "#475569",
	COMPREP: "#134e4a",
	DECEA: "#0c4a6e",
	COMGAP: "#7f1d1d",
	COMGEP: "#78350f",
	GABAER: "#334155",
	"N/A": "#334155",
}

const getOdsColor = (ods: string) => {
	return ODS_SOLID_COLORS[ods] || ODS_SOLID_COLORS["N/A"]
}

// --- Shared Types ---
// Mirrors recharts' label `content` render-prop props: coordinates arrive as
// `string | number` (recharts' internal `Props`), so consumers must coerce.
interface LabelListContentProps {
	x?: string | number
	y?: string | number
	width?: string | number
	value?: string | number | boolean | null
}

// --- Custom Tooltip ---
interface TooltipDataPayload {
	diff?: number
	totalDiff?: number
	difference?: number
	siafi?: number
	totalSiafi?: number
	siafiValue?: number
	siloms?: number
	totalSiloms?: number
	silomsValue?: number
	accumulatedPct?: number
	icc?: number
	name?: string
	ug?: string
	bmpDiff?: number
	consumoDiff?: number
	intangivelDiff?: number
}
interface TooltipPayloadEntry {
	payload: TooltipDataPayload
}
interface CustomDetailedTooltipProps {
	active?: boolean
	payload?: TooltipPayloadEntry[]
	label?: string
	viewMode?: string
}
const CustomDetailedTooltip = ({ active, payload, label, viewMode: _viewMode }: CustomDetailedTooltipProps) => {
	if (active && payload?.length) {
		const data = payload[0].payload

		const diff = data.diff !== undefined ? data.diff : data.totalDiff !== undefined ? data.totalDiff : data.difference
		const siafi = data.siafi !== undefined ? data.siafi : data.totalSiafi !== undefined ? data.totalSiafi : data.siafiValue
		const siloms = data.siloms !== undefined ? data.siloms : data.totalSiloms !== undefined ? data.totalSiloms : data.silomsValue
		const pct = data.accumulatedPct
		const icc = data.icc

		const siafiNum = siafi ?? 0
		const silomsNum = siloms ?? 0
		const absDiff = Math.abs(siafiNum - silomsNum)
		const pctDiff = siafiNum > 0 ? (absDiff / siafiNum) * 100 : 0

		const displayName = data.name && data.name !== "N/A" ? data.name : data.ug && data.ug !== "N/A" ? data.ug : label

		return (
			<div
				className={`min-w-[260px] p-4 rounded-lg border shadow-2xl backdrop-blur-md z-50
        bg-card/95 border-border
      `}
			>
				<h4
					className={`text-sm font-bold mb-3 pb-2 border-b uppercase tracking-wider
          text-foreground border-border
        `}
				>
					{displayName}
				</h4>

				<div className="space-y-2.5">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<div className="w-2 h-2 rounded-full bg-(--series-bmp)"></div>
							<span className={`text-[11px] font-bold text-muted-foreground`}>Saldo SIAFI:</span>
						</div>
						<span className={`text-xs font-bold font-mono text-(--series-siafi)`}>{formatCurrency(siafi || 0)}</span>
					</div>

					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<div className="w-2 h-2 rounded-full bg-(--series-consumo)"></div>
							<span className={`text-[11px] font-bold text-muted-foreground`}>Saldo SILOMS:</span>
						</div>
						<span className={`text-xs font-bold font-mono text-(--series-siloms)`}>{formatCurrency(siloms || 0)}</span>
					</div>

					<div className="h-px bg-surface-inverted-border/50 my-1"></div>

					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<div className="w-2 h-2 rounded-sm bg-destructive"></div>
							<span className={`text-[11px] font-bold text-muted-foreground`}>Diferença Total:</span>
						</div>
						<span className={`text-xs font-bold font-mono text-destructive`}>{formatCurrency(diff ?? 0)}</span>
					</div>

					{data.bmpDiff !== undefined && (
						<div className="pl-4 space-y-1 mt-1 border-l border-surface-inverted-border/50">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-1.5">
									<div className="w-1.5 h-1.5 rounded-sm bg-(--series-bmp)"></div>
									<span className={`text-label text-muted-foreground`}>BMP</span>
								</div>
								<span className={`text-hint font-mono font-bold text-foreground`}>{formatCurrency(data.bmpDiff)}</span>
							</div>
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-1.5">
									<div className="w-1.5 h-1.5 rounded-sm bg-warning"></div>
									<span className={`text-label text-muted-foreground`}>Consumo</span>
								</div>
								<span className={`text-hint font-mono font-bold text-foreground`}>{formatCurrency(data.consumoDiff ?? 0)}</span>
							</div>
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-1.5">
									<div className="w-1.5 h-1.5 rounded-sm bg-(--series-intangivel)"></div>
									<span className={`text-label text-muted-foreground`}>Intangível</span>
								</div>
								<span className={`text-hint font-mono font-bold text-foreground`}>{formatCurrency(data.intangivelDiff ?? 0)}</span>
							</div>
						</div>
					)}

					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<div className="w-2 h-2 rounded-full bg-warning"></div>
							<span className={`text-[11px] font-bold text-muted-foreground`}>Diferença Percentual:</span>
						</div>
						<span className="text-xs font-bold font-mono text-warning">{pctDiff.toFixed(2)}%</span>
					</div>

					{icc !== undefined && (
						<div className="flex items-center justify-between pt-1 border-t border-surface-inverted-border/30 mt-1">
							<div className="flex items-center gap-2">
								<div className="w-2 h-2 rounded-full bg-success"></div>
								<span className={`text-[11px] font-bold text-muted-foreground`}>ICC:</span>
							</div>
							<span className="text-xs font-bold font-mono text-success">{icc.toFixed(2)}%</span>
						</div>
					)}

					{pct !== undefined && (
						<div className="flex items-center justify-between pt-1 border-t border-surface-inverted-border/30 mt-1">
							<div className="flex items-center gap-2">
								<div className="w-2 h-2 rounded-full bg-warning"></div>
								<span className={`text-[11px] font-bold text-muted-foreground`}>Acumulado Pareto:</span>
							</div>
							<span className="text-xs font-bold font-mono text-warning">{pct.toFixed(2)}%</span>
						</div>
					)}
				</div>
			</div>
		)
	}
	return null
}

// --- Comparison Chart ---
export const ComparisonChart: React.FC<ChartProps> = ({ data, isExpanded, setHierarchy, hierarchyLevel = "UG", hierarchyFilter = ["TODOS"] }) => {
	const [viewMode, setViewMode] = useState<"composition" | "ranking" | "tree">("ranking")
	const [treeGroupBy, setTreeGroupBy] = useState<"ODS" | "ORGAO" | "UG">("ODS")

	useEffect(() => {
		if (viewMode === "tree" && setHierarchy) {
			setHierarchy(treeGroupBy)
		}
	}, [viewMode, treeGroupBy, setHierarchy])

	type AggregatedItem = {
		name: string
		ug: string
		siafi: number
		siloms: number
		diff: number
		netDiff: number
		orgaoSuperior: string
		ods: string
		riskLevel?: RiskLevel
		bmpDiff: number
		consumoDiff: number
		intangivelDiff: number
		accumulatedPct?: number
	}

	type OrgaoChildShape = { name: string; ods: string; children: AggregatedItem[] }
	type OdsGroupShape = { name: string; ods: string; children: Record<string, OrgaoChildShape> }

	const { aggregated, paretoData, totalAbsDiff } = useMemo(() => {
		if (!data) return { aggregated: [], paretoData: [], totalAbsDiff: 0 }

		const agg = data
			.reduce((acc, curr) => {
				let key = curr.ug

				const isSpecificUnitSelected = hierarchyFilter && hierarchyFilter.length === 1 && hierarchyFilter[0] !== "TODOS"

				if (isSpecificUnitSelected || hierarchyLevel === "UG") key = curr.ug
				else if (hierarchyLevel === "ODS") key = curr.ods
				else if (hierarchyLevel === "ORGAO") key = curr.orgaoSuperior

				const found = acc.find((item) => item.name === key)
				if (found) {
					found.siafi += curr.siafiValue || 0
					found.siloms += curr.silomsValue || 0
					found.diff += curr.difference || 0
					found.netDiff += curr.silomsValue - curr.siafiValue

					if (curr.group === AccountGroup.BMP) found.bmpDiff += curr.difference || 0
					if (curr.group === AccountGroup.CONSUMO) found.consumoDiff += curr.difference || 0
					if (curr.group === AccountGroup.INTANGIVEL) found.intangivelDiff += curr.difference || 0
				} else {
					acc.push({
						name: key,
						ug: curr.ug,
						siafi: curr.siafiValue || 0,
						siloms: curr.silomsValue || 0,
						diff: curr.difference || 0,
						netDiff: curr.silomsValue - curr.siafiValue || 0,
						orgaoSuperior: curr.orgaoSuperior,
						ods: curr.ods,
						riskLevel: curr.riskLevel,
						bmpDiff: curr.group === AccountGroup.BMP ? curr.difference || 0 : 0,
						consumoDiff: curr.group === AccountGroup.CONSUMO ? curr.difference || 0 : 0,
						intangivelDiff: curr.group === AccountGroup.INTANGIVEL ? curr.difference || 0 : 0,
					})
				}
				return acc
			}, [] as AggregatedItem[])
			.filter((item) => item.diff > 0)

		agg.sort((a, b) => b.diff - a.diff)

		const total = agg.reduce((sum, item) => sum + item.diff, 0)
		let acc2 = 0
		const pareto = agg.map((item) => {
			acc2 += item.diff
			return {
				...item,
				totalAbsDiffContext: total,
				accumulatedPct: total > 0 ? (acc2 / total) * 100 : 0,
			}
		})

		return { aggregated: agg, paretoData: pareto, totalAbsDiff: total }
	}, [data, hierarchyFilter, hierarchyLevel])

	const treeData = useMemo(() => {
		if (treeGroupBy === "UG") {
			const odsGroups: Record<string, OdsGroupShape> = {}
			aggregated.forEach((item) => {
				const ods = item.ods || "N/A"
				const orgao = item.orgaoSuperior || "N/A"
				if (!odsGroups[ods]) odsGroups[ods] = { name: ods, ods: ods, children: {} }
				if (!odsGroups[ods].children[orgao]) odsGroups[ods].children[orgao] = { name: orgao, ods: ods, children: [] }
				odsGroups[ods].children[orgao].children.push({
					name: item.ug,
					ods: ods,
					size: item.diff,
					siafi: item.siafi,
					siloms: item.siloms,
					diff: item.diff,
					totalAbsDiffContext: totalAbsDiff,
				} as AggregatedItem & { size: number; totalAbsDiffContext: number })
			})
			return Object.values(odsGroups).map((ods) => ({
				name: ods.name,
				ods: ods.ods,
				children: Object.values(ods.children).map((orgao) => ({
					name: orgao.name,
					ods: orgao.ods,
					children: orgao.children,
				})),
			}))
		}

		type GroupNode = { name: string; ods: string; size: number; diff: number; siafi: number; siloms: number; totalAbsDiffContext: number }

		if (treeGroupBy === "ORGAO") {
			const groups: Record<string, GroupNode> = {}
			aggregated.forEach((item) => {
				const key = item.orgaoSuperior || "N/A"
				if (!groups[key]) {
					groups[key] = {
						name: key,
						ods: item.ods || "N/A",
						size: 0,
						diff: 0,
						siafi: 0,
						siloms: 0,
						totalAbsDiffContext: totalAbsDiff,
					}
				}
				groups[key].size += item.diff
				groups[key].diff += item.diff
				groups[key].siafi += item.siafi
				groups[key].siloms += item.siloms
			})
			return Object.values(groups)
		}

		const groups: Record<string, GroupNode> = {}
		aggregated.forEach((item) => {
			const key = item.ods || "N/A"
			if (!groups[key]) {
				groups[key] = {
					name: key,
					ods: key,
					size: 0,
					diff: 0,
					siafi: 0,
					siloms: 0,
					totalAbsDiffContext: totalAbsDiff,
				}
			}
			groups[key].size += item.diff
			groups[key].diff += item.diff
			groups[key].siafi += item.siafi
			groups[key].siloms += item.siloms
		})
		return Object.values(groups)
	}, [aggregated, treeGroupBy, totalAbsDiff])

	if (!data) return null

	const totalNetDivergence = aggregated.reduce((sum, item) => sum + item.netDiff, 0)
	const totalFinancialImpact = aggregated.reduce((sum, item) => sum + item.diff, 0)

	const displayData = isExpanded ? paretoData : paretoData.slice(0, 20)

	if (displayData.length === 0) {
		return <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados para exibir.</div>
	}

	const containerStyle: React.CSSProperties = isExpanded
		? viewMode === "tree"
			? { width: "2400px", height: "1600px" }
			: {
					width: "100%",
					height: "100%",
					minWidth: `${Math.max(displayData.length * 100, 1200)}px`,
				}
		: { width: "100%", height: "100%" }

	const overflowClass = isExpanded ? (viewMode === "tree" ? "flex-1 overflow-auto custom-scrollbar" : "overflow-x-auto custom-scrollbar pb-2") : ""

	interface AxisTickProps {
		x?: number
		y?: number
		payload?: { value: string }
		data?: { name: string; riskLevel?: RiskLevel }[]
		hierarchyLevel?: string
	}
	const CustomizedAxisTick = (props: AxisTickProps) => {
		const { x, y, payload, data: tickData, hierarchyLevel: hl } = props
		const item = tickData?.find((d) => d.name === payload?.value)

		let emoji = ""
		if (hl === "UG") {
			emoji = "🟢"
			if (item?.riskLevel === RiskLevel.MEDIO) emoji = "🟡"
			if (item?.riskLevel === RiskLevel.ALTO) emoji = "🟠"
			if (item?.riskLevel === RiskLevel.CRITICO) emoji = "🔴"
		}

		return (
			<g transform={`translate(${x},${y})`}>
				<text x={0} y={0} dy={24} textAnchor="end" fill={chartChrome.axis} fontSize={11} fontWeight="bold" transform="rotate(-45)">
					{payload?.value} {emoji}
				</text>
			</g>
		)
	}

	interface TreemapContentProps {
		x?: number
		y?: number
		width?: number
		height?: number
		name?: string
		diff?: number
		ods?: string
	}
	const CustomizedTreemapContent = (props: TreemapContentProps) => {
		const { x, y, width, height, name, diff, ods } = props

		const finalFill = getOdsColor(ods || name || "N/A")
		// Os tiles vêm de `ODS_SOLID_COLORS`, escura nos dois temas: o rótulo é claro
		// sempre. `--foreground` inverteria e sumiria no tema claro.
		const textColor = "var(--surface-inverted-foreground)"
		const textShadow = "0 1px 2px rgba(0,0,0,0.8)"

		return (
			<g className="recharts-treemap-node group cursor-pointer">
				<rect
					x={x}
					y={y}
					width={width}
					height={height}
					style={{
						fill: finalFill,
						stroke: TREEMAP_COLORS.border,
						strokeWidth: 1.5,
						transition: "all 0.3s ease",
					}}
				/>
				<rect
					x={x}
					y={y}
					width={width}
					height={height}
					fill="white"
					fillOpacity={0}
					className="group-hover:fill-opacity-10 transition-all duration-200"
					style={{ pointerEvents: "none" }}
				/>
				<foreignObject x={x} y={y} width={width} height={height}>
					<div className="w-full h-full flex flex-col items-center justify-center p-0.5 overflow-hidden pointer-events-none">
						<span
							className="text-label text-center leading-tight break-words px-1"
							style={{
								color: textColor,
								textShadow,
								display: "-webkit-box",
								WebkitLineClamp: 2,
								WebkitBoxOrient: "vertical",
								overflow: "hidden",
							}}
						>
							{name}
						</span>
						{(width ?? 0) > 40 && (height ?? 0) > 20 && (
							<span className="text-hint font-mono font-bold tracking-tight" style={{ color: textColor, textShadow }}>
								{formatCompactNumber(diff || 0)}
							</span>
						)}
					</div>
				</foreignObject>
			</g>
		)
	}

	return (
		<div className="flex flex-col h-full w-full relative">
			<div className="flex items-center justify-center gap-4 mb-4">
				<div
					className={`flex items-center gap-3 px-4 py-2 rounded-xl border shadow-sm
          bg-card border-border
        `}
				>
					<div className="flex flex-col text-center">
						<span className="text-label text-muted-foreground">Impacto Financeiro Total</span>
						<span className={`text-sm font-bold text-foreground`}>{formatCurrency(totalFinancialImpact)}</span>
					</div>
				</div>
			</div>

			<div className="absolute top-0 right-0 z-10 flex items-center gap-4">
				{viewMode === "tree" && (
					<div className="flex items-center gap-2 mr-4">
						<span className={`text-label text-muted-foreground`}>Agrupar por:</span>
						<div className={`flex rounded-lg p-0.5 border shadow-sm bg-muted border-border`}>
							{(["ODS", "ORGAO", "UG"] as const).map((gb) => (
								<button
									key={gb}
									type="button"
									onClick={() => setTreeGroupBy(gb)}
									className={`flex items-center gap-1.5 px-2.5 py-1 text-hint font-bold rounded-md transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50
                    ${treeGroupBy === gb ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}
                  `}
								>
									{gb === "ODS" && <Layers className="w-3 h-3" />}
									{gb === "ORGAO" && <Building2 className="w-3 h-3" />}
									{gb === "UG" && <User className="w-3 h-3" />}
									{gb === "ORGAO" ? "Órgão" : gb}
								</button>
							))}
						</div>
					</div>
				)}

				<div className={`flex rounded-lg p-0.5 border shadow-sm bg-muted border-border`}>
					{(
						[
							{ mode: "ranking", icon: LayoutList, label: "Pareto" },
							{ mode: "tree", icon: Network, label: "Árvore" },
							{ mode: "composition", icon: BarChart3, label: "Composição" },
						] as const
					).map(({ mode, icon: Icon, label }) => (
						<button
							key={mode}
							type="button"
							onClick={() => setViewMode(mode)}
							className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-md transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50
                ${viewMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}
              `}
						>
							<Icon className="w-3 h-3" />
							{label}
						</button>
					))}
				</div>
			</div>

			{isExpanded && viewMode === "composition" && (
				<div
					className={`mb-2 mr-36 px-3 py-2 rounded-lg border flex items-center justify-between max-w-md
           bg-muted/50 border-border`}
				>
					<span className="text-xs font-bold uppercase text-muted-foreground">Divergência Líquida</span>
					<span
						className={`text-sm font-mono font-bold
             ${totalNetDivergence > 0 ? "text-success" : totalNetDivergence < 0 ? "text-destructive" : "text-muted-foreground"}
           `}
					>
						{totalNetDivergence > 0 ? "+" : ""}
						{formatCurrency(totalNetDivergence)}
					</span>
				</div>
			)}

			<div className={`flex-1 w-full mt-2 ${overflowClass}`}>
				<div style={containerStyle} className="w-full h-full relative">
					<ResponsiveContainer width="100%" height="100%">
						{viewMode === "composition" ? (
							<BarChart data={displayData} margin={{ top: 40, right: 30, left: 20, bottom: isExpanded ? 120 : 80 }}>
								<CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartChrome.grid} />
								<XAxis
									dataKey="name"
									tick={<CustomizedAxisTick data={displayData} hierarchyLevel={hierarchyLevel} />}
									interval={0}
									height={isExpanded ? 100 : 60}
									axisLine={false}
									tickLine={false}
								/>
								<YAxis
									tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`}
									tick={{ fill: chartChrome.axis }}
									axisLine={false}
									tickLine={false}
									domain={[0, "auto"]}
								/>
								<Tooltip content={<CustomDetailedTooltip />} cursor={{ fill: chartChrome.surfaceMuted }} />
								<Legend wrapperStyle={{ paddingTop: "20px" }} />
								<Bar dataKey="siafi" name="SIAFI" fill={chartSeries.bmp} radius={[4, 4, 0, 0]} barSize={isExpanded ? 30 : undefined} />
								<Bar dataKey="siloms" name="SILOMS" fill={chartSeries.icc} radius={[4, 4, 0, 0]} barSize={isExpanded ? 30 : undefined} />
							</BarChart>
						) : viewMode === "ranking" ? (
							<ComposedChart data={displayData} margin={{ top: 40, right: 30, left: 20, bottom: isExpanded ? 120 : 60 }}>
								<CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartChrome.grid} />
								<XAxis
									dataKey="name"
									tick={<CustomizedAxisTick data={displayData} hierarchyLevel={hierarchyLevel} />}
									interval={0}
									height={isExpanded ? 100 : 60}
									axisLine={false}
									tickLine={false}
								/>
								<YAxis
									yAxisId="left"
									hide={true}
									domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.15)]}
									tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`}
									tick={{ fill: chartChrome.axis }}
									axisLine={false}
									tickLine={false}
								/>
								<YAxis
									yAxisId="right"
									orientation="right"
									tickFormatter={(value) => `${value}%`}
									tick={{ fill: chartSeries.axisAlt }}
									axisLine={false}
									tickLine={false}
									domain={[0, 100]}
								/>
								<Tooltip content={<CustomDetailedTooltip />} />
								<Legend wrapperStyle={{ paddingTop: "10px" }} />

								<Bar
									yAxisId="left"
									dataKey="bmpDiff"
									name="BMP"
									stackId="a"
									fill={chartSeries.bmp}
									radius={[8, 8, 0, 0]}
									barSize={isExpanded ? 40 : undefined}
									shape={(props: BarShapeProps) => <Rectangle {...props} fill={chartSeries.bmp} fillOpacity={paretoOpacity(props.payload)} />}
								/>
								<Bar
									yAxisId="left"
									dataKey="consumoDiff"
									name="Bens de Consumo"
									stackId="a"
									fill={chartSeries.consumo}
									radius={[8, 8, 0, 0]}
									barSize={isExpanded ? 40 : undefined}
									shape={(props: BarShapeProps) => <Rectangle {...props} fill={chartSeries.consumo} fillOpacity={paretoOpacity(props.payload)} />}
								/>
								<Bar
									yAxisId="left"
									dataKey="intangivelDiff"
									name="Intangíveis"
									stackId="a"
									radius={[8, 8, 0, 0]}
									fill={chartSeries.intangivel}
									barSize={isExpanded ? 40 : undefined}
									shape={(props: BarShapeProps) => <Rectangle {...props} fill={chartSeries.intangivel} fillOpacity={paretoOpacity(props.payload)} />}
								>
									<LabelList
										dataKey="diff"
										position="top"
										angle={-90}
										offset={20}
										content={(props: LabelListContentProps) => {
											const { value } = props
											const x = Number(props.x ?? 0)
											const y = Number(props.y ?? 0)
											const width = Number(props.width ?? 0)
											if (value === undefined || value === null || value === 0) return <g />
											const formattedValue = formatCompactNumber(Number(value))
											if (!isExpanded && width < 20) return <g />

											return (
												<g transform={`translate(${x + width / 2},${y - 20})`}>
													<rect
														x="-14"
														y="-75"
														width="28"
														height="85"
														fill={chartChrome.surface}
														fillOpacity={0.9}
														rx="8"
														stroke={chartChrome.grid}
														strokeWidth={1}
													/>
													<text x="0" y="0" dy={-8} textAnchor="start" fill={chartChrome.label} fontSize="12" fontWeight="bold" transform="rotate(-90)">
														{formattedValue}
													</text>
												</g>
											)
										}}
									/>
								</Bar>

								<Line
									yAxisId="right"
									type="monotone"
									dataKey="accumulatedPct"
									name="Acumulado %"
									stroke={chartSeries.axisAlt}
									strokeWidth={2}
									dot={{ r: 3, fill: chartSeries.axisAlt, strokeWidth: 0 }}
									activeDot={{ r: 5 }}
								/>
							</ComposedChart>
						) : (
							<Treemap
								data={treeData}
								dataKey="size"
								aspectRatio={2400 / 1600}
								stroke={chartChrome.surface}
								fill={chartSeries.pareto}
								content={<CustomizedTreemapContent />}
							>
								<Tooltip content={<CustomDetailedTooltip />} />
							</Treemap>
						)}
					</ResponsiveContainer>
				</div>
			</div>
		</div>
	)
}

// --- Evolution Area Chart ---
export const EvolutionChart: React.FC<ChartProps> = ({ data, selectedMonth, timeFilter = "MENSAL" }) => {
	const [viewMode, setViewMode] = useState<"total" | "overlap" | "icc" | "comparison">("total")
	const [brushRange, setBrushRange] = useState<{ start: number; end: number }>({
		start: 0,
		end: 0,
	})
	const [isManuallyAdjusted, setIsManuallyAdjusted] = useState(false)

	type TimeSeriesItem = {
		date: string
		year: number
		monthIndex: number
		totalDiff: number
		totalSiafi: number
		totalSiloms: number
		timestamp: number
		axisLabel: string
		icc?: number
		diffHighlight?: number
		prevYearDiff?: number
		prevYearLabel?: string
		currentYearLabel?: string
	}

	const timeSeries = useMemo(() => {
		if (!data) return [] as TimeSeriesItem[]
		const grouped = data.reduce((acc, curr) => {
			const found = acc.find((item) => item.date === curr.date)
			if (found) {
				found.totalDiff += curr.difference
				found.totalSiafi += curr.siafiValue
				found.totalSiloms += curr.silomsValue
			} else {
				acc.push({
					date: curr.date,
					year: curr.year,
					monthIndex: curr.monthIndex,
					totalDiff: curr.difference,
					totalSiafi: curr.siafiValue,
					totalSiloms: curr.silomsValue,
					timestamp: curr.year * 100 + curr.monthIndex,
					axisLabel: toShortDate(curr.date),
				})
			}
			return acc
		}, [] as TimeSeriesItem[])

		const sorted = grouped.sort((a, b) => a.timestamp - b.timestamp)

		let filteredSorted = sorted
		if (timeFilter !== "MENSAL" && sorted.length > 0 && viewMode !== "comparison") {
			let gap = 1
			if (timeFilter === "TRIMESTRAL") gap = 3
			if (timeFilter === "SEMESTRAL") gap = 6
			if (timeFilter === "ANUAL") gap = 12

			let anchorIndex = sorted.length - 1
			if (selectedMonth && selectedMonth !== "TODOS") {
				const foundIndex = sorted.findIndex((s) => s.date === selectedMonth)
				if (foundIndex >= 0) anchorIndex = foundIndex
			}

			const anchorItem = sorted[anchorIndex]
			const anchorTotalMonths = anchorItem.year * 12 + anchorItem.monthIndex

			filteredSorted = sorted.filter((item) => {
				const itemTotalMonths = item.year * 12 + item.monthIndex
				const diffMonths = anchorTotalMonths - itemTotalMonths
				return diffMonths >= 0 && diffMonths % gap === 0
			})
		}

		return filteredSorted.map((item) => {
			const icc = item.totalSiafi > 0 ? Math.max(0, (1 - item.totalDiff / item.totalSiafi) * 100) : item.totalDiff === 0 ? 100 : 0

			const prevYear = item.year - 1
			const prevMonth = item.monthIndex
			const prevYearItem = sorted.find((s) => s.year === prevYear && s.monthIndex === prevMonth)

			return {
				...item,
				icc: Math.max(0, Math.min(100, icc)),
				diffHighlight: Math.abs(item.totalSiafi - item.totalSiloms),
				prevYearDiff: prevYearItem ? prevYearItem.totalDiff : 0,
				prevYearLabel: prevYearItem ? toShortDate(prevYearItem.date) : "N/A",
				currentYearLabel: toShortDate(item.date),
			}
		})
	}, [data, timeFilter, viewMode, selectedMonth])

	useEffect(() => {
		setIsManuallyAdjusted(false)
	}, [])

	useEffect(() => {
		if (timeSeries.length === 0) return

		if (isManuallyAdjusted) {
			setBrushRange((prev) => {
				if (prev.end >= timeSeries.length) {
					const size = prev.end - prev.start
					const end = timeSeries.length - 1
					const start = Math.max(0, end - size)
					return { start, end }
				}
				return prev
			})
			return
		}

		const totalPoints = timeSeries.length
		const selectedIndex = selectedMonth && selectedMonth !== "TODOS" ? timeSeries.findIndex((t) => t.date === selectedMonth) : -1

		const end = selectedIndex >= 0 ? selectedIndex : totalPoints - 1

		let pointsForOneYear = 12
		if (viewMode !== "comparison") {
			if (timeFilter === "TRIMESTRAL") pointsForOneYear = 4
			if (timeFilter === "SEMESTRAL") pointsForOneYear = 2
			if (timeFilter === "ANUAL") pointsForOneYear = 3
		}

		const start = Math.max(0, end - (pointsForOneYear - 1))
		setBrushRange({ start, end })
	}, [selectedMonth, timeSeries, isManuallyAdjusted, timeFilter, viewMode])

	if (!data || timeSeries.length === 0) return <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados.</div>

	type BrushChangeRange = { startIndex?: number; endIndex?: number }

	const handleBrushChange = (range: BrushChangeRange) => {
		if (range && typeof range.startIndex === "number" && typeof range.endIndex === "number") {
			if (range.startIndex !== brushRange.start || range.endIndex !== brushRange.end) {
				setBrushRange({ start: range.startIndex, end: range.endIndex })
				setIsManuallyAdjusted(true)
			}
		}
	}

	return (
		<div className="w-full h-full min-h-[300px] flex flex-col select-none">
			<div className="flex justify-between items-center mb-1 px-2">
				<div className="flex items-center gap-4">
					<div className={`flex rounded-lg p-0.5 border shadow-sm bg-muted border-border`}>
						{(
							[
								{ mode: "total", label: "Saldos (Total)" },
								{ mode: "overlap", label: "SIAFi x SIloms" },
								{ mode: "icc", label: "ICC (%)" },
								{ mode: "comparison", label: "Comparativo Anual" },
							] as const
						).map(({ mode, label }) => (
							<button
								key={mode}
								type="button"
								onClick={() => setViewMode(mode)}
								className={`px-3 py-1.5 text-hint font-bold rounded-md transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50
                  ${viewMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}
                `}
							>
								{label}
							</button>
						))}
					</div>

					{viewMode === "comparison" && timeSeries[brushRange.end] && (
						<div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border shadow-sm bg-success/10 border-success/30`}>
							<span className={`text-[11px] font-bold uppercase text-success`}>ICC Atual ({timeSeries[brushRange.end].axisLabel}):</span>
							<span className={`text-lg font-bold text-success`}>{(timeSeries[brushRange.end].icc ?? 0).toFixed(1)}%</span>
						</div>
					)}
				</div>

				<div className="flex items-center gap-4">
					{viewMode === "icc" ? (
						<div className="flex items-center gap-2">
							<div className="w-3 h-3 rounded-sm bg-(--series-icc)"></div>
							<span className="text-label text-muted-foreground">Índice de Conciliação</span>
						</div>
					) : viewMode === "comparison" ? (
						<>
							<div className="flex items-center gap-2">
								<div className="w-3 h-3 rounded-sm" style={{ backgroundColor: chartChrome.axis }}></div>
								<span className="text-label text-muted-foreground">Ano Anterior</span>
							</div>
							<div className="flex items-center gap-2">
								<div className="w-3 h-3 rounded-sm bg-(--series-pareto)"></div>
								<span className="text-label text-muted-foreground">Ano Atual</span>
							</div>
						</>
					) : (
						<>
							<div className="flex items-center gap-2">
								<div className="w-3 h-3 rounded-sm bg-(--series-bmp)"></div>
								<span className="text-label text-muted-foreground">SIAFi</span>
							</div>
							<div className="flex items-center gap-2">
								<div className="w-3 h-3 rounded-sm bg-(--series-consumo)"></div>
								<span className="text-label text-muted-foreground">SIloms</span>
							</div>
							<div className="flex items-center gap-2">
								<div className="w-3 h-3 rounded-sm bg-destructive opacity-50"></div>
								<span className="text-label text-muted-foreground">Divergência</span>
							</div>
						</>
					)}
				</div>
			</div>

			<div className="flex-1 min-h-[300px]">
				<ResponsiveContainer width="100%" height="100%" minHeight={300}>
					{viewMode === "comparison" ? (
						<BarChart data={timeSeries} margin={{ top: 25, right: 10, left: 10, bottom: 0 }} barGap={6}>
							<CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartChrome.grid} />
							<XAxis dataKey="axisLabel" tick={{ fill: chartChrome.axis, fontSize: 10 }} axisLine={false} tickLine={false} />
							<YAxis
								tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`}
								tick={{ fill: chartChrome.axis, fontSize: 10 }}
								axisLine={false}
								tickLine={false}
								domain={[0, (dataMax: number) => dataMax * 1.5]}
							/>
							<Tooltip content={<CustomDetailedTooltip viewMode={viewMode} />} />
							<Legend verticalAlign="top" height={20} />
							<Bar dataKey="prevYearDiff" name="Ano Anterior" fill={chartChrome.axis} fillOpacity={0.5} radius={[4, 4, 0, 0]}>
								<LabelList
									dataKey="prevYearDiff"
									position="top"
									angle={-90}
									offset={15}
									content={(props: LabelListContentProps) => {
										const { value } = props
										const x = Number(props.x ?? 0)
										const y = Number(props.y ?? 0)
										const width = Number(props.width ?? 0)
										if (value === undefined || value === null) return <g />
										return (
											<g transform={`translate(${x + width / 2},${y - 15})`}>
												<rect x="-11" y="-65" width="22" height="70" fill={chartChrome.surface} fillOpacity={0.9} rx="4" />
												<text x="0" y="0" dy={-5} textAnchor="start" fill={chartChrome.axis} fontSize="14" fontWeight="bold" transform="rotate(-90)">
													{formatCompactNumber(Number(value))}
												</text>
											</g>
										)
									}}
								/>
							</Bar>
							<Bar dataKey="totalDiff" name="Ano Atual" fill={chartSeries.pareto} radius={[4, 4, 0, 0]}>
								<LabelList
									dataKey="totalDiff"
									position="top"
									angle={-90}
									offset={15}
									content={(props: LabelListContentProps) => {
										const { value } = props
										const x = Number(props.x ?? 0)
										const y = Number(props.y ?? 0)
										const width = Number(props.width ?? 0)
										if (value === undefined || value === null) return <g />
										return (
											<g transform={`translate(${x + width / 2},${y - 15})`}>
												<rect x="-11" y="-65" width="22" height="70" fill={chartChrome.surface} fillOpacity={0.9} rx="4" />
												<text x="0" y="0" dy={-5} textAnchor="start" fill={chartSeries.pareto} fontSize="14" fontWeight="bold" transform="rotate(-90)">
													{formatCompactNumber(Number(value))}
												</text>
											</g>
										)
									}}
								/>
							</Bar>
							<Brush
								dataKey="axisLabel"
								height={30}
								stroke={chartChrome.grid}
								fill={chartChrome.surfaceMuted}
								startIndex={brushRange.start}
								endIndex={brushRange.end}
								onChange={handleBrushChange}
								travellerWidth={12}
								alwaysShowText={false}
							/>
						</BarChart>
					) : (
						<AreaChart
							key={`chart-${viewMode}-${timeSeries.length}-${timeSeries[0]?.date}`}
							data={timeSeries}
							margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
						>
							<defs>
								<linearGradient id="colorSiafi" x1="0" y1="0" x2="0" y2="1">
									<stop offset="5%" stopColor={chartSeries.bmp} stopOpacity={0.6} />
									<stop offset="95%" stopColor={chartSeries.bmp} stopOpacity={0.1} />
								</linearGradient>
								<linearGradient id="colorSiloms" x1="0" y1="0" x2="0" y2="1">
									<stop offset="5%" stopColor={chartSeries.consumo} stopOpacity={0.4} />
									<stop offset="95%" stopColor={chartSeries.consumo} stopOpacity={0.05} />
								</linearGradient>
								<linearGradient id="colorDiff" x1="0" y1="0" x2="0" y2="1">
									<stop offset="5%" stopColor={chartSeries.pareto} stopOpacity={0.4} />
									<stop offset="95%" stopColor={chartSeries.pareto} stopOpacity={0} />
								</linearGradient>
								<linearGradient id="colorIcc" x1="0" y1="0" x2="0" y2="1">
									<stop offset="5%" stopColor={chartSeries.icc} stopOpacity={0.3} />
									<stop offset="95%" stopColor={chartSeries.icc} stopOpacity={0} />
								</linearGradient>
							</defs>
							<CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartChrome.grid} />
							<XAxis dataKey="axisLabel" tick={{ fill: chartChrome.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
							<YAxis
								tickFormatter={(value) => (viewMode === "icc" ? `${value}%` : `${(value / 1000000).toFixed(0)}M`)}
								tick={{ fill: chartChrome.axis, fontSize: 12 }}
								axisLine={false}
								tickLine={false}
								domain={viewMode === "icc" ? [0, 110] : ["auto", "auto"]}
							/>
							<Tooltip content={<CustomDetailedTooltip viewMode={viewMode} />} />

							{selectedMonth && selectedMonth !== "TODOS" && (
								<ReferenceLine
									x={toShortDate(selectedMonth)}
									stroke={chartSeries.diff}
									strokeDasharray="3 3"
									label={{
										value: "SELECIONADO",
										position: "top",
										fill: chartSeries.diff,
										fontSize: 10,
										fontWeight: "bold",
									}}
								/>
							)}

							{viewMode === "icc" && (
								<ReferenceLine
									y={100}
									stroke={chartChrome.grid}
									strokeDasharray="3 3"
									label={{
										value: "META 100%",
										position: "insideBottomRight",
										fill: chartChrome.axis,
										fontSize: 10,
										fontWeight: "bold",
										offset: 10,
									}}
								/>
							)}

							{viewMode === "overlap" ? (
								<>
									<Area type="monotone" dataKey="diffHighlight" stroke="none" fill={chartSeries.diff} fillOpacity={0.15} />
									<Area
										type="monotone"
										dataKey="totalSiafi"
										name="SIAFi"
										stroke={chartSeries.siafi}
										strokeWidth={2}
										fillOpacity={1}
										fill="url(#colorSiafi)"
										strokeLinejoin="round"
										strokeLinecap="round"
										dot={{
											r: 3,
											fill: chartSeries.bmp,
											strokeWidth: 1,
											stroke: chartChrome.surface,
										}}
									/>
									<Area
										type="monotone"
										dataKey="totalSiloms"
										name="SIloms"
										stroke={chartSeries.siloms}
										strokeWidth={2}
										fillOpacity={1}
										fill="url(#colorSiloms)"
										strokeLinejoin="round"
										strokeLinecap="round"
										dot={{
											r: 3,
											fill: chartSeries.consumo,
											strokeWidth: 1,
											stroke: chartChrome.surface,
										}}
									/>
								</>
							) : viewMode === "icc" ? (
								<Area
									type="monotone"
									dataKey="icc"
									name="ICC"
									stroke={chartSeries.icc}
									strokeWidth={3}
									fillOpacity={1}
									fill="url(#colorIcc)"
									strokeLinejoin="round"
									strokeLinecap="round"
									dot={{
										r: 5,
										fill: chartSeries.icc,
										strokeWidth: 2,
										stroke: chartChrome.surface,
									}}
									activeDot={{ r: 7, strokeWidth: 0 }}
								>
									<LabelList
										dataKey="icc"
										position="top"
										offset={20}
										formatter={(val) => `${Number(val).toFixed(1)}%`}
										style={{
											fontSize: "16px",
											fontWeight: "900",
											fill: chartSeries.accumulated,
										}}
									/>
								</Area>
							) : (
								<Area
									type="monotone"
									dataKey="totalDiff"
									name="Divergência"
									stroke={chartSeries.pareto}
									strokeWidth={3}
									fillOpacity={1}
									fill="url(#colorDiff)"
									strokeLinejoin="round"
									strokeLinecap="round"
									dot={{
										r: 4,
										fill: chartSeries.pareto,
										strokeWidth: 2,
										stroke: chartChrome.surface,
									}}
									activeDot={{ r: 6, strokeWidth: 0 }}
								>
									<LabelList
										dataKey="totalDiff"
										position="top"
										offset={15}
										formatter={(val) => formatCompactNumber(Number(val))}
										style={{
											fontSize: "14px",
											fontWeight: "bold",
											fill: chartSeries.pareto,
										}}
									/>
								</Area>
							)}

							<Brush
								dataKey="axisLabel"
								height={30}
								stroke={chartChrome.grid}
								fill={chartChrome.surfaceMuted}
								startIndex={brushRange.start}
								endIndex={brushRange.end}
								onChange={handleBrushChange}
								travellerWidth={12}
								alwaysShowText={false}
							/>
						</AreaChart>
					)}
				</ResponsiveContainer>
			</div>
		</div>
	)
}
