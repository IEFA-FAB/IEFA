/**
 * Uma sessão de recuperação autentica o usuário — mas ele ainda não fez o que
 * veio fazer: falta trocar a senha. Os guards de "já está autenticado, manda
 * para dentro" (`beforeLoad` de `/auth`, listener de auth) não distinguem os
 * dois casos e levam o usuário embora do formulário, com a senha antiga
 * intacta e nenhuma mensagem. Este módulo é o sinal que falta.
 *
 * Módulo, e não estado de React, porque quem consulta é o `beforeLoad` das
 * rotas — que roda fora da árvore de componentes.
 */

let recovering = false

/** Chamado pelo listener de auth ao receber PASSWORD_RECOVERY. */
export function markPasswordRecovery(): void {
	recovering = true
}

/** Chamado quando a nova senha foi gravada — a recuperação acabou. */
export function clearPasswordRecovery(): void {
	recovering = false
}

export function isPasswordRecovery(): boolean {
	return recovering
}

/**
 * Evidência de recuperação na própria URL, para o primeiro load — aí ainda não
 * houve evento nenhum que pudesse ter levantado a flag.
 *
 * `?code=` conta porque nenhum destes apps tem login por OAuth: o único code
 * que chega aqui é o do PKCE da recuperação.
 */
export function urlLooksLikeRecovery(): boolean {
	if (typeof window === "undefined") return false
	const search = new URLSearchParams(window.location.search)
	const hash = new URLSearchParams(window.location.hash.slice(1))
	return search.has("code") || search.get("type") === "recovery" || hash.get("type") === "recovery" || hash.has("access_token")
}
