import { cn } from "@/lib/utils"

export type Escolha = {
	id: string
	OM: string
	chosen: number
	total: number
	state: string
}

/** Quadro de vagas para projeção — alto contraste, legível à distância. */
export function VacancyBoard({ data }: { data: Escolha[] }) {
	const totalVagas = data.reduce((acc, e) => acc + e.total, 0)
	const totalChosen = data.reduce((acc, e) => acc + Math.min(e.chosen, e.total), 0)

	return (
		<div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-2xl backdrop-blur-sm">
			<div className="flex items-baseline justify-between border-b border-white/10 px-6 py-4">
				<h2 className="text-xl font-semibold tracking-wide text-white/90">Quadro de Vagas</h2>
				<span className="font-mono text-sm text-white/50">
					{totalChosen}/{totalVagas} preenchidas
				</span>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto">
				<table className="w-full">
					<thead className="sticky top-0 bg-slate-950/80 backdrop-blur">
						<tr className="text-white/40">
							<th className="px-6 py-2 text-left text-xs font-semibold uppercase tracking-widest">OM</th>
							<th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-widest">Escolhidos</th>
							<th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-widest">Vagas</th>
							<th className="px-6 py-2 text-right text-xs font-semibold uppercase tracking-widest">Status</th>
						</tr>
					</thead>
					<tbody>
						{data.map((e) => {
							const full = e.chosen >= e.total && e.total > 0
							const empty = e.chosen === 0
							const pct = e.total > 0 ? Math.min(100, (e.chosen / e.total) * 100) : 0
							return (
								<tr key={e.id} className={cn("border-b border-white/5 transition-colors", full ? "bg-amber-400/[0.06]" : "hover:bg-white/[0.03]")}>
									<td className="px-6 py-2.5">
										<div className="flex items-center gap-3">
											<span className={cn("text-lg font-bold tracking-tight", full ? "text-amber-300" : "text-white")}>{e.OM}</span>
											<div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-white/10 sm:block">
												<div
													className={cn("h-full rounded-full transition-all", full ? "bg-amber-400" : empty ? "bg-white/20" : "bg-emerald-400")}
													style={{ width: `${pct}%` }}
												/>
											</div>
										</div>
									</td>
									<td className="px-2 py-2.5 text-center text-lg font-bold tabular-nums text-white/90">{e.chosen}</td>
									<td className="px-2 py-2.5 text-center text-lg font-medium tabular-nums text-white/50">{e.total}</td>
									<td className="px-6 py-2.5 text-right">
										<span
											className={cn(
												"inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
												full ? "bg-amber-400/15 text-amber-300" : empty ? "bg-white/5 text-white/40" : "bg-emerald-400/15 text-emerald-300"
											)}
										>
											<span className={cn("size-1.5 rounded-full", full ? "bg-amber-400" : empty ? "bg-white/30" : "bg-emerald-400")} />
											{full ? "Completa" : empty ? "Aberta" : "Parcial"}
										</span>
									</td>
								</tr>
							)
						})}
						{data.length === 0 && (
							<tr>
								<td colSpan={4} className="px-6 py-16 text-center text-white/40">
									Nenhuma vaga cadastrada nesta edição.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</div>
	)
}
