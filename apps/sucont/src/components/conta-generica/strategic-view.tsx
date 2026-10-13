// Extraído de routes/conta-generica.tsx (port do analistacontagenerica): visão
// estratégica do painel de risco.
import { AlertOctagon, Building2, DollarSign, Landmark, TrendingUp } from "lucide-react"
import { StatTile } from "#/components/ui/stat-tile"
import { formatCurrency } from "#/lib/analista/types"
import type { CriticalSummary } from "#/lib/conta-generica/advanced-analysis"
import type { DerivedStats } from "#/lib/conta-generica/derived-stats"
import { getUgName } from "#/lib/conta-generica/helpers"

interface StrategicViewProps {
	topOdsByCount: DerivedStats["topOdsByCount"]
	topOsByCount: DerivedStats["topOsByCount"]
	totalInconsistencias: number
	totalFinancialImpact: number
	criticalSummary: CriticalSummary | null
}

function OdsDistribution({ topOdsByCount, totalInconsistencias }: Pick<StrategicViewProps, "topOdsByCount" | "totalInconsistencias">) {
	return (
		<div className="space-y-3">
			{topOdsByCount.map((ods, idx) => {
				const pct = ((ods.count / totalInconsistencias) * 100).toFixed(1)
				return (
					<div key={idx} className="flex flex-col gap-1">
						<div className="flex justify-between items-center text-body">
							<span className="font-bold text-foreground">{ods.ods}</span>
							<span className="font-bold text-foreground">
								{pct}% <span className="text-caption text-muted-foreground">({ods.count})</span>
							</span>
						</div>
						<div className="w-full bg-muted rounded-full h-2">
							<div className="bg-action h-2 rounded-full" style={{ width: `${pct}%` }} />
						</div>
					</div>
				)
			})}
		</div>
	)
}

function OsConcentration({ topOsByCount, totalInconsistencias }: Pick<StrategicViewProps, "topOsByCount" | "totalInconsistencias">) {
	return (
		<div className="space-y-3">
			{topOsByCount.slice(0, 5).map((os, idx) => {
				const pct = ((os.count / totalInconsistencias) * 100).toFixed(1)
				return (
					<div key={idx} className="flex justify-between items-center bg-muted/50 p-2 rounded-lg border border-border">
						<span className="text-subheading text-foreground">{os.os}</span>
						<span className="text-subheading text-foreground">{pct}%</span>
					</div>
				)
			})}
		</div>
	)
}

function CriticalLevels({ criticalSummary }: Pick<StrategicViewProps, "criticalSummary">) {
	return (
		<div className="space-y-4">
			{[
				{ label: "ODS com Maior Risco", value: criticalSummary?.ods },
				{ label: "Órgão Superior Crítico", value: criticalSummary?.os },
				{
					label: "UG Maior Concentração",
					value: `UG ${criticalSummary?.ugCount} (${getUgName(criticalSummary?.ugCount || "")})`,
				},
				{
					label: "UG Maior Saldo Irregular",
					value: `UG ${criticalSummary?.ugVolume} (${getUgName(criticalSummary?.ugVolume || "")})`,
				},
			].map(({ label, value }) => (
				<div key={label} className="bg-muted/50 p-4 rounded-lg border border-border">
					<p className="text-label text-muted-foreground mb-1">{label}</p>
					<p className="text-subheading text-foreground">{value}</p>
				</div>
			))}
		</div>
	)
}

/** Estratégica view */
export function StrategicView({ topOdsByCount, topOsByCount, totalInconsistencias, totalFinancialImpact, criticalSummary }: StrategicViewProps) {
	return (
		<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
			<div className="bg-card p-6 rounded-xl border border-border">
				<div className="flex items-center gap-2 mb-6">
					<TrendingUp className="w-5 h-5 text-warning" />
					<h3 className="text-heading text-foreground">Visão Estratégica (DIREF)</h3>
				</div>
				<div className="space-y-6">
					<div>
						<h4 className="text-label text-muted-foreground mb-3 flex items-center gap-2">
							<Landmark className="w-4 h-4" /> Distribuição por ODS (Risco Contábil)
						</h4>
						<OdsDistribution topOdsByCount={topOdsByCount} totalInconsistencias={totalInconsistencias} />
					</div>
					<div>
						<h4 className="text-label text-muted-foreground mb-3 flex items-center gap-2">
							<Building2 className="w-4 h-4" /> Concentração por Órgão Superior
						</h4>
						<OsConcentration topOsByCount={topOsByCount} totalInconsistencias={totalInconsistencias} />
					</div>
				</div>
			</div>

			{/* Decision support */}
			<div className="space-y-6">
				<StatTile
					icon={<DollarSign />}
					label="Impacto financeiro total"
					value={formatCurrency(totalFinancialImpact)}
					hint="volume total em risco contábil"
					status="success"
				/>

				{/* Era um painel escuro (`bg-surface-inverted`, `shadow-xl`, texto branco)
				    no meio de uma grade clara — o único do app. */}
				<div className="bg-card p-6 rounded-xl border border-border">
					<div className="flex items-center gap-2 mb-6">
						<AlertOctagon className="w-5 h-5 text-warning" />
						<h3 className="text-heading text-foreground">Níveis críticos</h3>
					</div>
					<CriticalLevels criticalSummary={criticalSummary} />
				</div>
			</div>
		</div>
	)
}
