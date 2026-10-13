// Extraído de routes/subitens-genericos.tsx (port do sucontsubitem): nível operacional do painel.
import { LayoutDashboard, PieChart as PieChartIcon, Shield } from "lucide-react"
import { motion } from "motion/react"
import { Bar, BarChart, CartesianGrid, Legend, Pie, PieChart, Tooltip as RechartsTooltip, ResponsiveContainer, XAxis, YAxis } from "recharts"
import { chartChrome } from "#/lib/chart-theme"
import type { ConferenteSummary } from "#/subitens/dashboard"
import type { UgGroup } from "#/subitens/types"
import { formatUgName } from "#/subitens/ug"

interface OperationalDashboardProps {
	filteredData: UgGroup[]
	totalVolume: number
	contasCount: Record<string, number>
	topUgsBySaldo: { name: string; saldo: number }[]
	topContas: { name: string; count: number; fill: string }[]
	conferentesList: ConferenteSummary[]
}

export function OperationalDashboard({ filteredData, totalVolume, contasCount, topUgsBySaldo, topContas, conferentesList }: OperationalDashboardProps) {
	return (
		<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
			<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
				{[
					{
						title: "Risco Sistêmico",
						text: `A utilização de subitens genéricos afeta ${filteredData.length} Unidades Gestoras, comprometendo a evidenciação contábil de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalVolume)} no COMAER.`,
					},
					{
						title: "Ação Recomendada",
						text: `Expedir as ${filteredData.length} mensagens institucionais geradas para orientar as UGs na reclassificação dos saldos para contas específicas, conforme RAC.`,
					},
					{
						title: "Contas Afetadas",
						text: `Foram identificadas ${Object.keys(contasCount).length} contas contábeis distintas com inconsistências, exigindo atenção da Setorial Contábil.`,
					},
				].map((card) => (
					<div key={card.title} className="bg-card p-6 rounded-xl border border-border shadow-sm">
						<h4 className="text-label text-muted-foreground mb-2">{card.title}</h4>
						<p className="text-body text-muted-foreground leading-relaxed">{card.text}</p>
					</div>
				))}
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
				<div className="bg-card p-8 rounded-xl border border-border shadow-sm">
					<div className="flex items-center gap-3 mb-8">
						<div className="p-2 bg-muted rounded-lg text-foreground">
							<LayoutDashboard size={20} />
						</div>
						<h3 className="text-heading text-foreground">Top 5 UGs por Volume Financeiro</h3>
					</div>
					<div className="h-[300px] w-full">
						<ResponsiveContainer width="100%" height="100%">
							<BarChart data={topUgsBySaldo} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
								<CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartChrome.grid} />
								<XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: chartChrome.axis, fontSize: 12 }} />
								<YAxis
									axisLine={false}
									tickLine={false}
									tick={{ fill: chartChrome.axis, fontSize: 12 }}
									tickFormatter={(value) => new Intl.NumberFormat("pt-BR", { notation: "compact", compactDisplay: "short" }).format(value)}
								/>
								<RechartsTooltip
									cursor={{ fill: chartChrome.surfaceMuted, opacity: 0.4 }}
									contentStyle={{ borderRadius: "16px", border: "none", boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)" }}
									formatter={(value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value))}
								/>
								<Bar dataKey="saldo" fill="var(--series-siafi)" radius={[6, 6, 0, 0]} barSize={40} />
							</BarChart>
						</ResponsiveContainer>
					</div>
				</div>

				<div className="bg-card p-8 rounded-xl border border-border shadow-sm">
					<div className="flex items-center gap-3 mb-8">
						<div className="p-2 bg-muted rounded-lg text-foreground">
							<PieChartIcon size={20} />
						</div>
						<h3 className="text-heading text-foreground">Contas com Mais Inconsistências</h3>
					</div>
					<div className="h-[300px] w-full">
						<ResponsiveContainer width="100%" height="100%">
							<PieChart>
								<Pie data={topContas} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="count" />
								<RechartsTooltip contentStyle={{ borderRadius: "16px", border: "none", boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)" }} />
								<Legend verticalAlign="bottom" height={36} iconType="circle" />
							</PieChart>
						</ResponsiveContainer>
					</div>
				</div>
			</div>

			<div className="bg-card p-8 rounded-xl border border-border shadow-sm">
				<div className="flex items-center gap-3 mb-8">
					<div className="p-2 bg-muted rounded-lg text-foreground">
						<Shield size={20} />
					</div>
					<h3 className="text-heading text-foreground">Inconsistências por Conferente</h3>
				</div>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{conferentesList.map((conf, idx) => (
						<div key={idx} className="bg-muted/50 p-6 rounded-xl border border-border">
							<div className="flex items-center justify-between mb-4">
								<h4 className="font-bold text-foreground">{conf.name}</h4>
								<span className="px-3 py-1 bg-muted text-foreground rounded-full text-label">
									{conf.count} {conf.count === 1 ? "inconsistência" : "inconsistências"}
								</span>
							</div>
							<div className="space-y-2">
								<p className="text-label text-muted-foreground mb-2">UGs Afetadas:</p>
								<div className="flex flex-wrap gap-2">
									{conf.ugs.map((ug, i) => (
										<span key={i} className="px-2 py-1 bg-card border border-border rounded-md text-caption font-mono text-muted-foreground">
											{formatUgName(ug)}
										</span>
									))}
								</div>
							</div>
						</div>
					))}
				</div>
			</div>
		</motion.div>
	)
}
