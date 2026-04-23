import { Activity, AlertTriangle, BarChart3, FileImage, Filter, PieChart as PieChartIcon, Target, TrendingUp, X } from "lucide-react"
import type React from "react"
import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
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

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"]

const formatCurrency = (value: number) => {
	return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

export const AnalyticalPanel: React.FC<AnalyticalPanelProps> = ({ data }) => {
	const [selectedRac, setSelectedRac] = useState<string>("Geral")
	const [selectedDetailLevel, setSelectedDetailLevel] = useState<{ type: "ods" | "orgaoSuperior"; name: string } | null>(null)

	const filteredData = useMemo(() => {
		let filtered = [...data]
		if (selectedRac !== "Geral") {
			filtered = filtered
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
		}
		return filtered
	}, [data, selectedRac])

	const totalBalance = useMemo(() => filteredData.reduce((acc, curr) => acc + curr.saldo_total, 0), [filteredData])
	const totalOccurrences = useMemo(() => filteredData.reduce((acc, curr) => acc + curr.quantidade_ocorrencias, 0), [filteredData])

	// Group by ODS
	const odsData = useMemo(() => {
		const groups: Record<string, { ods: string; count: number; balance: number }> = {}

		filteredData.forEach((ug) => {
			const hierarchy = getUgHierarchy(ug.ug)
			const ods = hierarchy.ods

			if (!groups[ods]) {
				groups[ods] = { ods, count: 0, balance: 0 }
			}
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

	// Pareto Analysis (80/20)
	const paretoData = useMemo(() => {
		const sortedUgs = [...filteredData].sort((a, b) => b.saldo_total - a.saldo_total)
		let cumulativeBalance = 0
		const result = sortedUgs.map((ug) => {
			cumulativeBalance += ug.saldo_total
			return {
				ug: `${ug.ug} - ${ug.nome_ug || "-"}`,
				balance: ug.saldo_total,
				cumulativePercentage: totalBalance > 0 ? (cumulativeBalance / totalBalance) * 100 : 0,
			}
		})
		return result
	}, [filteredData, totalBalance])

	const paretoUgs = useMemo(() => {
		return paretoData.filter((item) => item.cumulativePercentage <= 85) // Using 85% as a threshold for "critical mass"
	}, [paretoData])

	// Group by Órgão Superior
	const orgaoData = useMemo(() => {
		const groups: Record<string, { name: string; balance: number }> = {}

		filteredData.forEach((ug) => {
			const hierarchy = getUgHierarchy(ug.ug)
			const name = hierarchy.orgaoSuperior

			if (!groups[name]) {
				groups[name] = { name, balance: 0 }
			}
			groups[name].balance += ug.saldo_total
		})

		return Object.values(groups).sort((a, b) => b.balance - a.balance)
	}, [filteredData])

	const detailedUgs = useMemo(() => {
		if (!selectedDetailLevel) return []

		return filteredData
			.filter((ug) => {
				const hierarchy = getUgHierarchy(ug.ug)
				if (selectedDetailLevel.type === "ods") {
					return hierarchy.ods === selectedDetailLevel.name
				}
				return hierarchy.orgaoSuperior === selectedDetailLevel.name
			})
			.sort((a, b) => b.saldo_total - a.saldo_total)
	}, [filteredData, selectedDetailLevel])

	return (
		<div className="space-y-8 animate-in fade-in duration-500">
			{/* Filters */}
			<div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-end gap-4">
				<div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
					<Filter className="w-4 h-4 text-slate-400" />
					<span className="text-xs font-medium text-slate-600">Questão RAC:</span>
					<select
						value={selectedRac}
						onChange={(e) => setSelectedRac(e.target.value)}
						className="bg-transparent border-none p-0 font-bold text-fab-700 focus:ring-0 cursor-pointer text-xs"
					>
						<option value="Geral">Todas as Questões</option>
						{RAC_QUESTIONS.map((q) => (
							<option key={q} value={q}>
								{q}
							</option>
						))}
					</select>
				</div>
			</div>

			{/* Summary Header */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
				<div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
					<div className="flex items-center gap-4 mb-4">
						<div className="p-3 bg-fab-100 rounded-xl">
							<TrendingUp className="w-6 h-6 text-fab-600" />
						</div>
						<div>
							<p className="text-sm font-medium text-slate-500">Saldo Total Analisado</p>
							<h3 className="text-2xl font-bold text-slate-900">{formatCurrency(totalBalance)}</h3>
						</div>
					</div>
					<div className="text-xs text-slate-500">Volume financeiro total sob acompanhamento contábil.</div>
				</div>

				<div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
					<div className="flex items-center gap-4 mb-4">
						<div className="p-3 bg-amber-100 rounded-xl">
							<AlertTriangle className="w-6 h-6 text-amber-600" />
						</div>
						<div>
							<p className="text-sm font-medium text-slate-500">Total de Inconsistências</p>
							<h3 className="text-2xl font-bold text-slate-900">{totalOccurrences}</h3>
						</div>
					</div>
					<div className="text-xs text-slate-500">Número total de ocorrências identificadas nas UGs.</div>
				</div>

				<div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
					<div className="flex items-center gap-4 mb-4">
						<div className="p-3 bg-indigo-100 rounded-xl">
							<Target className="w-6 h-6 text-indigo-600" />
						</div>
						<div>
							<p className="text-sm font-medium text-slate-500">Foco de Atuação (Pareto)</p>
							<h3 className="text-2xl font-bold text-slate-900">{paretoUgs.length} UGs</h3>
						</div>
					</div>
					<div className="text-xs text-slate-500">Unidades que concentram ~80% do saldo total.</div>
				</div>
			</div>

			{/* Pareto Analysis Chart - Full Width */}
			<div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden relative" id="analise-pareto">
				<div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Activity className="w-5 h-5 text-fab-600" />
						<h3 className="font-bold text-slate-900">Análise de Pareto (Curva ABC)</h3>
					</div>
					<button
						onClick={() => exportElementToImage("analise-pareto", "mapa-risco-pareto")}
						className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
						title="Exportar Gráfico (PNG)"
					>
						<FileImage className="w-3.5 h-3.5" />
						<span>Exportar</span>
					</button>
				</div>
				<div className="p-6 bg-white">
					<div className="h-[400px]">
						<ResponsiveContainer width="100%" height="100%">
							<ComposedChart data={paretoData.slice(0, 30)}>
								<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
								<XAxis dataKey="ug" fontSize={10} tick={{ fill: "#64748b" }} angle={-45} textAnchor="end" height={80} />
								<YAxis yAxisId="left" fontSize={10} tick={{ fill: "#64748b" }} tickFormatter={(value) => `R$ ${(value / 1000000).toFixed(1)}M`} />
								<YAxis yAxisId="right" orientation="right" fontSize={10} tick={{ fill: "#64748b" }} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
								<Tooltip
									formatter={(value: number, name: string) => (name === "balance" ? formatCurrency(value) : `${value.toFixed(1)}%`)}
									contentStyle={{
										backgroundColor: "white",
										border: "none",
										borderRadius: "12px",
										boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
									}}
									itemStyle={{ color: "#1e293b", fontWeight: "bold" }}
								/>
								<Bar yAxisId="left" dataKey="balance" fill="#3b82f6" radius={[4, 4, 0, 0]} />
								<Line
									yAxisId="right"
									type="monotone"
									dataKey="cumulativePercentage"
									stroke="#f59e0b"
									strokeWidth={3}
									dot={{ r: 4, fill: "#f59e0b", strokeWidth: 2, stroke: "white" }}
								/>
							</ComposedChart>
						</ResponsiveContainer>
					</div>
					<div className="mt-4 p-4 bg-amber-50 border border-amber-100 rounded-xl">
						<p className="text-sm text-amber-800 leading-relaxed text-center">
							<strong>Estratégia de Intervenção:</strong> A concentração exposta pelo Princípio de Pareto demonstra que atuar em{" "}
							<strong>{paretoUgs.length} UGs</strong> solucionará aproximadamente 80% do Risco Contábil do Comando da Aeronáutica.
						</p>
					</div>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
				{/* Risk Map by ODS */}
				{/* Mapa de Risco por ODS */}
				<div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col relative" id="risk-ods">
					<div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
						<div className="flex items-center gap-2">
							<BarChart3 className="w-5 h-5 text-fab-600" />
							<h3 className="font-bold text-slate-900">Mapa de Risco Contábil por ODS</h3>
						</div>
						<button
							onClick={() => exportElementToImage("risk-ods", "mapa-risco-ods")}
							className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
							title="Exportar Painel (PNG)"
						>
							<FileImage className="w-3.5 h-3.5" />
							<span>Exportar</span>
						</button>
					</div>
					<div className="p-6 flex-1 flex flex-col bg-white">
						<div className="h-[280px] mb-6">
							<ResponsiveContainer width="100%" height="100%">
								<PieChart
									onClick={(state) => {
										if (state?.activePayload && state.activePayload.length > 0) {
											setSelectedDetailLevel({ type: "ods", name: state.activePayload[0].payload.ods })
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
										onClick={(data) => setSelectedDetailLevel({ type: "ods", name: data.name })}
										cursor="pointer"
									>
										{odsData.map((_entry, index) => (
											<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
										))}
									</Pie>
									<Tooltip
										formatter={(value: number) => formatCurrency(value)}
										contentStyle={{
											backgroundColor: "white",
											border: "none",
											borderRadius: "12px",
											boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
										}}
										itemStyle={{ color: "#1e293b", fontWeight: "bold" }}
									/>
									<Legend verticalAlign="bottom" height={36} formatter={(value) => <span className="text-slate-700 font-medium">{value}</span>} />
								</PieChart>
							</ResponsiveContainer>
						</div>

						<div className="overflow-x-auto mt-auto border border-slate-100 rounded-xl">
							<table className="w-full text-sm text-left">
								<thead className="text-xs text-slate-500 uppercase bg-slate-50/50 border-b border-slate-100">
									<tr>
										<th className="px-4 py-3 font-semibold">ODS</th>
										<th className="px-4 py-3 font-semibold text-center">Incons.</th>
										<th className="px-4 py-3 font-semibold text-right">Saldo</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100">
									{odsData.map((item) => (
										<tr
											key={item.ods}
											className="hover:bg-slate-50 transition-colors cursor-pointer"
											onClick={() => setSelectedDetailLevel({ type: "ods", name: item.ods })}
										>
											<td className="px-4 py-3 font-bold text-fab-700">{item.ods}</td>
											<td className="px-4 py-3 text-center text-slate-600">{item.count}</td>
											<td className="px-4 py-3 text-right font-medium text-slate-900">{formatCurrency(item.balance)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				</div>

				{/* Concentração por Órgão Superior */}
				<div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col relative" id="risk-orgao">
					<div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
						<div className="flex items-center gap-2">
							<PieChartIcon className="w-5 h-5 text-fab-600" />
							<h3 className="font-bold text-slate-900">Concentração por Órgão Superior</h3>
						</div>
						<button
							onClick={() => exportElementToImage("risk-orgao", "mapa-risco-orgao")}
							className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
							title="Exportar Painel (PNG)"
						>
							<FileImage className="w-3.5 h-3.5" />
							<span>Exportar</span>
						</button>
					</div>
					<div className="p-6 flex-1 flex flex-col bg-white">
						<div className="h-[430px]">
							<ResponsiveContainer width="100%" height="100%">
								<BarChart
									data={orgaoData}
									layout="vertical"
									margin={{ left: 20 }}
									onClick={(state) => {
										if (state?.activePayload && state.activePayload.length > 0) {
											setSelectedDetailLevel({ type: "orgaoSuperior", name: state.activePayload[0].payload.name })
										}
									}}
									style={{ cursor: "pointer" }}
								>
									<CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
									<XAxis type="number" hide />
									<YAxis dataKey="name" type="category" fontSize={11} width={80} tick={{ fill: "#64748b" }} />
									<Tooltip
										formatter={(value: number) => formatCurrency(value)}
										contentStyle={{
											backgroundColor: "white",
											border: "none",
											borderRadius: "12px",
											boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
										}}
										itemStyle={{ color: "#1e293b", fontWeight: "bold" }}
										cursor={{ fill: "#f1f5f9" }}
									/>
									<Bar
										dataKey="balance"
										fill="#6366f1"
										radius={[0, 4, 4, 0]}
										onClick={(data) => setSelectedDetailLevel({ type: "orgaoSuperior", name: data.name })}
										cursor="pointer"
									/>
								</BarChart>
							</ResponsiveContainer>
						</div>
						<div className="mt-auto p-4 bg-slate-50 border border-slate-100 rounded-xl">
							<p className="text-xs text-slate-600 leading-relaxed">
								Distribuição do risco financeiro por Órgão Superior. Permite identificar quais estruturas administrativas demandam maior suporte técnico da
								SUCONT. Clique em uma barra para detalhar.
							</p>
						</div>
					</div>
				</div>
			</div>

			{/* Modal - Detalhamento das UGs */}
			{selectedDetailLevel && (
				<div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
					<div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
						<div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
							<h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
								<Activity className="w-5 h-5 text-fab-600" />
								Detalhamento: {selectedDetailLevel.name}
							</h3>
							<button
								onClick={() => setSelectedDetailLevel(null)}
								className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
								title="Fechar"
							>
								<X className="w-5 h-5" />
							</button>
						</div>
						<div className="p-6 overflow-y-auto">
							<p className="text-sm text-slate-600 mb-4">
								Listagem estrutural de UGs vinculadas à {selectedDetailLevel.name} classificadas por materialidade do risco.
							</p>
							<div className="space-y-3">
								{detailedUgs.map((ug) => (
									<div
										key={ug.ug}
										className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50 gap-2 hover:bg-slate-100 transition-colors"
									>
										<div>
											<p className="font-bold text-slate-800">
												{ug.ug} - {ug.nome_ug || "N/A"}
											</p>
											<p className="text-xs text-slate-500">
												{getUgHierarchy(ug.ug).diretoria || "Sem subordinação"} • {ug.quantidade_ocorrencias} inconsistência(s)
											</p>
										</div>
										<span className="font-bold text-slate-900 text-right bg-white px-3 py-1 rounded-lg border border-slate-200">
											{formatCurrency(ug.saldo_total)}
										</span>
									</div>
								))}

								{detailedUgs.length === 0 && (
									<p className="text-sm text-slate-500 italic text-center py-4 bg-slate-50 rounded-xl">
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
