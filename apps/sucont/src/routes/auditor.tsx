import { createFileRoute, Link } from "@tanstack/react-router"
import { Activity, AlertTriangle, ArrowLeft, Database, FileSpreadsheet, Layers, LayoutDashboard, Moon, Sun, UploadCloud } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { ComparisonChart, EvolutionChart } from "#/auditor/components/Charts"
import { ChartWrapper } from "#/auditor/components/ChartWrapper"
import { CustomSelect } from "#/auditor/components/CustomSelect"
import { FileUploadModal } from "#/auditor/components/FileUploadModal"
import { HealthScoreGauge } from "#/auditor/components/HealthScoreGauge"
import { RankingList } from "#/auditor/components/RankingList"
import { SiafiMessageModal } from "#/auditor/components/SiafiMessageModal"
import { StatCard } from "#/auditor/components/StatCard"
import { TemporalHeatmap } from "#/auditor/components/TemporalHeatmap"
import { applyRiskClassification, formatCurrency, normalizeData, parseDateString, recalculateDeltas, toShortDate } from "#/auditor/services/dataProcessor"
import { parseExcelFile } from "#/auditor/services/excelParser"
import type { FinancialRecord, TimeFilter } from "#/auditor/types"
import { AccountGroup } from "#/auditor/types"

export const Route = createFileRoute("/auditor")({
	component: AuditorPage,
})

