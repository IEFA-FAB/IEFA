import { ArrowUpDown, MessageSquareText } from "lucide-react"
import { useMemo, useState } from "react"
import { formatFinancial, parseDateString, toShortDate } from "../services/dataProcessor"
import type { FinancialRecord } from "../types"
import { AccountGroup } from "../types"

interface TemporalHeatmapProps {
	data: FinancialRecord[]
	availableMonths: string[]
	onSendMessage: (record: FinancialRecord, context?: "RANKING" | "HEATMAP") => void
}

export const TemporalHeatmap: React.FC<TemporalHeatmapProps> = ({ data, availableMonths, onSendMessage }) => {
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

	/**
	 * Matiz e intensidade da célula. A luminosidade — a única coisa que mudava
	 * entre claro e escuro — é decidida pelo CSS (`.heatmap-cell`), não aqui.
	 */
	const getCellStyles = (value: number, max: number) => {
		if (value === 0) {
			return { style: undefined, className: "heatmap-cell-empty" }
		}

		const ratio = max > 0 ? value / max : 0
		// Raiz quadrada: sem ela quase toda célula cai no extremo verde, porque as
		// divergências se concentram muito abaixo do máximo da série.
		const adjustedRatio = ratio ** 0.5
		// 120 = verde, 0 = vermelho. Quanto maior a divergência, mais quente.
		const hue = Math.max(0, (1 - adjustedRatio) * 120)

		return {
			style: { "--cell-hue": hue, "--cell-ratio": adjustedRatio } as React.CSSProperties,
			className: "heatmap-cell font-bold shadow-sm",
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
		if (group === AccountGroup.BMP) return "bg-destructive/15 text-destructive border-destructive/30 border"
		if (group === AccountGroup.CONSUMO) return "bg-accent text-accent-foreground border-border border"
		if (group === AccountGroup.INTANGIVEL) return "bg-success/15 text-success border-success/30 border"
		return "bg-muted text-muted-foreground"
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
		<div className={`w-full h-full flex flex-col overflow-hidden text-xs rounded-2xl border shadow-xl bg-card border-border`}>
			<div className={`flex items-center justify-between gap-2 p-3 border-b border-border bg-muted/50`}>
				<div className="flex items-center gap-2 overflow-x-auto">
					{[
						{
							id: "ALL",
							label: "TODOS",
							activeClass: "bg-primary text-primary-foreground",
						},
						{ id: AccountGroup.BMP, label: "BMP", activeClass: "text-white bg-destructive border-red-600" },
						{
							id: AccountGroup.CONSUMO,
							label: "CONSUMO",
							activeClass: "text-white bg-blue-600 border-blue-600",
						},
						{
							id: AccountGroup.INTANGIVEL,
							label: "INTANGIVEL",
							activeClass: "text-white bg-success border-emerald-600",
						},
					].map((tab) => (
						<button
							key={tab.id}
							type="button"
							onClick={() => setInternalGroupFilter(tab.id)}
							className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase transition-all whitespace-nowrap border border-transparent
                ${internalGroupFilter === tab.id ? "tab.activeClass" : "bg-muted text-muted-foreground hover:bg-muted/70 border-border"}
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
            ${sortBy === "value" ? "bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20" : "bg-muted border-border text-muted-foreground"}
          `}
				>
					<ArrowUpDown className="w-3 h-3" />
					{sortBy === "value" ? "Maior Valor" : "Alfabético"}
				</button>
			</div>

			{sortedUGs.length === 0 ? (
				<div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
					<span className="text-lg">Sem dados para exibir</span>
				</div>
			) : (
				<div className={`flex-1 overflow-auto custom-scrollbar relative bg-card`}>
					<div className="w-full min-w-max p-3">
						<div
							className={`grid gap-1 mb-2 sticky top-0 z-30 pb-2 border-b items-end border-border bg-card/90 backdrop-blur-md`}
							style={{
								gridTemplateColumns: `50px 180px repeat(${availableMonths.length}, minmax(100px, 1fr))`,
								position: "sticky",
								top: 0,
								zIndex: 30,
							}}
						>
							<div className={`text-center font-bold text-xs text-muted-foreground`}>MSG</div>

							<div
								className={`sticky left-[50px] z-40 font-bold uppercase tracking-wider pl-2 text-xs border-r bg-card/90 backdrop-blur-md text-muted-foreground border-border`}
								style={{ position: "sticky", left: 50, zIndex: 40 }}
							>
								UG / GRUPO
							</div>

							{availableMonths
								.slice()
								.reverse()
								.map((month) => (
									<div key={month} className={`text-center font-bold uppercase text-xs truncate px-1 text-muted-foreground`}>
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
										className={`grid gap-1 items-center rounded transition-colors group hover:bg-muted/50`}
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
												className={`w-9 h-9 flex items-center justify-center rounded hover:text-white hover:bg-blue-600 transition-colors border shadow-sm bg-muted text-muted-foreground border-border`}
											>
												<MessageSquareText className="w-4 h-4" />
											</button>
										</div>

										<div
											className={`sticky left-[50px] z-20 flex items-center h-12 overflow-hidden rounded-md border pr-2 shadow-[2px_0_5px_rgba(0,0,0,0.05)] bg-muted/90 backdrop-blur-md border-border`}
											style={{ position: "sticky", left: 50, zIndex: 20 }}
										>
											<div
												className={`w-10 h-full flex items-center justify-center text-[9px] font-black uppercase flex-shrink-0 ${getGroupBadgeClass(group)}`}
											>
												{group === AccountGroup.BMP ? "BMP" : group === AccountGroup.CONSUMO ? "CN" : "INT"}
											</div>
											<div className={`flex-1 px-3 font-bold truncate text-sm text-foreground`}>{ug}</div>
										</div>

										{availableMonths
											.slice()
											.reverse()
											.map((month) => {
												const record = ugRecords.find((r) => r.date === month && r.group === group)
												const diff = record ? record.difference : 0
												const { style, className } = getCellStyles(diff, globalMax)

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
