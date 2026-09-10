/**
 * Parecer do ACI (Etapa 1.8).
 *
 * A regra de quando um parecer pode ser emitido é decisão de produto e mora
 * aqui, pura: a rota só a aplica, e o trigger `alpha.compliance_review_guard`
 * a repete dentro do insert para fechar a corrida entre checagem e gravação.
 * O princípio é o do projeto — a máquina aponta, o analista decide — mas
 * decidir exige ter olhado: aprovar com achado bloqueante SEM TRIAGEM seria
 * assinar sem ler.
 */

import type { Severity } from "../compliance/severity.ts"
import { type Decision, emptySeverityCounts, isCritical, type Triage } from "./queue.ts"

export interface TriagedFinding {
	id: string
	severity: Severity
	triage: Triage
	triage_note: string | null
}

/**
 * Retrato dos achados no momento da emissão — gravado junto com o parecer.
 *
 * Leva a triagem de CADA achado, não só contagens: é o que permite ao relatório
 * final mostrar o que o analista assinou mesmo que alguém re-trie um achado
 * depois. A regra de emissão lê daqui, então o que foi julgado e o que foi
 * gravado são, por construção, o mesmo objeto.
 */
export interface ReviewSnapshot {
	total: number
	accepted: number
	discarded: number
	untriaged: number
	accepted_by_severity: Record<Severity, number>
	untriaged_by_severity: Record<Severity, number>
	findings: TriagedFinding[]
}

export function reviewSnapshot(findings: readonly TriagedFinding[]): ReviewSnapshot {
	const snapshot: ReviewSnapshot = {
		total: findings.length,
		accepted: 0,
		discarded: 0,
		untriaged: 0,
		accepted_by_severity: emptySeverityCounts(),
		untriaged_by_severity: emptySeverityCounts(),
		findings: findings.map((finding) => ({ id: finding.id, severity: finding.severity, triage: finding.triage, triage_note: finding.triage_note })),
	}

	for (const finding of findings) {
		if (finding.triage === "acatado") {
			snapshot.accepted += 1
			snapshot.accepted_by_severity[finding.severity] += 1
		} else if (finding.triage === "descartado") snapshot.discarded += 1
		else {
			snapshot.untriaged += 1
			snapshot.untriaged_by_severity[finding.severity] += 1
		}
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
export function decisionBlockers(snapshot: ReviewSnapshot, decision: Decision): string[] {
	if (decision === "reprovado") return []

	const blockers: string[] = []

	const criticalUntriaged = (Object.keys(snapshot.untriaged_by_severity) as Severity[])
		.filter(isCritical)
		.reduce((sum, severity) => sum + snapshot.untriaged_by_severity[severity], 0)
	if (criticalUntriaged > 0) {
		blockers.push(`${criticalUntriaged} achado(s) BLOQUEANTE/GRAVE ainda sem triagem`)
	}

	const blockingAccepted = snapshot.accepted_by_severity.BLOQUEANTE
	if (blockingAccepted > 0) {
		blockers.push(`${blockingAccepted} achado(s) BLOQUEANTE acatado(s) — só cabe reprovação`)
	}

	if (decision === "aprovado") {
		const graveAccepted = snapshot.accepted_by_severity.GRAVE
		if (graveAccepted > 0) {
			blockers.push(`${graveAccepted} achado(s) GRAVE acatado(s) — aprovação só com ressalvas`)
		}
	}

	return blockers
}

/** Bloqueios de cada decisão possível, para a tela mostrar antes do clique. */
export function blockersByDecision(snapshot: ReviewSnapshot): Record<Decision, string[]> {
	return {
		aprovado: decisionBlockers(snapshot, "aprovado"),
		aprovado_com_ressalvas: decisionBlockers(snapshot, "aprovado_com_ressalvas"),
		reprovado: decisionBlockers(snapshot, "reprovado"),
	}
}
