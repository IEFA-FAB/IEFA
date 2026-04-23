import {
	AlertTriangle,
	ArrowRight,
	Building2,
	ChevronDown,
	ChevronUp,
	DollarSign,
	Download,
	FileImage,
	Filter,
	MessageSquare,
	Search,
	User,
} from "lucide-react"
import type React from "react"
import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, LabelList, Tooltip as RechartsTooltip, ResponsiveContainer, XAxis, YAxis } from "recharts"
import type { DashboardMetrics, UgConsolidated } from "../utils/analytics"
import { getConferente } from "../utils/conferentes"
import { exportElementToImage, exportToExcel } from "../utils/exportUtils"
import { getUgHierarchy, getUniqueOds } from "../utils/hierarchy"
import { getQuestaoByAccount, RAC_MAPPING } from "../utils/rac"
import { ConsolidatedMessageModal } from "./ConsolidatedMessageModal"

interface OperationalPanelProps {
	data: UgConsolidated[]
	metrics: DashboardMetrics
	onViewDetails: (ug: UgConsolidated, racFilter?: string) => void
}

const formatCurrency = (value: number) => {
	return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

const CONFERENTES_LIST = ["1S ELIANA", "1T JEFFERSON LUÍS", "1T ÉRIKA VICENTE", "2S PÂMELA"]
const RAC_QUESTIONS = Object.keys(RAC_MAPPING).sort((a, b) => {
	const numA = parseInt(a.replace("Questão ", ""), 10)
	const numB = parseInt(b.replace("Questão ", ""), 10)
	return numA - numB
})

const _ODS_LIST = getUniqueOds()

export const OperationalPanel: React.FC<OperationalPanelProps> = ({ data, metrics, onViewDetails }) => {
	const [searchTerm, setSearchTerm] = useState("")
	const [sortField, setSortField] = useState<keyof UgConsolidated | "conferente" | "orgaoSuperior" | "ods">("saldo_total")
	const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")
	const [selectedConferente, setSelectedConferente] = useState<string>("Geral")
	const [selectedRac, setSelectedRac] = useState<string>("Geral")
	const [selectedOds, _setSelectedOds] = useState<string>("Geral")
	const [isConsolidatedModalOpen, setIsConsolidatedModalOpen] = useState(false)

	const handleSort = (field: keyof UgConsolidated | "conferente" | "orgaoSuperior" | "ods") => {
		if (sortField === field) {
			setSortDirection(sortDirection === "asc" ? "desc" : "asc")
		} else {
			setSortField(field)
			setSortDirection("desc")
		}
	}

	const filteredAndSortedData = useMemo(() => {
		let filtered = [...data]

		// Filter by Conferente
		if (selectedConferente !== "Geral") {
			filtered = filtered.filter((item) => getConferente(item.ug) === selectedConferente)
		}

		// Filter by ODS
		if (selectedOds !== "Geral") {
			filtered = filtered.filter((item) => getUgHierarchy(item.ug).ods === selectedOds)
		}

		// Filter by RAC Question
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

		// Search term
		if (searchTerm) {
			const term = searchTerm.toLowerCase()

			// Check for "Questão RAC XX" in search
			const racMatch = term.match(/questão rac (\d+)/) || term.match(/rac (\d+)/)
			if (racMatch) {
				const qNum = racMatch[1]
				const qName = `Questão ${parseInt(qNum, 10)}`
				if (RAC_MAPPING[qName]) {
					filtered = filtered
						.map((item) => {
							const matchingOcorrencias = item.ocorrencias.filter((occ) => getQuestaoByAccount(occ.conta_contabil) === qName)
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
			} else {
				filtered = filtered.filter((item) => {
					const conferente = getConferente(item.ug)
					const hierarchy = getUgHierarchy(item.ug)
					return (
						item.ug.toLowerCase().includes(term) ||
						item.nome_ug?.toLowerCase().includes(term) ||
						conferente.toLowerCase().includes(term) ||
						hierarchy.ods.toLowerCase().includes(term) ||
						hierarchy.orgaoSuperior.toLowerCase().includes(term)
					)
				})
			}
		}

		return filtered.sort((a, b) => {
			let valA: any = a[sortField as keyof UgConsolidated] ?? ""
			let valB: any = b[sortField as keyof UgConsolidated] ?? ""

			if (sortField === "conferente") {
				valA = getConferente(a.ug)
				valB = getConferente(b.ug)
			} else if (sortField === "orgaoSuperior") {
				valA = getUgHierarchy(a.ug).orgaoSuperior
				valB = getUgHierarchy(b.ug).orgaoSuperior
			} else if (sortField === "ods") {
				valA = getUgHierarchy(a.ug).ods
				valB = getUgHierarchy(b.ug).ods
			}

			if (valA < valB) return sortDirection === "asc" ? -1 : 1
			if (valA > valB) return sortDirection === "asc" ? 1 : -1
			return 0
		})
	}, [data, searchTerm, sortField, sortDirection, selectedConferente, selectedRac, selectedOds])

	const topUgs = useMemo(() => {
		return [...filteredAndSortedData].sort((a, b) => b.saldo_total - a.saldo_total).slice(0, 10)
	}, [filteredAndSortedData])

	const filteredSaldoTotal = useMemo(() => {
		return filteredAndSortedData.reduce((acc, curr) => acc + curr.saldo_total, 0)
	}, [filteredAndSortedData])

	return (
		<div className="space-y-6">
			{/* Filters */}
			<div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
				{selectedRac !== "Geral" ? (
					<button
						onClick={() => setIsConsolidatedModalOpen(true)}
						className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-fab-600 border border-transparent rounded-lg hover:bg-fab-700 transition-colors focus:outline-none focus:ring-2 focus:ring-fab-500 focus:ring-offset-1 shadow-sm"
					>
						<MessageSquare className="w-4 h-4" />
						Gerar Mensagem Única ({selectedRac})
					</button>
				) : (
					<div></div>
				)}
				<div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
					<div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
						<Filter className="w-4 h-4 text-slate-400" />
						<span className="text-xs font-medium text-slate-600">Conferente:</span>
						<select
							value={selectedConferente}
							onChange={(e) => {
								setSelectedConferente(e.target.value)
							}}
							className="bg-transparent border-none p-0 font-bold text-fab-700 focus:ring-0 cursor-pointer text-xs"
						>
							<option value="Geral">Todos</option>
							{CONFERENTES_LIST.map((c) => (
								<option key={c} value={c}>
									{c}
								</option>
							))}
						</select>
					</div>

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
			</div>

			{/* Summary Cards */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				<div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
					<div className="flex items-center gap-3 mb-2">
						<div className="p-2 bg-fab-50 text-fab-600 rounded-lg">
							<Building2 className="w-5 h-5" />
						</div>
						<h3 className="text-sm font-medium text-slate-600">UGs com Ocorrência</h3>
					</div>
					<p className="text-2xl font-bold text-slate-900 mt-auto">{filteredAndSortedData.length}</p>
				</div>

				<div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
					<div className="flex items-center gap-3 mb-2">
						<div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
							<AlertTriangle className="w-5 h-5" />
						</div>
						<h3 className="text-sm font-medium text-slate-600">Ocorrências Identificadas</h3>
					</div>
					<p className="text-2xl font-bold text-slate-900 mt-auto">{filteredAndSortedData.reduce((acc, curr) => acc + curr.quantidade_ocorrencias, 0)}</p>
				</div>

				<div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
					<div className="flex items-center gap-3 mb-2">
						<div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
							<DollarSign className="w-5 h-5" />
						</div>
						<h3 className="text-sm font-medium text-slate-600">Saldo Alongado (&gt;3 meses)</h3>
					</div>
					<p className="text-2xl font-bold text-slate-900 mt-auto">{formatCurrency(filteredAndSortedData.reduce((acc, curr) => acc + curr.saldo_total, 0))}</p>
				</div>
			</div>

			{/* Main Chart */}
			<div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative" id="chart-top10">
				<div className="flex justify-between items-start mb-4">
					<h3 className="text-base font-semibold text-slate-800">Total de Saldos Sem Movimentação por UG (&gt;3 meses) - Top 10</h3>
					<button
						onClick={() => exportElementToImage("chart-top10", "saldos-top10")}
						className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
						title="Exportar Gráfico (PNG)"
					>
						<FileImage className="w-3.5 h-3.5" />
						<span>Exportar Gráfico</span>
					</button>
				</div>
				<div className="h-[320px] w-full bg-white">
					<ResponsiveContainer width="100%" height="100%">
						<BarChart
							data={topUgs}
							layout="vertical"
							margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
							onClick={(state) => {
								if (state?.activePayload && state.activePayload.length > 0) {
									onViewDetails(state.activePayload[0].payload, selectedRac)
								}
							}}
							style={{ cursor: "pointer" }}
						>
							<defs>
								<linearGradient id="colorSaldo" x1="0" y1="0" x2="1" y2="0">
									<stop offset="0%" stopColor="#1e40af" stopOpacity={0.8} />
									<stop offset="100%" stopColor="#3b82f6" stopOpacity={1} />
								</linearGradient>
							</defs>
							<CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
							<XAxis
								type="number"
								tickFormatter={(val) => `R$ ${(val / 1000000).toFixed(1)}M`}
								stroke="#64748b"
								fontSize={12}
								tickLine={false}
								axisLine={false}
							/>
							<YAxis dataKey="ug" type="category" width={80} tick={{ fontSize: 12, fill: "#64748b", fontWeight: 500 }} tickLine={false} axisLine={false} />
							<RechartsTooltip
								formatter={(value: number) => formatCurrency(value)}
								labelFormatter={(label) => `UG: ${label}`}
								content={({ active, payload, label }) => {
									if (active && payload?.length) {
										const data = payload[0].payload as UgConsolidated
										const percentage = filteredSaldoTotal > 0 ? ((data.saldo_total / filteredSaldoTotal) * 100).toFixed(1) : "0.0"
										const conferente = getConferente(data.ug)
										return (
											<div className="bg-white p-4 border border-slate-100 shadow-xl rounded-xl">
												<p className="font-bold text-slate-800 mb-3 border-b border-slate-100 pb-2">
													UG: {label} {data.nome_ug ? `- ${data.nome_ug}` : ""}
												</p>
												<div className="space-y-1.5">
													<p className="text-sm text-slate-500 flex justify-between gap-4">
														<span>Conferente:</span>
														<span className="font-semibold text-slate-700">{conferente}</span>
													</p>
													<p className="text-sm text-slate-500 flex justify-between gap-4">
														<span>Saldo Alongado (&gt;3 meses):</span>
														<span className="font-semibold text-fab-700">{formatCurrency(data.saldo_total)}</span>
													</p>
													<p className="text-sm text-slate-500 flex justify-between gap-4">
														<span>Representatividade:</span>
														<span className="font-semibold text-emerald-600">{percentage}% do total</span>
													</p>
													<p className="text-sm text-slate-500 flex justify-between gap-4">
														<span>Ocorrências:</span>
														<span className="font-semibold text-slate-900">{data.quantidade_ocorrencias}</span>
													</p>
												</div>
											</div>
										)
									}
									return null
								}}
								cursor={{ fill: "#f1f5f9", opacity: 0.1 }}
							/>
							<Bar dataKey="saldo_total" fill="url(#colorSaldo)" radius={[0, 6, 6, 0]} barSize={20}>
								<LabelList
									dataKey="saldo_total"
									position="right"
									formatter={(value: number) => (filteredSaldoTotal > 0 ? `${((value / filteredSaldoTotal) * 100).toFixed(1)}%` : "0.0%")}
									fill="#64748b"
									fontSize={11}
									fontWeight={500}
								/>
							</Bar>
						</BarChart>
					</ResponsiveContainer>
				</div>
			</div>

			{/* Operational Table */}
			<div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
				<div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50">
					<div className="flex items-center gap-3">
						<h3 className="text-base font-semibold text-slate-800">Lista Operacional de UGs</h3>
						<button
							onClick={() => {
								const dataToExport = filteredAndSortedData.map((ug) => ({
									UG: ug.ug,
									"Nome da UG": ug.nome_ug || "",
									"Órgão Superior": getUgHierarchy(ug.ug).orgaoSuperior,
									ODS: getUgHierarchy(ug.ug).ods,
									Conferente: getConferente(ug.ug),
									Ocorrências: ug.quantidade_ocorrencias,
									"Saldo Alongado (R$)": ug.saldo_total,
								}))
								exportToExcel(dataToExport, "lista_operacional_ugs")
							}}
							className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
							title="Exportar Tabela (Excel)"
						>
							<Download className="w-3.5 h-3.5" />
							<span>Exportar Excel</span>
						</button>
					</div>
					<div className="relative w-full sm:w-72">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
						<input
							type="text"
							placeholder="Buscar por código, nome ou conferente..."
							className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-fab-500 focus:border-fab-500 bg-white text-slate-900"
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
						/>
					</div>
				</div>
				<div className="overflow-x-auto">
					<table className="w-full text-sm text-left text-slate-600">
						<thead className="text-xs text-slate-500 uppercase bg-white border-b border-slate-200">
							<tr>
								<th className="px-5 py-3 cursor-pointer hover:bg-slate-50" onClick={() => handleSort("ug")}>
									<div className="flex items-center gap-1">
										UG / Nome {sortField === "ug" && (sortDirection === "asc" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
									</div>
								</th>
								<th className="px-5 py-3 cursor-pointer hover:bg-slate-50" onClick={() => handleSort("orgaoSuperior")}>
									<div className="flex items-center gap-1">
										Órgão Superior{" "}
										{sortField === "orgaoSuperior" && (sortDirection === "asc" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
									</div>
								</th>
								<th className="px-5 py-3 cursor-pointer hover:bg-slate-50" onClick={() => handleSort("ods")}>
									<div className="flex items-center gap-1">
										ODS {sortField === "ods" && (sortDirection === "asc" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
									</div>
								</th>
								<th className="px-5 py-3 cursor-pointer hover:bg-slate-50" onClick={() => handleSort("conferente")}>
									<div className="flex items-center gap-1">
										Conferente{" "}
										{sortField === "conferente" && (sortDirection === "asc" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
									</div>
								</th>
								<th className="px-5 py-3 cursor-pointer hover:bg-slate-50" onClick={() => handleSort("quantidade_ocorrencias")}>
									<div className="flex items-center gap-1">
										Ocorrências{" "}
										{sortField === "quantidade_ocorrencias" &&
											(sortDirection === "asc" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
									</div>
								</th>
								<th className="px-5 py-3 cursor-pointer hover:bg-slate-50" onClick={() => handleSort("saldo_total")}>
									<div className="flex items-center gap-1">
										Saldo Alongado (&gt;3 meses){" "}
										{sortField === "saldo_total" && (sortDirection === "asc" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
									</div>
								</th>
								<th className="px-5 py-3 text-right">Ação</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{filteredAndSortedData.map((row) => (
								<tr key={row.ug} className="bg-white hover:bg-fab-50/50 transition-colors group">
									<td className="px-5 py-3 font-medium text-slate-900">
										{row.ug} - {row.nome_ug || "-"}
									</td>
									<td className="px-5 py-3 text-slate-600">{getUgHierarchy(row.ug).orgaoSuperior}</td>
									<td className="px-5 py-3 text-slate-600">{getUgHierarchy(row.ug).ods}</td>
									<td className="px-5 py-3 text-slate-700">
										<div className="flex items-center gap-1.5">
											<User className="w-3.5 h-3.5 text-slate-400" />
											{getConferente(row.ug)}
										</div>
									</td>
									<td className="px-5 py-3">
										<span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">
											{row.quantidade_ocorrencias}
										</span>
									</td>
									<td className="px-5 py-3 font-medium text-slate-900">{formatCurrency(row.saldo_total)}</td>
									<td className="px-5 py-3 text-right">
										<button
											onClick={() => onViewDetails(row, selectedRac)}
											className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-fab-700 bg-fab-50 border border-fab-200 rounded-lg hover:bg-fab-100 hover:border-fab-300 transition-colors"
										>
											Analisar
											<ArrowRight className="w-3.5 h-3.5" />
										</button>
									</td>
								</tr>
							))}
							{filteredAndSortedData.length === 0 && (
								<tr>
									<td colSpan={5} className="px-5 py-8 text-center text-slate-500">
										Nenhuma UG encontrada com os filtros atuais.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</div>

			{isConsolidatedModalOpen && (
				<ConsolidatedMessageModal data={filteredAndSortedData} racFilter={selectedRac} onClose={() => setIsConsolidatedModalOpen(false)} />
			)}
		</div>
	)
}
