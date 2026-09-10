/**
 * @module identity
 * Como uma pessoa é NOMEADA nas telas do sucont.
 *
 * O app conhece três nomes para a mesma pessoa, em ordem de utilidade decrescente:
 * a identificação militar (`posto` + `nomeGuerra`, vinda de `core.user_military_data`
 * pelo SARAM), o e-mail institucional e, no fim, o `userId` do Supabase. A tela de
 * acessos mostrava só o último quando os dois primeiros faltavam — quatro linhas,
 * três delas um UUID, e nenhuma forma de saber de quem era o acesso.
 *
 * Puro de propósito: a escolha do rótulo é regra de apresentação, testável sem
 * banco, e o mesmo par (principal, secundário) serve a lista de acessos e a busca
 * de concessão.
 */

export type PersonIdentity = {
	userId: string
	/** E-mail institucional. `null` quando a pessoa não existe em `core.user_data`. */
	email: string | null
	/** SARAM vinculado à conta. `null` enquanto a pessoa não o informa. */
	nrOrdem: string | null
	/** Sigla do posto/graduação (`sgPosto`), ex.: "1T", "3S". */
	posto: string | null
	/** Nome de guerra (`nmGuerra`). */
	nomeGuerra: string | null
}

/**
 * Identificação militar formatada — `"1T NANNI"`, ou só o nome de guerra quando o
 * posto não veio. `null` quando não há nome de guerra: um posto solto ("1T") não
 * identifica ninguém.
 */
export function formatMilitaryName(identity: Pick<PersonIdentity, "posto" | "nomeGuerra">): string | null {
	const nomeGuerra = identity.nomeGuerra?.trim()
	if (!nomeGuerra) return null
	const posto = identity.posto?.trim()
	return posto ? `${posto} ${nomeGuerra}` : nomeGuerra
}

/**
 * Rótulo principal e complemento de uma pessoa.
 *
 * O principal nunca é vazio — na pior das hipóteses é o `userId`, que é feio mas
 * identifica; "—" faria a linha parecer corrompida. O complemento só existe quando
 * acrescenta informação: repetir o principal embaixo dele é ruído.
 */
export function describePerson(identity: PersonIdentity): { primary: string; secondary: string | null } {
	const militaryName = formatMilitaryName(identity)
	const email = identity.email?.trim() || null
	const nrOrdem = identity.nrOrdem?.trim() || null

	if (militaryName) return { primary: militaryName, secondary: email ?? (nrOrdem && `SARAM ${nrOrdem}`) ?? null }
	if (email) return { primary: email, secondary: nrOrdem ? `SARAM ${nrOrdem}` : null }
	if (nrOrdem) return { primary: `SARAM ${nrOrdem}`, secondary: null }
	return { primary: identity.userId, secondary: null }
}
