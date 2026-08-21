/**
 * @module sacdgc/request
 * Contrato do pedido de análise entre a tela e a rota SSE.
 *
 * As planilhas são lidas no navegador (como no Auditor e no Cruzamento de Contas):
 * o servidor não guarda a base, recebe apenas o recorte da UG que vai ao modelo.
 * Este módulo não pode importar nada de servidor — a tela também o usa.
 */

import { z } from "zod"
import { MAX_GROUP_CONTEXT_CHARS, MAX_UG_CHARS } from "#/sacdgc/parser"
import type { DgcBase, UgDataset } from "#/sacdgc/types"

/** Folga sobre o teto do recorte: cabe o aviso de corte anexado pelo parser. */
const CONSOLIDATED_LIMIT = MAX_UG_CHARS + 512
const GROUP_CONTEXT_LIMIT = MAX_GROUP_CONTEXT_CHARS + 512

export const dgcAnalysisRequestSchema = z.object({
	ugCode: z.string().trim().min(1).max(40),
	ugName: z.string().trim().min(1).max(200),
	group: z.string().trim().min(1).max(60),
	competence: z.string().trim().max(200).default(""),
	panelsFound: z.array(z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])).max(4),
	rowCount: z.object({ 1: z.number().int().min(0), 2: z.number().int().min(0), 3: z.number().int().min(0), 4: z.number().int().min(0) }),
	consolidated: z.string().min(1).max(CONSOLIDATED_LIMIT),
	truncated: z.boolean(),
	groupContext: z.string().max(GROUP_CONTEXT_LIMIT).default(""),
})

export type DgcAnalysisRequest = z.infer<typeof dgcAnalysisRequestSchema>

/** Monta o corpo do pedido a partir do recorte já produzido pelo parser. */
export function toAnalysisRequest(dataset: UgDataset, base: Pick<DgcBase, "competence" | "panelsFound">, groupContext: string): DgcAnalysisRequest {
	return {
		ugCode: dataset.ugCode,
		ugName: dataset.ugName,
		group: dataset.group,
		competence: base.competence,
		panelsFound: base.panelsFound,
		rowCount: dataset.rowCount,
		consolidated: dataset.consolidated,
		truncated: dataset.truncated,
		groupContext,
	}
}
