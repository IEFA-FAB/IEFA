/**
 * Perfil do journal sob demanda.
 *
 * Desde 20260926218000 o cadastro do Auth não cria mais perfil (`journal.user_profiles`): ele
 * nasce quando a pessoa usa o journal, pelo formulário de perfil (`upsertUserProfileFn` →
 * `journal.save_user_profile`, papel `author`). Até lá, a leitura do perfil devolve `null` e a
 * submissão fica bloqueada; o painel editorial mostra a submissão sem nome.
 */

export const JOURNAL_PROFILE_REQUIRED_MESSAGE = "Complete seu perfil no journal antes de submeter."

export const MISSING_SUBMITTER_NAME = "Perfil não preenchido"

/** Nome do submissor para o painel editorial; sem perfil (ou nome em branco), o aviso. */
export function displaySubmitterName(name: string | null | undefined): string {
	const trimmed = name?.trim()
	return trimmed ? trimmed : MISSING_SUBMITTER_NAME
}
