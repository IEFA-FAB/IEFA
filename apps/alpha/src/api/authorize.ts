/**
 * Autorização por submissão.
 *
 * Documento submetido é contratação em elaboração, e os achados carregam
 * trechos literais dele. Toda rota que devolve submissão, extração ou parecer
 * passa por aqui.
 *
 * **Allow-list, não deny-list.** A versão anterior negava apenas
 * `app_requisitante`; qualquer usuário sem `app_metadata.role` — que é o
 * estado de quem acabou de se cadastrar — passava direto e lia a submissão de
 * qualquer um. Só perfil explicitamente amplo tem acesso além do próprio.
 */

import type { User } from "@supabase/supabase-js"
import { supabase } from "../db/supabase.ts"
import type { AppRole } from "../middleware/auth.ts"

/** Perfis que enxergam o fluxo inteiro, por definição de negócio. */
const PERFIS_AMPLOS: ReadonlyArray<AppRole> = ["app_aci", "app_licitacoes"]

export function hasBroadAccess(role: AppRole | undefined): boolean {
	return role !== undefined && PERFIS_AMPLOS.includes(role)
}

/** O usuário pode ler esta submissão? */
export async function canReadSubmission(submissionId: string, user: User, role: AppRole | undefined): Promise<boolean> {
	if (hasBroadAccess(role)) return true

	const { data } = await supabase.from("submission").select("user_id").eq("id", submissionId).maybeSingle()

	// Submissão inexistente não é autorizada aqui: a rota devolve 404 depois.
	return data?.user_id === user.id
}

/**
 * O usuário pode ler esta execução de conformidade?
 *
 * A permissão é a da submissão de origem — o parecer não tem dono próprio.
 */
export async function canReadComplianceRun(runId: string, user: User, role: AppRole | undefined): Promise<boolean> {
	if (hasBroadAccess(role)) return true

	const { data } = await supabase.from("compliance_run").select("submission_id").eq("id", runId).maybeSingle()
	if (!data?.submission_id) return false

	return canReadSubmission(data.submission_id, user, role)
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
