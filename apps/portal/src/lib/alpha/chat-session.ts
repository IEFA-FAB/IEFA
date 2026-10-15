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
 *
 * O valor guardado não é confiável (qualquer script da origem ou a própria pessoa o reescreve):
 * fora do formato de UUID ele é descartado na leitura e recusado na escrita. Sem isso, um id
 * corrompido virava chamada autenticada ao α e um 404 a cada abertura da tela.
 */

import { isAlphaId } from "./chat"

const LS_SESSION_ID = (userId: string) => `rada_session_id:${userId}`

export function loadSessionId(userId: string): string | null {
	try {
		const stored = localStorage.getItem(LS_SESSION_ID(userId))
		if (stored === null || isAlphaId(stored)) return stored
		localStorage.removeItem(LS_SESSION_ID(userId))
		return null
	} catch {
		return null
	}
}

export function saveSessionId(userId: string, id: string) {
	if (!isAlphaId(id)) return
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
