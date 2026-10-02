/**
 * Quem pode disparar uma verificação de conformidade, e quando.
 *
 * Cada execução é uma chamada de modelo por regra ativa, e o chat e a etapa do processo leem
 * só a MAIS RECENTE. Sem regra, reexecutar até sair um resultado limpo apagava da vista o
 * resultado anterior — e cada tentativa custava dezenas de chamadas. A regra:
 *
 *   - com parecer emitido, a submissão está congelada: ninguém reexecuta (o parecer é peça
 *     do processo e se refere a uma execução; uma execução nova depois dele o contradiria);
 *   - uma execução em andamento por submissão (o banco garante com índice único parcial);
 *   - a primeira verificação concluída é de quem pode ler o processo; depois dela, só o ACI
 *     que cobre a OM reexecuta — e ele vê o histórico inteiro na tela do processo;
 *   - teto de execuções concluídas por submissão, para todos.
 *
 * Execução que falhou não conta: não produziu resultado para ser trocado.
 *
 * Pura: a rota (`api/compliance.ts`) aplica antes de cobrar o teto diário, e a tela do processo
 * (`api/aci.ts`) mostra a mesma decisão — o botão não promete o que a rota recusa.
 */

export type RunStatus = "running" | "succeeded" | "failed"

export interface RunRecord {
	id: string
	status: RunStatus | string
	started_at: string
}

/**
 * Execução `running` mais velha que isto é dada como perdida (processo reiniciado no meio, por
 * exemplo) e não segura mais a submissão. A verificação leva minutos; o ALB corta a resposta em
 * 60 s, mas o servidor segue até o fim.
 */
export const STALE_RUN_MS = 15 * 60 * 1000

export type RunRefusalCode = "COMPLIANCE_FROZEN" | "COMPLIANCE_RUN_IN_PROGRESS" | "COMPLIANCE_RERUN_ACI_ONLY" | "COMPLIANCE_RUN_LIMIT"

export type RunPolicy = { allowed: true } | { allowed: false; code: RunRefusalCode; message: string }

export function isStaleRun(run: RunRecord, now: Date): boolean {
	return run.status === "running" && now.getTime() - new Date(run.started_at).getTime() > STALE_RUN_MS
}

export function decideComplianceRun(input: { runs: readonly RunRecord[]; hasReview: boolean; canReview: boolean; maxRuns: number; now: Date }): RunPolicy {
	const { runs, hasReview, canReview, maxRuns, now } = input

	if (hasReview) {
		return { allowed: false, code: "COMPLIANCE_FROZEN", message: "a submissão já tem parecer; a verificação não se repete" }
	}
	if (runs.some((run) => run.status === "running" && !isStaleRun(run, now))) {
		return { allowed: false, code: "COMPLIANCE_RUN_IN_PROGRESS", message: "já há uma verificação em andamento para esta submissão" }
	}

	const succeeded = runs.filter((run) => run.status === "succeeded").length
	if (succeeded >= maxRuns) {
		return { allowed: false, code: "COMPLIANCE_RUN_LIMIT", message: `a submissão já foi verificada ${succeeded} vezes; o limite é ${maxRuns}` }
	}
	if (succeeded > 0 && !canReview) {
		return { allowed: false, code: "COMPLIANCE_RERUN_ACI_ONLY", message: "a verificação já foi feita; só o ACI que cobre a OM do processo pode repeti-la" }
	}
	return { allowed: true }
}

/**
 * A gravação da execução esbarrou numa trava do banco: outra execução começou no mesmo
 * instante (índice único parcial) ou um parecer foi emitido entre a conferência e o insert
 * (gatilho `compliance_run_frozen_guard`).
 */
export class ComplianceRunConflictError extends Error {
	readonly code: Extract<RunRefusalCode, "COMPLIANCE_FROZEN" | "COMPLIANCE_RUN_IN_PROGRESS">
	constructor(code: Extract<RunRefusalCode, "COMPLIANCE_FROZEN" | "COMPLIANCE_RUN_IN_PROGRESS">) {
		super(code === "COMPLIANCE_FROZEN" ? "a submissão já tem parecer; a verificação não se repete" : "já há uma verificação em andamento para esta submissão")
		this.name = "ComplianceRunConflictError"
		this.code = code
	}
}

/** Código Postgres de `unique_violation` e `check_violation`. */
const UNIQUE_VIOLATION = "23505"
const CHECK_VIOLATION = "23514"

/** Traduz o erro do insert em `compliance_run`; `null` = não é uma das travas. */
export function runInsertConflict(error: { code?: string; message?: string } | null): ComplianceRunConflictError | null {
	if (!error) return null
	if (error.code === UNIQUE_VIOLATION) return new ComplianceRunConflictError("COMPLIANCE_RUN_IN_PROGRESS")
	if (error.code === CHECK_VIOLATION && error.message?.includes("COMPLIANCE_FROZEN")) return new ComplianceRunConflictError("COMPLIANCE_FROZEN")
	return null
}
