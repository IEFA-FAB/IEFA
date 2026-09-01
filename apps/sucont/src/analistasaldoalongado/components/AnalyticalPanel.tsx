import { Activity, AlertTriangle, BarChart3, FileImage, Filter, PieChart as PieChartIcon, Target, TrendingUp, X } from "lucide-react"
import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Button } from "#/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select"
import { chartChrome } from "#/lib/chart-theme"
import type { UgConsolidated } from "../utils/analytics"
import { exportElementToImage } from "../utils/exportUtils"
import { getUgHierarchy } from "../utils/hierarchy"
import { getQuestaoByAccount, RAC_MAPPING } from "../utils/rac"

interface AnalyticalPanelProps {
	data: UgConsolidated[]
}

const RAC_QUESTIONS = Object.keys(RAC_MAPPING).sort((a, b) => {
	const numA = parseInt(a.replace("Questão ", ""), 10)
	const numB = parseInt(b.replace("Questão ", ""), 10)
	return numA - numB
})

// Paleta CATEGÓRICA de visualização: existe para distinguir categorias entre si.
// Fica em hex explícito de propósito (ver STYLE_CONTRACT §8) — mapeá-la para
// tokens de estado colapsa cores diferentes na mesma e a legenda passa a afirmar
// que duas categorias são a mesma coisa.
const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"]

const formatCurrency = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)

type ChartClickEvent<T extends Record<string, unknown> = Record<string, unknown>> = {
	activePayload?: Array<{ payload: T }>
}

