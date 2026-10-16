// Extraído de routes/subitens-genericos.tsx (port do sucontsubitem): nível estratégico do painel.
import { Shield, TrendingUp } from "lucide-react"
import { motion } from "motion/react"
import { SectionHeader } from "#/components/ui/section-header"
import { StatTile } from "#/components/ui/stat-tile"
import { describeHiddenUgs, formatParetoShare, formatUgCount, splitParetoList } from "#/lib/analysis/pareto"
import type { CountSaldoSummary, ParetoSummary } from "#/subitens/dashboard"
import type { UgGroup } from "#/subitens/types"
import { formatUgName } from "#/subitens/ug"

interface StrategicDashboardProps {
	filteredData: UgGroup[]
	totalInconsistencias: number
	totalVolume: number
	odsList: CountSaldoSummary[]
	orgaoSuperiorList: CountSaldoSummary[]
	paretoSummary: ParetoSummary
	topUgsByInconsistencias: UgGroup[]
}

export function StrategicDashboard({
	filteredData,
	totalInconsistencias,
	totalVolume,
	odsList,
	orgaoSuperiorList,
	paretoSummary,
	topUgsByInconsistencias,
}: StrategicDashboardProps) {
	const paretoList = splitParetoList(paretoSummary.group, 3)
	return (
		<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
			{/* Era um painel azul-sólido de `p-10` com escudo de 300px em marca-d'água
			    e KPIs em `bg-white/10` — o único hero escuro do app. */}
			<SectionHeader
				title="Painel de risco contábil do COMAER"
				description="Panorama consolidado das inconsistências, com os pontos de maior risco financeiro e operacional."
			/>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				<StatTile label="Total de inconsistências" value={totalInconsistencias} />
				<StatTile
					label="Volume financeiro em risco"
					value={new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact" }).format(totalVolume)}
					status="warning"
				/>
				<StatTile label="Maior risco por ODS" value={odsList[0]?.name || "-"} hint={`${odsList[0]?.count || 0} ocorrências`} />
				<StatTile label="Média por UG afetada" value={filteredData.length > 0 ? (totalInconsistencias / filteredData.length).toFixed(1) : 0} />
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
				{[
					{ title: "Distribuição Percentual por ODS", data: odsList, barColor: "bg-action" },
					{ title: "Concentração por Órgão Superior", data: orgaoSuperiorList, barColor: "bg-warning" },
				].map(({ title, data, barColor }) => (
					<div key={title} className="bg-card p-8 rounded-xl border border-border shadow-sm">
						<h3 className="text-heading text-foreground mb-6">{title}</h3>
						<div className="space-y-4">
							{data.map((item) => {
								const pct = totalInconsistencias > 0 ? Math.round((item.count / totalInconsistencias) * 100) : 0
								return (
									<div key={item.name} className="flex items-center gap-4">
										<div className="w-24 text-foreground text-subheading">{item.name}</div>
										<div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
											<div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
										</div>
										<div className="w-12 text-right font-mono text-body text-muted-foreground">{pct}%</div>
									</div>
								)
							})}
						</div>
					</div>
				))}
			</div>

			{/* Mapa de Risco + Pareto */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
				<div className="lg:col-span-2 bg-card p-8 rounded-xl border border-border shadow-sm">
					<div className="flex items-center justify-between mb-8">
						<h3 className="text-heading text-foreground">Mapa de Risco Contábil (Consolidado)</h3>
						<div className="px-3 py-1 bg-muted text-foreground rounded-full text-label">Visão por ODS</div>
					</div>
					<div className="overflow-x-auto">
						<table className="w-full">
							<thead className="bg-muted/50 border-b border-border text-label text-muted-foreground">
								<tr>
									{["ODS", "Inconsistências", "Saldo Associado", "% do Total"].map((h, i) => (
										<th key={h} className={`px-4 py-3${i === 0 ? " text-left" : i < 3 ? " text-center" : " text-right"}`}>
											{h}
										</th>
									))}
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{odsList.map((ods) => (
									<tr key={ods.name} className="hover:bg-muted/40 transition-colors">
										<td className="py-4 text-foreground text-subheading">{ods.name}</td>
										<td className="py-4 text-center font-mono text-body text-muted-foreground">{ods.count}</td>
										<td className="py-4 text-right font-mono text-body text-muted-foreground">
											{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact" }).format(ods.saldo)}
										</td>
										<td className="py-4 text-right font-mono text-subheading text-foreground">
											{totalInconsistencias > 0 ? Math.round((ods.count / totalInconsistencias) * 100) : 0}%
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>

				<div className="bg-card p-8 rounded-xl border border-border flex flex-col justify-between">
					<div>
						<h3 className="text-heading text-foreground mb-1 flex items-center gap-2">
							<TrendingUp className="w-5 h-5 text-muted-foreground" />
							Análise de concentração
						</h3>
						<p className="text-caption text-muted-foreground mb-6">UGs que somam 80% das ocorrências</p>

						<div className="space-y-6">
							<div>
								<h4 className="text-display text-warning mb-1">{formatParetoShare(paretoSummary.issuePercentage)}</h4>
								<p className="text-caption text-muted-foreground leading-relaxed">
									das inconsistências contábeis estão concentradas em {formatParetoShare(paretoSummary.ugPercentage)} das UGs analisadas (
									{formatUgCount(paretoSummary.group.length)}).
								</p>
							</div>

							<div className="pt-6 border-t border-border">
								<p className="text-label text-muted-foreground mb-3">UGs de alta concentração</p>
								<div className="space-y-2">
									{paretoList.shown.map((item) => (
										<div key={item.ug} className="flex items-center justify-between text-caption">
											<span className="text-foreground font-mono">{formatUgName(item.ug)}</span>
											<span className="font-bold text-warning">{item.count} ocorr.</span>
										</div>
									))}
									{paretoList.hiddenCount > 0 && <p className="text-hint text-muted-foreground">{describeHiddenUgs(paretoList.hiddenCount)}</p>}
								</div>
							</div>
						</div>
					</div>

					<div className="mt-8 p-4 bg-muted/50 rounded-lg border border-border">
						<p className="text-label text-foreground mb-1">Prioridade de atuação</p>
						<p className="text-hint text-muted-foreground leading-relaxed">
							O direcionamento das ações para estas {formatUgCount(paretoSummary.group.length)} resultará na regularização de{" "}
							{formatParetoShare(paretoSummary.issuePercentage)} das ocorrências.
						</p>
					</div>
				</div>
			</div>

			{/* Priorização */}
			<div className="bg-card p-8 rounded-xl border border-border shadow-sm">
				<div className="flex items-center justify-between mb-8">
					<div className="flex items-center gap-3">
						<div className="p-2 bg-muted rounded-lg text-foreground">
							<Shield size={20} />
						</div>
						<h3 className="text-heading text-foreground">Priorização de Atuação Imediata</h3>
					</div>
					<p className="text-label text-muted-foreground">Baseado em Risco e Impacto Financeiro</p>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
					{topUgsByInconsistencias.slice(0, 3).map((ug, idx) => (
						<div key={ug.ug} className="p-6 bg-muted/50 rounded-xl border border-border relative overflow-hidden group hover:border-warning/30 transition-all">
							<div className="absolute -right-4 -top-4 text-muted-foreground/40 text-8xl group-hover:text-warning/10 transition-colors">{idx + 1}</div>
							<div className="relative z-10">
								<p className="text-label text-warning mb-1">{idx + 1}º Prioridade</p>
								<h4 className="text-heading text-foreground mb-4">{formatUgName(ug.ug)}</h4>
								<div className="space-y-3">
									<div className="flex items-center justify-between">
										<span className="text-label text-muted-foreground">Inconsistências</span>
										<span className="text-subheading font-mono text-foreground">{ug.occurrences.length}</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-label text-muted-foreground">Impacto Financeiro</span>
										<span className="text-subheading font-mono text-foreground">
											{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact" }).format(ug.totalSaldo)}
										</span>
									</div>
									<div className="pt-3 border-t border-border">
										<p className="text-hint text-muted-foreground italic">
											{ug.occurrences.length > 3 ? "Alta recorrência de questões RAC." : "Impacto significativo nas demonstrações."}
										</p>
									</div>
								</div>
							</div>
						</div>
					))}
				</div>
			</div>
		</motion.div>
	)
}
