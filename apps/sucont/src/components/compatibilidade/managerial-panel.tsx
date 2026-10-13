/**
 * Aba "Painel gerencial (RAC)": indicadores, gráficos, distribuições e análise
 * de risco. Extraído de routes/analista-compatibilidade.tsx (port do
 * analistacompatibilidade); os números saem de `buildManagerialData`.
 */
import { BarChart3, Building2, LayoutDashboard, type LucideIcon, PieChart as PieChartIcon, ShieldAlert, Users } from "lucide-react"
import { Bar, BarChart, CartesianGrid, Legend, Pie, PieChart, Tooltip as RechartsTooltip, ResponsiveContainer, XAxis, YAxis } from "recharts"
import { StatTile } from "#/components/ui/stat-tile"
import { chartChrome } from "#/lib/chart-theme"
import { formatCurrency } from "#/lib/compatibilidade/format"
import type { GroupStat, ManagerialData } from "#/lib/compatibilidade/managerial"

function TopUgsChart({ topUGs }: { topUGs: ManagerialData["topUGs"] }) {
	return (
		<div className="bg-card p-6 rounded-xl shadow-sm border border-border">
			<h3 className="text-heading text-foreground mb-4 flex items-center gap-2">
				<BarChart3 className="w-5 h-5 text-action" />
				Top 5 UGs por Volume de Divergência
			</h3>
			<div className="h-72">
				<ResponsiveContainer width="100%" height="100%">
					<BarChart data={topUGs} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
						<CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartChrome.grid} />
						<XAxis type="number" tickFormatter={(value: number) => `R$ ${(value / 1000000).toFixed(1)}M`} stroke={chartChrome.axis} fontSize={12} />
						<YAxis dataKey="name" type="category" stroke={chartChrome.axis} fontSize={12} fontWeight="bold" />
						<RechartsTooltip
							formatter={(value) => formatCurrency(typeof value === "number" ? value : Number(value))}
							labelFormatter={(label, payload) => {
								const first = payload?.[0]?.payload
								if (first) {
									return `${String(label)} — Conferente: ${first.conferente}`
								}
								return String(label)
							}}
							cursor={{ fill: chartChrome.surfaceMuted }}
							contentStyle={{
								borderRadius: "8px",
								border: "none",
								boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
							}}
						/>
						<Bar dataKey="volume" fill="var(--series-siafi)" radius={[0, 4, 4, 0]} barSize={32} />
					</BarChart>
				</ResponsiveContainer>
			</div>
		</div>
	)
}

function PairIncidenceChart({ pairStats }: { pairStats: ManagerialData["pairStats"] }) {
	return (
		<div className="bg-card p-6 rounded-xl shadow-sm border border-border">
			<h3 className="text-heading text-foreground mb-4 flex items-center gap-2">
				<PieChartIcon className="w-5 h-5 text-action" />
				Incidência por Par de Contas
			</h3>
			<div className="h-72">
				<ResponsiveContainer width="100%" height="100%">
					<PieChart>
						<Pie data={pairStats.filter((p) => p.count > 0)} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="count" />
						<RechartsTooltip
							// biome-ignore lint/suspicious/noExplicitAny: recharts formatter overload
							formatter={(value: any) => [`${value} UGs`, "Ocorrências"]}
							contentStyle={{
								borderRadius: "8px",
								border: "none",
								boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
							}}
						/>
						<Legend verticalAlign="bottom" height={36} iconType="circle" />
					</PieChart>
				</ResponsiveContainer>
			</div>
		</div>
	)
}

interface DistributionSectionProps {
	icon: LucideIcon
	title: string
	/** Classes da pílula de contagem (cor de cada distribuição). */
	badgeClassName: string
	stats: GroupStat[]
}