function AuditorPage() {
	const [rawData, setRawData] = useState<FinancialRecord[]>([])

	// UI State
	const [selectedGroup, setSelectedGroup] = useState<string>("ALL")
	const [timeFilter, setTimeFilter] = useState<TimeFilter>("MENSAL")
	const [selectedMonth, setSelectedMonth] = useState<string>("")
	const [selectedHierarchyLevel, setSelectedHierarchyLevel] = useState<"ODS" | "ORGAO" | "UG">("UG")
	const [selectedHierarchyFilter, setSelectedHierarchyFilter] = useState<string[]>(["TODOS"])
	const [selectedRisk, _setSelectedRisk] = useState<string>("TODOS")
	const [searchTerm, _setSearchTerm] = useState("")
	const [isDarkMode, setIsDarkMode] = useState(true)
	const [hideZeros, setHideZeros] = useState(true)

	// Modals
	const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
	const [isMessageModalOpen, setIsMessageModalOpen] = useState(false)
	const [selectedRecordForMessage, setSelectedRecordForMessage] = useState<FinancialRecord | null>(null)
	const [selectedHistoryForMessage, setSelectedHistoryForMessage] = useState<FinancialRecord[]>([])
	const [messageContext, setMessageContext] = useState<"RANKING" | "HEATMAP">("HEATMAP")

	// Sync dark mode class on html element
	useEffect(() => {
		if (isDarkMode) document.documentElement.classList.add("dark")
		else document.documentElement.classList.remove("dark")

		// Cleanup: remove dark class when leaving the page
		return () => {
			document.documentElement.classList.remove("dark")
		}
	}, [isDarkMode])

	// 1. Process data
	const allData = useMemo(() => {
		const normalized = normalizeData(rawData)
		const withDeltas = recalculateDeltas(normalized, timeFilter)
		return applyRiskClassification(withDeltas)
	}, [rawData, timeFilter])

	// 2. Extract dropdown lists
	const uniqueMonths = useMemo(() => {
		const dates = Array.from(new Set(allData.map((d) => d.date))) as string[]
		return dates.sort((a, b) => parseDateString(a).timestamp - parseDateString(b).timestamp)
	}, [allData])

	const uniqueUGs = useMemo(() => Array.from(new Set(allData.map((d) => d.ug))).sort(), [allData])
	const uniqueODS = useMemo(
		() =>
			Array.from(new Set(allData.map((d) => d.ods)))
				.filter(Boolean)
				.sort(),
		[allData]
	)
	const uniqueOrgaos = useMemo(
		() =>
			Array.from(new Set(allData.map((d) => d.orgaoSuperior)))
				.filter(Boolean)
				.sort(),
		[allData]
	)

	// Auto-select latest month when data loads
	useEffect(() => {
		if (uniqueMonths.length > 0 && !selectedMonth) {
			setSelectedMonth(uniqueMonths[uniqueMonths.length - 1])
		} else if (uniqueMonths.length > 0 && !uniqueMonths.includes(selectedMonth)) {
			setSelectedMonth(uniqueMonths[uniqueMonths.length - 1])
		}
	}, [uniqueMonths, selectedMonth])

	// 3a. Base filter
	const baseFilteredData = useMemo(() => {
		return allData.filter((item) => {
			const matchSearch = item.ug.toLowerCase().includes(searchTerm.toLowerCase()) || item.cod.includes(searchTerm)
			const matchRisk = selectedRisk === "TODOS" || item.riskLevel === selectedRisk

			let matchHierarchy = true
			if (selectedHierarchyFilter.length > 0 && !selectedHierarchyFilter.includes("TODOS")) {
				if (selectedHierarchyLevel === "ODS") matchHierarchy = selectedHierarchyFilter.includes(item.ods)
				else if (selectedHierarchyLevel === "ORGAO") matchHierarchy = selectedHierarchyFilter.includes(item.orgaoSuperior)
				else matchHierarchy = selectedHierarchyFilter.includes(item.ug)
			}

			return matchSearch && matchHierarchy && matchRisk
		})
	}, [allData, searchTerm, selectedHierarchyLevel, selectedHierarchyFilter, selectedRisk])

	// 3b. Visualization filter
	const filteredDataForVisuals = useMemo(() => {
		return baseFilteredData.filter((item) => {
			const matchZero = hideZeros ? item.difference !== 0 : true
			return matchZero
		})
	}, [baseFilteredData, hideZeros])

	// 3c. KPI data (current month)
	const kpiData = useMemo(() => {
		return baseFilteredData.filter((item) => item.date === selectedMonth && (selectedGroup === "ALL" || item.group === selectedGroup))
	}, [baseFilteredData, selectedMonth, selectedGroup])

	const currentMonthVisuals = useMemo(() => {
		return filteredDataForVisuals.filter((item) => item.date === selectedMonth && (selectedGroup === "ALL" || item.group === selectedGroup))
	}, [filteredDataForVisuals, selectedMonth, selectedGroup])

	// 3d. Previous period KPI data
	const previousKpiData = useMemo(() => {
		if (!selectedMonth || selectedMonth === "TODOS" || uniqueMonths.length === 0) return []

		let gap = 1
		if (timeFilter === "TRIMESTRAL") gap = 3
		if (timeFilter === "SEMESTRAL") gap = 6
		if (timeFilter === "ANUAL") gap = 12

		const [yearStr, monthStr] = selectedMonth.split("-")
		let year = parseInt(yearStr, 10)
		let month = parseInt(monthStr, 10)

		month -= gap
		while (month <= 0) {
			month += 12
			year -= 1
		}

		const prevMonthStr = `${year}-${month.toString().padStart(2, "0")}`

		return baseFilteredData.filter((item) => item.date === prevMonthStr && (selectedGroup === "ALL" || item.group === selectedGroup))
	}, [baseFilteredData, selectedMonth, uniqueMonths, selectedGroup, timeFilter])

	// 4. KPI calculations
	const stats = useMemo(() => {
		const totalDiff = kpiData.reduce((acc, curr) => acc + curr.difference, 0)
		const totalSiafi = kpiData.reduce((acc, curr) => acc + curr.siafiValue, 0)
		const totalSiloms = kpiData.reduce((acc, curr) => acc + curr.silomsValue, 0)

		const prevDiff = previousKpiData.reduce((acc, curr) => acc + curr.difference, 0)
		const prevSiafi = previousKpiData.reduce((acc, curr) => acc + curr.siafiValue, 0)
		const prevSiloms = previousKpiData.reduce((acc, curr) => acc + curr.silomsValue, 0)

		const calculateVar = (curr: number, prev: number) => {
			if (prev === 0) return curr > 0 ? 100 : 0
			return ((curr - prev) / prev) * 100
		}

		const diffVar = calculateVar(totalDiff, prevDiff)
		const siafiVar = calculateVar(totalSiafi, prevSiafi)
		const silomsVar = calculateVar(totalSiloms, prevSiloms)

		const topOffender =
			currentMonthVisuals.length > 0 ? currentMonthVisuals.reduce((prev, current) => (prev.difference > current.difference ? prev : current)) : null

		const topOffenderICC =
			topOffender && topOffender.siafiValue > 0
				? Math.max(0, (1 - topOffender.difference / topOffender.siafiValue) * 100)
				: topOffender?.difference === 0
					? 100
					: 0

		const totalUGsCount = new Set(currentMonthVisuals.map((d) => d.ug)).size

		const iccScore = totalSiafi > 0 ? Math.max(0, (1 - totalDiff / totalSiafi) * 100) : totalDiff === 0 ? 100 : 0

		return {
			totalDiff,
			totalSiafi,
			totalSiloms,
			topOffender,
			totalUGsCount,
			healthScore: iccScore,
			diffVar,
			siafiVar,
			silomsVar,
			topOffenderICC,
		}
	}, [kpiData, previousKpiData, currentMonthVisuals])

	// 3e. Trend series for mini charts
	const trendSeries = useMemo(() => {
		if (!selectedMonth || uniqueMonths.length === 0) return { diff: [], siafi: [], siloms: [] }
		const currentIndex = uniqueMonths.indexOf(selectedMonth)

		let gap = 1
		if (timeFilter === "TRIMESTRAL") gap = 3
		if (timeFilter === "SEMESTRAL") gap = 6
		if (timeFilter === "ANUAL") gap = 12

		const diffs: number[] = []
		const siafis: number[] = []
		const siloms: number[] = []

		for (let i = 5; i >= 0; i--) {
			const idx = currentIndex - i * gap
			if (idx >= 0) {
				const month = uniqueMonths[idx]
				const monthData = baseFilteredData.filter((item) => item.date === month && (selectedGroup === "ALL" || item.group === selectedGroup))
				diffs.push(monthData.reduce((acc, curr) => acc + curr.difference, 0))
				siafis.push(monthData.reduce((acc, curr) => acc + curr.siafiValue, 0))
				siloms.push(monthData.reduce((acc, curr) => acc + curr.silomsValue, 0))
			}
		}

		return { diff: diffs, siafi: siafis, siloms: siloms }
	}, [baseFilteredData, selectedMonth, uniqueMonths, selectedGroup, timeFilter])

	// Comparison label for ranking
	const comparisonLabel = useMemo(() => {
		if (!selectedMonth || kpiData.length === 0) return `Comparando ${timeFilter}`
		const sampleRecord = kpiData[0]

		const currShortYear = sampleRecord.year.toString().slice(-2)
		const currMonthNames = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]
		const currShort = `${currMonthNames[sampleRecord.monthIndex]}/${currShortYear}`
		const prevDate = sampleRecord.previousDate || "N/A"

		return `Comparando ${currShort} contra ${prevDate}`
	}, [kpiData, selectedMonth, timeFilter])

	// Handlers
	const handleFileUpload = async (file: File) => {
		try {
			const parsed = await parseExcelFile(file)
			if (parsed.length > 0) {
				setRawData(parsed)
			} else {
				alert("Arquivo vazio ou formato não reconhecido.")
			}
		} catch (_e) {
			alert("Erro crítico ao processar arquivo. Verifique se é um Excel válido.")
		}
	}

	const handleOpenMessage = (record: FinancialRecord, context: "RANKING" | "HEATMAP" = "HEATMAP") => {
		const history = allData.filter((item) => item.ug === record.ug && item.group === record.group && item.cod === record.cod)
		setSelectedHistoryForMessage(history)
		setSelectedRecordForMessage(record)
		setMessageContext(context)
		setIsMessageModalOpen(true)
	}

	return (
		<div className={`min-h-screen pb-12 transition-colors duration-300 ${isDarkMode ? "dark bg-[#020617] text-slate-100" : "bg-slate-50 text-slate-900"}`}>
			<FileUploadModal isOpen={isUploadModalOpen} onClose={() => setIsUploadModalOpen(false)} onUpload={handleFileUpload} isDarkMode={isDarkMode} />

			<SiafiMessageModal
				isOpen={isMessageModalOpen}
				onClose={() => setIsMessageModalOpen(false)}
				record={selectedRecordForMessage}
				history={selectedHistoryForMessage}
				context={messageContext}
				timeFilter={timeFilter}
			/>

			{/* STICKY TOP NAV */}
			<nav className={`${isDarkMode ? "bg-[#0f172a]/95 border-slate-800" : "bg-white/95 border-slate-200"} border-b sticky top-0 z-40 backdrop-blur-md`}>
				<div className="max-w-[1800px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
					<div className="flex items-center gap-6 min-w-max">
						<div className="flex items-center gap-3">
							<Link
								to="/"
								className={`p-2 rounded-lg transition-colors border ${isDarkMode ? "border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white" : "border-slate-200 text-slate-500 hover:bg-slate-100"}`}
								title="Voltar ao Hub"
							>
								<ArrowLeft className="w-4 h-4" />
							</Link>
							<div className="bg-blue-600 p-2 rounded-lg shadow-lg shadow-blue-500/20">
								<Activity className="w-5 h-5 text-white" />
							</div>
							<h1 className={`text-lg font-bold tracking-tight hidden lg:block ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>
								SIAFI <span className="text-slate-500 mx-1">x</span> SILOMS
							</h1>
						</div>

						<div className="flex items-center gap-3">
							<div className={`flex rounded-lg p-0.5 border shadow-sm ${isDarkMode ? "bg-slate-800 border-slate-700" : "bg-slate-100 border-slate-200"}`}>
								{(["ODS", "ORGAO", "UG"] as const).map((level) => (
									<button
										key={level}
										type="button"
										onClick={() => setSelectedHierarchyLevel(level)}
										className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-1
                      ${selectedHierarchyLevel === level ? (isDarkMode ? "bg-slate-600 text-white shadow-sm" : "bg-white text-slate-800 shadow-sm") : isDarkMode ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700"}
                    `}
									>
										{level === "ODS" && <Layers className="w-3 h-3" />}
										{level === "ORGAO" && <Database className="w-3 h-3" />}
										{level === "UG" && <LayoutDashboard className="w-3 h-3" />}
										{level === "ORGAO" ? "Órgão" : level}
									</button>
								))}
							</div>

							<div className="w-40 hidden md:block">
								<CustomSelect
									value={selectedHierarchyFilter[0]}
									onChange={(val) => setSelectedHierarchyFilter([val])}
									options={[
										{
											value: "TODOS",
											label: `Todas as ${selectedHierarchyLevel === "ODS" ? "ODSs" : selectedHierarchyLevel === "ORGAO" ? "Órgãos" : "UGs"}`,
										},
										...(selectedHierarchyLevel === "ODS" ? uniqueODS : selectedHierarchyLevel === "ORGAO" ? uniqueOrgaos : uniqueUGs).map((opt) => ({
											value: opt,
											label: opt,
										})),
									]}
									placeholder={`Filtrar ${selectedHierarchyLevel}`}
									isDarkMode={isDarkMode}
								/>
							</div>

							<div className="w-40 hidden md:block">
								<CustomSelect
									value={selectedMonth}
									onChange={setSelectedMonth}
									options={uniqueMonths.map((m) => ({ value: m, label: toShortDate(m) }))}
									placeholder="Mês de Ref."
									isDarkMode={isDarkMode}
								/>
							</div>
						</div>
					</div>

					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={() => setIsUploadModalOpen(true)}
							className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-lg shadow-blue-900/20 whitespace-nowrap"
						>
							<UploadCloud className="w-4 h-4" />
							<span className="hidden sm:inline">Importar Excel</span>
						</button>

						<button
							type="button"
							onClick={() => setIsDarkMode(!isDarkMode)}
							className={`p-2 rounded-full transition-colors border ${isDarkMode ? "hover:bg-slate-800 text-slate-400 border-transparent" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"}`}
						>
							{isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
						</button>
					</div>
				</div>
			</nav>

			<main className="max-w-[1800px] mx-auto px-4 sm:px-6 space-y-6">
				{/* EMPTY STATE */}
				{allData.length === 0 && (
					<div
						className={`flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-lg mt-8
             ${isDarkMode ? "border-slate-800 bg-slate-900/50" : "border-slate-300 bg-white"}
          `}
					>
						<FileSpreadsheet className={`w-16 h-16 mb-4 ${isDarkMode ? "text-slate-600" : "text-slate-400"}`} />
						<h2 className={`text-xl font-bold ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>Nenhum dado carregado</h2>
						<p className="text-slate-500 mb-6">Importe uma planilha para começar a auditoria.</p>
						<button
							type="button"
							onClick={() => setIsUploadModalOpen(true)}
							className="px-6 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-500 transition-colors"
						>
							Carregar Arquivo .XLSX
						</button>
					</div>
				)}

				{allData.length > 0 && (
					<>
						{/* CONTROLS BAR */}
						<div
							className={`sticky top-16 z-30 pt-4 pb-2 transition-colors ${isDarkMode ? "bg-[#020617]/95" : "bg-slate-50/95"} backdrop-blur-md -mx-4 px-4 sm:-mx-6 sm:px-6`}
						>
							<div
								className={`grid grid-cols-1 md:grid-cols-12 gap-4 items-center p-2 rounded-lg border shadow-sm
                ${isDarkMode ? "bg-slate-800/50 border-slate-700" : "bg-white border-slate-200"}
              `}
							>
								{/* Group Filters */}
								<div className="col-span-1 md:col-span-5 flex items-center gap-2 p-1 bg-transparent rounded-lg overflow-x-auto">
									{[
										{
											id: "ALL",
											label: "VISÃO GERAL",
											activeClass: isDarkMode ? "bg-slate-700 text-white" : "bg-slate-200 text-slate-800",
										},
										{
											id: AccountGroup.BMP,
											label: "BMP",
											activeClass: "text-red-600 border border-red-600 shadow-[0_0_10px_rgba(220,38,38,0.2)]",
										},
										{
											id: AccountGroup.CONSUMO,
											label: "CONSUMO",
											activeClass: "text-blue-600 border border-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.2)]",
										},
										{
											id: AccountGroup.INTANGIVEL,
											label: "INTANGÍVEL",
											activeClass: "text-emerald-600 border border-emerald-600 shadow-[0_0_10px_rgba(5,150,105,0.2)]",
										},
									].map((tab) => (
										<button
											key={tab.id}
											type="button"
											onClick={() => setSelectedGroup(tab.id)}
											className={`px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap border border-transparent
                        ${selectedGroup === tab.id ? tab.activeClass : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800/50"}
                      `}
										>
											{tab.label}
										</button>
									))}
								</div>

								{/* Time Filters */}
								<div className="col-span-1 md:col-span-4 flex justify-center">
									<div className={`flex p-1 rounded-lg ${isDarkMode ? "bg-slate-900" : "bg-slate-100"}`}>
										{(["MENSAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"] as TimeFilter[]).map((tf) => (
											<button
												key={tf}
												type="button"
												onClick={() => setTimeFilter(tf)}
												className={`px-3 py-2 text-xs font-bold rounded-lg transition-all
                          ${timeFilter === tf ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}
                        `}
											>
												{tf}
											</button>
										))}
									</div>
								</div>

								{/* Toggles */}
								<div className="col-span-1 md:col-span-3 flex justify-end items-center gap-3">
									<div
										className={`flex items-center gap-2 px-3 py-2 rounded-lg border
                       ${isDarkMode ? "bg-slate-900/50 border-slate-700/50" : "bg-slate-100 border-slate-200"}`}
										title="Quantidade de UGs consideradas na visualização atual"
									>
										<Database className="w-3.5 h-3.5 text-blue-500" />
										<div className="flex flex-col leading-none">
											<span className={`text-[9px] font-bold uppercase ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>Registros Totais</span>
											<span className={`text-xs font-bold ${isDarkMode ? "text-slate-200" : "text-slate-800"}`}>{stats.totalUGsCount} UGs</span>
										</div>
									</div>

									<button
										type="button"
										onClick={() => setHideZeros(!hideZeros)}
										className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold border transition-all
                      ${hideZeros ? "bg-amber-500/10 text-amber-500 border-amber-500/50" : isDarkMode ? "bg-slate-800 text-slate-400 border-slate-700" : "bg-white text-slate-500 border-slate-200"}
                    `}
									>
										<AlertTriangle className="w-4 h-4" />
										{hideZeros ? "Ocultando Zerados" : "Mostrar Zerados"}
									</button>
								</div>
							</div>
						</div>

						{/* KPIS */}
						<div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 pt-2">
							<StatCard
								title="Divergência Total"
								value={stats.totalDiff}
								subtitle="Diferença Absoluta"
								icon={AlertTriangle}
								bgClass="bg-red-500"
								trendData={trendSeries.diff}
								variation={`${Math.abs(stats.diffVar).toFixed(1)}% vs período anterior`}
								isPositive={stats.diffVar < 0}
								isDarkMode={isDarkMode}
							/>
							<StatCard
								title="Saldo SIAFI"
								value={stats.totalSiafi}
								subtitle="Contábil (Completo)"
								icon={LayoutDashboard}
								bgClass="bg-slate-700/50"
								trendData={trendSeries.siafi}
								variation={`${Math.abs(stats.siafiVar).toFixed(1)}% vs período anterior`}
								isPositive={stats.siafiVar >= 0}
								isDarkMode={isDarkMode}
							/>
							<StatCard
								title="Saldo SILOMS"
								value={stats.totalSiloms}
								subtitle="Físico (Completo)"
								icon={Layers}
								bgClass="bg-slate-700/50"
								trendData={trendSeries.siloms}
								variation={`${Math.abs(stats.silomsVar).toFixed(1)}% vs período anterior`}
								isPositive={stats.silomsVar >= 0}
								isDarkMode={isDarkMode}
							/>
							<StatCard
								title="Maior Divergência"
								value={stats.topOffender?.ug || "-"}
								subtitle={stats.topOffender ? formatCurrency(stats.topOffender.difference) : "-"}
								icon={AlertTriangle}
								bgClass={
									stats.topOffenderICC >= 98
										? "bg-emerald-500"
										: stats.topOffenderICC >= 90
											? "bg-green-500"
											: stats.topOffenderICC >= 80
												? "bg-amber-500"
												: stats.topOffenderICC >= 70
													? "bg-orange-500"
													: "bg-red-500"
								}
								trendData={[20, 40, 30, 50, 45, 60]}
								variation={
									stats.topOffenderICC >= 98
										? "Excelência Máxima"
										: stats.topOffenderICC >= 90
											? "Nível Excelente"
											: stats.topOffenderICC >= 80
												? "Nível Operacional"
												: stats.topOffenderICC >= 70
													? "Divergência Moderada"
													: "Nível Crítico"
								}
								isPositive={stats.topOffenderICC >= 80}
								isDarkMode={isDarkMode}
							/>

							{/* ICC Card */}
							<div
								className={`${isDarkMode ? "bg-[#0f172a]/60 border-slate-800/50 hover:bg-[#0f172a]/80" : "bg-white border-slate-200 hover:bg-slate-50"} backdrop-blur-md rounded-2xl shadow-lg border p-4 flex flex-col justify-between transition-all group overflow-hidden relative h-[140px]`}
							>
								<div className="flex justify-between items-start relative z-10">
									<div className="flex-1">
										<p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">ICC</p>
										<h3 className={`text-xs font-black tracking-tight leading-tight ${isDarkMode ? "text-white" : "text-slate-900"}`}>
											Indicador de Conciliação Contábil
										</h3>
									</div>
									<div className="w-10 h-10 rounded-lg bg-indigo-600 shadow-lg shadow-black/20 flex items-center justify-center flex-shrink-0 ml-2">
										<Activity className="w-5 h-5 text-white" />
									</div>
								</div>
								<div className="mt-1 flex-1 flex items-center justify-center">
									<HealthScoreGauge score={stats.healthScore} isDarkMode={isDarkMode} />
								</div>
							</div>
						</div>

						{/* EVOLUTION CHART */}
						<ChartWrapper
							title="Evolução Temporal"
							className="h-[550px]"
							allData={baseFilteredData}
							availableMonths={uniqueMonths}
							availableUGs={uniqueUGs}
							isDarkMode={isDarkMode}
							defaultGroup={selectedGroup}
							hideMonthFilter={true}
							hierarchyLevel={selectedHierarchyLevel}
							hierarchyFilter={selectedHierarchyFilter}
						>
							{(data, _isExpanded) => <EvolutionChart data={data} isDarkMode={isDarkMode} selectedMonth={selectedMonth} timeFilter={timeFilter} />}
						</ChartWrapper>

						{/* RANKING */}
						<ChartWrapper
							title={`Ranking de Evolução (${timeFilter === "ANUAL" ? "ANO" : timeFilter.substring(0, 3)})`}
							className="h-[500px]"
							allData={filteredDataForVisuals}
							availableMonths={uniqueMonths}
							availableUGs={uniqueUGs}
							isDarkMode={isDarkMode}
							defaultMonth={selectedMonth}
							defaultGroup={selectedGroup}
							hierarchyLevel={selectedHierarchyLevel}
							hierarchyFilter={selectedHierarchyFilter}
						>
							{(data) => (
								<RankingList
									data={data}
									historicalData={baseFilteredData}
									isDarkMode={isDarkMode}
									comparisonLabel={comparisonLabel}
									onSendMessage={handleOpenMessage}
								/>
							)}
						</ChartWrapper>

						{/* COMPARISON CHART */}
						<div className="flex flex-col gap-6">
							<ChartWrapper
								title="Diferenças Atuais e Composição"
								className="h-[750px]"
								allData={filteredDataForVisuals}
								availableMonths={uniqueMonths}
								availableUGs={uniqueUGs}
								isDarkMode={isDarkMode}
								defaultMonth={selectedMonth}
								defaultGroup={selectedGroup}
								showRiskFilter={true}
								hierarchyLevel={selectedHierarchyLevel}
								hierarchyFilter={selectedHierarchyFilter}
							>
								{(data, isExpanded) => (
									<ComparisonChart
										data={data}
										isDarkMode={isDarkMode}
										isExpanded={isExpanded}
										setHierarchy={() => {}}
										hierarchyLevel={selectedHierarchyLevel}
										hierarchyFilter={selectedHierarchyFilter}
									/>
								)}
							</ChartWrapper>
						</div>

						{/* TEMPORAL HEATMAP */}
						<ChartWrapper
							title="Matriz de Calor Temporal"
							className="h-[85vh] w-full"
							allData={filteredDataForVisuals}
							availableMonths={uniqueMonths}
							availableUGs={uniqueUGs}
							isDarkMode={isDarkMode}
							defaultGroup="ALL"
							hierarchyLevel={selectedHierarchyLevel}
							hierarchyFilter={selectedHierarchyFilter}
						>
							{(data) => <TemporalHeatmap data={data} isDarkMode={isDarkMode} availableMonths={uniqueMonths} onSendMessage={handleOpenMessage} />}
						</ChartWrapper>
					</>
				)}
			</main>
		</div>
	)
}
