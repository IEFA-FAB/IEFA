/**
 * @module mfa-availability.server
 * Recusa de server function quando a verificação em duas etapas está no modo `off`.
 *
 * Nos modos `optional` e `enforced` a funcionalidade existe e este guard não faz nada — quem
 * decide se alguém PRECISA de segundo fator é `MFA_ENFORCEMENT_ALLOWED`, não esta função.
 *
 * @domain app
 */

import { setResponseStatus } from "@tanstack/react-start/server"
import { MFA_AVAILABLE } from "@/lib/assurance/mfa-availability"

export const MFA_UNAVAILABLE_MESSAGE = "A verificação em duas etapas ainda não está disponível."

/**
 * Lança quando `MFA_AVAILABLE` é falso (modo `off`).
 *
 * 503, e não 403 ou 404: a rota existe e o usuário pode ter permissão — é o recurso que está
 * fora do ar, no mesmo espírito dos fluxos de IA sem configuração (`capabilities.server.ts`).
 * Vai na PRIMEIRA linha do handler, antes até do guard de autenticação: não toca banco nem
 * sessão, então não custa nada recusar cedo.
 */
export function assertMfaAvailable(): void {
	if (MFA_AVAILABLE) return
	setResponseStatus(503)
	throw new Error(MFA_UNAVAILABLE_MESSAGE)
}
