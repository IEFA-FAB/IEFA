import { Filter, Info, Maximize2, Minimize2, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type { FinancialRecord } from "../types"
import { AccountGroup, RiskLevel } from "../types"

interface ChartWrapperProps {
	title: string
	allData: FinancialRecord[]
	children: (filteredData: FinancialRecord[], isExpanded: boolean) => React.ReactNode
	availableMonths: string[]
	availableUGs: string[]
	isDarkMode: boolean
	defaultGroup?: string
	defaultMonth?: string
	hideMonthFilter?: boolean
	showRiskFilter?: boolean
	hierarchyLevel: "ODS" | "ORGAO" | "UG"
	hierarchyFilter: string[]
	className?: string
}

export const ChartWrapper: React.FC<ChartWrapperProps> = ({
	title,
	allData,
	children,
	availableMonths,
	availableUGs: _availableUGs,
	isDarkMode,
	defaultGroup = "ALL",
	defaultMonth = "TODOS",
	hideMonthFilter = false,
	showRiskFilter = false,
	hierarchyLevel,
	hierarchyFilter,
	className = "",
}) => {
	const [isExpanded, setIsExpanded] = useState(false)
	const [localMonth, setLocalMonth] = useState<string>(defaultMonth)
	const [localGroup, setLocalGroup] = useState<string>(defaultGroup)
	const [localRisk, setLocalRisk] = useState<string>("TODOS")

	useEffect(() => {
		setLocalMonth(defaultMonth)
	}, [defaultMonth])
	useEffect(() => {
		setLocalGroup(defaultGroup)
	}, [defaultGroup])

	const filteredData = useMemo(() => {
		return allData.filter((item) => {
			const matchGroup = localGroup === "ALL" || item.group === localGroup
			const matchMonth = localMonth === "TODOS" || item.date === localMonth
			const matchRisk = localRisk === "TODOS" || item.riskLevel === localRisk

			let matchHierarchy = true
			if (hierarchyFilter.length > 0 && !hierarchyFilter.includes("TODOS")) {
				if (hierarchyLevel === "ODS") matchHierarchy = hierarchyFilter.includes(item.ods)
				else if (hierarchyLevel === "ORGAO") matchHierarchy = hierarchyFilter.includes(item.orgaoSuperior)
				else matchHierarchy = hierarchyFilter.includes(item.ug)
			}

			return matchGroup && matchMonth && matchHierarchy && matchRisk
		})
	}, [allData, localMonth, hierarchyFilter, localGroup, hierarchyLevel, localRisk])

	const Controls = () => (
		<div className="flex flex-wrap items-center gap-2 mt-2 sm:mt-0">
			<div className="relative">
				<select
					value={localGroup}
					onChange={(e) => setLocalGroup(e.target.value)}
					className={`appearance-none pl-3 pr-8 py-1 rounded text-xs font-medium border outline-none cursor-pointer focus:ring-2 focus:ring-blue-500
            ${isDarkMode ? "bg-slate-900 border-slate-600 text-slate-300" : "bg-slate-50 border-slate-300 text-slate-700"}`}
				>
					<option value="ALL">Todos os Grupos</option>
					<option value={AccountGroup.BMP}>BMP</option>
					<option value={AccountGroup.CONSUMO}>CONSUMO</option>
					<option value={AccountGroup.INTANGIVEL}>INTANGÍVEL</option>
				</select>
				<Filter className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
			</div>

			{!hideMonthFilter && (
				<div className="relative">
					<select
						value={localMonth}
						onChange={(e) => setLocalMonth(e.target.value)}
						className={`appearance-none pl-3 pr-8 py-1 rounded text-xs font-medium border outline-none cursor-pointer focus:ring-2 focus:ring-blue-500
              ${isDarkMode ? "bg-slate-900 border-slate-600 text-slate-300" : "bg-slate-50 border-slate-300 text-slate-700"}`}
					>
						<option value="TODOS">Todos os Meses</option>
						{availableMonths.map((m) => (
							<option key={m} value={m}>
								{m}
							</option>
						))}
					</select>
					<Filter className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
				</div>
			)}

			{showRiskFilter && (
				<div className="flex items-center gap-1">
					<div className="relative">
						<select
							value={localRisk}
							onChange={(e) => setLocalRisk(e.target.value)}
							className={`appearance-none pl-3 pr-8 py-1 rounded text-xs font-medium border outline-none cursor-pointer focus:ring-2 focus:ring-blue-500
                ${isDarkMode ? "bg-slate-900 border-slate-600 text-slate-300" : "bg-slate-50 border-slate-300 text-slate-700"}`}
						>
							<option value="TODOS">Todos os Riscos</option>
							<option value={RiskLevel.BAIXO}>Baixo Risco</option>
							<option value={RiskLevel.MEDIO}>Médio Risco</option>
							<option value={RiskLevel.ALTO}>Alto Risco</option>
							<option value={RiskLevel.CRITICO}>Crítico</option>
						</select>
						<Filter className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
					</div>

					<div className="group relative">
						<Info className="w-4 h-4 text-slate-400 cursor-help hover:text-blue-500 transition-colors" />
						<div
							className={`absolute top-full right-0 mt-2 w-72 p-3 rounded-lg border shadow-2xl z-[60] invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200
              ${isDarkMode ? "bg-slate-800 border-slate-700 text-slate-300" : "bg-white border-slate-200 text-slate-700"}`}
						>
							<p className="text-[11px] font-bold mb-2 text-blue-500 uppercase tracking-wider">Matriz de Risco</p>
							<p className="text-[10px] leading-relaxed mb-2">
								O nível de risco considera duas dimensões: Impacto financeiro da divergência e frequência de ocorrência ao longo dos meses.
							</p>
							<div className="space-y-1 text-[9px]">
								<div className="flex gap-2">
									<span className="font-bold text-emerald-500">Baixo Risco</span>
									<span>→ divergência pequena e pouco recorrente</span>
								</div>
								<div className="flex gap-2">
									<span className="font-bold text-yellow-500">Médio Risco</span>
									<span>→ divergência moderada ou recorrência moderada</span>
								</div>
								<div className="flex gap-2">
									<span className="font-bold text-orange-500">Alto Risco</span>
									<span>→ divergência relevante ou recorrente</span>
								</div>
								<div className="flex gap-2">
									<span className="font-bold text-red-500">Crítico</span>
									<span>→ divergência muito elevada e persistente</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			)}

			<button
				type="button"
				onClick={() => setIsExpanded(!isExpanded)}
				className={`p-1.5 rounded hover:bg-opacity-80 transition-colors
          ${isDarkMode ? "hover:bg-slate-700 text-slate-400" : "hover:bg-slate-200 text-slate-500"}
        `}
				title={isExpanded ? "Minimizar" : "Expandir"}
			>
				{isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
			</button>
		</div>
	)

	return (
		<>
			{isExpanded && <div className={className} />}

			{isExpanded && (
				<button
					type="button"
					className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 cursor-default"
					onClick={() => setIsExpanded(false)}
					aria-label="Fechar"
				/>
			)}

			<div
				className={`rounded-lg border shadow-sm flex flex-col overflow-visible transition-all duration-300
        ${isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}
        ${isExpanded ? "fixed top-[5vh] bottom-[5vh] left-1/2 -translate-x-1/2 w-[95vw] z-50 shadow-2xl p-6" : `p-5 ${className}`}
      `}
			>
				<div className={`flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2 flex-shrink-0 ${isExpanded ? "border-b pb-4" : ""}`}>
					<h2 className={`font-semibold ${isDarkMode ? "text-slate-200" : "text-slate-800"} ${isExpanded ? "text-xl" : "text-lg"}`}>{title}</h2>
					<div className="flex items-center gap-4">
						<Controls />
						{isExpanded && (
							<button
								type="button"
								onClick={() => setIsExpanded(false)}
								className={`p-2 rounded-full hover:bg-red-500 hover:text-white transition-colors
                  ${isDarkMode ? "text-slate-400" : "text-slate-500"}
                `}
							>
								<X className="w-6 h-6" />
							</button>
						)}
					</div>
				</div>

				<div className="flex-1 relative w-full overflow-hidden flex flex-col">
					<div className="w-full h-full relative min-h-0 flex-1">{children(filteredData, isExpanded)}</div>
				</div>
			</div>
		</>
	)
}