export function AnalyticalPanel({ data }: AnalyticalPanelProps) {
	const [selectedRac, setSelectedRac] = useState<string>("Geral")
	const [selectedDetailLevel, setSelectedDetailLevel] = useState<{
		type: "ods" | "orgaoSuperior"
		name: string
	} | null>(null)

	const filteredData = useMemo(() => {
		if (selectedRac === "Geral") return [...data]
		return data
			.map((item) => {
				const matchingOcorrencias = item.ocorrencias.filter((occ) => getQuestaoByAccount(occ.conta_contabil) === selectedRac)
				if (matchingOcorrencias.length === 0) return null
				return {
					...item,
					ocorrencias: matchingOcorrencias,
					quantidade_ocorrencias: matchingOcorrencias.length,
					saldo_total: matchingOcorrencias.reduce((sum, occ) => sum + occ.saldo, 0),
				}
			})
			.filter((item): item is UgConsolidated => item !== null)
	}, [data, selectedRac])

	const totalBalance = useMemo(() => filteredData.reduce((acc, curr) => acc + curr.saldo_total, 0), [filteredData])
	const totalOccurrences = useMemo(() => filteredData.reduce((acc, curr) => acc + curr.quantidade_ocorrencias, 0), [filteredData])

	const odsData = useMemo(() => {
		const groups: Record<string, { ods: string; count: number; balance: number }> = {}
		filteredData.forEach((ug) => {
			const hierarchy = getUgHierarchy(ug.ug)
			const ods = hierarchy.ods
			if (!groups[ods]) groups[ods] = { ods, count: 0, balance: 0 }
			groups[ods].count += ug.quantidade_ocorrencias
			groups[ods].balance += ug.saldo_total
		})
		return Object.values(groups)
			.sort((a, b) => b.balance - a.balance)
			.map((item) => ({
				...item,
				percentage: totalBalance > 0 ? (item.balance / totalBalance) * 100 : 0,
			}))
	}, [filteredData, totalBalance])

	const paretoData = useMemo(() => {
		const sortedUgs = [...filteredData].sort((a, b) => b.saldo_total - a.saldo_total)
		let cumulativeBalance = 0
		return sortedUgs.map((ug) => {
			cumulativeBalance += ug.saldo_total
			return {
				ug: `${ug.ug} - ${ug.nome_ug || "-"}`,
				balance: ug.saldo_total,
				cumulativePercentage: totalBalance > 0 ? (cumulativeBalance / totalBalance) * 100 : 0,
			}
		})
	}, [filteredData, totalBalance])

	const paretoUgs = useMemo(() => paretoData.filter((item) => item.cumulativePercentage <= 85), [paretoData])

	const orgaoData = useMemo(() => {
		const groups: Record<string, { name: string; balance: number }> = {}
		filteredData.forEach((ug) => {
			const hierarchy = getUgHierarchy(ug.ug)
			const name = hierarchy.orgaoSuperior
			if (!groups[name]) groups[name] = { name, balance: 0 }
			groups[name].balance += ug.saldo_total
		})
		return Object.values(groups).sort((a, b) => b.balance - a.balance)
	}, [filteredData])

	const detailedUgs = useMemo(() => {
		if (!selectedDetailLevel) return []
		return filteredData
			.filter((ug) => {
				const hierarchy = getUgHierarchy(ug.ug)
				return selectedDetailLevel.type === "ods" ? hierarchy.ods === selectedDetailLevel.name : hierarchy.orgaoSuperior === selectedDetailLevel.name
			})
			.sort((a, b) => b.saldo_total - a.saldo_total)
	}, [filteredData, selectedDetailLevel])

	return (
		<div className="space-y-8">
			{/* Filters */}
			<div className="bg-card p-4 rounded-xl border border-border shadow-sm flex items-center justify-end gap-4">
				<div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border border-border rounded-lg">
					<Filter className="w-4 h-4 text-muted-foreground" />
					<span className="text-caption text-muted-foreground">Questão RAC:</span>
					<Select
						items={{ Geral: "Todas as Questões", ...Object.fromEntries(RAC_QUESTIONS.map((q) => [q, q])) }}
						value={selectedRac}
						onValueChange={(v) => setSelectedRac(v ?? "Geral")}
					>
						<SelectTrigger className="data-[size=default]:h-auto border-none bg-transparent p-0 text-caption text-fab-700 shadow-none focus-visible:ring-0">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="Geral">Todas as Questões</SelectItem>
							{RAC_QUESTIONS.map((q) => (
								<SelectItem key={q} value={q}>
									{q}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Summary Header */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
				<div className="bg-card p-6 rounded-xl border border-border shadow-sm">
					<div className="flex items-center gap-4 mb-4">
						<div className="p-3 bg-fab-100 rounded-xl">
							<TrendingUp className="w-6 h-6 text-fab-600" />
						</div>
						<div>
							<p className="text-subheading text-muted-foreground">Saldo Total Analisado</p>
							<h3 className="text-display text-foreground">{formatCurrency(totalBalance)}</h3>
						</div>
					</div>
					<div className="text-caption text-muted-foreground">Volume financeiro total sob acompanhamento contábil.</div>
				</div>

				<div className="bg-card p-6 rounded-xl border border-border shadow-sm">
					<div className="flex items-center gap-4 mb-4">
						<div className="p-3 bg-warning/15 rounded-xl">
							<AlertTriangle className="w-6 h-6 text-warning" />
						</div>
						<div>
							<p className="text-subheading text-muted-foreground">Total de Inconsistências</p>
							<h3 className="text-display text-foreground">{totalOccurrences}</h3>
						</div>
					</div>
					<div className="text-caption text-muted-foreground">Número total de ocorrências identificadas nas UGs.</div>
				</div>

				<div className="bg-card p-6 rounded-xl border border-border shadow-sm">
					<div className="flex items-center gap-4 mb-4">
						<div className="p-3 bg-action/10 rounded-xl">
							<Target className="w-6 h-6 text-action" />
						</div>
						<div>
							<p className="text-subheading text-muted-foreground">Foco de Atuação (Pareto)</p>
							<h3 className="text-display text-foreground">{paretoUgs.length} UGs</h3>
						</div>
					</div>
					<div className="text-caption text-muted-foreground">Unidades que concentram ~80% do saldo total.</div>
				</div>
			</div>

			{/* Pareto Analysis */}
			<div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden relative" id="analise-pareto">
				<div className="px-6 py-4 border-b border-border flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Activity className="w-5 h-5 text-fab-600" />
						<h3 className="font-bold text-foreground">Análise de Pareto (Curva ABC)</h3>
					</div>
					<Button
						type="button"
						onClick={() => exportElementToImage("analise-pareto", "mapa-risco-pareto")}
						variant="outline"
						size="sm"
						className="gap-2 px-3 py-1.5 text-caption text-muted-foreground bg-muted/50 hover:bg-muted/80 border-border rounded-lg transition-colors"
					>
						<FileImage className="w-3.5 h-3.5" />
						<span>Exportar</span>
					</Button>
				</div>
				<div className="p-6 bg-card">
					<div className="h-[400px]">
						<ResponsiveContainer width="100%" height="100%">
							<ComposedChart data={paretoData.slice(0, 30)}>
								<CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartChrome.grid} />
								<XAxis dataKey="ug" fontSize={10} tick={{ fill: chartChrome.axis }} angle={-45} textAnchor="end" height={80} />
								<YAxis yAxisId="left" fontSize={10} tick={{ fill: chartChrome.axis }} tickFormatter={(value) => `R$ ${(value / 1000000).toFixed(1)}M`} />
								<YAxis
									yAxisId="right"
									orientation="right"
									fontSize={10}
									tick={{ fill: chartChrome.axis }}
									domain={[0, 100]}
									tickFormatter={(value) => `${value}%`}
								/>
								<Tooltip
									formatter={(value, name) => (name === "balance" ? formatCurrency(Number(value)) : `${Number(value).toFixed(1)}%`)}
									contentStyle={{
										backgroundColor: chartChrome.surface,
										border: "none",
										borderRadius: "12px",
										boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
									}}
								/>
								<Bar yAxisId="left" dataKey="balance" fill={"var(--series-bmp)"} radius={[4, 4, 0, 0]} />
								<Line
									yAxisId="right"
									type="monotone"
									dataKey="cumulativePercentage"
									stroke={"var(--warning)"}
									strokeWidth={3}
									dot={{ r: 4, fill: "var(--warning)", strokeWidth: 2, stroke: chartChrome.surface }}
								/>
							</ComposedChart>
						</ResponsiveContainer>
					</div>
					<div className="mt-4 p-4 bg-warning/10 border border-warning/30 rounded-xl">
						<p className="text-body text-warning leading-relaxed text-center">
							<strong>Estratégia de Intervenção:</strong> A concentração exposta pelo Princípio de Pareto demonstra que atuar em{" "}
							<strong>{paretoUgs.length} UGs</strong> solucionará aproximadamente 80% do Risco Contábil do Comando da Aeronáutica.
						</p>
					</div>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
				{/* Mapa de Risco por ODS */}
				<div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden flex flex-col relative" id="risk-ods">
					<div className="px-6 py-4 border-b border-border flex items-center justify-between">
						<div className="flex items-center gap-2">
							<BarChart3 className="w-5 h-5 text-fab-600" />
							<h3 className="font-bold text-foreground">Mapa de Risco Contábil por ODS</h3>
						</div>
						<Button
							type="button"
							onClick={() => exportElementToImage("risk-ods", "mapa-risco-ods")}
							variant="outline"
							size="sm"
							className="gap-2 px-3 py-1.5 text-caption text-muted-foreground bg-muted/50 hover:bg-muted/80 border-border rounded-lg transition-colors"
						>
							<FileImage className="w-3.5 h-3.5" />
							<span>Exportar</span>
						</Button>
					</div>
					<div className="p-6 flex-1 flex flex-col bg-card">
						<div className="h-[280px] mb-6">
							<ResponsiveContainer width="100%" height="100%">
								<PieChart
									onClick={(state) => {
										const s = state as ChartClickEvent<{ ods: string }>
										if (s.activePayload && s.activePayload.length > 0) {
											setSelectedDetailLevel({
												type: "ods",
												name: s.activePayload[0].payload.ods,
											})
										}
									}}
									style={{ cursor: "pointer" }}
								>
									<Pie
										data={odsData}
										cx="50%"
										cy="50%"
										innerRadius={70}
										outerRadius={110}
										paddingAngle={5}
										dataKey="balance"
										nameKey="ods"
										onClick={(d) => setSelectedDetailLevel({ type: "ods", name: String(d.name ?? "") })}
										cursor="pointer"
									>
										{odsData.map((_entry, index) => (
											<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
										))}
									</Pie>
									<Tooltip
										formatter={(value) => formatCurrency(Number(value))}
										contentStyle={{
											backgroundColor: chartChrome.surface,
											border: "none",
											borderRadius: "12px",
											boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
										}}
									/>
									<Legend verticalAlign="bottom" height={36} formatter={(value) => <span className="text-foreground font-medium">{value}</span>} />
								</PieChart>
							</ResponsiveContainer>
						</div>

						<div className="overflow-x-auto mt-auto border border-border rounded-xl">
							<table className="w-full text-body text-left">
								<thead className="bg-muted/50 border-b border-border text-label text-muted-foreground">
									<tr>
										<th className="px-4 py-3">ODS</th>
										<th className="px-4 py-3 text-center">Incons.</th>
										<th className="px-4 py-3 text-right">Saldo</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border">
									{odsData.map((item) => (
										<tr
											key={item.ods}
											className="hover:bg-muted/50 transition-colors cursor-pointer"
											onClick={() => setSelectedDetailLevel({ type: "ods", name: item.ods })}
										>
											<td className="px-4 py-3 font-bold text-fab-700">{item.ods}</td>
											<td className="px-4 py-3 text-center text-muted-foreground">{item.count}</td>
											<td className="px-4 py-3 text-right font-medium text-foreground">{formatCurrency(item.balance)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				</div>

				{/* Concentração por Órgão Superior */}
				<div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden flex flex-col relative" id="risk-orgao">
					<div className="px-6 py-4 border-b border-border flex items-center justify-between">
						<div className="flex items-center gap-2">
							<PieChartIcon className="w-5 h-5 text-fab-600" />
							<h3 className="font-bold text-foreground">Concentração por Órgão Superior</h3>
						</div>
						<Button
							type="button"
							onClick={() => exportElementToImage("risk-orgao", "mapa-risco-orgao")}
							variant="outline"
							size="sm"
							className="gap-2 px-3 py-1.5 text-caption text-muted-foreground bg-muted/50 hover:bg-muted/80 border-border rounded-lg transition-colors"
						>
							<FileImage className="w-3.5 h-3.5" />
							<span>Exportar</span>
						</Button>
					</div>
					<div className="p-6 flex-1 flex flex-col bg-card">
						<div className="h-[430px]">
							<ResponsiveContainer width="100%" height="100%">
								<BarChart
									data={orgaoData}
									layout="vertical"
									margin={{ left: 20 }}
									onClick={(state) => {
										const s = state as ChartClickEvent<{ name: string }>
										if (s.activePayload && s.activePayload.length > 0) {
											setSelectedDetailLevel({
												type: "orgaoSuperior",
												name: s.activePayload[0].payload.name,
											})
										}
									}}
									style={{ cursor: "pointer" }}
								>
									<CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke={chartChrome.grid} />
									<XAxis type="number" hide />
									<YAxis dataKey="name" type="category" fontSize={11} width={80} tick={{ fill: chartChrome.axis }} />
									<Tooltip
										formatter={(value) => formatCurrency(Number(value))}
										contentStyle={{
											backgroundColor: chartChrome.surface,
											border: "none",
											borderRadius: "12px",
											boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
										}}
										cursor={{ fill: chartChrome.surfaceMuted }}
									/>
									<Bar
										dataKey="balance"
										fill={"var(--series-pareto)"}
										radius={[0, 4, 4, 0]}
										onClick={(d) => setSelectedDetailLevel({ type: "orgaoSuperior", name: String(d.name ?? "") })}
										cursor="pointer"
									/>
								</BarChart>
							</ResponsiveContainer>
						</div>
						<div className="mt-auto p-4 bg-muted/50 border border-border rounded-xl">
							<p className="text-caption text-muted-foreground leading-relaxed">
								Distribuição do risco financeiro por Órgão Superior. Permite identificar quais estruturas administrativas demandam maior suporte técnico da
								SUCONT. Clique em uma barra para detalhar.
							</p>
						</div>
					</div>
				</div>
			</div>

			{/* Modal - Detalhamento das UGs */}
			{selectedDetailLevel && (
				<div className="fixed inset-0 z-50 bg-overlay/50 flex items-center justify-center p-4">
					<div className="bg-card rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
						<div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
							<h3 className="text-heading text-foreground flex items-center gap-2">
								<Activity className="w-5 h-5 text-fab-600" />
								Detalhamento: {selectedDetailLevel.name}
							</h3>
							<Button
								type="button"
								onClick={() => setSelectedDetailLevel(null)}
								variant="ghost"
								size="icon"
								aria-label="Fechar"
								className="hover:bg-muted rounded-full text-muted-foreground transition-colors"
							>
								<X className="w-5 h-5" />
							</Button>
						</div>
						<div className="p-6 overflow-y-auto">
							<p className="text-body text-muted-foreground mb-4">
								Listagem estrutural de UGs vinculadas à {selectedDetailLevel.name} classificadas por materialidade do risco.
							</p>
							<div className="space-y-3">
								{detailedUgs.map((ug) => (
									<div
										key={ug.ug}
										className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border bg-muted/50 gap-2 hover:bg-muted/80 transition-colors"
									>
										<div>
											<p className="font-bold text-foreground">
												{ug.ug} - {ug.nome_ug || "N/A"}
											</p>
											<p className="text-caption text-muted-foreground">
												{getUgHierarchy(ug.ug).orgaoSuperior} • {ug.quantidade_ocorrencias} inconsistência(s)
											</p>
										</div>
										<span className="font-bold text-foreground text-right bg-card px-3 py-1 rounded-lg border border-border">
											{formatCurrency(ug.saldo_total)}
										</span>
									</div>
								))}
								{detailedUgs.length === 0 && (
									<p className="text-body text-muted-foreground italic text-center py-4 bg-muted/50 rounded-xl">
										Nenhuma UG encontrada com os recortes contábeis atuais.
									</p>
								)}
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
