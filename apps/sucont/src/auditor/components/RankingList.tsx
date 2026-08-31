import { Activity, ArrowDown, ArrowDownRight, ArrowRight, ArrowUpRight, MessageSquareText, TrendingDown, TrendingUp } from "lucide-react"
import { useMemo, useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select"
import type { FinancialRecord } from "../types"
import { AccountGroup } from "../types"
import { CurrencyDisplay } from "./CurrencyDisplay"

interface RankingListProps {
	data: FinancialRecord[]
	historicalData?: FinancialRecord[]
	comparisonLabel?: string
	onSendMessage?: (record: FinancialRecord, type: "RANKING" | "HEATMAP") => void
}

type Category = "REDUCAO_CONTINUA" | "REDUCAO_PONTUAL" | "AUMENTO_CONTINUO" | "OSCILACAO_ATIPICA" | "NEUTRO"

interface EnrichedRecord extends FinancialRecord {
	fq: number
	fa: number
	volatility: number
	category: Category
	tooltipText: string
}

export const RankingList: React.FC<RankingListProps> = ({ data, historicalData = [], comparisonLabel, onSendMessage }) => {
	const [categoryFilter, setCategoryFilter] = useState<Category | "TODOS">("TODOS")

	const enrichedData = useMemo(() => {
		return data.map((item) => {
			const ugHistory = historicalData
				.filter((d) => d.ug === item.ug && d.group === item.group && d.date <= item.date)
				.sort((a, b) => a.date.localeCompare(b.date))
				.slice(-7)

			let fq = 0
			let fa = 0
			let volatility = 0

			if (ugHistory.length > 1) {
				let increases = 0
				let decreases = 0
				const variations: number[] = []

				for (let i = 1; i < ugHistory.length; i++) {
					const prev = ugHistory[i - 1].difference
					const curr = ugHistory[i].difference
					const diff = curr - prev

					if (diff > 0) increases++
					if (diff < 0) decreases++
					variations.push(diff)
				}

				const totalTransitions = ugHistory.length - 1
				fa = (increases / totalTransitions) * 100
				fq = (decreases / totalTransitions) * 100

				const mean = variations.reduce((sum, val) => sum + val, 0) / variations.length
				const variance = variations.reduce((sum, val) => sum + (val - mean) ** 2, 0) / variations.length
				volatility = Math.sqrt(variance)
			}

			const delta = item.delta ?? 0
			let category: Category = "NEUTRO"
			let tooltipText = ""

			const CONTINUOUS_THRESHOLD = 60

			if (delta < -100) {
				if (fq >= CONTINUOUS_THRESHOLD) {
					category = "REDUCAO_CONTINUA"
					tooltipText = `A unidade reduziu o saldo na maioria dos meses recentes, demonstrando trabalho de saneamento constante (Quedas em ${fq.toFixed(0)}% da janela de 6 meses).`
				} else {
					category = "REDUCAO_PONTUAL"
					tooltipText = `A redução foi expressiva no período, porém sem constância histórica recente (Quedas em apenas ${fq.toFixed(0)}% da janela de 6 meses).`
				}
			} else if (delta > 100) {
				if (fa >= CONTINUOUS_THRESHOLD) {
					category = "AUMENTO_CONTINUO"
					tooltipText = `O problema está crescendo de forma persistente mês a mês (Aumentos em ${fa.toFixed(0)}% da janela de 6 meses).`
				} else if (fa < 50 || (volatility > 100000 && item.difference < 50000)) {
					category = "OSCILACAO_ATIPICA"
					tooltipText = `Aumento súbito que não condiz com o histórico ou alta instabilidade operacional (Aumentos em ${fa.toFixed(0)}% da janela de 6 meses).`
				} else {
					category = "AUMENTO_CONTINUO"
					tooltipText = `O problema apresentou crescimento frequente (Aumentos em ${fa.toFixed(0)}% da janela de 6 meses).`
				}
			}

			return { ...item, fq, fa, volatility, category, tooltipText } as EnrichedRecord
		})
	}, [data, historicalData])

	const filteredData = useMemo(() => {
		if (categoryFilter === "TODOS") return enrichedData
		return enrichedData.filter((d) => d.category === categoryFilter)
	}, [enrichedData, categoryFilter])

	const worsened = filteredData
		.filter((d) => (d.delta ?? 0) > 100)
		.sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
		.slice(0, 50)

	const improved = filteredData
		.filter((d) => (d.delta ?? 0) < -100)
		.sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))
		.slice(0, 50)

	const getCategoryConfig = (category: Category) => {
		switch (category) {
			case "REDUCAO_CONTINUA":
				return {
					color: "bg-success/10 text-success border-success/30",
					icon: ArrowDownRight,
					label: "Redução Contínua",
				}
			case "REDUCAO_PONTUAL":
				return {
					color: "bg-success/10 text-success border-success/30",
					icon: ArrowDown,
					label: "Redução Pontual",
				}
			case "AUMENTO_CONTINUO":
				return {
					color: "bg-destructive/10 text-destructive border-destructive/30",
					icon: ArrowUpRight,
					label: "Aumento Contínuo",
				}
			case "OSCILACAO_ATIPICA":
				return {
					color: "bg-warning/10 text-warning border-warning/30",
					icon: Activity,
					label: "Oscilação Atípica",
				}
			default:
				return {
					color: "bg-muted/10 text-muted-foreground border-border/30",
					icon: ArrowRight,
					label: "Neutro",
				}
		}
	}

	const renderCard = (item: EnrichedRecord, rank: number, type: "worse" | "better") => {
		const isWorse = type === "worse"
		const catConfig = getCategoryConfig(item.category)
		const Icon = catConfig.icon

		const prevVal = item.previousDifference ?? item.difference - (item.delta || 0)
		const currVal = item.difference
		const deltaVal = Math.abs(item.delta || 0)

		return (
			<div
				key={item.id}
				className={`relative p-3 rounded-xl border backdrop-blur-md transition-all group mb-2
          ${isWorse ? "bg-destructive/5 border-destructive/20 hover:bg-destructive/10" : "bg-success/5 border-success/20 hover:bg-success/10"}`}
			>
				<div
					className={`absolute -left-1 top-3 w-5 h-5 flex items-center justify-center text-[9px] font-bold rounded shadow-lg z-10
          ${isWorse ? "bg-destructive text-white" : "bg-success text-white"}`}
				>
					{rank}
				</div>

				<div className="pl-5 flex flex-col gap-1">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2 overflow-hidden">
							<h4 className={`font-bold text-sm truncate text-foreground`}>{item.ug}</h4>

							<div className="group/tooltip relative flex items-center">
								<span
									className={`flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider whitespace-nowrap cursor-help ${catConfig.color}`}
								>
									{catConfig.label}
								</span>
								<div
									className={`absolute bottom-full left-0 mb-2 w-64 p-2 rounded shadow-xl text-[10px] opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-20
                  bg-card text-foreground border border-border`}
								>
									{item.tooltipText}
								</div>
							</div>
						</div>

						{onSendMessage && (
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation()
									onSendMessage(item, "RANKING")
								}}
								className={`p-1 rounded transition-colors border
                  bg-card text-muted-foreground hover:text-foreground border-border`}
							>
								<MessageSquareText className="w-3.5 h-3.5" />
							</button>
						)}
					</div>

					<div className={`text-[10px] flex items-center gap-1.5 text-muted-foreground`}>
						<span>{item.cod}</span>
						<span className="opacity-50">•</span>
						<span>{item.group === AccountGroup.CONSUMO ? "CONSUMO" : item.group === AccountGroup.BMP ? "BMP" : "INTANGÍVEL"}</span>
					</div>

					<div className={`pt-2 mt-1 border-t flex items-center justify-between border-border`}>
						<div className="flex items-center gap-4">
							<div className="flex flex-col">
								<span className="text-[8px] font-bold text-muted-foreground uppercase tracking-tighter">Anterior</span>
								<span className={`text-[11px] font-mono text-muted-foreground`}>
									<CurrencyDisplay value={prevVal} />
								</span>
							</div>

							<div className={`flex items-center justify-center ${isWorse ? "text-destructive" : "text-success"}`}>
								<Icon className="w-4 h-4" />
							</div>

							<div className="flex flex-col">
								<span className="text-[8px] font-bold text-muted-foreground uppercase tracking-tighter">Atual</span>
								<span className={`text-[11px] font-mono font-bold text-foreground`}>
									<CurrencyDisplay value={currVal} />
								</span>
							</div>
						</div>

						<div className="flex flex-col items-end">
							<span className="text-[8px] font-bold text-muted-foreground uppercase tracking-tighter">Variação</span>
							<span className={`text-[11px] font-mono font-bold ${isWorse ? "text-destructive" : "text-success"}`}>
								{isWorse ? "+" : "-"}
								<CurrencyDisplay value={deltaVal} />
							</span>
						</div>
					</div>
				</div>
			</div>
		)
	}

	return (
		<div className="flex flex-col h-full w-full gap-4 overflow-hidden">
			<div className="flex items-center justify-between px-2">
				<div className="flex items-center gap-2">
					<span className={`text-xs font-bold text-muted-foreground`}>Filtro por Tipo:</span>
					<Select
						items={{
							TODOS: "Todas as Categorias",
							AUMENTO_CONTINUO: "Aumento Contínuo",
							OSCILACAO_ATIPICA: "Oscilação Atípica",
							REDUCAO_CONTINUA: "Redução Contínua",
							REDUCAO_PONTUAL: "Redução Pontual",
						}}
						value={categoryFilter}
						onValueChange={(value) => setCategoryFilter(value as Category | "TODOS")}
					>
						<SelectTrigger
							className={`data-[size=default]:h-auto pl-3 pr-2 py-1 rounded text-xs font-medium border shadow-none focus-visible:ring-2 focus-visible:ring-ring
               bg-muted/50 border-border text-foreground`}
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="TODOS">Todas as Categorias</SelectItem>
							<SelectItem value="AUMENTO_CONTINUO">Aumento Contínuo</SelectItem>
							<SelectItem value="OSCILACAO_ATIPICA">Oscilação Atípica</SelectItem>
							<SelectItem value="REDUCAO_CONTINUA">Redução Contínua</SelectItem>
							<SelectItem value="REDUCAO_PONTUAL">Redução Pontual</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			<div className="flex flex-col lg:flex-row h-full w-full gap-4 overflow-hidden">
				<div
					className={`flex-1 flex flex-col overflow-hidden rounded-2xl p-4 border backdrop-blur-sm shadow-xl
           border-border bg-card`}
				>
					<div className="flex flex-col gap-1 mb-3 pb-2 border-b border-destructive/20">
						<div className="flex items-center gap-2">
							<TrendingUp className="w-4 h-4 text-destructive" />
							<h3 className={`text-xs font-bold uppercase tracking-wider text-destructive`}>Piora no Período</h3>
						</div>
						{comparisonLabel && <span className={`text-[10px] pl-6 text-muted-foreground`}>{comparisonLabel}</span>}
					</div>
					<div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
						{worsened.length === 0 ? (
							<div className={`text-center py-4 text-xs text-muted-foreground`}>Sem registros.</div>
						) : (
							worsened.map((item, idx) => renderCard(item, idx + 1, "worse"))
						)}
					</div>
				</div>

				<div
					className={`flex-1 flex flex-col overflow-hidden rounded-2xl p-4 border backdrop-blur-sm shadow-xl
           border-border bg-card`}
				>
					<div className="flex flex-col gap-1 mb-3 pb-2 border-b border-success/20">
						<div className="flex items-center gap-2">
							<TrendingDown className="w-4 h-4 text-success" />
							<h3 className={`text-xs font-bold uppercase tracking-wider text-success`}>Melhoria no Período</h3>
						</div>
						{comparisonLabel && <span className={`text-[10px] pl-6 text-muted-foreground`}>{comparisonLabel}</span>}
					</div>
					<div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
						{improved.length === 0 ? (
							<div className={`text-center py-4 text-xs text-muted-foreground`}>Sem registros.</div>
						) : (
							improved.map((item, idx) => renderCard(item, idx + 1, "better"))
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
