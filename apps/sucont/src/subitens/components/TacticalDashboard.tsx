// Extraído de routes/subitens-genericos.tsx (port do sucontsubitem): nível tático do painel.
import { motion } from "motion/react"
import type { CountSaldoSummary } from "#/subitens/dashboard"
import type { UgGroup } from "#/subitens/types"
import { formatUgName } from "#/subitens/ug"

interface TacticalDashboardProps {
	odsList: CountSaldoSummary[]
	orgaoSuperiorList: CountSaldoSummary[]
	topUgsByInconsistencias: UgGroup[]
}

export function TacticalDashboard({ odsList, orgaoSuperiorList, topUgsByInconsistencias }: TacticalDashboardProps) {
	return (
		<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
			<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
				{[
					{ title: "Ranking de ODS por Inconsistências", data: odsList, key: "count", suffix: "ocorrências" },
					{ title: "Ranking de Órgãos Superiores", data: orgaoSuperiorList, key: "count", suffix: "ocorrências" },
				].map((ranking) => (
					<div key={ranking.title} className="bg-card p-8 rounded-xl border border-border shadow-sm">
						<h3 className="text-heading text-foreground mb-6">{ranking.title}</h3>
						<div className="space-y-4">
							{ranking.data.map((item, idx) => (
								<div key={item.name} className="flex items-center justify-between p-4 bg-muted/50 rounded-xl border border-border">
									<div className="flex items-center gap-4">
										<span className="text-heading text-warning">{idx + 1}º</span>
										<span className="font-bold text-foreground">{item.name}</span>
									</div>
									<span className="text-body font-mono text-muted-foreground">
										{(item as { count: number }).count} {ranking.suffix}
									</span>
								</div>
							))}
						</div>
					</div>
				))}

				<div className="bg-card p-8 rounded-xl border border-border shadow-sm">
					<h3 className="text-heading text-foreground mb-6">Top 10 UGs com Mais Inconsistências</h3>
					<div className="space-y-3">
						{topUgsByInconsistencias.map((ug, idx) => (
							<div key={ug.ug} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl border border-border">
								<div className="flex items-center gap-3">
									<span className="text-subheading text-warning w-6">{idx + 1}º</span>
									<span className="font-mono text-body text-foreground">{formatUgName(ug.ug)}</span>
								</div>
								<span className="text-caption text-muted-foreground">{ug.occurrences.length} ocorrências</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</motion.div>
	)
}
