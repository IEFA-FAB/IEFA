import { ArrowUpDown, MessageSquareText } from "lucide-react"
import { useMemo, useState } from "react"
import { formatFinancial, parseDateString, toShortDate } from "../services/dataProcessor"
import type { FinancialRecord } from "../types"
import { AccountGroup } from "../types"

interface TemporalHeatmapProps {
	data: FinancialRecord[]
	isDarkMode: boolean
	availableMonths: string[]
	onSendMessage: (record: FinancialRecord, context?: "RANKING" | "HEATMAP") => void
}

export const TemporalHeatmap: React.FC<TemporalHeatmapProps> = ({ data, isDarkMode, availableMonths, onSendMessage }) => {
	const [internalGroupFilter, setInternalGroupFilter] = useState<string>("ALL")
	const [sortBy, setSortBy] = useState<"value" | "name">("value")

	const filteredData = useMemo(() => data.filter((item) => internalGroupFilter === "ALL" || item.group === internalGroupFilter), [data, internalGroupFilter])

	const globalMax = useMemo(() => {
		if (filteredData.length === 0) return 1
		let max = 0
		for (let i = 0; i < filteredData.length; i++) {
			if (filteredData[i].difference > max) max = filteredData[i].difference
		}
		return max || 1
	}, [filteredData])

	const getCellStyles = (value: number, max: number, isDark: boolean) => {
		if (value === 0) {
			return {
				style: isDark
					? { backgroundColor: "rgba(30, 41, 59, 0.4)", borderColor: "rgba(30, 41, 59, 0.5)" }
					: { backgroundColor: "#f8fafc", borderColor: "#e2e8f0" },
				className: isDark ? "text-slate-600" : "text-slate-300",
			}
		}

		const ratio = max > 0 ? value / max : 0
		const adjustedRatio = ratio ** 0.5
		const hue = Math.max(0, (1 - adjustedRatio) * 120)

		let lightness: number
		let borderColor: string

		if (isDark) {
			lightness = 20 + adjustedRatio * 10
			borderColor = `hsl(${hue}, 90%, ${lightness + 10}%)`
		} else {
			lightness = 95 - adjustedRatio * 15
			borderColor = `hsl(${hue}, 70%, ${lightness - 30}%)`
		}

		return {
			style: {
				backgroundColor: `hsl(${hue}, 85%, ${lightness}%)`,
				borderColor: borderColor,
				color: isDark ? "#fff" : "#1e293b",
			},
			className: "font-bold shadow-sm",
		}
	}

	const formatCompact = (val: number) => {
		if (val === 0) return "-"
		if (val >= 1000000000) return `${(val / 1000000000).toFixed(1)} BI`
		if (val >= 1000000) return `${(val / 1000000).toFixed(1)} MI`
		if (val >= 1000) return `${(val / 1000).toFixed(0)}k`
		return val.toFixed(0)
	}

	const getGroupBadgeClass = (group: string) => {
		if (group === AccountGroup.BMP)
			return isDarkMode
				? "bg-red-500/20 text-red-400 border-red-500/30 border shadow-[0_0_5px_rgba(220,38,38,0.2)]"
				: "bg-red-50 text-red-700 border-red-200 border shadow-sm"
		if (group === AccountGroup.CONSUMO)
			return isDarkMode
				? "bg-blue-500/20 text-blue-400 border-blue-500/30 border shadow-[0_0_5px_rgba(37,99,235,0.2)]"
				: "bg-blue-50 text-blue-700 border-blue-200 border shadow-sm"
		if (group === AccountGroup.INTANGIVEL)
			return isDarkMode
				? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 border shadow-[0_0_5px_rgba(16,185,129,0.2)]"
				: "bg-emerald-50 text-emerald-700 border-emerald-200 border shadow-sm"
		return isDarkMode ? "bg-slate-700 text-slate-300" : "bg-slate-200 text-slate-600"
	}

	const sortedUGs = useMemo(() => {
		const ugMap = new Map<string, number>()
		const latestMonth = availableMonths[availableMonths.length - 1]

		if (sortBy === "value") {
			filteredData.forEach((r) => {
				if (r.date === latestMonth) {
					const currentVal = ugMap.get(r.ug) || 0
					ugMap.set(r.ug, currentVal + r.difference)
				} else if (!ugMap.has(r.ug)) {
					ugMap.set(r.ug, 0)
				}
			})
		}

		const ugs = Array.from(new Set(filteredData.map((d) => d.ug)))

		if (sortBy === "value") {
			return ugs.sort((a, b) => (ugMap.get(b) || 0) - (ugMap.get(a) || 0))
		}
		return ugs.sort((a, b) => a.localeCompare(b))
	}, [filteredData, sortBy, availableMonths])

	return (
		<div
			className={`w-full h-full flex flex-col overflow-hidden text-xs rounded-2xl border shadow-xl ${isDarkMode ? "bg-slate-900/40 backdrop-blur-sm border-slate-800" : "bg-white border-slate-200"}`}
		>
			<div
				className={`flex items-center justify-between gap-2 p-3 border-b ${isDarkMode ? "border-slate-800 bg-slate-900/50" : "border-slate-200 bg-slate-50"}`}
			>
				<div className="flex items-center gap-2 overflow-x-auto">
					{[
						{
							id: "ALL",
							label: "TODOS",
							activeClass: isDarkMode ? "text-slate-100 bg-slate-600" : "text-slate-100 bg-slate-700",
						},
						{ id: AccountGroup.BMP, label: "BMP", activeClass: "text-white bg-red-600 border-red-600" },
						{
							id: AccountGroup.CONSUMO,
							label: "CONSUMO",
							activeClass: "text-white bg-blue-600 border-blue-600",
						},
						{
							id: AccountGroup.INTANGIVEL,
							label: "INTANGIVEL",
							activeClass: "text-white bg-emerald-600 border-emerald-600",
						},
					].map((tab) => (
						<button
							key={tab.id}
							type="button"
							onClick={() => setInternalGroupFilter(tab.id)}
							className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase transition-all whitespace-nowrap border border-transparent
                ${
									internalGroupFilter === tab.id
										? tab.activeClass
										: isDarkMode
											? "bg-slate-950 text-slate-400 hover:bg-slate-800 border-slate-700"
											: "bg-slate-100 text-slate-500 hover:bg-slate-200 border-slate-300"
								}
              `}
						>
							{tab.label}
						</button>
					))}
				</div>

				<button
					type="button"
					onClick={() => setSortBy(sortBy === "value" ? "name" : "value")}
					className={`hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-md border text-xs font-bold uppercase transition-all
            ${
							sortBy === "value"
								? "bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20"
								: isDarkMode
									? "bg-slate-950 border-slate-700 text-slate-400"
									: "bg-slate-100 border-slate-300 text-slate-500"
						}
          `}
				>
					<ArrowUpDown className="w-3 h-3" />
					{sortBy === "value" ? "Maior Valor" : "Alfabético"}
				</button>
			</div>

			{sortedUGs.length === 0 ? (
				<div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2">
					<span className="text-lg">Sem dados para exibir</span>
				</div>
			) : (
				<div className={`flex-1 overflow-auto custom-scrollbar relative ${isDarkMode ? "bg-transparent" : "bg-white"}`}>
					<div className="w-full min-w-max p-3">
						<div
							className={`grid gap-1 mb-2 sticky top-0 z-30 pb-2 border-b items-end ${isDarkMode ? "border-slate-800 bg-slate-900/90 backdrop-blur-md" : "border-slate-200 bg-white/90 backdrop-blur-md"}`}
							style={{
								gridTemplateColumns: `50px 180px repeat(${availableMonths.length}, minmax(100px, 1fr))`,
								position: "sticky",
								top: 0,
								zIndex: 30,
							}}
						>
							<div className={`text-center font-bold text-xs ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>MSG</div>

							<div
								className={`sticky left-[50px] z-40 font-bold uppercase tracking-wider pl-2 text-xs border-r ${isDarkMode ? "bg-slate-900/90 backdrop-blur-md text-slate-400 border-slate-800" : "bg-white/90 backdrop-blur-md text-slate-600 border-slate-200"}`}
								style={{ position: "sticky", left: 50, zIndex: 40 }}
							>
								UG / GRUPO
							</div>

							{availableMonths
								.slice()
								.reverse()
								.map((month) => (
									<div key={month} className={`text-center font-bold uppercase text-xs truncate px-1 ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
										{toShortDate(month)}
									</div>
								))}
						</div>

						<div className="space-y-1.5">
							{sortedUGs.map((ug) => {
								const ugRecords = filteredData.filter((d) => d.ug === ug)
								const uniqueGroups = (Array.from(new Set(ugRecords.map((r) => r.group))) as AccountGroup[]).sort()

								return uniqueGroups.map((group) => (
									<div
										key={`${ug}-${group}`}
										className={`grid gap-1 items-center rounded transition-colors group ${isDarkMode ? "hover:bg-slate-800/30" : "hover:bg-slate-50"}`}
										style={{
											gridTemplateColumns: `50px 180px repeat(${availableMonths.length}, minmax(100px, 1fr))`,
										}}
									>
										<div className="flex justify-center h-12 items-center">
											<button
												type="button"
												onClick={() => {
													const latest = ugRecords
														.filter((r) => r.group === group)
														.sort((a, b) => parseDateString(b.date).timestamp - parseDateString(a.date).timestamp)[0]
													if (latest) onSendMessage(latest, "HEATMAP")
												}}
												className={`w-9 h-9 flex items-center justify-center rounded hover:text-white hover:bg-blue-600 transition-colors border shadow-sm ${isDarkMode ? "bg-slate-800 text-slate-400 border-slate-700" : "bg-slate-100 text-slate-400 border-slate-200"}`}
											>
												<MessageSquareText className="w-4 h-4" />
											</button>
										</div>

										<div
											className={`sticky left-[50px] z-20 flex items-center h-12 overflow-hidden rounded-md border pr-2 shadow-[2px_0_5px_rgba(0,0,0,0.05)] ${isDarkMode ? "bg-slate-900/90 backdrop-blur-md border-slate-700/50 shadow-[2px_0_5px_rgba(0,0,0,0.2)]" : "bg-slate-100/90 backdrop-blur-md border-slate-200"}`}
											style={{ position: "sticky", left: 50, zIndex: 20 }}
										>
											<div
												className={`w-10 h-full flex items-center justify-center text-[9px] font-black uppercase flex-shrink-0 ${getGroupBadgeClass(group)}`}
											>
												{group === AccountGroup.BMP ? "BMP" : group === AccountGroup.CONSUMO ? "CN" : "INT"}
											</div>
											<div className={`flex-1 px-3 font-bold truncate text-sm ${isDarkMode ? "text-slate-100" : "text-slate-900"}`}>{ug}</div>
										</div>

										{availableMonths
											.slice()
											.reverse()
											.map((month) => {
												const record = ugRecords.find((r) => r.date === month && r.group === group)
												const diff = record ? record.difference : 0
												const { style, className } = getCellStyles(diff, globalMax, isDarkMode)

												return (
													<div
														key={month}
														style={style}
														className={`h-12 rounded-md flex items-center justify-center text-[11px] tracking-wide transition-all cursor-help border ${className}`}
														title={record ? `${month}: ${formatFinancial(diff)}` : "Sem dados"}
													>
														{formatCompact(diff)}
													</div>
												)
											})}
									</div>
								))
							})}
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
