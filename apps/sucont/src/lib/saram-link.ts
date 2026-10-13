/**
 * Erros do vínculo de SARAM (funções `core.*` da migration 20261003100000) → frase para a tela.
 *
 * As frases são as do sisub (`@iefa/database/saram-link`): a mesma recusa diz a mesma coisa nos
 * dois apps. Ficam aqui só as duas que são do sucont (o cadastro de pessoas do ERP é mantido pelo
 * administrador do SUCONT). Token desconhecido (queda de conexão, timeout) não vai cru para a tela.
 */

import { SARAM_ERROR_MESSAGES, SARAM_FALLBACK_ERROR_MESSAGE } from "@iefa/database/saram-link"

const SUCONT_ERRORS: Record<string, string> = {
	// Outra linha, de outro `id`, já detém este endereço. Reivindicá-lo apagaria o cadastro de
	// outra pessoa (o sisub faz isso deliberadamente; aqui não).
	EMAIL_TAKEN: "Seu e-mail já está registrado em outra conta do ERP. Procure o administrador do SUCONT.",
	USER_DATA_NOT_FOUND: "Sua conta ainda não está no cadastro de pessoas do ERP. Procure o administrador do SUCONT.",
}

export const SARAM_LINK_FALLBACK_MESSAGE = SARAM_FALLBACK_ERROR_MESSAGE

export function saramLinkErrorMessage(raw: string | null | undefined): string {
	const token = (raw ?? "").trim()
	return SUCONT_ERRORS[token] ?? (SARAM_ERROR_MESSAGES as Record<string, string>)[token] ?? SARAM_LINK_FALLBACK_MESSAGE
}
