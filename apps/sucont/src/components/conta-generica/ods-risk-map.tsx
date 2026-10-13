// Extraído de routes/conta-generica.tsx (port do analistacontagenerica): tabela do
// mapa de risco por ODS, comum às visões estratégica e tática.
import { Compass } from "lucide-react"
import { formatCurrency } from "#/lib/analista/types"
import type { OdsRisk } from "#/lib/conta-generica/advanced-analysis"

/** ODS Risk Map (both views) */
export function OdsRiskMapCard({ odsRiskMap }: { odsRiskMap: OdsRisk[] }) {
	return (
		<div className="mt-8 bg-card p-6 rounded-xl border border-border">
			<div className="flex items-center justify-between mb-6">
				<div className="flex items-center gap-2">
					<Compass className="w-5 h-5 text-foreground" />
					<h3 className="text-heading text-foreground">Mapa de Risco por ODS</h3>
				</div>
				<span className="text-label text-muted-foreground">Distribuição do Risco</span>
			</div>
			<div className="overflow-x-auto">
				<table className="w-full text-left">
					<thead className="bg-muted/50 border-b border-border text-label text-muted-foreground">
						<tr>
							{["ODS", "Inconsistências", "Saldo Associado", "% Total"].map((h) => (
								<th key={h} className={`px-4 py-3 ${h !== "ODS" ? "text-center" : ""} ${h === "Saldo Associado" || h === "% Total" ? "text-right" : ""}`}>
									{h}
								</th>
							))}
						</tr>
					</thead>
					<tbody className="divide-y divide-border">
						{odsRiskMap.map((item, idx) => (
							<tr key={idx} className="hover:bg-muted/50 transition-colors">
								<td className="py-4 font-bold text-foreground">{item.ods}</td>
								<td className="py-4 text-center font-bold text-muted-foreground">{item.count}</td>
								<td className="py-4 text-right font-bold text-success">{formatCurrency(item.volume)}</td>
								<td className="py-4 text-right">
									<span className={`px-2 py-1 rounded text-hint ${idx === 0 ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}>
										{item.percentage}%
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	)
}
