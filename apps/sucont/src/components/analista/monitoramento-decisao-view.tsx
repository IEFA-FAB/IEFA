// Extraído de routes/monitoramento.tsx (port do Analistasaldoimproprio): apoio à decisão (mapa de risco, Pareto, prioridades).
import { Lightbulb, ShieldAlert, Target, TrendingUp } from "lucide-react"
import { ChatAssistant } from "#/components/analista/chat-assistant"
import type { DecisaoData, EstrategicoData, ManagerialData } from "#/lib/analista/monitoramento-panels"
import { formatCurrency } from "#/lib/analista/types"
import { cn } from "#/lib/utils"

interface MonitoramentoDecisaoViewProps {
	decisaoData: DecisaoData
	managerialData: ManagerialData | null
	estrategicoData: EstrategicoData | null
}

export function MonitoramentoDecisaoView({ decisaoData, managerialData, estrategicoData }: MonitoramentoDecisaoViewProps) {
	return (
		<div className="space-y-8">
			<div className="bg-card p-8 rounded-xl shadow-sm border border-border">
				<div className="flex items-start space-x-4">
					<div className="p-3 bg-warning/15 rounded-xl shrink-0">
						<Lightbulb className="w-6 h-6 text-warning" />
					</div>
					<div>
						<h2 className="text-heading text-foreground mb-2">Apoio à Tomada de Decisão e Mapa de Risco</h2>
						<p className="text-muted-foreground leading-relaxed">
							Análise estratégica para identificação de níveis de risco contábil, concentração de inconsistências e priorização de atuação no âmbito do COMAER.
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
					<div key={label} className="bg-warning/10 p-6 rounded-xl border border-warning/30">
						<p className="text-label text-warning mb-1">{label}</p>
						<p className="text-heading text-foreground">{value}</p>
					</div>
				))}
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
				<div className="bg-card p-6 rounded-xl shadow-sm border border-border">
					<h3 className="text-heading text-foreground mb-6 flex items-center">
						<ShieldAlert className="w-5 h-5 mr-2 text-destructive" />
						Mapa de Risco Contábil (ODS)
					</h3>
					<div className="overflow-x-auto">
						<table className="w-full text-body text-left">
							<thead className="bg-muted/50 border-b border-border text-label text-muted-foreground">
								<tr>
									<th className="px-4 py-3">ODS</th>
									<th className="px-4 py-3 text-center">Inconsistências</th>
									<th className="px-4 py-3 text-right">Saldo Associado</th>
									<th className="px-4 py-3 text-right">% Total</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{estrategicoData?.topOds.map((ods) => (
									<tr key={ods.name} className="hover:bg-muted/50">
										<td className="px-4 py-3 font-medium text-foreground">{ods.name}</td>
										<td className="px-4 py-3 text-center">{ods.count}</td>
										<td className="px-4 py-3 text-right text-destructive font-medium">{formatCurrency(ods.value)}</td>
										<td className="px-4 py-3 text-right">{ods.percent.toFixed(1)}%</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>

				<div className="bg-card p-6 rounded-xl shadow-sm border border-border">
					<h3 className="text-heading text-foreground mb-6 flex items-center">
						<Target className="w-5 h-5 mr-2 text-action" />
						Análise de Concentração (Pareto)
					</h3>
					<div className="flex flex-col items-center justify-center h-full pb-6">
						<div className="text-center mb-8">
							<p className="text-display text-action mb-2">{decisaoData.pareto.paretoPercent.toFixed(1)}%</p>
							<p className="text-body text-muted-foreground">
								das inconsistências estão concentradas em apenas <span className="font-bold text-foreground">20% das UGs</span> (
								{decisaoData.pareto.twentyPercentCount} UGs).
							</p>
						</div>
						<div className="w-full space-y-3">
							<p className="text-label text-muted-foreground">UGs que compõem a concentração:</p>
							{decisaoData.pareto.topTwentyUgs.map((ug, i) => (
								<div key={ug.ug} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg border border-border">
									<div className="flex items-center gap-2">
										<span className="text-hint bg-action/15 text-action w-5 h-5 flex items-center justify-center rounded-full">{i + 1}</span>
										<span className="text-subheading text-foreground">
											{ug.ug} ({ug.nome})
										</span>
									</div>
									<span className="text-caption text-muted-foreground">{ug.count} itens</span>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>

			<div className="bg-card p-6 rounded-xl shadow-sm border border-border">
				<h3 className="text-heading text-foreground mb-6 flex items-center">
					<TrendingUp className="w-5 h-5 mr-2 text-success" />
					Priorização de Atuação (Top 15 UGs Prioritárias)
				</h3>
				<div className="overflow-x-auto">
					<table className="w-full text-body text-left">
						<thead className="bg-muted/50 border-b border-border text-label text-muted-foreground">
							<tr>
								<th className="px-4 py-3">Prioridade</th>
								<th className="px-4 py-3">UG / Nome</th>
								<th className="px-4 py-3">Órgão Superior / ODS</th>
								<th className="px-4 py-3 text-center">Inconsistências</th>
								<th className="px-4 py-3 text-right">Impacto Financeiro</th>
								<th className="px-4 py-3 text-center">Score de Risco</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{decisaoData.priorities.map((ug, i) => (
								<tr key={ug.ug} className="hover:bg-muted/50">
									<td className="px-4 py-3">
										<span
											className={cn(
												"inline-flex items-center justify-center w-6 h-6 rounded-full text-hint",
												i < 3 ? "bg-destructive/15 text-destructive" : "bg-muted text-foreground"
											)}
										>
											{i + 1}º
										</span>
									</td>
									<td className="px-4 py-3">
										<p className="font-bold text-foreground">{ug.ug}</p>
										<p className="text-caption text-muted-foreground">{ug.nome}</p>
									</td>
									<td className="px-4 py-3">
										<p className="text-foreground">{ug.superior}</p>
										<p className="text-caption text-muted-foreground">{ug.ods}</p>
									</td>
									<td className="px-4 py-3 text-center font-medium">{ug.count}</td>
									<td className="px-4 py-3 text-right text-destructive font-medium">{formatCurrency(ug.value)}</td>
									<td className="px-4 py-3 text-center">
										<div className="w-full bg-muted rounded-full h-1.5 max-w-[100px] mx-auto">
											<div
												className={cn("h-1.5 rounded-full", ug.score > 0.7 ? "bg-destructive" : ug.score > 0.4 ? "bg-warning" : "bg-success")}
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
	)
}
