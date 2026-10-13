// Extraído de routes/conta-generica.tsx (port do analistacontagenerica): visão
// tática do painel de risco (rankings, Pareto, prioridades, conferentes, RAC).
import { AlertTriangle, Award, Target, TrendingUp, Wallet } from "lucide-react"
import { Badge } from "#/components/ui/badge"
import { formatCurrency } from "#/lib/analista/types"
import type { ParetoData, PriorityItem } from "#/lib/conta-generica/advanced-analysis"
import type { DerivedStats } from "#/lib/conta-generica/derived-stats"
import { getConferente, getOds, getOs, getUgName, RAC_QUESTIONS } from "#/lib/conta-generica/helpers"

interface TacticalViewProps {
	topUgsByCount: DerivedStats["topUgsByCount"]
	topContasByFreq: DerivedStats["topContasByFreq"]
	paretoData: ParetoData | null
	priorityList: PriorityItem[]
	conferenteStats: DerivedStats["conferenteStats"]
	racStatsMap: DerivedStats["racStatsMap"]
	onSelectConferente: (conferente: string) => void
}

function TacticalRankings({ topUgsByCount, topContasByFreq }: Pick<TacticalViewProps, "topUgsByCount" | "topContasByFreq">) {
	return (
		<div className="bg-card p-6 rounded-xl border border-border">
			<div className="flex items-center gap-2 mb-6">
				<Target className="w-5 h-5 text-foreground" />
				<h3 className="text-heading text-foreground">Visão Tática (SUCONT-3)</h3>
			</div>
			<div className="space-y-6">
				<div>
					<h4 className="text-label text-muted-foreground mb-3 flex items-center gap-2">
						<AlertTriangle className="w-4 h-4" /> Top UGs com Mais Inconsistências
					</h4>
					<div className="space-y-2">
						{topUgsByCount.slice(0, 5).map((ug, idx) => (
							<div key={idx} className="flex justify-between items-center bg-muted/50 p-2 rounded-lg border border-border">
								<div className="flex items-center gap-2">
									<span className="text-caption text-muted-foreground w-4">{idx + 1}º</span>
									<div>
										<span className="text-subheading text-foreground block">
											{getUgName(ug.ug)} ({ug.ug})
										</span>
										<span className="text-label text-muted-foreground">
											{getOs(ug.ug)} / {getOds(ug.ug)}
										</span>
									</div>
								</div>
								<div className="flex items-center gap-3">
									<span className="text-label text-muted-foreground">{getConferente(ug.ug)}</span>
									<span className="text-subheading text-warning">{ug.count}</span>
								</div>
							</div>
						))}
					</div>
				</div>
				<div>
					<h4 className="text-label text-muted-foreground mb-3 flex items-center gap-2">
						<Wallet className="w-4 h-4" /> Contas Genéricas Mais Recorrentes
					</h4>
					<div className="space-y-2">
						{topContasByFreq.slice(0, 5).map((conta, idx) => (
							<div key={idx} className="flex justify-between items-center bg-muted/50 p-2 rounded-lg border border-border">
								<span className="text-subheading text-foreground">{conta.conta}</span>
								<span className="text-caption text-muted-foreground bg-muted px-2 py-1 rounded-full">{conta.count} ocorrências</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	)
}

function ParetoCard({ paretoData }: Pick<TacticalViewProps, "paretoData">) {
	return (
		<div className="bg-card p-6 rounded-xl border border-border">
			<div className="flex items-center gap-2 mb-4">
				<TrendingUp className="w-5 h-5 text-action" />
				<h3 className="text-heading text-foreground">Análise de Concentração (Pareto)</h3>
			</div>
			<div className="bg-action/10 p-4 rounded-xl border border-action/30 mb-4">
				<p className="text-subheading text-action leading-relaxed">
					<span className="text-display text-action">{paretoData?.ugPercentage}%</span> das UGs concentram{" "}
					<span className="text-display text-action">{paretoData?.inconsistencyPercentage}%</span> das inconsistências.
				</p>
			</div>
			<h4 className="text-label text-muted-foreground mb-3">UGs que compõem a concentração (Top 5)</h4>
			<div className="space-y-2">
				{paretoData?.topUgs.slice(0, 5).map((u, i) => (
					<div key={i} className="flex justify-between items-center text-caption p-2 bg-muted/50 rounded-lg">
						<span className="font-bold text-foreground">
							UG {u.ug} ({getUgName(u.ug)})
						</span>
						<span className="font-bold text-action">{u.count} itens</span>
					</div>
				))}
			</div>
		</div>
	)
}

function PriorityCard({ priorityList }: Pick<TacticalViewProps, "priorityList">) {
	return (
		<div className="bg-card p-6 rounded-xl border border-border">
			<div className="flex items-center gap-2 mb-4">
				<Target className="w-5 h-5 text-success" />
				<h3 className="text-heading text-foreground">Priorização de Atuação Imediata</h3>
			</div>
			<p className="text-label text-muted-foreground mb-4">Baseado em Score de Risco (Volume x Quantidade)</p>
			<div className="space-y-3">
				{priorityList.map((p, i) => (
					<div key={i} className="flex items-center gap-4 p-3 bg-muted/50 rounded-xl border border-border hover:bg-success/10 transition-colors">
						<div className="w-8 h-8 bg-success text-success-foreground rounded-lg flex items-center justify-center text-subheading">{i + 1}º</div>
						<div className="flex-1">
							<p className="text-subheading text-foreground">
								UG {p.ug} ({getUgName(p.ug)})
							</p>
							<p className="text-label text-muted-foreground">
								{p.ods} | {formatCurrency(p.volume)}
							</p>
						</div>
						<div className="text-right">
							<p className="text-label text-muted-foreground">Score</p>
							<p className="text-heading text-success">{p.priorityScore}</p>
						</div>
					</div>
				))}
			</div>
		</div>
	)
}

/** Conferente distribution */
function ConferenteDistribution({ conferenteStats, onSelectConferente }: Pick<TacticalViewProps, "conferenteStats" | "onSelectConferente">) {
	return (
		<div className="bg-card p-6 rounded-xl border border-border">
			<div className="flex items-center gap-2 mb-6">
				<Award className="w-5 h-5 text-success" />
				<h3 className="text-heading text-foreground">Panorama de Distribuição SUCONT-3</h3>
			</div>
			<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
				{Object.entries(conferenteStats)
					.sort((a, b) => b[1].count - a[1].count)
					.map(([conf, stats]) => (
						<button
							type="button"
							key={conf}
							className="bg-muted/50 p-4 rounded-xl border border-border text-center hover:bg-success/10 transition-colors cursor-pointer focus-visible:ring-3 focus-visible:ring-ring/50"
							onClick={() => onSelectConferente(conf)}
						>
							<p className="text-label text-muted-foreground mb-1">{conf}</p>
							<p className="text-display text-success">{stats.count}</p>
							<p className="text-label text-muted-foreground">Inconsistências</p>
						</button>
					))}
			</div>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				{Object.entries(conferenteStats)
					.sort((a, b) => b[1].count - a[1].count)
					.map(([conferente, stats]) => (
						<div key={conferente} className="bg-muted/50 rounded-xl border border-border overflow-hidden flex flex-col">
							<div className="bg-muted px-4 py-3 border-b border-border flex justify-between items-center">
								<span className="text-label text-foreground">Conferente: {conferente}</span>
								<span className="px-2 py-1 bg-success/15 text-success text-hint rounded-full">{stats.count} Inconsistência(s)</span>
							</div>
							<div className="p-4 flex-1">
								<h4 className="text-label text-muted-foreground mb-2">UGs sob responsabilidade ({stats.ugs.length})</h4>
								<div className="flex flex-wrap gap-2">
									{stats.ugs.map((ug) => (
										<span key={ug} className="px-2 py-1 bg-card border border-border text-caption text-foreground rounded shadow-sm">
											UG {ug}
										</span>
									))}
								</div>
							</div>
						</div>
					))}
			</div>
		</div>
	)
}

/** RAC panorama */
function RacPanorama({ racStatsMap }: Pick<TacticalViewProps, "racStatsMap">) {
	return (
		<div className="bg-card p-6 rounded-xl border border-border">
			<div className="flex items-center gap-2 mb-6">
				<Target className="w-5 h-5 text-foreground" />
				<h3 className="text-heading text-foreground">Panorama por Questão RAC</h3>
			</div>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				{RAC_QUESTIONS.map((q) => (
					<div key={q.id} className="bg-muted/50 p-5 rounded-xl border border-border hover:bg-action/5 transition-colors">
						<div className="flex justify-between items-start mb-3">
							<Badge variant="action">RAC {q.id}</Badge>
							<span className="text-caption text-foreground">{racStatsMap[q.id].ugs.size} UGs</span>
						</div>
						<p className="text-label text-muted-foreground mb-4 h-8 line-clamp-2">{q.description}</p>
						<div className="flex items-end justify-between">
							<div>
								<p className="text-label text-muted-foreground">Volume</p>
								<p className="text-subheading text-foreground">{formatCurrency(racStatsMap[q.id].volume)}</p>
							</div>
							<div className="text-right">
								<p className="text-label text-muted-foreground">Itens</p>
								<p className="text-subheading text-foreground">{racStatsMap[q.id].count}</p>
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	)
}

/** Tática view */
export function TacticalView({
	topUgsByCount,
	topContasByFreq,
	paretoData,
	priorityList,
	conferenteStats,
	racStatsMap,
	onSelectConferente,
}: TacticalViewProps) {
	return (
		<div className="space-y-8">
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
				<TacticalRankings topUgsByCount={topUgsByCount} topContasByFreq={topContasByFreq} />

				{/* Pareto + Priority */}
				<div className="space-y-6">
					<ParetoCard paretoData={paretoData} />
					<PriorityCard priorityList={priorityList} />
				</div>
			</div>

			<ConferenteDistribution conferenteStats={conferenteStats} onSelectConferente={onSelectConferente} />

			<RacPanorama racStatsMap={racStatsMap} />
		</div>
	)
}
