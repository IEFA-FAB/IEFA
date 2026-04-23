import { Activity, AlertTriangle, FileImage, Filter, PieChart as PieChartIcon, Shield, TrendingUp, Users, X } from "lucide-react"
import type React from "react"
import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { DashboardMetrics, UgConsolidated } from "../utils/analytics"
import { getConferente } from "../utils/conferentes"
import { exportElementToImage } from "../utils/exportUtils"
import { getUgHierarchy } from "../utils/hierarchy"
import { getAccountName, getQuestaoByAccount, RAC_MAPPING } from "../utils/rac"

interface ManagerialPanelProps {
	data: UgConsolidated[]
	metrics: DashboardMetrics
}

const formatCurrency = (value: number) => {
	return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

const RAC_QUESTIONS = Object.keys(RAC_MAPPING).sort((a, b) => {
	const numA = parseInt(a.replace("Questão ", ""), 10)
	const numB = parseInt(b.replace("Questão ", ""), 10)
	return numA - numB
})

const COLORS = ["#2a57b9", "#488bde", "#9bc7f0", "#c5def6", "#e0edfa"]

export const ManagerialPanel: React.FC<ManagerialPanelProps> = ({ data, metrics }) => {
	const [selectedRac, setSelectedRac] = useState<string>("Geral")
	const [selectedOdsDetails, setSelectedOdsDetails] = useState<string | null>(null)

	// Mapeamento dinâmico dos nomes das contas
	const dynamicAccountNames = useMemo(() => {
		const map = new Map<string, string>()
		data.forEach((ug) => {
			ug.ocorrencias.forEach((occ) => {
				if (occ.conta_contabil && occ.nome_conta && !map.has(occ.conta_contabil)) {
					map.set(occ.conta_contabil, occ.nome_conta)
				}
			})
		})
		return map
	}, [data])

	const getDynamicAccountName = (account: string) => {
		const hardcodedName = getAccountName(account)
		if (hardcodedName !== account) return hardcodedName // Se já tiver no rac.ts

		const dynamicName = dynamicAccountNames.get(account)
		return dynamicName ? `${account} - ${dynamicName}` : account
	}

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

	const filteredSaldoTotal = useMemo(() => {
		return filteredData.reduce((acc, curr) => acc + curr.saldo_total, 0)
	}, [filteredData])

	// Top 10 UGs by Saldo
	const topUgsBySaldo = useMemo(() => {
		return [...filteredData]
			.sort((a, b) => b.saldo_total - a.saldo_total)
			.slice(0, 10)
			.map((ug) => ({
				name: `${ug.ug} - ${ug.nome_ug || "UG Sem Nome"}`,
				saldo: ug.saldo_total,
			}))
	}, [filteredData])

	// Contas Contábeis mais recorrentes
	const contasRecorrentes = useMemo(() => {
		const contaMap = new Map<string, number>()
		filteredData.forEach((ug) => {
			ug.ocorrencias.forEach((occ) => {
				contaMap.set(occ.conta_contabil, (contaMap.get(occ.conta_contabil) || 0) + 1)
			})
		})

		return Array.from(contaMap.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5)
			.map(([name, value]) => ({ name, value }))
	}, [filteredData])

	// Agrupamento por Conferente
	const conferenteStats = useMemo(() => {
		const stats = new Map<string, { ugs: string[]; saldo: number; ocorrencias: number }>()

		filteredData.forEach((ug) => {
			const conferente = getConferente(ug.ug)
			const current = stats.get(conferente) || { ugs: [], saldo: 0, ocorrencias: 0 }

			current.ugs.push(ug.ug)
			current.saldo += ug.saldo_total
			current.ocorrencias += ug.quantidade_ocorrencias

			stats.set(conferente, current)
		})

		return Array.from(stats.entries()).sort((a, b) => b[1].saldo - a[1].saldo)
	}, [filteredData])

	// Agrupamento por ODS
	const odsStats = useMemo(() => {
		const stats = new Map<string, number>()
		filteredData.forEach((ug) => {
			const hierarchy = getUgHierarchy(ug.ug)
			stats.set(hierarchy.ods, (stats.get(hierarchy.ods) || 0) + ug.saldo_total)
		})
		return Array.from(stats.entries())
			.sort((a, b) => b[1] - a[1])
			.map(([name, value]) => ({ name, value }))
	}, [filteredData])

	// Concentração de Risco
	const concentracaoRisco = useMemo(() => {
		const top5Saldo = topUgsBySaldo.reduce((acc, curr) => acc + curr.saldo, 0)
		const percentual = filteredSaldoTotal > 0 ? (top5Saldo / filteredSaldoTotal) * 100 : 0
		return percentual.toFixed(1)
	}, [topUgsBySaldo, filteredSaldoTotal])

	const contaMaisCriticaRaw = contasRecorrentes.length > 0 ? contasRecorrentes[0].name : null
	const contaMaisCritica = contaMaisCriticaRaw ? getDynamicAccountName(contaMaisCriticaRaw) : "N/A"

	const ugsInSelectedOds = useMemo(() => {
		if (!selectedOdsDetails) return []
		return filteredData.filter((ug) => getUgHierarchy(ug.ug).ods === selectedOdsDetails).sort((a, b) => b.saldo_total - a.saldo_total)
	}, [filteredData, selectedOdsDetails])

	return (
		<div className="space-y-6">
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
			{/* Visão Estratégica */}
			<div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
				<div className="flex items-center gap-3 mb-6">
					<div className="p-2 bg-fab-50 text-fab-600 rounded-lg">
						<TrendingUp className="w-5 h-5" />
					</div>
					<div>
						<h2 className="text-lg font-bold text-slate-800">Visão Estratégica</h2>
						<p className="text-sm text-slate-500">Apoio à Alta Gestão - Riscos e Tendências</p>
					</div>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
					<div className="p-5 bg-slate-50 rounded-xl border border-slate-100">
						<div className="flex items-center gap-2 mb-2">
							<AlertTriangle className="w-4 h-4 text-amber-500" />
							<h3 className="text-sm font-semibold text-slate-700">Concentração de Risco</h3>
						</div>
						<p className="text-3xl font-bold text-slate-900">{concentracaoRisco}%</p>
						<p className="text-xs text-slate-500 mt-1">do saldo total está concentrado nas Top 5 UGs</p>
					</div>

					<div className="p-5 bg-slate-50 rounded-xl border border-slate-100">
						<div className="flex items-center gap-2 mb-2">
							<Activity className="w-4 h-4 text-fab-500" />
							<h3 className="text-sm font-semibold text-slate-700">Impacto Financeiro Global</h3>
						</div>
						<p className="text-3xl font-bold text-slate-900">{formatCurrency(filteredSaldoTotal)}</p>
						<p className="text-xs text-slate-500 mt-1">em saldos alongados (&gt;3 meses) {selectedRac !== "Geral" ? `na ${selectedRac}` : "no COMAER"}</p>
					</div>

					<div className="p-5 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-center">
						<div className="flex items-center gap-2 mb-2">
							<PieChartIcon className="w-4 h-4 text-emerald-500 shrink-0" />
							<h3 className="text-sm font-semibold text-slate-700">Conta Mais Crítica</h3>
						</div>
						<p className="text-xl font-bold text-slate-900 leading-tight" title={contaMaisCritica}>
							{contaMaisCritica}
						</p>
						<p className="text-xs text-slate-500 mt-2">maior volume de reincidência {selectedRac !== "Geral" ? "na questão" : "na base"}</p>
					</div>
				</div>
			</div>

			{/* Visão Tática */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Top 10 UGs por Saldo */}
				<div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative" id="managerial-top10">
					<div className="flex justify-between items-start mb-6">
						<div>
							<h3 className="text-md font-bold text-slate-800 mb-1">Top 10 UGs por Volume Financeiro</h3>
							<p className="text-xs text-slate-500">Unidades com maior saldo retido</p>
						</div>
						<button
							onClick={() => exportElementToImage("managerial-top10", "estrategico-top10")}
							className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
							title="Exportar Gráfico (PNG)"
						>
							<FileImage className="w-3.5 h-3.5" />
							<span>Exportar</span>
						</button>
					</div>
					<div className="h-96 bg-white">
						<ResponsiveContainer width="100%" height="100%">
							<BarChart data={topUgsBySaldo} layout="vertical" margin={{ top: 5, right: 30, left: 150, bottom: 5 }}>
								<CartesianGrid strokeDasharray="3 3" horizontal={false} />
								<XAxis type="number" tickFormatter={(value) => `R$ ${(value / 1000000).toFixed(1)}M`} stroke="#64748b" />
								<YAxis dataKey="name" type="category" width={200} tick={{ fontSize: 9, fill: "#64748b" }} />
								<Tooltip
									formatter={(value: number) => formatCurrency(value)}
									contentStyle={{ backgroundColor: "white", borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
									itemStyle={{ color: "#1e293b", fontWeight: "bold" }}
								/>
								<Bar dataKey="saldo" fill="#2a57b9" radius={[0, 4, 4, 0]} />
							</BarChart>
						</ResponsiveContainer>
					</div>
				</div>

				{/* Top 5 Contas por Ocorrência */}
				<div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col relative" id="managerial-contas">
					<div className="flex justify-between items-start mb-6">
						<div>
							<h3 className="text-md font-bold text-slate-800 mb-1">Contas Contábeis Mais Recorrentes</h3>
							<p className="text-xs text-slate-500">Contas com maior número de inconsistências</p>
						</div>
						<button
							onClick={() => exportElementToImage("managerial-contas", "estrategico-contas")}
							className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
							title="Exportar Gráfico (PNG)"
						>
							<FileImage className="w-3.5 h-3.5" />
							<span>Exportar</span>
						</button>
					</div>
					<div className="flex-1 flex flex-col min-h-[300px] bg-white">
						<ResponsiveContainer width="100%" height={200}>
							<PieChart>
								<Pie data={contasRecorrentes} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">
									{contasRecorrentes.map((_entry, index) => (
										<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
									))}
								</Pie>
								<Tooltip
									formatter={(value: number, name: string) => [value, getDynamicAccountName(name)]}
									contentStyle={{ backgroundColor: "white", borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
									itemStyle={{ color: "#334155", fontWeight: 500 }}
								/>
							</PieChart>
						</ResponsiveContainer>
						{/* Custom Legend */}
						<div className="mt-4 flex flex-col gap-2">
							{contasRecorrentes.map((entry, index) => (
								<div key={entry.name} className="flex items-start gap-2 text-xs">
									<div className="w-3 h-3 rounded-sm shrink-0 mt-0.5" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
									<span className="text-slate-600 font-medium leading-tight">{getDynamicAccountName(entry.name)}</span>
								</div>
							))}
						</div>
					</div>
				</div>

				{/* Distribuição por ODS */}
				<div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative" id="managerial-ods">
					<div className="flex justify-between items-start mb-6">
						<div>
							<div className="flex items-center gap-2 mb-1">
								<Shield className="w-4 h-4 text-fab-600" />
								<h3 className="text-md font-bold text-slate-800">Distribuição por ODS</h3>
							</div>
							<p className="text-xs text-slate-500">Saldo total por Organização de Direção Setorial</p>
						</div>
						<button
							onClick={() => exportElementToImage("managerial-ods", "estrategico-ods")}
							className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
							title="Exportar Gráfico (PNG)"
						>
							<FileImage className="w-3.5 h-3.5" />
							<span>Exportar</span>
						</button>
					</div>
					<div className="h-64 bg-white">
						<ResponsiveContainer width="100%" height="100%">
							<BarChart
								data={odsStats}
								onClick={(state) => {
									if (state?.activePayload && state.activePayload.length > 0) {
										setSelectedOdsDetails(state.activePayload[0].payload.name)
									}
								}}
								style={{ cursor: "pointer" }}
							>
								<CartesianGrid strokeDasharray="3 3" vertical={false} />
								<XAxis dataKey="name" fontSize={10} tick={{ fill: "#64748b" }} />
								<YAxis tickFormatter={(value) => `R$ ${(value / 1000000).toFixed(1)}M`} fontSize={10} tick={{ fill: "#64748b" }} />
								<Tooltip
									formatter={(value: number) => formatCurrency(value)}
									contentStyle={{ backgroundColor: "white", borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
									cursor={{ fill: "#f1f5f9" }}
								/>
								<Bar dataKey="value" fill="#488bde" radius={[4, 4, 0, 0]} onClick={(data) => setSelectedOdsDetails(data.name)} cursor="pointer" />
							</BarChart>
						</ResponsiveContainer>
					</div>
				</div>
			</div>

			{/* Saída Gerencial por Conferente */}
			<div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
				<div className="flex items-center gap-3 mb-6">
					<div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
						<Users className="w-5 h-5" />
					</div>
					<div>
						<h2 className="text-lg font-bold text-slate-800">Panorama por Conferente</h2>
						<p className="text-sm text-slate-500">Distribuição de responsabilidades e inconsistências</p>
					</div>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
					{conferenteStats.map(([nome, stats]) => (
						<div key={nome} className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex flex-col">
							<div className="flex items-center justify-between mb-3">
								<h4 className="font-bold text-slate-800 text-sm">{nome}</h4>
								<span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded uppercase">{stats.ugs.length} UGs</span>
							</div>

							<div className="space-y-2 mb-4">
								<div className="flex justify-between text-xs">
									<span className="text-slate-500">Saldo Total:</span>
									<span className="font-bold text-slate-900">{formatCurrency(stats.saldo)}</span>
								</div>
								<div className="flex justify-between text-xs">
									<span className="text-slate-500">Ocorrências:</span>
									<span className="font-bold text-slate-900">{stats.ocorrencias}</span>
								</div>
							</div>

							<div className="mt-auto pt-3 border-t border-slate-200">
								<p className="text-[10px] font-bold text-slate-400 uppercase mb-2">UGs com Inconsistência:</p>
								<div className="flex flex-wrap gap-1">
									{stats.ugs.map((ug) => {
										const ugObj = filteredData.find((item) => item.ug === ug)
										const displayName = ugObj ? `${ug} - ${ugObj.nome_ug || "-"}` : ug
										return (
											<span key={ug} className="px-1.5 py-0.5 bg-white border border-slate-200 text-slate-600 text-[10px] rounded font-mono">
												{displayName}
											</span>
										)
									})}
								</div>
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Recomendações */}
			<div className="bg-fab-50 p-6 rounded-2xl border border-fab-100">
				<h3 className="text-md font-bold text-fab-900 mb-3">Diretrizes de Acompanhamento (RAC)</h3>
				<ul className="space-y-2 text-sm text-fab-800">
					<li className="flex items-start gap-2">
						<span className="w-1.5 h-1.5 rounded-full bg-fab-500 mt-1.5 shrink-0"></span>
						<p>
							<strong>Foco de Atuação:</strong> Priorizar o contato e a orientação técnica às 5 UGs que concentram {concentracaoRisco}% das inconsistências
							financeiras.
						</p>
					</li>
					<li className="flex items-start gap-2">
						<span className="w-1.5 h-1.5 rounded-full bg-fab-500 mt-1.5 shrink-0"></span>
						<p>
							<strong>Capacitação:</strong> Avaliar a necessidade de emissão de orientação técnica ou treinamento específico sobre a conta{" "}
							<strong>{contaMaisCritica}</strong>, devido à sua alta recorrência.
						</p>
					</li>
					<li className="flex items-start gap-2">
						<span className="w-1.5 h-1.5 rounded-full bg-fab-500 mt-1.5 shrink-0"></span>
						<p>
							<strong>Risco Contábil:</strong> A manutenção de saldos alongados compromete a fidedignidade das demonstrações contábeis do COMAER. A SUCONT-3
							deve monitorar a regularização destes saldos no próximo ciclo.
						</p>
					</li>
				</ul>
			</div>

			{/* Modal - Detalhamento das UGs por ODS */}
			{selectedOdsDetails && (
				<div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
					<div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
						<div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
							<h3 className="text-lg font-bold text-slate-800">Detalhamento: {selectedOdsDetails}</h3>
							<button
								onClick={() => setSelectedOdsDetails(null)}
								className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
								title="Fechar"
							>
								<X className="w-5 h-5" />
							</button>
						</div>
						<div className="p-6 overflow-y-auto">
							<p className="text-sm text-slate-600 mb-4">UGs vinculadas à {selectedOdsDetails} que estão contribuindo para o saldo de inconsistências.</p>
							<div className="space-y-3">
								{ugsInSelectedOds.map((ug) => (
									<div
										key={ug.ug}
										className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50 gap-2"
									>
										<div>
											<p className="font-bold text-slate-800">
												{ug.ug} - {ug.nome_ug || "N/A"}
											</p>
											<p className="text-xs text-slate-500">
												{getUgHierarchy(ug.ug).diretoria || "Sem subordinação"} • {ug.quantidade_ocorrencias} ocorrência(s)
											</p>
										</div>
										<span className="font-bold text-slate-900 text-right">{formatCurrency(ug.saldo_total)}</span>
									</div>
								))}

								{ugsInSelectedOds.length === 0 && (
									<p className="text-sm text-slate-500 italic text-center py-4">Nenhuma UG encontrada para os filtros atuais.</p>
								)}
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
