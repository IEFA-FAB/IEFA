import { Download } from "lucide-react"
import { Component, type ErrorInfo, lazy, type ReactNode, Suspense, useCallback, useRef } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { ChartSpec, ChartType } from "@/types/domain/analytics-chat"

// ── Error Boundary ──────────────────────────────────────────────────────────

interface ChartErrorBoundaryState {
	error: Error | null
}

class ChartErrorBoundary extends Component<{ children: ReactNode }, ChartErrorBoundaryState> {
	state: ChartErrorBoundaryState = { error: null }

	static getDerivedStateFromError(error: Error) {
		return { error }
	}

	componentDidCatch(_error: Error, _info: ErrorInfo) {}

	render() {
		if (this.state.error) {
			return (
				<div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
					<p className="font-medium">Erro ao renderizar gráfico</p>
					<p className="mt-1 text-xs opacity-80">{this.state.error.message}</p>
				</div>
			)
		}
		return this.props.children
	}
}

// ── Key Validation ──────────────────────────────────────────────────────────

function validateChartKeys(spec: ChartSpec): string | null {
	if (spec.data.length === 0) return null
	const sampleRow = spec.data[0]
	if (!sampleRow) return null
	const availableKeys = Object.keys(sampleRow)

	if (spec.type !== "pie" && !availableKeys.includes(spec.xAxisKey)) {
		return `Chave do eixo X "${spec.xAxisKey}" não encontrada nos dados. Colunas disponíveis: ${availableKeys.join(", ")}`
	}

	for (const s of spec.series) {
		if (!availableKeys.includes(s.key)) {
			return `Chave de série "${s.key}" não encontrada nos dados. Colunas disponíveis: ${availableKeys.join(", ")}`
		}
	}

	return null
}

// ── Export Utilities ────────────────────────────────────────────────────────

function sanitizeFilename(title: string): string {
	return (
		title
			.toLowerCase()
			.replace(/[^a-z0-9à-úç\s-]/g, "")
			.replace(/\s+/g, "-")
			.slice(0, 60) || "grafico"
	)
}

function triggerDownload(url: string, filename: string) {
	const a = document.createElement("a")
	a.href = url
	a.download = filename
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	URL.revokeObjectURL(url)
}

/** Resolve computed CSS → inline attributes so the SVG renders standalone. */
function inlineComputedStyles(original: SVGSVGElement, clone: SVGSVGElement) {
	const origElements = original.querySelectorAll("*")
	const cloneElements = clone.querySelectorAll("*")
	const PROPS = ["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-opacity", "fill-opacity", "opacity", "font-size", "font-family", "font-weight"]

	for (let i = 0; i < origElements.length; i++) {
		const orig = origElements[i]
		const target = cloneElements[i]
		if (!(orig instanceof SVGElement) || !(target instanceof SVGElement)) continue

		const computed = getComputedStyle(orig)
		for (const prop of PROPS) {
			const val = computed.getPropertyValue(prop)
			if (val) target.style.setProperty(prop, val)
		}
		target.removeAttribute("class")
	}
	clone.removeAttribute("class")
}

/** Clone SVG with inlined styles + white background, ready for export. */
function prepareSvgClone(container: HTMLDivElement): SVGSVGElement | null {
	const svg = container.querySelector("svg")
	if (!svg) return null

	const clone = svg.cloneNode(true) as SVGSVGElement
	inlineComputedStyles(svg, clone)

	// White background so exported image isn't transparent
	const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect")
	bg.setAttribute("width", "100%")
	bg.setAttribute("height", "100%")
	bg.setAttribute("fill", "#ffffff")
	clone.insertBefore(bg, clone.firstChild)

	// Ensure explicit dimensions
	const { width, height } = svg.getBoundingClientRect()
	clone.setAttribute("width", String(width))
	clone.setAttribute("height", String(height))
	clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")

	return clone
}

