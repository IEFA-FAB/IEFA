import type { AnalysisRun } from "@iefa/database/sucont"
import { AlertTriangle, Clock, FolderOpen, Loader2, RotateCw } from "lucide-react"

interface DgcRunHistoryProps {
	runs: AnalysisRun[]
	activeRunId: string | null
	loadingRunId: string | null
	onOpen: (runId: string) => void
	/** Consulta em voo: distingue "ainda não sei" de "não há rodada". */
	isLoading?: boolean
	/** Mensagem da falha de leitura, ou null. Vazio e falha são telas diferentes. */
	error?: string | null
	onRetry?: () => void
}

/**
 * Rodadas já gravadas. Existe porque uma competência são ~69 chamadas ao modelo:
 * sem isto, reabrir o resultado significa pagar a rodada inteira de novo.
 *
 * Os três estados são distintos de propósito. A versão anterior devolvia `null`
 * sempre que a lista chegava vazia — e como a falha de leitura caía no mesmo
 * ramo, uma consulta que morreu no meio do caminho apagava o histórico da tela
 * sem dizer nada. O operador concluía que as rodadas tinham sumido e refazia a
 * competência inteira no modelo.
 */
export function DgcRunHistory({ runs, activeRunId, loadingRunId, onOpen, isLoading = false, error = null, onRetry }: DgcRunHistoryProps) {
	// Falha primeiro: sem rodada por erro não é o mesmo que sem rodada.
	if (error) {
		return (
			<section className="bg-card border border-border rounded-xl overflow-hidden">
				<Header />
				<div className="px-6 py-5 flex items-start gap-3">
					<AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
					<div className="min-w-0 flex-1">
						<p className="text-sm font-semibold text-foreground">Não foi possível ler as rodadas gravadas.</p>
						<p className="text-[11px] text-muted-foreground mt-0.5 break-words">{error}</p>
						<p className="text-[11px] text-muted-foreground mt-1">O histórico continua no banco — o que falhou foi a consulta.</p>
					</div>
					{onRetry && (
						<button
							type="button"
							onClick={onRetry}
							className="inline-flex items-center gap-1.5 shrink-0 px-4 py-2 rounded-lg border border-border text-muted-foreground text-[11px] font-bold uppercase tracking-wider transition-colors hover:border-tech-cyan hover:text-tech-cyan"
						>
							<RotateCw className="w-3.5 h-3.5" />
							Tentar de novo
						</button>
					)}
				</div>
			</section>
		)
	}

	if (isLoading) {
		return (
			<section className="bg-card border border-border rounded-xl overflow-hidden">
				<Header />
				<div className="px-6 py-5 flex items-center gap-2 text-muted-foreground">
					<Loader2 className="w-3.5 h-3.5 animate-spin" />
					<span className="text-[11px] font-bold uppercase tracking-wider">Carregando rodadas…</span>
				</div>
			</section>
		)
	}

	// Vazio real: primeira competência do usuário. Nada a mostrar ainda.
	if (runs.length === 0) return null

	return (
		<section className="bg-card border border-border rounded-xl overflow-hidden">
			<Header />
			<ul className="divide-y divide-border">
				{runs.map((run) => (
					<li key={run.id} className="px-6 py-3 flex items-center justify-between gap-4">
						<div className="min-w-0">
							<p className="text-sm font-semibold text-foreground">{run.period || "competência não identificada"}</p>
							<p className="text-[11px] text-muted-foreground">
								{run.records_count ?? 0} UG(s) · {new Date(run.created_at).toLocaleString("pt-BR")}
							</p>
						</div>
						<button
							type="button"
							onClick={() => onOpen(run.id)}
							disabled={loadingRunId !== null}
							className="inline-flex items-center gap-1.5 shrink-0 px-4 py-2 rounded-lg border border-border text-muted-foreground text-[11px] font-bold uppercase tracking-wider transition-colors hover:border-tech-cyan hover:text-tech-cyan disabled:opacity-40"
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

function Header() {
	return (
		<header className="px-6 py-4 border-b border-border flex items-center gap-2">
			<Clock className="w-4 h-4 text-muted-foreground" />
			<h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Rodadas gravadas</h3>
		</header>
	)
}
