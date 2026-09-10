/**
 * Parecer do ACI (Etapa 1.8).
 *
 * A regra de quando um parecer pode ser emitido é decisão de produto e mora
 * aqui, pura: a rota só a aplica. O princípio é o do projeto — a máquina
 * aponta, o analista decide — mas decidir exige ter olhado: aprovar com achado
 * bloqueante SEM TRIAGEM seria assinar sem ler.
 */

import type { Severity } from "../compliance/severity.ts"
import type { Decision, Triage } from "./queue.ts"
import { isCritical } from "./queue.ts"

export const DECISIONS: readonly Decision[] = ["aprovado", "aprovado_com_ressalvas", "reprovado"]

export interface TriagedFinding {
	severity: Severity
	triage: Triage
}

export interface ReviewSnapshot {
	total: number
	acatados: number
	descartados: number
	sem_triagem: number
	acatados_por_severidade: Record<Severity, number>
}

/** Retrato dos achados no momento da emissão — gravado junto com o parecer. */
export function reviewSnapshot(findings: readonly TriagedFinding[]): ReviewSnapshot {
	const snapshot: ReviewSnapshot = {
		total: findings.length,
		acatados: 0,
		descartados: 0,
		sem_triagem: 0,
		acatados_por_severidade: { BLOQUEANTE: 0, GRAVE: 0, MEDIA: 0, INFORMATIVA: 0 },
	}

	for (const finding of findings) {
		if (finding.triage === "acatado") {
			snapshot.acatados += 1
			snapshot.acatados_por_severidade[finding.severity] += 1
		} else if (finding.triage === "descartado") snapshot.descartados += 1
		else snapshot.sem_triagem += 1
	}

	return snapshot
}

/**
 * Por que a decisão NÃO pode ser emitida. Vazio = pode.
 *
 * - Reprovar é sempre possível: é a decisão conservadora.
 * - Qualquer aprovação exige que todo achado crítico (BLOQUEANTE ou GRAVE) tenha
 *   sido triado. Achado MEDIA/INFORMATIVA sem triagem não trava — travar por
 *   ele obrigaria o analista a clicar em dezenas de achados informativos.
 * - Aprovar sem ressalvas exige nenhum achado crítico ACATADO.
 * - Aprovar com ressalvas tolera GRAVE acatado, mas não BLOQUEANTE: bloqueante
 *   é, por definição da escala, o que impede a contratação de seguir.
 */
export function decisionBlockers(findings: readonly TriagedFinding[], decision: Decision): string[] {
	if (decision === "reprovado") return []

	const blockers: string[] = []

	const criticalUntriaged = findings.filter((finding) => isCritical(finding.severity) && finding.triage === null).length
	if (criticalUntriaged > 0) {
		blockers.push(`${criticalUntriaged} achado(s) BLOQUEANTE/GRAVE ainda sem triagem`)
	}

	const blockingAccepted = findings.filter((finding) => finding.severity === "BLOQUEANTE" && finding.triage === "acatado").length
	if (blockingAccepted > 0) {
		blockers.push(`${blockingAccepted} achado(s) BLOQUEANTE acatado(s) — só cabe reprovação`)
	}

	if (decision === "aprovado") {
		const graveAccepted = findings.filter((finding) => finding.severity === "GRAVE" && finding.triage === "acatado").length
		if (graveAccepted > 0) {
			blockers.push(`${graveAccepted} achado(s) GRAVE acatado(s) — aprovação só com ressalvas`)
		}
	}

	return blockers
}