function exportAsSvg(container: HTMLDivElement, title: string) {
	const clone = prepareSvgClone(container)
	if (!clone) return

	const svgString = new XMLSerializer().serializeToString(clone)
	const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" })
	triggerDownload(URL.createObjectURL(blob), `${sanitizeFilename(title)}.svg`)
}

function exportAsPng(container: HTMLDivElement, title: string) {
	const svg = container.querySelector("svg")
	if (!svg) return

	const clone = prepareSvgClone(container)
	if (!clone) return

	const { width, height } = svg.getBoundingClientRect()
	const svgString = new XMLSerializer().serializeToString(clone)
	const base64 = btoa(unescape(encodeURIComponent(svgString)))
	const dataUrl = `data:image/svg+xml;base64,${base64}`

	const scale = 2 // 2× for retina-quality export
	const canvas = document.createElement("canvas")
	canvas.width = width * scale
	canvas.height = height * scale
	const ctx = canvas.getContext("2d")
	if (!ctx) return
	ctx.scale(scale, scale)

	const img = new Image()
	img.onload = () => {
		ctx.drawImage(img, 0, 0, width, height)
		canvas.toBlob((blob) => {
			if (!blob) return
			triggerDownload(URL.createObjectURL(blob), `${sanitizeFilename(title)}.png`)
		}, "image/png")
	}
	img.src = dataUrl
}

// ── Lazy Recharts (avoid SSR, reduce initial bundle) ────────────────────────

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"]

