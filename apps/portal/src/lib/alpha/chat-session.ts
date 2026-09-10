/**
 * Sessão corrente do ChatRADA, por usuário, em `localStorage`.
 *
 * Extraído da tela do chat para que a Plataforma ACI consiga abrir uma
 * conversa específica: ela grava o id aqui e navega para `/chatRada`, que lê
 * na montagem. Sem isto a plataforma só conseguiria listar as conversas, sem
 * levar o analista até nenhuma.
 *
 * A chave carrega o usuário: numa máquina compartilhada, a sessão do anterior
 * seria reenviada pelo seguinte e o α responderia 403 em `canAccessSession`,
 * com erro genérico.
 */

const LS_SESSION_ID = (userId: string) => `rada_session_id:${userId}`

export function loadSessionId(userId: string): string | null {
	try {
		return localStorage.getItem(LS_SESSION_ID(userId))
	} catch {
		return null
	}
}

export function saveSessionId(userId: string, id: string) {
	try {
		localStorage.setItem(LS_SESSION_ID(userId), id)
	} catch {
		// noop
	}
}

export function clearSessionId(userId: string) {
	try {
		localStorage.removeItem(LS_SESSION_ID(userId))
	} catch {
		// noop
	}
}