/** Distribuição por órgão superior, por ODS ou por conferente: mesmo bloco, ícone e cor da pílula próprios. */
function DistributionSection({ icon: Icon, title, badgeClassName, stats }: DistributionSectionProps) {
	return (
		<div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
			<div className="bg-muted/50 border-b border-border px-6 py-4">
				<h3 className="text-heading text-foreground flex items-center gap-2">
					<Icon className="w-5 h-5 text-action" />
					{title}
				</h3>
			</div>
			<div className="p-6">
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{stats.map((stat, idx) => (
						<div key={idx} className="bg-muted/50 rounded-xl border border-border p-5 flex flex-col">
							<div className="flex items-center justify-between mb-4 border-b border-border pb-3">
								<h4 className="font-bold text-foreground flex items-center gap-2">
									<Icon className="w-4 h-4 text-muted-foreground" />
									{stat.name}
								</h4>
								<span className={badgeClassName}>
									{stat.count} UG{stat.count > 1 ? "s" : ""}
								</span>
							</div>
							<div className="flex-1">
								<p className="text-label text-muted-foreground mb-2">Unidades com Inconsistências:</p>
								<div className="flex flex-wrap gap-1.5">
									{stat.ugs.map((ug, i) => (
										<span key={i} className="text-caption bg-card border border-border text-foreground px-2 py-1 rounded-md">
											{ug.includes(" - ") ? `${ug.split(" - ")[1]} (${ug.split(" - ")[0]})` : `UG ${ug}`}
										</span>
									))}
								</div>
							</div>
							<div className="mt-4 pt-3 border-t border-border">
								<p className="text-caption text-muted-foreground">
									Volume Total: <span className="font-bold text-foreground">{formatCurrency(stat.volume)}</span>
								</p>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	)
}

function RiskAnalysis({ pairStats }: { pairStats: ManagerialData["pairStats"] }) {
	return (
		<div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
			<div className="bg-muted/50 border-b border-border px-6 py-4">
				<h3 className="text-heading text-foreground flex items-center gap-2">
					<ShieldAlert className="w-5 h-5 text-action" />
					Análise de Risco e Contexto Metodológico (RAC)
				</h3>
			</div>
			<div className="p-6 space-y-6">
				{pairStats.map((pair, idx) => {
					if (pair.count === 0) return null
					return (
						<div key={idx} className="flex flex-col md:flex-row gap-4 pb-6 border-b border-border last:border-0 last:pb-0">
							<div className="md:w-1/3">
								<div className="flex items-center gap-2 mb-2">
									<div className="w-3 h-3 rounded-full" style={{ backgroundColor: pair.color }} />
									<h4 className="font-bold text-foreground">{pair.name}</h4>
								</div>
								<p className="text-subheading text-muted-foreground mb-1">{pair.description.split(" × ")[0]}</p>
								<p className="text-subheading text-muted-foreground">{pair.description.split(" × ")[1]}</p>
								<div className="mt-3 bg-muted/50 p-3 rounded-lg border border-border">
									<p className="text-label text-muted-foreground mb-1">Volume Envolvido</p>
									<p className="text-heading text-foreground">{formatCurrency(pair.volume)}</p>
								</div>
							</div>
							<div className="md:w-2/3 bg-action/5 p-4 rounded-xl border border-action/30">
								<h5 className="text-subheading text-foreground mb-2">Objetivo da Verificação:</h5>
								<p className="text-body text-foreground mb-4 leading-relaxed">
									{pair.name === "Par 1"
										? "Garantir que os saldos de caução em espécie registrados no ativo (1.1.1.1.1.19.03) estejam integralmente refletidos na conta de controle (8.1.1.1.1.01.13)."
										: "Garantir a compatibilidade entre os saldos dos sistemas SIAFI e SILOMS, assegurando que os bens em trânsito ou enviados estejam corretamente registrados e baixados."}
								</p>
								<h5 className="text-subheading text-destructive mb-2">Risco Contábil Associado:</h5>
								<p className="text-body text-foreground leading-relaxed">
									{pair.name === "Par 1"
										? "A divergência indica possível omissão no registro do documento hábil RC com situação LDV053, o que distorce a evidenciação dos controles de garantias e cauções do COMAER, comprometendo a fidedignidade do balanço patrimonial."
										: "A falta de compatibilidade evidencia falhas no controle de movimentação de bens (almoxarifado/móveis), podendo resultar em superavaliação ou subavaliação do patrimônio da União sob responsabilidade do COMAER, além de descumprimento do Manual Eletrônico do RADA-e."}
								</p>
							</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}

interface ManagerialPanelProps {
	managerialData: ManagerialData
	reportsCount: number
}

export function ManagerialPanel({ managerialData, reportsCount }: ManagerialPanelProps) {
	return (
		<div className="space-y-6">
			{/* KPIs */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				<StatTile label="UGs com divergência" value={reportsCount} />
				<StatTile label="Volume financeiro total" value={formatCurrency(managerialData.totalVolume)} status="destructive" />
				<StatTile label="Média por UG" value={formatCurrency(managerialData.totalVolume / reportsCount)} status="warning" />
			</div>

			{/* Charts */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Bar chart: Top 5 UGs */}
				<TopUgsChart topUGs={managerialData.topUGs} />

				{/* Pie chart: Pairs */}
				<PairIncidenceChart pairStats={managerialData.pairStats} />
			</div>

			{/* Distribution: Órgão Superior */}
			<DistributionSection
				icon={Building2}
				title="Distribuição por Órgão Superior"
				badgeClassName="bg-action/15 text-action text-label px-2 py-1 rounded-full"
				stats={managerialData.superiorStats}
			/>

			{/* Distribution: ODS */}
			<DistributionSection
				icon={LayoutDashboard}
				title="Distribuição por ODS (Órgão de Direção Setorial)"
				badgeClassName="bg-success/15 text-success text-label px-2 py-1 rounded-full"
				stats={managerialData.odsStats}
			/>

			{/* Distribution: Conferente */}
			<DistributionSection
				icon={Users}
				title="Filtro Gerencial por Conferente"
				badgeClassName="bg-destructive/15 text-destructive text-label px-2 py-1 rounded-full"
				stats={managerialData.conferenteStats}
			/>

			{/* Risk analysis */}
			<RiskAnalysis pairStats={managerialData.pairStats} />
		</div>
	)
}
