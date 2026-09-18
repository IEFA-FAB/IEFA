/**
 * Autorização por submissão.
 *
 * Documento submetido é contratação em elaboração, e os achados carregam
 * trechos literais dele. Toda rota que devolve submissão, extração ou parecer
 * passa por aqui.
 *
 * **Allow-list, não deny-list.** Lê o autor e quem tem papel de leitura na OM da submissão
 * (requisitante, licitações ou ACI que a cobrem pela hierarquia de apoio). Usuário sem papel
 * — o estado de quem acabou de se cadastrar — só lê o que ele mesmo enviou.
 *
 * A decisão é pura (`decideSubmissionRead`/`decideSubmissionReview`, em `alpha-access.ts`);
 * aqui mora só a leitura do dono e da OM, sempre a partir da linha persistida — nunca do que
 * o cliente mandou.
 *
 * Falha de leitura NEGA (e fica no log): responder "pode" por não ter conseguido conferir
 * seria abrir o documento de outra OM por instabilidade do banco.
 */

import type { User } from "@supabase/supabase-js"
import { supabase } from "../db/supabase.ts"
import { type AlphaAccess, decideSubmissionRead, decideSubmissionReview, READER_ROLES, type SubmissionOwnership, unitsFor } from "../lib/alpha-access.ts"

/** Autor e OM da submissão, ou `null` se não existe (ou não pôde ser lida). */
async function loadSubmissionOwnership(submissionId: string): Promise<SubmissionOwnership | null> {
	const { data, error } = await supabase.from("submission").select("user_id, unit_id").eq("id", submissionId).maybeSingle()
	if (error) {
		console.error(`[authorize] submissão ${submissionId} não lida: ${error.message}`)
		return null
	}
	return (data as SubmissionOwnership | null) ?? null
}

/** Submissão de origem de uma execução de conformidade — o parecer não tem dono próprio. */
async function loadRunSubmissionId(runId: string): Promise<string | null> {
	const { data, error } = await supabase.from("compliance_run").select("submission_id").eq("id", runId).maybeSingle()
	if (error) {
		console.error(`[authorize] execução ${runId} não lida: ${error.message}`)
		return null
	}
	return (data?.submission_id as string | undefined) ?? null
}

/** O usuário pode ler esta submissão? */
export async function canReadSubmission(submissionId: string, user: User, access: AlphaAccess): Promise<boolean> {
	// Papel global de leitura alcança tudo: não há o que conferir, e a rota devolve 404 se
	// a submissão não existir.
	if (unitsFor(access, ...READER_ROLES) === "all") return true

	const ownership = await loadSubmissionOwnership(submissionId)
	// Submissão inexistente não é autorizada aqui: 403, sem revelar se o id existe.
	return ownership !== null && decideSubmissionRead(access, user.id, ownership)
}

/**
 * O usuário pode ler esta execução de conformidade?
 *
 * A permissão é a da submissão de origem — o parecer não tem dono próprio.
 */
export async function canReadComplianceRun(runId: string, user: User, access: AlphaAccess): Promise<boolean> {
	if (unitsFor(access, ...READER_ROLES) === "all") return true

	const submissionId = await loadRunSubmissionId(runId)
	if (!submissionId) return false

	return canReadSubmission(submissionId, user, access)
}

/**
 * O usuário pode triar e emitir parecer nesta execução? Só o ACI que cobre a OM da
 * submissão de origem.
 *
 * Antes do escopo por OM, triagem e parecer só conferiam o NÍVEL do usuário — nunca de quem
 * era o processo. Com os papéis escopados, isso deixaria o ACI de uma OM decidir o processo
 * de qualquer outra.
 */
export async function canReviewComplianceRun(runId: string, access: AlphaAccess): Promise<boolean> {
	if (access.roles.aci === "all") return true

	const submissionId = await loadRunSubmissionId(runId)
	if (!submissionId) return false

	const ownership = await loadSubmissionOwnership(submissionId)
	return ownership !== null && decideSubmissionReview(access, ownership)
}

/** O usuário pode triar este achado? A regra é a da execução a que ele pertence. */
export async function canTriageFinding(findingId: string, access: AlphaAccess): Promise<boolean> {
	if (access.roles.aci === "all") return true

	const { data, error } = await supabase.from("compliance_finding").select("run_id").eq("id", findingId).maybeSingle()
	if (error) {
		console.error(`[authorize] achado ${findingId} não lido: ${error.message}`)
		return false
	}
	if (!data?.run_id) return false

	return canReviewComplianceRun(data.run_id as string, access)
}

/**
 * A extração pertence mesmo à submissão informada?
 *
 * Sem esta checagem, quem tem uma submissão própria consegue rodar conformidade
 * apontando para a extração de outro usuário, e o parecer resultante exibiria
 * trechos do documento alheio.
 */
export async function extractionBelongsToSubmission(extractionId: string, submissionId: string): Promise<boolean> {
	const { data } = await supabase.from("extraction").select("submission_id").eq("id", extractionId).maybeSingle()

	return data?.submission_id === submissionId
}

/**
 * O usuário pode usar esta sessão de conversa?
 *
 * Aqui não vale perfil amplo: sessão de chat é rascunho pessoal, não peça do
 * processo, e o ACI não tem por que ler a conversa de outro servidor. A regra é
 * dono ou ninguém.
 *
 * Sessão sem nenhum registro em `query_log` é thread recém-criado pelo próprio
 * cliente — ainda não tem dono, e negar impediria a primeira mensagem.
 */
export async function canAccessSession(sessionId: string, user: User): Promise<boolean> {
	const { data } = await supabase.from("query_log").select("user_id").eq("session_id", sessionId).limit(1).maybeSingle()
	if (!data) return true

	return data.user_id === user.id
}
