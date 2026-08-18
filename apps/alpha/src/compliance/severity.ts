/**
 * Severidade dos achados.
 *
 * Concentrada num módulo puro porque é o que ordena o relatório e, na prática,
 * o que decide o que o ACI olha primeiro. Mudar essa escala é decisão de
 * produto, não detalhe de implementação espalhado pelo código.
 */

import type { MatchStatus } from "./match-sections.ts"

export type Severity = "BLOQUEANTE" | "GRAVE" | "MEDIA" | "INFORMATIVA"

export const SEVERITY_ORDER: Record<Severity, number> = {
	BLOQUEANTE: 0,
	GRAVE: 1,
	MEDIA: 2,
	INFORMATIVA: 3,
}

/**
 * Severidade de um achado estrutural.
 *
 * Seção obrigatória ausente é o único caso grave: o modelo da AGU declara
 * aquela seção como exigida, então sua falta é uma lacuna concreta. Seção
 * opcional ausente, seção extra e renomeação são informativas — apontar cada
 * desvio de redação como problema afogaria o analista em ruído.
 */
export function structuralSeverity(status: MatchStatus, isRequired: boolean): Severity | null {
	switch (status) {
		case "MISSING":
			return isRequired ? "GRAVE" : "INFORMATIVA"
		case "OUT_OF_ORDER":
			return "MEDIA"
		case "RENAMED":
		case "EXTRA":
			return "INFORMATIVA"
		default:
			return null
	}
}

export function compareSeverity(left: Severity, right: Severity): number {
	return SEVERITY_ORDER[left] - SEVERITY_ORDER[right]
}
