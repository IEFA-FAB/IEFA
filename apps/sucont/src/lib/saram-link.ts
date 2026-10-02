/**
 * Erros do vínculo de SARAM (`core.link_own_saram`, migration 20261001100200) → frase para a tela.
 *
 * As duas travas mandam para a administração do SISTEMA, como `syncUserSaram` no sisub, e não
 * para o administrador do SUCONT: o console do sucont não mexe em SARAM (a correção é manual, no
 * banco). Token desconhecido (queda de conexão, timeout) não vai cru para a tela.
 */
const SARAM_LINK_ERRORS: Record<string, string> = {
	SARAM_LOCKED: "O SARAM já está vinculado à sua conta e não pode ser alterado por aqui. Para corrigi-lo, procure a administração do sistema.",
	SARAM_TAKEN: "Este SARAM já está vinculado a outra conta. Se ele é seu, procure a administração do sistema.",
	// Outra linha, de outro `id`, já detém este endereço. Reivindicá-lo apagaria o cadastro de
	// outra pessoa (o sisub faz isso deliberadamente; aqui não).
	EMAIL_TAKEN: "Seu e-mail já está registrado em outra conta do ERP. Procure o administrador do SUCONT.",
	USER_DATA_NOT_FOUND: "Sua conta ainda não está no cadastro de pessoas do ERP. Procure o administrador do SUCONT.",
	SARAM_INVALID: "O SARAM tem 6 ou 7 dígitos.",
}

export const SARAM_LINK_FALLBACK_MESSAGE = "Não foi possível salvar o SARAM. Tente de novo."

export function saramLinkErrorMessage(raw: string | null | undefined): string {
	return SARAM_LINK_ERRORS[(raw ?? "").trim()] ?? SARAM_LINK_FALLBACK_MESSAGE
}
