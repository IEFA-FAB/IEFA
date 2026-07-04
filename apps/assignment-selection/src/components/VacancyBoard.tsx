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
			<div className="flex items-baseline justify-between border-b border-white/10 px-7 py-4">
				<h2 className="text-3xl font-bold tracking-wide text-white/95">Quadro de Vagas</h2>
				<span className="font-mono text-lg text-white/55">
					{totalChosen}/{totalVagas} preenchidas
				</span>
			</div>

			<div className="min-h-0 flex-1 overflow-hidden">
				<table className="h-full w-full">
					<thead className="bg-slate-950/85 backdrop-blur">
						<tr className="text-white/45">
							<th className="px-7 py-2.5 text-left text-sm font-semibold uppercase tracking-widest">OM</th>
							<th className="px-2 py-2.5 text-center text-sm font-semibold uppercase tracking-widest">Escolhidos</th>
							<th className="px-2 py-2.5 text-center text-sm font-semibold uppercase tracking-widest">Vagas</th>
							<th className="px-7 py-2.5 text-right text-sm font-semibold uppercase tracking-widest">Status</th>
						</tr>
					</thead>
					<tbody>
						{data.map((e) => {
							const full = e.chosen >= e.total && e.total > 0
							const empty = e.chosen === 0
							const pct = e.total > 0 ? Math.min(100, (e.chosen / e.total) * 100) : 0
							return (
								<tr key={e.id} className={cn("border-b border-white/5 transition-colors", full ? "bg-amber-400/[0.07]" : "hover:bg-white/[0.03]")}>
									<td className="px-7 py-1">
										<div className="flex items-center gap-4">
											<span className={cn("whitespace-nowrap text-2xl font-black tracking-tight", full ? "text-amber-300" : "text-white")}>{e.OM}</span>
											<div className="hidden h-2 w-24 overflow-hidden rounded-full bg-white/10 md:block">
												<div
													className={cn("h-full rounded-full transition-all", full ? "bg-amber-400" : empty ? "bg-white/20" : "bg-emerald-400")}
													style={{ width: `${pct}%` }}
												/>
											</div>
										</div>
									</td>
									<td className="px-2 py-1 text-center text-2xl font-black tabular-nums text-white">{e.chosen}</td>
									<td className="px-2 py-1 text-center text-xl font-medium tabular-nums text-white/45">{e.total}</td>
									<td className="px-7 py-1 text-right">
										<span
											className={cn(
												"inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-base font-semibold",
												full ? "bg-amber-400/15 text-amber-300" : empty ? "bg-white/5 text-white/45" : "bg-emerald-400/15 text-emerald-300"
											)}
										>
											<span className={cn("size-2.5 rounded-full", full ? "bg-amber-400" : empty ? "bg-white/30" : "bg-emerald-400")} />
											{full ? "Completa" : empty ? "Aberta" : "Parcial"}
										</span>
									</td>
								</tr>
							)
						})}
						{data.length === 0 && (
							<tr>
								<td colSpan={4} className="px-6 py-16 text-center text-lg text-white/40">
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
