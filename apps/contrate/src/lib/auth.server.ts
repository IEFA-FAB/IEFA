/**
 * @module auth.server
 * Guards das server functions do contrate.
 *
 * `/_serverFn/<id>` é endpoint HTTP cru: o `beforeLoad` protege a navegação, não o
 * endpoint. Toda fn que usa client service-role passa por um guard daqui.
 *
 * Autorização é PBAC (`@iefa/pbac`), a mesma dos demais apps: módulo `alpha` para o
 * copiloto e `alpha-admin` (nível 3) para gerir os acessos. As regras de negócio do
 * α (fila, triagem, parecer) moram na API do α, que resolve o mesmo PBAC; aqui só o
 * que é do próprio app — Pregoeiro e a tela de acessos.
 */

import type { UserContext } from "@iefa/pbac"
import { createRequestAuth, forbidden as denyWithStatus, unauthorized as unauthenticatedWithStatus } from "@iefa/pbac/start"
import { getAccessControlClient, getIefaAuthClient } from "./supabase.server"

export function unauthorized(): never {
	return unauthenticatedWithStatus("Não autenticado.")
}

export function forbidden(message = "Você não tem acesso a este recurso."): never {
	return denyWithStatus(message)
}

const auth = createRequestAuth({
	getAuthClient: getIefaAuthClient,
	getPermissionsClient: getAccessControlClient,
	messages: { unauthorized: "Não autenticado." },
})

export const { getRequestUser, requireUserId } = auth

/**
 * Exige que o alvo da operação seja o próprio usuário da sessão.
 *
 * O `userId` no payload é só comparado, nunca decide o alvo. Divergiu da sessão, é
 * IDOR: 403.
 */
export async function requireSelf(claimedUserId: string): Promise<string> {
	const userId = await requireUserId()
	if (claimedUserId !== userId) forbidden("Você só pode acessar os próprios dados.")
	return userId
}

/** Gate da gestão de acessos do α: `alpha-admin` nível 3. */
export function requireAlphaAdmin(): Promise<UserContext> {
	return auth.requireLevel("alpha-admin", 3)
}
