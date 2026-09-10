/**
 * @module evidence
 * A evidência citada num veredito existe mesmo no trecho analisado?
 *
 * O juiz devolve `evidence` como "trecho do documento que sustenta a constatação", e nada
 * conferia isso: a fundamentação era garantida pelo prompt e pelo guard de citação, que
 * olha a NORMA citada, não o DOCUMENTO. Um achado podia apontar inconformidade citando uma
 * frase que o ETP não contém — e quem lê o parecer não tem como perceber, porque a frase
 * parece do documento.
 *
 * A verificação é DETERMINÍSTICA, e não uma segunda chamada de modelo como o grader do
 * grafo. Lá a pergunta é "esta afirmação decorre destes documentos?", que é julgamento;
 * aqui é "este texto está neste bloco?", que é busca — e busca se resolve exatamente.
 *
 * Módulo puro de propósito: `verify.ts` importa `db/supabase`, e importá-lo de um teste
 * dispara a validação de ambiente na carga e derruba a suíte.
 */

import { locateSpan } from "../extraction/locate-span.ts"
import type { SourceSpan } from "../extraction/schema.ts"

/** O que o guard precisa saber de um veredito. */
export interface EvidenceClaim {
	status: "CONFORME" | "INCONFORME" | "NAO_AVALIADA"
	evidence: string | null
}

/** Onde a evidência aparece no bloco, ou `null` se não aparece. */
export function locateEvidence(claim: EvidenceClaim, blockText: string): SourceSpan | null {
	if (!claim.evidence) return null
	return locateSpan(blockText, claim.evidence)
}

/**
 * Motivo para descartar o achado por fundamentação, ou `null` para seguir.
 *
 * Só julga INCONFORME: `CONFORME` não vira achado, e barrar ali gastaria busca sem mudar
 * nada. Veredito sem evidência também passa — quem cobra isso é o guard de citação, com o
 * motivo próprio dele.
 */
export function evidenceGuardReason(claim: EvidenceClaim, blockText: string | undefined): "evidencia_nao_localizada" | null {
	if (claim.status !== "INCONFORME") return null
	if (blockText === undefined || !claim.evidence) return null

	return locateEvidence(claim, blockText) ? null : "evidencia_nao_localizada"
}
