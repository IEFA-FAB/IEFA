import type { AnalysisRun } from "@iefa/database/sucont"
import { Clock, FolderOpen, Loader2 } from "lucide-react"

interface DgcRunHistoryProps {
	runs: AnalysisRun[]
	activeRunId: string | null
	loadingRunId: string | null
	onOpen: (runId: string) => void
}

/**
 * Rodadas já gravadas. Existe porque uma competência são ~69 chamadas ao modelo:
 * sem isto, reabrir o resultado significa pagar a rodada inteira de novo.
 */
export function DgcRunHistory({ runs, activeRunId, loadingRunId, onOpen }: DgcRunHistoryProps) {
	if (runs.length === 0) return null

	return (
		<section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
			<header className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
				<Clock className="w-4 h-4 text-slate-400" />
				<h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Rodadas gravadas</h3>
			</header>
			<ul className="divide-y divide-slate-100">
				{runs.map((run) => (
					<li key={run.id} className="px-6 py-3 flex items-center justify-between gap-4">
						<div className="min-w-0">
							<p className="text-sm font-semibold text-slate-800">{run.period || "competência não identificada"}</p>
							<p className="text-[11px] text-slate-500">
								{run.records_count ?? 0} UG(s) · {new Date(run.created_at).toLocaleString("pt-BR")}
							</p>
						</div>
						<button
							type="button"
							onClick={() => onOpen(run.id)}
							disabled={loadingRunId !== null}
							className="inline-flex items-center gap-1.5 shrink-0 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-bold uppercase tracking-wider transition-colors hover:border-tech-cyan hover:text-tech-cyan disabled:opacity-40"
						>
							{loadingRunId === run.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderOpen className="w-3.5 h-3.5" />}
							{activeRunId === run.id ? "Rodada atual" : "Abrir"}
						</button>
					</li>
				))}
			</ul>
		</section>
	)
}
