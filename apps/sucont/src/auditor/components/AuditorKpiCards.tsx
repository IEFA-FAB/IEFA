// Extraído de routes/auditor.tsx (port do SIAFI-x-SILOMS-Auditor): cartões de KPI e ICC.

import { Activity, AlertTriangle, Layers, LayoutDashboard } from "lucide-react"
import { HealthScoreGauge } from "#/auditor/components/HealthScoreGauge"
import { StatCard } from "#/auditor/components/StatCard"
import type { KpiStats, TrendSeries } from "#/auditor/services/dashboard"
import { formatCurrency } from "#/auditor/services/dataProcessor"
import { iccColor, iccLabel } from "#/auditor/theme"

interface AuditorKpiCardsProps {
	stats: KpiStats
	trendSeries: TrendSeries
}

export function AuditorKpiCards({ stats, trendSeries }: AuditorKpiCardsProps) {
	return (
		<div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 pt-2">
			<StatCard
				title="Divergência Total"
				value={stats.totalDiff}
				subtitle="Diferença Absoluta"
				icon={AlertTriangle}
				bgClass="bg-destructive"
				trendData={trendSeries.diff}
				variation={`${Math.abs(stats.diffVar).toFixed(1)}% vs período anterior`}
				isPositive={stats.diffVar < 0}
			/>
			<StatCard
				title="Saldo SIAFI"
				value={stats.totalSiafi}
				subtitle="Contábil (Completo)"
				icon={LayoutDashboard}
				bgClass="bg-surface-inverted-border/50"
				trendData={trendSeries.siafi}
				variation={`${Math.abs(stats.siafiVar).toFixed(1)}% vs período anterior`}
				isPositive={stats.siafiVar >= 0}
			/>
			<StatCard
				title="Saldo SILOMS"
				value={stats.totalSiloms}
				subtitle="Físico (Completo)"
				icon={Layers}
				bgClass="bg-surface-inverted-border/50"
				trendData={trendSeries.siloms}
				variation={`${Math.abs(stats.silomsVar).toFixed(1)}% vs período anterior`}
				isPositive={stats.silomsVar >= 0}
			/>
			<StatCard
				title="Maior Divergência"
				value={stats.topOffender?.ug || "-"}
				subtitle={stats.topOffender ? formatCurrency(stats.topOffender.difference) : "-"}
				icon={AlertTriangle}
				bgClass=""
				iconColor={iccColor(stats.topOffenderICC)}
				variation={iccLabel(stats.topOffenderICC)}
				isPositive={stats.topOffenderICC >= 80}
			/>

			{/* ICC Card */}
			{/*
			  `min-h`, e não `h`: o cabeçalho quebra em três linhas na coluna estreita
			  do `lg:grid-cols-5` e o arco pede 100px logo abaixo — em altura fixa de
			  140px com `overflow-hidden` o medidor saía cortado, sem o rótulo da faixa.
			  Os `StatCard` ao lado usam o mesmo mínimo, e a linha do grid iguala a
			  altura pelo cartão mais alto.
			*/}
			<div
				className={`bg-card border-border hover:bg-muted/50 rounded-xl shadow-sm border p-4 flex flex-col justify-between transition-all group overflow-hidden relative min-h-[140px]`}
			>
				<div className="flex justify-between items-start relative z-10">
					<div className="flex-1">
						<p className="text-label text-muted-foreground mb-0.5">ICC</p>
						<h3 className="text-subheading text-foreground">Indicador de Conciliação Contábil</h3>
					</div>
					<div className="w-10 h-10 rounded-lg bg-action flex items-center justify-center flex-shrink-0 ml-2">
						<Activity className="w-5 h-5 text-action-foreground" />
					</div>
				</div>
				<div className="mt-1 flex-1 flex items-center justify-center">
					<HealthScoreGauge score={stats.healthScore} />
				</div>
			</div>
		</div>
	)
}
