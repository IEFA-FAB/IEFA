/**
 * Derivações puras do detalhe do anexo quantitativo (`unit/$unitId/quantity-estimates/$quantityEstimateId`).
 */

import { roundToCents } from "@iefa/sisub-domain/money"
import type { ProcurementNeed } from "@iefa/sisub-domain/types"
import { buildDraftAnnexRows, buildSnapshotAnnexRows, type QuantityEstimateAnnexRow, type QuantityEstimateAnnexSettings } from "@/lib/quantity-estimate-annex"
import type { QuantityEstimateWithDetails } from "@/types/domain/quantity-estimate"

export const STATUS_LABELS: Record<string, string> = {
	draft: "Rascunho",
	completed: "Concluído",
	archived: "Arquivado",
}

export const STATUS_VARIANTS: Record<string, "secondary" | "default" | "outline"> = {
	draft: "secondary",
	completed: "default",
	archived: "outline",
}

export const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

export function buildAnnexSettings(quantityEstimate: QuantityEstimateWithDetails | null | undefined): QuantityEstimateAnnexSettings | null {
	return quantityEstimate
		? {
				validityMonths: quantityEstimate.validity_months,
				maxIncreasePercent: quantityEstimate.max_increase_percent,
				maxQuantityJustification: quantityEstimate.max_quantity_justification,
				minQuotePercent: Number(quantityEstimate.min_quote_percent ?? 100),
			}
		: null
}

/**
 * Rascunho calcula na hora; concluído mostra o que o snapshot congelou — nunca recalcula
 * um documento concluído com a regra ou a conservação de hoje.
 */
export function selectAnnexRows(
	quantityEstimate: QuantityEstimateWithDetails | null | undefined,
	needs: ProcurementNeed[],
	annexSettings: QuantityEstimateAnnexSettings | null
): QuantityEstimateAnnexRow[] {
	if (!quantityEstimate || !annexSettings) return []
	if (quantityEstimate.status === "draft") return buildDraftAnnexRows(needs, annexSettings)
	return quantityEstimate.meta.snapshot ? buildSnapshotAnnexRows(quantityEstimate.meta.snapshot.components, quantityEstimate.items) : []
}

/** A trava real é do servidor na conclusão; aqui só evita o clique que já sabemos que falha. */
export function isJustificationMissing(
	quantityEstimate: Pick<QuantityEstimateWithDetails, "status" | "max_quantity_justification"> | null | undefined,
	annexRows: Pick<QuantityEstimateAnnexRow, "warnings">[]
): boolean {
	return (
		quantityEstimate?.status === "draft" &&
		annexRows.some((r) => r.warnings.includes("increase_requires_justification")) &&
		!quantityEstimate.max_quantity_justification?.trim()
	)
}

/** Há preço em algum item, e o total estimado (só dos itens com preço). */
export function summarizePrices(items: { unit_price: number | string | null; estimated_quantity: number | string }[]): {
	hasPrices: boolean
	grandTotal: number
} {
	const hasPrices = items.some((item) => item.unit_price !== null)
	// soma as linhas fechadas em centavo, como o anexo e a tabela de itens mostram cada uma
	const grandTotal = roundToCents(
		items.reduce((sum, item) => sum + (item.unit_price !== null ? roundToCents(Number(item.estimated_quantity) * Number(item.unit_price)) : 0), 0)
	)
	return { hasPrices, grandTotal }
}
