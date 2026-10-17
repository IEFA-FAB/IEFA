// Extraído de routes/monitoramento.tsx (port do Analistasaldoimproprio): a visão estratégica (risco contábil do COMAER).
import { AlertTriangle, BarChart3, Building2, PieChart as PieChartIcon } from "lucide-react"
import { Bar, BarChart, CartesianGrid, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ChatAssistant } from "#/components/analista/chat-assistant"
import { SectionHeader } from "#/components/ui/section-header"
import { StatTile } from "#/components/ui/stat-tile"
import { type DecisaoData, describeTopOdsShare, type EstrategicoData, type ManagerialData } from "#/lib/analista/monitoramento-panels"
import { formatCurrency } from "#/lib/analista/types"
import { chartChrome } from "#/lib/chart-theme"

interface MonitoramentoEstrategicoViewProps {
	estrategicoData: EstrategicoData
	managerialData: ManagerialData | null
	decisaoData: DecisaoData | null
}

export function MonitoramentoEstrategicoView({ estrategicoData, managerialData, decisaoData }: MonitoramentoEstrategicoViewProps) {
	return (
		<div className="space-y-8">
			<SectionHeader
				icon={<Building2 />}
				title="Painel de risco contábil do COMAER (estratégico)"
				description="Visão consolidada para a decisão da chefia da SUCONT, da DIREF e dos altos escalões do COMAER."
			/>

			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				<StatTile label="Total de inconsistências" value={estrategicoData.totalIssues} hint="registros fora da conformidade RAC" />
				<StatTile
					label="Volume financeiro em risco"
					value={formatCurrency(estrategicoData.totalRiskValue)}
					hint="soma absoluta dos saldos irregulares"
					status="destructive"
				/>
				<StatTile label="Maior risco por ODS" value={estrategicoData.topOds[0]?.name || "-"} hint={describeTopOdsShare(estrategicoData.topOds)} />
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
				<div className="bg-card p-6 rounded-xl shadow-sm border border-border">
					<h3 className="text-heading text-foreground mb-6 flex items-center">
						<PieChartIcon className="w-5 h-5 mr-2 text-success" />
						Distribuição Percentual por ODS
					</h3>
					<div className="h-80">
						<ResponsiveContainer width="100%" height="100%">
							<PieChart>
								<Pie data={estrategicoData.topOds} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="count" nameKey="name" />
								<Tooltip
									contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
									formatter={(value, _name, item) => [`${Number(value)} (${(Number(item?.payload?.percent) || 0).toFixed(1)}%)`, "Inconsistências"]}
								/>
								<Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: "12px", color: chartChrome.axis }} />
							</PieChart>
						</ResponsiveContainer>
					</div>
				</div>

				<div className="bg-card p-6 rounded-xl shadow-sm border border-border">
					<h3 className="text-heading text-foreground mb-6 flex items-center">
						<BarChart3 className="w-5 h-5 mr-2 text-success" />
						Ranking de Órgãos Superiores
					</h3>
					<div className="h-80">
						<ResponsiveContainer width="100%" height="100%">
							<BarChart data={estrategicoData.topOrgaosSuperiores} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
								<CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke={chartChrome.grid} />
								<XAxis type="number" tick={{ fontSize: 12, fill: chartChrome.axis }} axisLine={false} tickLine={false} />
								<YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11, fill: chartChrome.axis }} axisLine={false} tickLine={false} />
								<Tooltip
									cursor={{ fill: chartChrome.surfaceMuted }}
									contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
									formatter={(value) => [Number(value), "Inconsistências"]}
								/>
								<Bar dataKey="count" fill={"var(--success)"} radius={[0, 4, 4, 0]} barSize={20} />
							</BarChart>
						</ResponsiveContainer>
					</div>
				</div>
			</div>

			<div className="bg-card p-6 rounded-xl shadow-sm border border-border">
				<h3 className="text-heading text-foreground mb-6 flex items-center">
					<AlertTriangle className="w-5 h-5 mr-2 text-destructive" />
					Contas Contábeis com Maior Risco (Top 10)
				</h3>
				<div className="overflow-x-auto">
					<table className="min-w-full divide-y divide-border">
						<thead className="bg-muted/50 border-b border-border text-label text-muted-foreground">
							<tr>
								{["Conta", "Descrição", "Ocorrências", "Volume Financeiro"].map((h) => (
									<th key={h} className="px-4 py-3 text-left">
										{h}
									</th>
								))}
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{estrategicoData.topContas.map((c, i) => (
								<tr key={i} className="hover:bg-muted/50">
									<td className="px-3 py-2 whitespace-nowrap text-body font-mono text-foreground">{c.conta}</td>
									<td className="px-3 py-2 text-body text-muted-foreground">{c.descricao}</td>
									<td className="px-3 py-2 whitespace-nowrap text-subheading text-right text-foreground">{c.count}</td>
									<td className="px-3 py-2 whitespace-nowrap text-subheading text-right text-destructive">{formatCurrency(c.value)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>

			<ChatAssistant managerialData={managerialData ?? null} estrategicoData={estrategicoData} decisaoData={decisaoData} />
		</div>
	)
}
