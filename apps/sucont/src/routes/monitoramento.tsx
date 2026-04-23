import { createFileRoute } from "@tanstack/react-router"
import {
	AlertCircle,
	AlertTriangle,
	BarChart3,
	BookOpen,
	Building2,
	CheckCircle2,
	ChevronRight,
	DollarSign,
	FileText,
	Filter,
	Info,
	Lightbulb,
	MessageSquare,
	PieChart as PieChartIcon,
	Search,
	ShieldAlert,
	Target,
	Trash2,
	TrendingUp,
	Upload,
	Users,
} from "lucide-react"
import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import * as XLSX from "xlsx"
import { ChatAssistant } from "#/components/analista/chat-assistant"
import { ConsolidatedMessageCard } from "#/components/analista/consolidated-message-card"
import { UGCard } from "#/components/analista/ug-card"
import { HubLayout } from "#/components/hub-layout"
import { getConferente } from "#/lib/analista/conferentes"
import { getOrganizacao } from "#/lib/analista/organizacao"
import { classifyAccount, formatCurrency, getRacDescription, type ProcessedRow } from "#/lib/analista/types"
import { cn } from "#/lib/utils"

export const Route = createFileRoute("/monitoramento")({
	component: MonitoramentoPage,
})

function MonitoramentoPage() {
	const [data, setData] = useState<ProcessedRow[]>([])
	const [fileName, setFileName] = useState<string | null>(null)
	const [isDragging, setIsDragging] = useState(false)
	const [activeTab, setActiveTab] = useState<"ALL" | "COBRANCAS" | "EXCECOES" | "FORA_ESCOPO">("ALL")
	const [activeView, setActiveView] = useState<"operacional" | "tatico" | "estrategico" | "decisao">("operacional")
	const [activeConferenteFilter, setActiveConferenteFilter] = useState("TODOS")
	const [activeRacFilter, setActiveRacFilter] = useState("TODOS")

	const processFile = (file: File) => {
		setFileName(file.name)
		const reader = new FileReader()
		reader.onload = (e) => {
			const rawData = e.target?.result
			const workbook = XLSX.read(rawData, { type: "binary" })
			const firstSheetName = workbook.SheetNames[0]
			const worksheet = workbook.Sheets[firstSheetName]
			const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
				header: 1,
				defval: null,
			})

			const processed: ProcessedRow[] = []

			const normalizeString = (str: unknown) => {
				if (typeof str !== "string") return ""
				return str
					.toLowerCase()
					.normalize("NFD")
					.replace(/[\u0300-\u036f]/g, "")
					.replace(/\s+/g, " ")
					.trim()
			}

			let colIndices = { ug: -1, mes: -1, conta: -1, saldo: -1 }
			let dataStartIndex = -1

			for (let i = 0; i < rows.length; i++) {
				const row = rows[i]
				if (!Array.isArray(row)) continue

				const tempIndices = { ug: -1, mes: -1, conta: -1, saldo: -1 }

				row.forEach((cell, index) => {
					const norm = normalizeString(cell)
					if (!norm) return

					if (["ug", "unidade gestora", "cod ug", "codigo ug"].some((k) => norm.includes(k))) {
						tempIndices.ug = index
					} else if (["mes", "referencia", "periodo"].some((k) => norm.includes(k))) {
						tempIndices.mes = index
					} else if (["conta", "conta contabil", "cod conta"].some((k) => norm.includes(k)) && !norm.includes("bancaria")) {
						tempIndices.conta = index
					} else if (["saldo", "valor"].some((k) => norm.includes(k))) {
						tempIndices.saldo = index
					}
				})

				if (tempIndices.ug !== -1 && tempIndices.mes !== -1 && tempIndices.conta !== -1 && tempIndices.saldo !== -1) {
					colIndices = tempIndices
					dataStartIndex = i + 1
					break
				}
			}

			const parseSaldo = (saldoRaw: unknown): number => {
				if (typeof saldoRaw === "number") return saldoRaw
				if (typeof saldoRaw === "string") {
					const cleaned = saldoRaw.replace(/[R$\s]/g, "")
					if (cleaned.includes(",") && cleaned.includes(".")) {
						return parseFloat(cleaned.replace(/\./g, "").replace(",", "."))
					} else if (cleaned.includes(",")) {
						return parseFloat(cleaned.replace(",", "."))
					} else {
						return parseFloat(cleaned)
					}
				}
				return NaN
			}

			if (dataStartIndex !== -1) {
				for (let i = dataStartIndex; i < rows.length; i++) {
					const row = rows[i]
					if (!Array.isArray(row)) continue

					const ugRaw = row[colIndices.ug]
					const mesRaw = row[colIndices.mes]
					const contaRaw = row[colIndices.conta]
					const saldoRaw = row[colIndices.saldo]

					if (
						ugRaw != null &&
						String(ugRaw).trim() !== "" &&
						mesRaw != null &&
						String(mesRaw).trim() !== "" &&
						contaRaw != null &&
						String(contaRaw).trim() !== "" &&
						saldoRaw != null &&
						String(saldoRaw).trim() !== ""
					) {
						const ug = String(ugRaw).trim()
						const mes = String(mesRaw).trim()
						const conta = String(contaRaw).trim()
						const saldo = parseSaldo(saldoRaw)

						if (!Number.isNaN(saldo) && saldo !== 0) {
							const { classification, description, observation, accountCode, questaoRAC } = classifyAccount(ug, conta, saldo)
							processed.push({
								ug,
								mes,
								conta: accountCode,
								descricao: description,
								saldo,
								classificacao: classification,
								observacao: observation,
								questaoRAC,
							})
						}
					}
				}
			}

			// Fallback heurístico
			if (processed.length === 0) {
				for (let i = 0; i < rows.length; i++) {
					const row = rows[i]
					if (!Array.isArray(row)) continue

					let ug = "",
						mes = "",
						conta = "",
						saldo = 0
					let foundUg = false,
						foundMes = false,
						foundConta = false,
						foundSaldo = false

					row.forEach((cell) => {
						if (cell == null || String(cell).trim() === "") return
						const str = String(cell).trim()

						if (!foundUg && /^\d{6}$/.test(str)) {
							ug = str
							foundUg = true
						} else if (!foundConta && /^\d{9}$/.test(str)) {
							conta = str
							foundConta = true
						} else if (
							!foundMes &&
							(/^[A-Za-z]{3,}\/?\d{0,4}$/.test(str) ||
								/^\d{2}\/\d{4}$/.test(str) ||
								/^(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)$/i.test(str))
						) {
							mes = str
							foundMes = true
						} else if (!foundSaldo) {
							const parsed = parseSaldo(cell)
							if (!Number.isNaN(parsed)) {
								saldo = parsed
								foundSaldo = true
							}
						}
					})

					if (foundUg && foundMes && foundConta && foundSaldo && saldo !== 0) {
						const { classification, description, observation, accountCode, questaoRAC } = classifyAccount(ug, conta, saldo)
						processed.push({
							ug,
							mes,
							conta: accountCode,
							descricao: description,
							saldo,
							classificacao: classification,
							observacao: observation,
							questaoRAC,
						})
					}
				}
			}

			setData(processed)
		}
		reader.readAsBinaryString(file)
	}

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault()
		setIsDragging(false)
		if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0])
	}

	const clearData = () => {
		setData([])
		setFileName(null)
	}

	const filteredData = useMemo(() => {
		let filtered = data
		if (activeConferenteFilter !== "TODOS") {
			filtered = filtered.filter((row) => getConferente(row.ug) === activeConferenteFilter)
		}
		if (activeRacFilter !== "TODOS") {
			filtered = filtered.filter((row) => row.questaoRAC === activeRacFilter)
		}
		return filtered
	}, [data, activeConferenteFilter, activeRacFilter])

	const groupedData = filteredData.reduce(
		(acc, row) => {
			const key = `${row.ug}-${row.mes}`
			if (!acc[key]) acc[key] = { ug: row.ug, mes: row.mes, rows: [] }
			acc[key].rows.push(row)
			return acc
		},
		{} as Record<string, { ug: string; mes: string; rows: ProcessedRow[] }>
	)

	const excecoesData = filteredData.filter((r) => r.classificacao === "EXCEÇÃO PREVISTA")
	const outOfScopeData = filteredData.filter((r) => r.classificacao === "FORA DO ESCOPO PARAMETRIZADO")

	const dashboardData = useMemo(() => {
		if (filteredData.length === 0) return null
		const cobrancas = filteredData.filter((r) => r.classificacao === "COBRANÇA" || r.classificacao === "COBRANÇA COM OBSERVAÇÃO")
		const excecoes = filteredData.filter((r) => r.classificacao === "EXCEÇÃO PREVISTA")
		const foraEscopo = filteredData.filter((r) => r.classificacao === "FORA DO ESCOPO PARAMETRIZADO")
		return {
			totalRegistros: filteredData.length,
			totalCobrancas: cobrancas.length,
			ugsComInconsistencia: new Set(cobrancas.map((r) => r.ug)).size,
			totalExcecoes: excecoes.length,
			totalForaEscopo: foraEscopo.length,
			volumeFinanceiro: cobrancas.reduce((acc, r) => acc + Math.abs(r.saldo), 0),
		}
	}, [filteredData])

	const managerialData = useMemo(() => {
		if (filteredData.length === 0) return null
		const cobrancas = filteredData.filter((r) => r.classificacao === "COBRANÇA" || r.classificacao === "COBRANÇA COM OBSERVAÇÃO")
		const totalRiskValue = cobrancas.reduce((acc, curr) => acc + Math.abs(curr.saldo), 0)
		const ugMap = new Map<string, { count: number; value: number }>()
		const racMap = new Map<string, number>()
		const conferenteMap = new Map<string, { count: number; ugs: Set<string> }>()

		for (const item of cobrancas) {
			const ugData = ugMap.get(item.ug) || { count: 0, value: 0 }
			ugData.count += 1
			ugData.value += Math.abs(item.saldo)
			ugMap.set(item.ug, ugData)

			const rac = item.questaoRAC || "Outras Inconsistências"
			racMap.set(rac, (racMap.get(rac) || 0) + 1)

			const conferente = getConferente(item.ug)
			const confData = conferenteMap.get(conferente) || {
				count: 0,
				ugs: new Set<string>(),
			}
			confData.count += 1
			confData.ugs.add(item.ug)
			conferenteMap.set(conferente, confData)
		}

		return {
			totalRiskValue,
			topUgs: Array.from(ugMap.entries())
				.map(([ug, d]) => ({ ug, ...d }))
				.sort((a, b) => b.count - a.count)
				.slice(0, 10),
			topRacs: Array.from(racMap.entries())
				.map(([name, value]) => ({ name, value }))
				.sort((a, b) => b.value - a.value),
			totalIssues: cobrancas.length,
			conferentes: Array.from(conferenteMap.entries())
				.map(([name, d]) => ({
					name,
					count: d.count,
					ugs: Array.from(d.ugs).sort(),
				}))
				.sort((a, b) => b.count - a.count),
		}
	}, [filteredData])

	const estrategicoData = useMemo(() => {
		if (filteredData.length === 0) return null
		const cobrancas = filteredData.filter((r) => r.classificacao === "COBRANÇA" || r.classificacao === "COBRANÇA COM OBSERVAÇÃO")
		const totalRiskValue = cobrancas.reduce((acc, curr) => acc + Math.abs(curr.saldo), 0)
		const odsMap = new Map<string, { count: number; value: number }>()
		const orgaoSuperiorMap = new Map<string, { count: number; value: number }>()
		const contaMap = new Map<string, { count: number; value: number; descricao: string }>()

		for (const item of cobrancas) {
			const org = getOrganizacao(item.ug)

			const odsData = odsMap.get(org.ods) || { count: 0, value: 0 }
			odsData.count += 1
			odsData.value += Math.abs(item.saldo)
			odsMap.set(org.ods, odsData)

			const orgaoSupData = orgaoSuperiorMap.get(org.orgaoSuperior) || {
				count: 0,
				value: 0,
			}
			orgaoSupData.count += 1
			orgaoSupData.value += Math.abs(item.saldo)
			orgaoSuperiorMap.set(org.orgaoSuperior, orgaoSupData)

			const contaData = contaMap.get(item.conta) || {
				count: 0,
				value: 0,
				descricao: item.descricao,
			}
			contaData.count += 1
			contaData.value += Math.abs(item.saldo)
			contaMap.set(item.conta, contaData)
		}

		const topOds = Array.from(odsMap.entries())
			.map(([name, d]) => ({
				name,
				...d,
				percent: (d.count / cobrancas.length) * 100,
			}))
			.sort((a, b) => b.count - a.count)

		return {
			totalRiskValue,
			topOds,
			topOrgaosSuperiores: Array.from(orgaoSuperiorMap.entries())
				.map(([name, d]) => ({
					name,
					...d,
					percent: (d.count / cobrancas.length) * 100,
				}))
				.sort((a, b) => b.count - a.count)
				.slice(0, 10),
			topContas: Array.from(contaMap.entries())
				.map(([conta, d]) => ({ conta, ...d }))
				.sort((a, b) => b.count - a.count)
				.slice(0, 10),
			totalIssues: cobrancas.length,
		}
	}, [filteredData])

	const decisaoData = useMemo(() => {
		if (filteredData.length === 0) return null
		const cobrancas = filteredData.filter((r) => r.classificacao === "COBRANÇA" || r.classificacao === "COBRANÇA COM OBSERVAÇÃO")
		const totalIssues = cobrancas.length

		const ugMap = new Map<string, number>()
		for (const r of cobrancas) ugMap.set(r.ug, (ugMap.get(r.ug) || 0) + 1)

		const sortedUgs = Array.from(ugMap.entries())
			.map(([ug, count]) => ({ ug, count }))
			.sort((a, b) => b.count - a.count)

		const totalUgs = sortedUgs.length
		const twentyPercentCount = Math.max(1, Math.round(totalUgs * 0.2))
		const topTwentyUgs = sortedUgs.slice(0, twentyPercentCount)
		const topTwentyIssuesCount = topTwentyUgs.reduce((acc, curr) => acc + curr.count, 0)
		const paretoPercent = (topTwentyIssuesCount / totalIssues) * 100

		const maxCount = sortedUgs[0]?.count || 1
		const maxValue = Math.max(...sortedUgs.map((u) => cobrancas.filter((c) => c.ug === u.ug).reduce((acc, curr) => acc + Math.abs(curr.saldo), 0)))

		const prioritizedUgs = sortedUgs
			.map((u) => {
				const ugCobrancas = cobrancas.filter((c) => c.ug === u.ug)
				const value = ugCobrancas.reduce((acc, curr) => acc + Math.abs(curr.saldo), 0)
				const org = getOrganizacao(u.ug)
				const score = (u.count / maxCount) * 0.4 + (value / (maxValue || 1)) * 0.4 + 0.2
				return {
					...u,
					value,
					nome: org.nome,
					ods: org.ods,
					superior: org.orgaoSuperior,
					score,
				}
			})
			.sort((a, b) => b.score - a.score)

		return {
			pareto: {
				totalUgs,
				twentyPercentCount,
				paretoPercent,
				topTwentyUgs: prioritizedUgs.slice(0, twentyPercentCount),
			},
			priorities: prioritizedUgs.slice(0, 15),
			criticalLevels: {
				ods: estrategicoData?.topOds[0]?.name ?? "-",
				superior: estrategicoData?.topOrgaosSuperiores[0]?.name ?? "-",
				ugCount: sortedUgs[0]?.ug ?? "-",
				ugValue: prioritizedUgs.sort((a, b) => b.value - a.value)[0]?.ug ?? "-",
			},
		}
	}, [filteredData, estrategicoData])

	return (
		<HubLayout>
			{/* Header da ferramenta */}
			<div className="mb-8 flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-slate-900 tracking-tight">Analista SUCONT — Monitoramento de Contas de Saldo Transitório</h1>
					<p className="text-slate-500 mt-1 text-sm">Diretoria de Economia e Finanças da Aeronáutica (DIREF) · Questões Q26, Q27, Q28, Q31, Q32, Q36 do RAC</p>
				</div>
				{fileName && (
					<button
						type="button"
						onClick={clearData}
						className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
					>
						<Trash2 className="w-4 h-4" />
						<span>Nova Análise</span>
					</button>
				)}
			</div>

			{!fileName ? (
				<div className="space-y-6">
					{/* Upload zone */}
					<button
						type="button"
						className={cn(
							"w-full border-2 border-dashed rounded-2xl p-12 text-center transition-colors duration-200 cursor-pointer",
							isDragging ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-blue-400 hover:bg-slate-50 bg-white"
						)}
						onDrop={handleDrop}
						onDragOver={(e) => {
							e.preventDefault()
							setIsDragging(true)
						}}
						onDragLeave={(e) => {
							e.preventDefault()
							setIsDragging(false)
						}}
						onClick={() => document.getElementById("file-upload")?.click()}
					>
						<input
							id="file-upload"
							type="file"
							accept=".xlsx,.xls"
							className="hidden"
							onChange={(e) => {
								if (e.target.files?.[0]) processFile(e.target.files[0])
							}}
						/>
						<div className="mx-auto w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
							<Upload className="w-8 h-8" />
						</div>
						<h3 className="text-lg font-semibold text-slate-900 mb-1">Carregar Planilha do Tesouro Gerencial</h3>
						<p className="text-slate-500 text-sm max-w-md mx-auto">
							Arraste e solte o arquivo .xlsx aqui, ou clique para selecionar. A planilha deve conter as colunas UG, Mês, Conta Contábil e Saldo.
						</p>
					</button>

					<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
						<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
							<div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mb-4">
								<Search className="w-6 h-6" />
							</div>
							<h3 className="text-lg font-semibold text-slate-900 mb-2">O que está sendo analisado</h3>
							<p className="text-sm text-slate-600 leading-relaxed">
								Saldos de contas contábeis transitórias e de controle do COMAER, extraídos do Tesouro Gerencial, visando identificar inconsistências e valores
								fora da conformidade.
							</p>
						</div>
						<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
							<div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center mb-4">
								<BookOpen className="w-6 h-6" />
							</div>
							<h3 className="text-lg font-semibold text-slate-900 mb-2">O Referencial Teórico (RAC)</h3>
							<p className="text-sm text-slate-600 leading-relaxed">
								A análise é fundamentada no Roteiro de Acompanhamento Contábil (RAC), mapeando as contas de acordo com as diretrizes e exceções previstas nas
								questões normativas.
							</p>
						</div>
						<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
							<div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mb-4">
								<MessageSquare className="w-6 h-6" />
							</div>
							<h3 className="text-lg font-semibold text-slate-900 mb-2">Mensagens Automáticas</h3>
							<p className="text-sm text-slate-600 leading-relaxed">
								Geração automática de propostas de mensagens de cobrança e orientação para as UGs, padronizando a comunicação e agilizando a regularização.
							</p>
						</div>
					</div>

					<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
						<h3 className="text-md font-semibold text-slate-900 mb-4 flex items-center">
							<FileText className="w-5 h-5 mr-2 text-blue-600" />
							Caminho do Relatório no Tesouro Gerencial
						</h3>
						<div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-sm text-slate-700 flex flex-wrap items-center gap-y-2 gap-x-1">
							{[
								"TESOURO GERENCIAL",
								"Relatórios Compartilhados",
								"Consultas Gerenciais",
								"Relatórios de Bancada dos Órgãos Superiores",
								"52000 - Ministério da Defesa",
								"52111 - Comando da Aeronáutica",
								"SEFA",
								"DIREF",
								"SUCONT-3 - ACOMPANHAMENTO",
							].map((step, i) => (
								<span key={step} className="flex items-center gap-x-1">
									{i > 0 && <ChevronRight className="w-4 h-4 text-slate-400" />}
									<span className={i === 0 ? "font-medium" : ""}>{step}</span>
								</span>
							))}
							<ChevronRight className="w-4 h-4 text-slate-400" />
							<span className="font-semibold text-blue-700">ACOMPANHAMENTO CONTÁBIL - SUCONT-3.1</span>
						</div>
					</div>
				</div>
			) : (
				<div className="space-y-8">
					{/* Escopo */}
					<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
						<div className="flex items-start space-x-3">
							<div className="p-2 bg-blue-100 rounded-lg shrink-0">
								<Info className="w-5 h-5 text-blue-700" />
							</div>
							<div>
								<h3 className="text-lg font-semibold text-slate-900 mb-2">Escopo da Análise (RAC)</h3>
								<p className="text-sm text-slate-600 mb-3">Este sistema analisa saldos transitórios com base nas seguintes questões do RAC:</p>
								<div className="flex flex-wrap gap-2 mb-4">
									{["Questão 26", "Questão 27", "Questão 28", "Questão 31", "Questão 32", "Questão 36"].map((q) => (
										<span
											key={q}
											className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200"
										>
											{q}
										</span>
									))}
								</div>
								<div className="bg-amber-50 border-l-4 border-amber-500 p-3 rounded-r-md">
									<p className="text-xs text-amber-800 flex items-center">
										<AlertTriangle className="w-4 h-4 mr-1.5 shrink-0" />
										<strong>Atenção:</strong>&nbsp;Contas presentes na planilha que não fazem parte do escopo parametrizado do RAC também são analisadas e
										destacadas em uma seção específica para revisão manual.
									</p>
								</div>
							</div>
						</div>
					</div>

					{/* Filtros */}
					<div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
						<div className="flex flex-wrap items-center gap-6">
							<div className="flex items-center space-x-3">
								<label htmlFor="rac-filter" className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center">
									<BookOpen className="w-4 h-4 mr-2 text-blue-600" />
									Questão RAC:
								</label>
								<select
									id="rac-filter"
									value={activeRacFilter}
									onChange={(e) => setActiveRacFilter(e.target.value)}
									className="text-sm border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 py-2 pl-3 pr-10 bg-slate-50 font-medium text-slate-700"
								>
									<option value="TODOS">Todas as Questões</option>
									{Array.from(new Set(data.filter((r) => r.questaoRAC).map((r) => r.questaoRAC)))
										.sort()
										.map((rac) => (
											<option key={rac} value={rac}>
												{rac}
											</option>
										))}
								</select>
							</div>
							<div className="flex items-center space-x-3">
								<label htmlFor="conferente-filter" className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center">
									<Filter className="w-4 h-4 mr-2 text-blue-600" />
									Conferente:
								</label>
								<select
									id="conferente-filter"
									value={activeConferenteFilter}
									onChange={(e) => setActiveConferenteFilter(e.target.value)}
									className="text-sm border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 py-2 pl-3 pr-10 bg-slate-50 font-medium text-slate-700"
								>
									<option value="TODOS">Todos os Conferentes</option>
									{Array.from(new Set(data.map((r) => getConferente(r.ug))))
										.sort()
										.map((conf) => (
											<option key={conf} value={conf}>
												{conf}
											</option>
										))}
								</select>
							</div>
						</div>
						{(activeRacFilter !== "TODOS" || activeConferenteFilter !== "TODOS") && (
							<button
								type="button"
								onClick={() => {
									setActiveRacFilter("TODOS")
									setActiveConferenteFilter("TODOS")
								}}
								className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors"
							>
								<Trash2 className="w-4 h-4" />
								LIMPAR FILTROS
							</button>
						)}
					</div>

					{/* Abas de visão */}
					<div className="flex flex-wrap items-center border-b border-slate-200 gap-1">
						{(
							[
								{ id: "operacional", label: "Visão Operacional", color: "blue" },
								{ id: "tatico", label: "Visão Tática", color: "indigo" },
								{ id: "estrategico", label: "Visão Estratégica", color: "emerald" },
								{ id: "decisao", label: "Apoio à Decisão", color: "amber" },
							] as const
						).map(({ id, label, color }) => (
							<button
								key={id}
								type="button"
								onClick={() => setActiveView(id)}
								className={cn(
									"px-6 py-4 text-sm font-bold transition-all",
									activeView === id
										? `text-${color}-600 border-b-2 border-${color}-600 bg-${color}-50/50`
										: "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
								)}
							>
								{label}
							</button>
						))}
					</div>

					{/* Banner focal RAC */}
					{activeView === "operacional" && activeRacFilter !== "TODOS" && (
						<div className="bg-blue-900 text-white p-6 rounded-2xl border border-blue-700 flex items-center justify-between animate-in slide-in-from-top duration-500">
							<div className="flex items-center space-x-4">
								<div className="p-3 bg-blue-800 rounded-xl">
									<BookOpen className="w-6 h-6 text-blue-100" />
								</div>
								<div>
									<h2 className="text-xl font-bold">
										{activeRacFilter} — {getRacDescription(activeRacFilter)}
									</h2>
									<p className="text-blue-200 text-sm">Mostrando apenas UGs com inconsistências nesta questão do RAC</p>
								</div>
							</div>
							<button
								type="button"
								onClick={() => setActiveRacFilter("TODOS")}
								className="text-xs bg-blue-800 hover:bg-blue-700 px-3 py-1.5 rounded-lg border border-blue-600 transition-colors"
							>
								Limpar Filtro RAC
							</button>
						</div>
					)}

					{/* ── VISÃO TÁTICA ── */}
					{activeView === "tatico" && managerialData && (
						<div className="space-y-8 animate-in fade-in duration-500">
							<div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
								<div className="flex items-start space-x-4">
									<div className="p-3 bg-indigo-100 rounded-xl shrink-0">
										<Target className="w-6 h-6 text-indigo-700" />
									</div>
									<div>
										<h2 className="text-2xl font-bold text-slate-900 mb-2">Painel de Análise Tática (SUCONT-3)</h2>
										<p className="text-slate-600 leading-relaxed">
											Este painel traduz os achados operacionais em informações gerenciais para a Divisão SUCONT-3, alinhadas ao{" "}
											<strong>Roteiro de Acompanhamento Contábil (RAC)</strong>.
										</p>
									</div>
								</div>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
								{[
									{
										label: "Total de Inconsistências",
										value: managerialData.totalIssues,
										sub: "Registros fora da conformidade RAC",
										color: "slate",
									},
									{
										label: "Volume Financeiro em Risco",
										value: formatCurrency(managerialData.totalRiskValue),
										sub: "Soma absoluta dos saldos irregulares",
										color: "red",
									},
									{
										label: "UG mais Crítica (Volume)",
										value: managerialData.topUgs[0]?.ug || "-",
										sub: "Maior concentração de inconsistências",
										color: "slate",
									},
									{
										label: "Questão RAC mais Frequente",
										value: managerialData.topRacs[0]?.name || "-",
										sub: "Principal ofensor sistêmico",
										color: "indigo",
									},
								].map(({ label, value, sub, color }) => (
									<div key={label} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
										<p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
										<p className={`text-3xl font-bold text-${color}-${color === "red" ? "600" : color === "indigo" ? "600" : "900"} truncate`}>{value}</p>
										<p className="text-xs text-slate-500 mt-2">{sub}</p>
									</div>
								))}
							</div>

							<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
								<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
									<h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
										<TrendingUp className="w-5 h-5 mr-2 text-blue-600" />
										Top 10 UGs por Volume de Inconsistências
									</h3>
									<div className="h-80">
										<ResponsiveContainer width="100%" height="100%">
											<BarChart data={managerialData.topUgs} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
												<CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
												<XAxis type="number" hide />
												<YAxis dataKey="ug" type="category" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
												<Tooltip
													cursor={{ fill: "#f1f5f9" }}
													contentStyle={{
														borderRadius: "8px",
														border: "none",
														boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
													}}
													formatter={(value: number) => [value, "Ocorrências"]}
												/>
												<Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
											</BarChart>
										</ResponsiveContainer>
									</div>
								</div>

								<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
									<h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
										<PieChartIcon className="w-5 h-5 mr-2 text-indigo-600" />
										Distribuição por Questão RAC
									</h3>
									<div className="h-80">
										<ResponsiveContainer width="100%" height="100%">
											<PieChart>
												<Pie data={managerialData.topRacs} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
													{managerialData.topRacs.map((_, index) => (
														<Cell key={`cell-${index}`} fill={["#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316"][index % 6]} />
													))}
												</Pie>
												<Tooltip
													contentStyle={{
														borderRadius: "8px",
														border: "none",
														boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
													}}
													formatter={(value: number) => [value, "Ocorrências"]}
												/>
												<Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: "12px", color: "#64748b" }} />
											</PieChart>
										</ResponsiveContainer>
									</div>
								</div>
							</div>

							<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
								<h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
									<Users className="w-5 h-5 mr-2 text-emerald-600" />
									Distribuição de Inconsistências por Conferente
								</h3>
								<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
									{managerialData.conferentes.map((conf, idx) => (
										<div key={idx} className="border border-slate-200 rounded-xl p-4 bg-slate-50">
											<div className="flex justify-between items-start mb-3">
												<h4 className="font-semibold text-slate-900 text-sm">Conferente: {conf.name}</h4>
												<span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
													{conf.count} Inconsistências
												</span>
											</div>
											<div className="text-xs text-slate-500 mb-2 font-medium">UGs com inconsistências:</div>
											<div className="flex flex-wrap gap-1.5">
												{conf.ugs.map((ug) => (
													<span
														key={ug}
														className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white border border-slate-200 text-slate-700"
													>
														UG {ug}
													</span>
												))}
											</div>
										</div>
									))}
								</div>
							</div>

							<div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6">
								<h3 className="text-lg font-bold text-indigo-900 mb-4 flex items-center">
									<Lightbulb className="w-5 h-5 mr-2 text-indigo-600" />
									Recomendações Estratégicas (Foco de Atuação)
								</h3>
								<ul className="space-y-3 text-indigo-800 text-sm">
									{managerialData.topUgs.length > 0 && (
										<li className="flex items-start">
											<span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 mr-2 shrink-0" />A UG <strong>{managerialData.topUgs[0].ug}</strong>{" "}
											concentra a maior parte das inconsistências. Recomenda-se uma ação de orientação técnica direcionada à Setorial Contábil desta unidade.
										</li>
									)}
									{managerialData.topRacs.length > 0 && (
										<li className="flex items-start">
											<span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 mr-2 shrink-0" />A <strong>{managerialData.topRacs[0].name}</strong> é a
											principal ofensora do COMAER neste período. Sugere-se avaliar a necessidade de capacitação das UGs ou a emissão de um boletim de
											orientação específico.
										</li>
									)}
									<li className="flex items-start">
										<span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 mr-2 shrink-0" />O volume financeiro total em risco é de{" "}
										<strong>{formatCurrency(managerialData.totalRiskValue)}</strong>. A não regularização pode comprometer a fidedignidade das demonstrações
										contábeis do COMAER.
									</li>
								</ul>
							</div>

							<ChatAssistant managerialData={managerialData} estrategicoData={estrategicoData ?? null} decisaoData={decisaoData} />
						</div>
					)}

					{/* ── VISÃO ESTRATÉGICA ── */}
					{activeView === "estrategico" && estrategicoData && (
						<div className="space-y-8 animate-in fade-in duration-500">
							<div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
								<div className="flex items-start space-x-4">
									<div className="p-3 bg-emerald-100 rounded-xl shrink-0">
										<Building2 className="w-6 h-6 text-emerald-700" />
									</div>
									<div>
										<h2 className="text-2xl font-bold text-slate-900 mb-2">Painel de Risco Contábil do COMAER (Estratégico)</h2>
										<p className="text-slate-600 leading-relaxed">
											Visão consolidada para apoio à tomada de decisão da chefia da SUCONT, DIREF e altos escalões do COMAER.
										</p>
									</div>
								</div>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
								<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
									<p className="text-sm font-medium text-slate-500 mb-1">Total de Inconsistências</p>
									<p className="text-3xl font-bold text-slate-900">{estrategicoData.totalIssues}</p>
									<p className="text-xs text-slate-500 mt-2">Registros fora da conformidade RAC</p>
								</div>
								<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
									<p className="text-sm font-medium text-slate-500 mb-1">Volume Financeiro em Risco</p>
									<p className="text-3xl font-bold text-red-600">{formatCurrency(estrategicoData.totalRiskValue)}</p>
									<p className="text-xs text-slate-500 mt-2">Soma absoluta dos saldos irregulares</p>
								</div>
								<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
									<p className="text-sm font-medium text-slate-500 mb-1">Maior Risco por ODS</p>
									<p className="text-2xl font-bold text-emerald-600 truncate">{estrategicoData.topOds[0]?.name || "-"}</p>
									<p className="text-xs text-slate-500 mt-2">{estrategicoData.topOds[0]?.percent.toFixed(1)}% das inconsistências</p>
								</div>
							</div>

							<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
								<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
									<h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
										<PieChartIcon className="w-5 h-5 mr-2 text-emerald-600" />
										Distribuição Percentual por ODS
									</h3>
									<div className="h-80">
										<ResponsiveContainer width="100%" height="100%">
											<PieChart>
												<Pie data={estrategicoData.topOds} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="count" nameKey="name">
													{estrategicoData.topOds.map((_, index) => (
														<Cell key={`cell-${index}`} fill={["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b"][index % 6]} />
													))}
												</Pie>
												<Tooltip
													contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
													formatter={(value: number, _name: string, props: { payload: { percent: number } }) => [
														`${value} (${props.payload.percent.toFixed(1)}%)`,
														"Inconsistências",
													]}
												/>
												<Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: "12px", color: "#64748b" }} />
											</PieChart>
										</ResponsiveContainer>
									</div>
								</div>

								<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
									<h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
										<BarChart3 className="w-5 h-5 mr-2 text-emerald-600" />
										Ranking de Órgãos Superiores
									</h3>
									<div className="h-80">
										<ResponsiveContainer width="100%" height="100%">
											<BarChart data={estrategicoData.topOrgaosSuperiores} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
												<CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="#e2e8f0" />
												<XAxis type="number" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
												<YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11, fill: "#475569" }} axisLine={false} tickLine={false} />
												<Tooltip
													cursor={{ fill: "#f1f5f9" }}
													contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
													formatter={(value: number) => [value, "Inconsistências"]}
												/>
												<Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
											</BarChart>
										</ResponsiveContainer>
									</div>
								</div>
							</div>

							<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
								<h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
									<AlertTriangle className="w-5 h-5 mr-2 text-red-600" />
									Contas Contábeis com Maior Risco (Top 10)
								</h3>
								<div className="overflow-x-auto">
									<table className="min-w-full divide-y divide-slate-200">
										<thead>
											<tr>
												{["Conta", "Descrição", "Ocorrências", "Volume Financeiro"].map((h) => (
													<th key={h} className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
														{h}
													</th>
												))}
											</tr>
										</thead>
										<tbody className="divide-y divide-slate-100">
											{estrategicoData.topContas.map((c, i) => (
												<tr key={i} className="hover:bg-slate-50">
													<td className="px-3 py-2 whitespace-nowrap text-sm font-mono text-slate-900">{c.conta}</td>
													<td className="px-3 py-2 text-sm text-slate-600">{c.descricao}</td>
													<td className="px-3 py-2 whitespace-nowrap text-sm text-right font-medium text-slate-900">{c.count}</td>
													<td className="px-3 py-2 whitespace-nowrap text-sm text-right font-medium text-red-600">{formatCurrency(c.value)}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>

							<ChatAssistant managerialData={managerialData ?? null} estrategicoData={estrategicoData} decisaoData={decisaoData} />
						</div>
					)}

					{/* ── APOIO À DECISÃO ── */}
					{activeView === "decisao" && decisaoData && (
						<div className="space-y-8 animate-in fade-in duration-500">
							<div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
								<div className="flex items-start space-x-4">
									<div className="p-3 bg-amber-100 rounded-xl shrink-0">
										<Lightbulb className="w-6 h-6 text-amber-700" />
									</div>
									<div>
										<h2 className="text-2xl font-bold text-slate-900 mb-2">Apoio à Tomada de Decisão e Mapa de Risco</h2>
										<p className="text-slate-600 leading-relaxed">
											Análise estratégica para identificação de níveis de risco contábil, concentração de inconsistências e priorização de atuação no âmbito do
											COMAER.
										</p>
									</div>
								</div>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
								{[
									{ label: "ODS de Maior Risco", value: decisaoData.criticalLevels.ods },
									{ label: "Órgão Superior Crítico", value: decisaoData.criticalLevels.superior },
									{ label: "UG com mais Inconsistências", value: decisaoData.criticalLevels.ugCount },
									{ label: "UG com maior Saldo Irregular", value: decisaoData.criticalLevels.ugValue },
								].map(({ label, value }) => (
									<div key={label} className="bg-amber-50 p-6 rounded-2xl border border-amber-200">
										<p className="text-xs font-bold text-amber-600 uppercase mb-1">{label}</p>
										<p className="text-xl font-bold text-slate-900">{value}</p>
									</div>
								))}
							</div>

							<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
								<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
									<h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
										<ShieldAlert className="w-5 h-5 mr-2 text-red-600" />
										Mapa de Risco Contábil (ODS)
									</h3>
									<div className="overflow-x-auto">
										<table className="w-full text-sm text-left">
											<thead className="text-xs text-slate-500 uppercase bg-slate-50">
												<tr>
													<th className="px-4 py-3">ODS</th>
													<th className="px-4 py-3 text-center">Inconsistências</th>
													<th className="px-4 py-3 text-right">Saldo Associado</th>
													<th className="px-4 py-3 text-right">% Total</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-slate-100">
												{estrategicoData?.topOds.map((ods) => (
													<tr key={ods.name} className="hover:bg-slate-50">
														<td className="px-4 py-3 font-medium text-slate-900">{ods.name}</td>
														<td className="px-4 py-3 text-center">{ods.count}</td>
														<td className="px-4 py-3 text-right text-red-600 font-medium">{formatCurrency(ods.value)}</td>
														<td className="px-4 py-3 text-right">{ods.percent.toFixed(1)}%</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</div>

								<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
									<h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
										<Target className="w-5 h-5 mr-2 text-blue-600" />
										Análise de Concentração (Pareto)
									</h3>
									<div className="flex flex-col items-center justify-center h-full pb-6">
										<div className="text-center mb-8">
											<p className="text-4xl font-black text-blue-600 mb-2">{decisaoData.pareto.paretoPercent.toFixed(1)}%</p>
											<p className="text-sm text-slate-600">
												das inconsistências estão concentradas em apenas <span className="font-bold text-slate-900">20% das UGs</span> (
												{decisaoData.pareto.twentyPercentCount} UGs).
											</p>
										</div>
										<div className="w-full space-y-3">
											<p className="text-xs font-bold text-slate-400 uppercase">UGs que compõem a concentração:</p>
											{decisaoData.pareto.topTwentyUgs.map((ug, i) => (
												<div key={ug.ug} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100">
													<div className="flex items-center gap-2">
														<span className="text-[10px] font-bold bg-blue-100 text-blue-700 w-5 h-5 flex items-center justify-center rounded-full">
															{i + 1}
														</span>
														<span className="text-sm font-semibold text-slate-700">
															{ug.ug} ({ug.nome})
														</span>
													</div>
													<span className="text-xs font-medium text-slate-500">{ug.count} itens</span>
												</div>
											))}
										</div>
									</div>
								</div>
							</div>

							<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
								<h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
									<TrendingUp className="w-5 h-5 mr-2 text-emerald-600" />
									Priorização de Atuação (Top 15 UGs Prioritárias)
								</h3>
								<div className="overflow-x-auto">
									<table className="w-full text-sm text-left">
										<thead className="text-xs text-slate-500 uppercase bg-slate-50">
											<tr>
												<th className="px-4 py-3">Prioridade</th>
												<th className="px-4 py-3">UG / Nome</th>
												<th className="px-4 py-3">Órgão Superior / ODS</th>
												<th className="px-4 py-3 text-center">Inconsistências</th>
												<th className="px-4 py-3 text-right">Impacto Financeiro</th>
												<th className="px-4 py-3 text-center">Score de Risco</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-slate-100">
											{decisaoData.priorities.map((ug, i) => (
												<tr key={ug.ug} className="hover:bg-slate-50">
													<td className="px-4 py-3">
														<span
															className={cn(
																"inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold",
																i < 3 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"
															)}
														>
															{i + 1}º
														</span>
													</td>
													<td className="px-4 py-3">
														<p className="font-bold text-slate-900">{ug.ug}</p>
														<p className="text-xs text-slate-500">{ug.nome}</p>
													</td>
													<td className="px-4 py-3">
														<p className="text-slate-700">{ug.superior}</p>
														<p className="text-xs text-slate-500">{ug.ods}</p>
													</td>
													<td className="px-4 py-3 text-center font-medium">{ug.count}</td>
													<td className="px-4 py-3 text-right text-red-600 font-medium">{formatCurrency(ug.value)}</td>
													<td className="px-4 py-3 text-center">
														<div className="w-full bg-slate-100 rounded-full h-1.5 max-w-[100px] mx-auto">
															<div
																className={cn("h-1.5 rounded-full", ug.score > 0.7 ? "bg-red-500" : ug.score > 0.4 ? "bg-amber-500" : "bg-emerald-500")}
																style={{ width: `${ug.score * 100}%` }}
															/>
														</div>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>

							<ChatAssistant managerialData={managerialData ?? null} estrategicoData={estrategicoData ?? null} decisaoData={decisaoData} />
						</div>
					)}

					{/* ── VISÃO OPERACIONAL ── */}
					{activeView === "operacional" && dashboardData && (
						<div className="space-y-6 mb-8 animate-in fade-in duration-500">
							<h2 className="text-xl font-bold text-slate-900 flex items-center">
								<BarChart3 className="w-6 h-6 mr-2 text-blue-600" />
								VISÃO GERAL
							</h2>
							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
								{[
									{
										icon: <FileText className="w-6 h-6" />,
										bg: "bg-slate-100 text-slate-600",
										label: "Total de Registros Analisados",
										value: dashboardData.totalRegistros,
									},
									{
										icon: <AlertTriangle className="w-6 h-6" />,
										bg: "bg-red-100 text-red-600",
										label: "Ocorrências de Cobrança",
										value: dashboardData.totalCobrancas,
									},
									{
										icon: <Building2 className="w-6 h-6" />,
										bg: "bg-blue-100 text-blue-600",
										label: "UGs com Inconsistências",
										value: dashboardData.ugsComInconsistencia,
									},
									{
										icon: <CheckCircle2 className="w-6 h-6" />,
										bg: "bg-emerald-100 text-emerald-600",
										label: "Exceções Identificadas",
										value: dashboardData.totalExcecoes,
									},
									{
										icon: <AlertCircle className="w-6 h-6" />,
										bg: "bg-amber-100 text-amber-600",
										label: "Ocorrências Fora do Escopo",
										value: dashboardData.totalForaEscopo,
									},
									{
										icon: <DollarSign className="w-6 h-6" />,
										bg: "bg-emerald-100 text-emerald-600",
										label: "Valor Total das Inconsistências",
										value: formatCurrency(dashboardData.volumeFinanceiro),
									},
								].map(({ icon, bg, label, value }) => (
									<div key={label} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center space-x-4">
										<div className={`p-3 ${bg} rounded-xl`}>{icon}</div>
										<div>
											<p className="text-sm font-medium text-slate-500">{label}</p>
											<p className="text-2xl font-bold text-slate-900">{value}</p>
										</div>
									</div>
								))}
							</div>
						</div>
					)}

					{activeView === "operacional" && data.length > 0 && (
						<div className="mb-8">
							<div className="flex items-center space-x-2 mb-4">
								<Filter className="w-5 h-5 text-slate-500" />
								<h3 className="text-sm font-medium text-slate-700 uppercase tracking-wider">Filtrar Visão</h3>
							</div>
							<div className="flex flex-wrap gap-2">
								{(
									[
										{ id: "ALL", label: "Todas as Ocorrências", active: "bg-slate-800 text-white" },
										{ id: "COBRANCAS", label: "Cobranças (RAC)", active: "bg-red-600 text-white" },
										{ id: "EXCECOES", label: "Exceções (RAC)", active: "bg-emerald-600 text-white" },
										{ id: "FORA_ESCOPO", label: "Fora do Escopo (Inconsistências)", active: "bg-amber-500 text-white" },
									] as const
								).map(({ id, label, active }) => (
									<button
										key={id}
										type="button"
										onClick={() => setActiveTab(id)}
										className={cn(
											"px-4 py-2 rounded-lg text-sm font-medium transition-colors",
											activeTab === id ? active : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
										)}
									>
										{label}
									</button>
								))}
							</div>
						</div>
					)}

					{activeView === "operacional" && (activeTab === "ALL" || activeTab === "COBRANCAS") && dashboardData && dashboardData.totalCobrancas > 0 && (
						<div className="space-y-6 mb-8">
							{activeRacFilter !== "TODOS" && <ConsolidatedMessageCard rows={filteredData} activeRacFilter={activeRacFilter} />}
							<h2 className="text-xl font-bold text-slate-900 flex items-center mt-12">
								<AlertTriangle className="w-6 h-6 mr-2 text-red-600" />
								PAINEL DE INCONSISTÊNCIAS POR UG
							</h2>
							{Object.values(groupedData).map((group) => (
								<UGCard key={`${group.ug}-${group.mes}`} group={group} type="INCONSISTENCIA" activeRacFilter={activeRacFilter} />
							))}
						</div>
					)}

					{activeView === "operacional" && (activeTab === "ALL" || activeTab === "EXCECOES") && excecoesData.length > 0 && (
						<div className="space-y-6 mb-8">
							<h2 className="text-xl font-bold text-slate-900 flex items-center mt-12">
								<CheckCircle2 className="w-6 h-6 mr-2 text-emerald-600" />
								PAINEL DE EXCEÇÕES DO RAC
							</h2>
							<div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
								<div className="p-6">
									<p className="text-sm text-slate-600 mb-4">
										As ocorrências abaixo foram detectadas, mas estão previstas nas exceções do RAC. Nenhuma cobrança será gerada.
									</p>
									<div className="overflow-x-auto">
										<table className="min-w-full divide-y divide-slate-200">
											<thead>
												<tr>
													{["UG", "Conta", "Descrição", "Saldo", "Fundamento da exceção"].map((h) => (
														<th key={h} className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
															{h}
														</th>
													))}
												</tr>
											</thead>
											<tbody className="divide-y divide-slate-100">
												{excecoesData.map((c, i) => (
													<tr key={i} className="hover:bg-slate-50">
														<td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-slate-900">{c.ug}</td>
														<td className="px-3 py-2 whitespace-nowrap text-sm font-mono text-slate-900">{c.conta}</td>
														<td className="px-3 py-2 text-sm text-slate-600">{c.descricao}</td>
														<td className="px-3 py-2 whitespace-nowrap text-sm text-right font-medium text-slate-900">{formatCurrency(c.saldo)}</td>
														<td className="px-3 py-2 text-sm text-slate-500 italic">{c.observacao || "Exceção expressamente prevista no RAC"}</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</div>
							</div>
						</div>
					)}

					{activeView === "operacional" && (activeTab === "ALL" || activeTab === "FORA_ESCOPO") && outOfScopeData.length > 0 && (
						<div className="space-y-6 mb-8 animate-in fade-in duration-500">
							<h2 className="text-xl font-bold text-slate-900 flex items-center mt-12">
								<AlertCircle className="w-6 h-6 mr-2 text-amber-500" />
								PAINEL DE CONTAS FORA DO ESCOPO DO RAC
							</h2>
							<div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl mb-6">
								<p className="text-sm text-amber-800">
									<span className="font-semibold">Possível inconsistência contábil – conta não parametrizada no RAC.</span>
									<br />
									As contas abaixo não foram encontradas na matriz normativa e requerem revisão manual pela equipe da SUCONT-3.
								</p>
							</div>
							{Object.values(groupedData).map((group) => (
								<UGCard key={`fora-${group.ug}-${group.mes}`} group={group} type="FORA_ESCOPO" activeRacFilter={activeRacFilter} />
							))}
						</div>
					)}

					{activeView === "operacional" && data.length > 0 && dashboardData?.totalCobrancas === 0 && outOfScopeData.length === 0 && (
						<div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center animate-in fade-in duration-500">
							<CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
							<h3 className="text-lg font-semibold text-emerald-900">Nenhuma cobrança necessária</h3>
							<p className="text-emerald-700 mt-1">Todas as ocorrências processadas são exceções previstas na matriz normativa.</p>
						</div>
					)}
				</div>
			)}
		</HubLayout>
	)
}
