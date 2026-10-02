/**
 * Leitura do histórico de execuções de uma submissão — o insumo de `run-policy.ts` — e o
 * encerramento das execuções que ficaram presas em `running`.
 *
 * Usado por quem MUDA o estado (disparar verificação, emitir parecer). A tela do processo
 * (`GET /aci/processes/:id`) já lê as execuções e os pareceres inteiros para exibir, e aplica a
 * mesma `decideComplianceRun` sobre eles.
 */

import { supabase } from "../db/supabase.ts"
import { isStaleRun, type RunRecord } from "./run-policy.ts"

export interface RunHistory {
	runs: RunRecord[]
	hasReview: boolean
}

/** Execuções da submissão e se alguma tem parecer. `null` = a leitura falhou (quem chama recusa). */
export async function loadRunHistory(submissionId: string): Promise<RunHistory | null> {
	const { data: runs, error } = await supabase.from("compliance_run").select("id, status, started_at").eq("submission_id", submissionId)
	if (error) {
		console.error(`[compliance] execuções da submissão ${JSON.stringify(submissionId)} não lidas: ${error.message}`)
		return null
	}
	const runIds = (runs ?? []).map((run) => run.id as string)
	if (runIds.length === 0) return { runs: [], hasReview: false }

	const { data: reviews, error: reviewsError } = await supabase.from("compliance_review").select("id").in("run_id", runIds).limit(1)
	if (reviewsError) {
		console.error(`[compliance] pareceres da submissão ${JSON.stringify(submissionId)} não lidos: ${reviewsError.message}`)
		return null
	}
	return { runs: (runs ?? []) as RunRecord[], hasReview: (reviews ?? []).length > 0 }
}

/**
 * Dá como falha a execução `running` além do prazo (o processo caiu no meio): pelo índice
 * único, ela seguraria a submissão para sempre — nem verificação nova, nem parecer.
 * Devolve o histórico com o status já corrigido.
 */
export async function reapStaleRuns(history: RunHistory, now: Date): Promise<RunHistory> {
	const stale = history.runs.filter((run) => isStaleRun(run, now)).map((run) => run.id)
	if (stale.length === 0) return history

	const { error } = await supabase.from("compliance_run").update({ status: "failed", finished_at: now.toISOString() }).in("id", stale).eq("status", "running")
	if (error) {
		console.error(`[compliance] execuções presas ${stale.join(", ")} não encerradas: ${error.message}`)
		return history
	}
	return { ...history, runs: history.runs.map((run) => (stale.includes(run.id) ? { ...run, status: "failed" } : run)) }
}

/** A execução mais recente da submissão (por início), ou `null`. */
export function latestRun(runs: readonly RunRecord[]): RunRecord | null {
	return runs.reduce<RunRecord | null>((latest, run) => (latest === null || run.started_at > latest.started_at ? run : latest), null)
}
