import { lazy, Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { ChartSpec, ChartType } from "@/types/domain/analytics-chat"

// Lazy-load Recharts to avoid SSR issues and reduce initial bundle
const RechartsBarChart = lazy(() =>
	import("recharts").then((m) => ({
		default: function BarChartWrapper({ spec }: { spec: ChartSpec }) {
			const { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = m
			const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"]
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
			const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"]
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
			const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"]
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
			const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"]
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

interface ChatChartProps {
	spec: ChartSpec
	overrideType?: ChartType
}

export function ChatChart({ spec, overrideType }: ChatChartProps) {
	const type = overrideType ?? spec.type

	if (spec.data.length === 0) {
		return (
			<div className="rounded-lg border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
				Nenhum dado encontrado para esta consulta.
			</div>
		)
	}

	const fallback = <Skeleton className="h-[300px] w-full rounded-lg" />

	return (
		<div className="rounded-lg border border-border bg-card p-4">
			{spec.title && <p className="mb-3 text-sm font-medium text-foreground">{spec.title}</p>}
			{spec.description && <p className="mb-3 text-xs text-muted-foreground">{spec.description}</p>}
			{type === "table" ? (
				<DataTable spec={spec} />
			) : (
				<Suspense fallback={fallback}>
					{type === "bar" && <RechartsBarChart spec={spec} />}
					{type === "line" && <RechartsLineChart spec={spec} />}
					{type === "area" && <RechartsAreaChart spec={spec} />}
					{type === "pie" && <RechartsPieChart spec={spec} />}
				</Suspense>
			)}
		</div>
	)
}
