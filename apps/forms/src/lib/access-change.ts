/**
 * Regras PURAS da concessão de acesso a questionário — visualizadores de respostas (com as
 * regras de escopo por OM) e editores.
 *
 * ## Auditoria
 *
 * Conceder, alterar e retirar esse acesso passa pelas funções SQL `forms.add_response_viewer`,
 * `forms.update_response_viewer_policy`, `forms.remove_response_viewer`,
 * `forms.add_questionnaire_editor` e `forms.remove_questionnaire_editor` (migration
 * 20260921130000): a escrita e a linha de `access_control.sensitive_operation_log` entram na
 * MESMA transação, com o ator da SESSÃO. Antes, o visualizador e as regras de escopo dele eram
 * duas escritas soltas — um visualizador podia nascer "global" e perder a regra no meio do
 * caminho, vendo tudo — e nada registrava quem concedeu. Desde 20260921130100 o banco recusa
 * escrita direta nessas tabelas.
 *
 * ## Quem pode conceder a si mesmo
 *
 * O criador administra o questionário inteiro; o editor administra os visualizadores, mas é
 * administração ESCOPADA (ele não é dono). Pela regra do mantenedor (`assertGrantable`), quem
 * administra de forma escopada não concede nem altera acesso a si mesmo — um editor não se
 * torna visualizador das respostas por conta própria. O criador já vê tudo, então também não
 * há o que conceder a ele.
 */

/** Frases para a tela, pelos tokens estáveis que as funções SQL levantam. */
const ACCESS_ERROR_MESSAGES: Record<string, string> = {
	VIEWER_ALREADY_EXISTS: "Este usuário já é um visualizador",
	EDITOR_ALREADY_EXISTS: "Este usuário já é um editor",
	VIEWER_NOT_FOUND: "Visualizador não encontrado neste questionário — a lista pode estar desatualizada",
	EDITOR_NOT_FOUND: "Editor não encontrado neste questionário — a lista pode estar desatualizada",
	QUESTIONNAIRE_NOT_FOUND: "Questionário não encontrado",
	ACCESS_ACTOR_NOT_FOUND: "Sua conta não foi encontrada no cadastro de usuários; a alteração não foi feita",
	ACCESS_CHANGE_INVALID: "Regra de acesso inválida",
	ACCESS_CHANGE_UNAUDITED: "O banco recusou uma alteração de acesso fora do caminho auditado. Nada foi gravado — avise a administração do sistema",
}

/**
 * Erro da RPC → erro com a frase da tela. O SQL cru segue em `cause` (log do servidor), nunca
 * na mensagem.
 */
export function toFormsAccessError(error: { message?: string; code?: string }): Error {
	const token = error.message ?? ""
	return new Error(ACCESS_ERROR_MESSAGES[token] ?? "Falha ao alterar o acesso. Confira a lista antes de tentar de novo", { cause: error })
}

/** Por que a concessão sobre si mesmo é recusada — ou `null` quando não é sobre si mesmo. */
export type SelfViewerRefusal = "CREATOR_ALREADY_SEES" | "SCOPED_ADMIN_SELF"

/**
 * A concessão/alteração de acesso de visualizador é SOBRE SI MESMO e deve ser recusada?
 * Retirar o próprio acesso de visualizador continua permitido (não passa por aqui): não
 * tranca ninguém. Pura — quem lança (e com que status) é a server function.
 */
export function selfViewerGrantRefusal(actorId: string, viewerUserId: string, actorIsCreator: boolean): SelfViewerRefusal | null {
	if (actorId !== viewerUserId) return null
	return actorIsCreator ? "CREATOR_ALREADY_SEES" : "SCOPED_ADMIN_SELF"
}

export const SELF_VIEWER_MESSAGES: Record<SelfViewerRefusal, string> = {
	CREATOR_ALREADY_SEES: "Você já é o criador do questionário",
	SCOPED_ADMIN_SELF: "Só o criador do questionário concede ou altera o seu acesso às respostas. Peça ao criador.",
}
