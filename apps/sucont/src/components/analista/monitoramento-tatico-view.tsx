// Extraído de routes/monitoramento.tsx (port do Analistasaldoimproprio): a visão tática (SUCONT-3).
import { Lightbulb, PieChart as PieChartIcon, Target, TrendingUp, Users } from "lucide-react"
import { Bar, BarChart, CartesianGrid, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ChatAssistant } from "#/components/analista/chat-assistant"
import { SectionHeader } from "#/components/ui/section-header"
import { StatTile } from "#/components/ui/stat-tile"
import type { DecisaoData, EstrategicoData, ManagerialData } from "#/lib/analista/monitoramento-panels"
import { formatCurrency } from "#/lib/analista/types"
import { chartChrome } from "#/lib/chart-theme"

interface MonitoramentoTaticoViewProps {
	managerialData: ManagerialData
	estrategicoData: EstrategicoData | null
	decisaoData: DecisaoData | null
}

export function MonitoramentoTaticoView({ managerialData, estrategicoData, decisaoData }: MonitoramentoTaticoViewProps) {
	return (
		<div className="space-y-8">
			<SectionHeader
				icon={<Target />}
				title="Painel de análise tática (SUCONT-3)"
				description="Traduz os achados operacionais em informação gerencial para a divisão, alinhada ao RAC."
			/>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				<StatTile label="Total de inconsistências" value={managerialData.totalIssues} hint="registros fora da conformidade RAC" />
				<StatTile
					label="Volume financeiro em risco"
					value={formatCurrency(managerialData.totalRiskValue)}
					hint="soma absoluta dos saldos irregulares"
					status="destructive"
				/>
				<StatTile label="UG mais crítica (volume)" value={managerialData.topUgs[0]?.ug || "-"} hint="maior concentração de inconsistências" />
				<StatTile label="Questão RAC mais frequente" value={managerialData.topRacs[0]?.name || "-"} hint="principal ofensor sistêmico" status="action" />
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
				<div className="bg-card p-6 rounded-xl shadow-sm border border-border">
					<h3 className="text-heading text-foreground mb-6 flex items-center">
						<TrendingUp className="w-5 h-5 mr-2 text-action" />
						Top 10 UGs por Volume de Inconsistências
					</h3>
					<div className="h-80">
						<ResponsiveContainer width="100%" height="100%">
							<BarChart data={managerialData.topUgs} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
								<CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartChrome.grid} />
								<XAxis type="number" hide />
								<YAxis dataKey="ug" type="category" axisLine={false} tickLine={false} tick={{ fill: chartChrome.axis, fontSize: 12 }} />
								<Tooltip
									cursor={{ fill: chartChrome.surfaceMuted }}
									contentStyle={{
										borderRadius: "8px",
										border: "none",
										boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
									}}
									formatter={(value) => [Number(value), "Ocorrências"]}
								/>
								<Bar dataKey="count" fill={"var(--series-bmp)"} radius={[0, 4, 4, 0]} barSize={20} />
							</BarChart>
						</ResponsiveContainer>
					</div>
				</div>

				<div className="bg-card p-6 rounded-xl shadow-sm border border-border">
					<h3 className="text-heading text-foreground mb-6 flex items-center">
						<PieChartIcon className="w-5 h-5 mr-2 text-action" />
						Distribuição por Questão RAC
					</h3>
					<div className="h-80">
						<ResponsiveContainer width="100%" height="100%">
							<PieChart>
								<Pie data={managerialData.topRacs} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" />
								<Tooltip
									contentStyle={{
										borderRadius: "8px",
										border: "none",
										boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
									}}
									formatter={(value) => [Number(value), "Ocorrências"]}
								/>
								<Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: "12px", color: chartChrome.axis }} />
							</PieChart>
						</ResponsiveContainer>
					</div>
				</div>
			</div>

			<div className="bg-card p-6 rounded-xl shadow-sm border border-border">
				<h3 className="text-heading text-foreground mb-6 flex items-center">
					<Users className="w-5 h-5 mr-2 text-success" />
					Distribuição de Inconsistências por Conferente
				</h3>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{managerialData.conferentes.map((conf, idx) => (
						<div key={idx} className="border border-border rounded-xl p-4 bg-muted/50">
							<div className="flex justify-between items-start mb-3">
								<h4 className="text-foreground text-subheading">Conferente: {conf.name}</h4>
								<span className="inline-flex items-center px-2 py-0.5 rounded text-caption bg-success/15 text-success">{conf.count} Inconsistências</span>
							</div>
							<div className="text-caption text-muted-foreground mb-2">UGs com inconsistências:</div>
							<div className="flex flex-wrap gap-1.5">
								{conf.ugs.map((ug) => (
									<span key={ug} className="inline-flex items-center px-2 py-0.5 rounded text-caption bg-card border border-border text-foreground">
										UG {ug}
									</span>
								))}
							</div>
						</div>
					))}
				</div>
			</div>

			<div className="bg-action/10 border border-action/30 rounded-xl p-6">
				<h3 className="text-heading text-action mb-4 flex items-center">
					<Lightbulb className="w-5 h-5 mr-2 text-action" />
					Recomendações Estratégicas (Foco de Atuação)
				</h3>
				<ul className="space-y-3 text-action text-body">
					{managerialData.topUgs.length > 0 && (
						<li className="flex items-start">
							<span className="w-1.5 h-1.5 rounded-full bg-action mt-1.5 mr-2 shrink-0" />A UG <strong>{managerialData.topUgs[0].ug}</strong> concentra a maior
							parte das inconsistências. Recomenda-se uma ação de orientação técnica direcionada à Setorial Contábil desta unidade.
						</li>
					)}
					{managerialData.topRacs.length > 0 && (
						<li className="flex items-start">
							<span className="w-1.5 h-1.5 rounded-full bg-action mt-1.5 mr-2 shrink-0" />A <strong>{managerialData.topRacs[0].name}</strong> é a principal
							ofensora do COMAER neste período. Sugere-se avaliar a necessidade de capacitação das UGs ou a emissão de um boletim de orientação específico.
						</li>
					)}
					<li className="flex items-start">
						<span className="w-1.5 h-1.5 rounded-full bg-action mt-1.5 mr-2 shrink-0" />O volume financeiro total em risco é de{" "}
						<strong>{formatCurrency(managerialData.totalRiskValue)}</strong>. A não regularização pode comprometer a fidedignidade das demonstrações contábeis
						do COMAER.
					</li>
				</ul>
			</div>

			<ChatAssistant managerialData={managerialData} estrategicoData={estrategicoData ?? null} decisaoData={decisaoData} />
		</div>
	)
}
