/**
 * Perfil do journal sob demanda.
 *
 * Desde 20260926218000 o cadastro do Auth não cria mais perfil (`journal.user_profiles`): ele
 * nasce quando a pessoa usa o journal, pelo formulário de perfil (`upsertUserProfileFn` →
 * `journal.save_user_profile`, papel `author`). Até lá a leitura do perfil devolve `null`, a
 * submissão fica bloqueada e o painel editorial mostra a submissão sem nome.
 *
 * Módulo sem env: o cliente entra por parâmetro, para ser testado com um cliente falso.
 */

import { safeRedirect } from "@iefa/auth-kit"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { UserRole } from "./types"

export const JOURNAL_PROFILE_REQUIRED_MESSAGE = "Complete seu perfil no journal antes de submeter."

export const MISSING_SUBMITTER_NAME = "Perfil não preenchido"

/** O que as barreiras do journal precisam saber do perfil. */
export type JournalProfileAccess = { id: string; role: UserRole }

/**
 * A leitura do perfil do journal, única para os guards (`isEditor`, `requireJournalProfile`) e
 * para o papel atual (`readCurrentRole`). `null` = a pessoa ainda não tem perfil. Erro de leitura
 * sempre lança: tratar como "sem perfil" negaria acesso (ou liberaria o onboarding) por uma
 * falha do banco, sem ninguém saber.
 */
export async function fetchJournalProfile(db: Pick<SupabaseClient, "from">, userId: string): Promise<JournalProfileAccess | null> {
	const { data, error } = await db.from("user_profiles").select("id, role").eq("id", userId).maybeSingle()
	if (error) throw new Error(`Falha ao ler o perfil do journal: ${error.message}`)
	return (data as JournalProfileAccess | null) ?? null
}

/** Nome do submissor para o painel editorial; sem perfil (ou nome em branco), o aviso. */
export function displaySubmitterName(name: string | null | undefined): string {
	const trimmed = name?.trim()
	return trimmed ? trimmed : MISSING_SUBMITTER_NAME
}

/**
 * Para onde voltar depois de salvar o perfil: só caminho interno do journal. Qualquer outra
 * coisa (URL absoluta, `//host`, rota de fora) é ignorada — o `next` vem da barra de endereço.
 */
export function resolveProfileNext(next: unknown): string | undefined {
	const path = safeRedirect(next)
	return path?.startsWith("/journal/") ? path : undefined
}

export type SubmitPrerequisites<P, D> =
	| { status: "needs-profile"; redirect: { to: "/journal/profile"; search: { next: string } } }
	| { status: "ready"; profile: P; draft: D }

/**
 * O que a rota de submissão carrega, na ordem: o perfil primeiro; sem ele, manda para o
 * formulário de perfil com a volta marcada (`next`) e nem busca o rascunho.
 */
export async function loadSubmitPrerequisites<P, D>(deps: {
	readProfile: () => Promise<P | null>
	readDraft: () => Promise<D>
	next: string
}): Promise<SubmitPrerequisites<P, D>> {
	const profile = await deps.readProfile()
	if (!profile) return { status: "needs-profile", redirect: { to: "/journal/profile", search: { next: deps.next } } }
	return { status: "ready", profile, draft: await deps.readDraft() }
}