const RechartsBarChart = lazy(() =>
	import("recharts").then((m) => ({
		default: function BarChartWrapper({ spec }: { spec: ChartSpec }) {
			const { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = m
			return (
				<ResponsiveContainer width="100%" height={300}>
					<BarChart data={spec.data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
						<CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
						<XAxis dataKey={spec.xAxisKey} tick={{ fontSize: 12 }} />
						<YAxis tick={{ fontSize: 12 }} />
						<Tooltip />
						<Legend />
						{spec.series.map((s, i) => (
							<Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} />
						))}
					</BarChart>
				</ResponsiveContainer>
			)
		},
	}))
)

const RechartsLineChart = lazy(() =>
	import("recharts").then((m) => ({
		default: function LineChartWrapper({ spec }: { spec: ChartSpec }) {
			const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = m
			return (
				<ResponsiveContainer width="100%" height={300}>
					<LineChart data={spec.data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
						<CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
						<XAxis dataKey={spec.xAxisKey} tick={{ fontSize: 12 }} />
						<YAxis tick={{ fontSize: 12 }} />
						<Tooltip />
						<Legend />
						{spec.series.map((s, i) => (
							<Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
						))}
					</LineChart>
				</ResponsiveContainer>
			)
		},
	}))
)

const RechartsAreaChart = lazy(() =>
	import("recharts").then((m) => ({
		default: function AreaChartWrapper({ spec }: { spec: ChartSpec }) {
			const { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = m
			return (
				<ResponsiveContainer width="100%" height={300}>
					<AreaChart data={spec.data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
						<CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
						<XAxis dataKey={spec.xAxisKey} tick={{ fontSize: 12 }} />
						<YAxis tick={{ fontSize: 12 }} />
						<Tooltip />
						<Legend />
						{spec.series.map((s, i) => {
							const color = s.color ?? COLORS[i % COLORS.length]
							return <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={color} fill={color} fillOpacity={0.15} strokeWidth={2} />
						})}
					</AreaChart>
				</ResponsiveContainer>
			)
		},
	}))
)

const RechartsPieChart = lazy(() =>
	import("recharts").then((m) => ({
		default: function PieChartWrapper({ spec }: { spec: ChartSpec }) {
			const { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } = m
			const valueKey = spec.series[0]?.key ?? "value"
			return (
				<ResponsiveContainer width="100%" height={300}>
					<PieChart>
						<Pie data={spec.data} dataKey={valueKey} nameKey={spec.xAxisKey} cx="50%" cy="50%" outerRadius={100} label>
							{spec.data.map((_, index) => (
								<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
							))}
						</Pie>
						<Tooltip />
						<Legend />
					</PieChart>
				</ResponsiveContainer>
			)
		},
	}))
)

// ── Data Table ──────────────────────────────────────────────────────────────

function DataTable({ spec }: { spec: ChartSpec }) {
	const preferredColumns = [spec.xAxisKey, ...spec.series.map((s) => s.key)]
	const derivedColumns = spec.data.flatMap((row) => Object.keys(row))
	const columns = [...new Set([...preferredColumns, ...derivedColumns])]
	const headers = columns.map((column) => spec.series.find((serie) => serie.key === column)?.label ?? column)

	return (
		<div className="overflow-auto rounded-md border border-border">
			<Table>
				<TableHeader>
					<TableRow>
						{headers.map((h) => (
							<TableHead key={h} className="whitespace-nowrap text-xs">
								{h}
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{spec.data.map((row, i) => (
						<TableRow key={i}>
							{columns.map((col) => (
								<TableCell key={col} className="text-xs">
									{String(row[col] ?? "")}
								</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	)
}

// ── ChatChart ───────────────────────────────────────────────────────────────

interface ChatChartProps {
	spec: ChartSpec
	overrideType?: ChartType
}

export function ChatChart({ spec, overrideType }: ChatChartProps) {
	const type = overrideType ?? spec.type
	const chartRef = useRef<HTMLDivElement>(null)
	const isChart = type !== "table"

	const handleDownloadSvg = useCallback(() => {
		if (chartRef.current) exportAsSvg(chartRef.current, spec.title)
	}, [spec.title])

	const handleDownloadPng = useCallback(() => {
		if (chartRef.current) exportAsPng(chartRef.current, spec.title)
	}, [spec.title])

	if (spec.data.length === 0) {
		return (
			<div className="rounded-lg border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
				Nenhum dado encontrado para esta consulta.
			</div>
		)
	}

	// Validate that xAxisKey and series keys actually exist in the data rows.
	// Recharts silently renders empty when keys don't match — this surfaces the problem.
	const keyError = validateChartKeys(spec)
	if (keyError) {
		return (
			<div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
				<p className="font-medium">Dados incompatíveis com a configuração do gráfico</p>
				<p className="mt-1 text-xs opacity-80">{keyError}</p>
			</div>
		)
	}

	const fallback = <Skeleton className="h-[300px] w-full rounded-lg" />

	return (
		<div className="rounded-lg border border-border bg-card p-4">
			{/* Header — title/description + export buttons */}
			{(spec.title || spec.description || isChart) && (
				<div className="mb-3 flex items-start justify-between gap-2">
					<div className="min-w-0">
						{spec.title && <p className="text-sm font-medium text-foreground">{spec.title}</p>}
						{spec.description && <p className="mt-0.5 text-xs text-muted-foreground">{spec.description}</p>}
					</div>
					{isChart && (
						<div className="flex shrink-0 items-center gap-1">
							<button
								type="button"
								onClick={handleDownloadSvg}
								className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
								title="Baixar como SVG"
							>
								<Download className="h-3 w-3" />
								SVG
							</button>
							<button
								type="button"
								onClick={handleDownloadPng}
								className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
								title="Baixar como PNG"
							>
								<Download className="h-3 w-3" />
								PNG
							</button>
						</div>
					)}
				</div>
			)}
			<ChartErrorBoundary>
				{type === "table" ? (
					<DataTable spec={spec} />
				) : (
					<div ref={chartRef}>
						<Suspense fallback={fallback}>
							{type === "bar" && <RechartsBarChart spec={spec} />}
							{type === "line" && <RechartsLineChart spec={spec} />}
							{type === "area" && <RechartsAreaChart spec={spec} />}
							{type === "pie" && <RechartsPieChart spec={spec} />}
						</Suspense>
					</div>
				)}
			</ChartErrorBoundary>
		</div>
	)
}
