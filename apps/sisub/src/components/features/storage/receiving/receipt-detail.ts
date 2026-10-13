/**
 * Derivações puras da conferência de recebimento (`storage/$kitchenId/receiving/$receiptId`).
 */

import {
	CONSERVATION_CLASSES,
	CONSERVATION_LABELS,
	type ConservationClass,
	conservationDivergence,
	isTemperatureOutOfRange,
	RECEIPT_SOURCE_LABELS,
	type ReceiptLotDraft,
	type ReceiptSource,
	temperatureVerdict,
} from "@iefa/sisub-domain"

export const NUM = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 })

/** Mesmo vocabulário da lista de recebimentos — o enum cru ("draft") vazava para a tela. */
export const RECEIPT_STATUS_LABEL: Record<string, string> = {
	draft: "Rascunho",
	provisional: "Provisório",
	definitive: "Definitivo",
	divergent: "Divergente",
	rejected: "Rejeitado",
}

export type TemperatureRangeC = { minC: number | null; maxC: number | null }

export function requiredRange(conditioning: { storage_temp_min_c: number | null; storage_temp_max_c: number | null } | null): TemperatureRangeC {
	return {
		minC: conditioning?.storage_temp_min_c != null ? Number(conditioning.storage_temp_min_c) : null,
		maxC: conditioning?.storage_temp_max_c != null ? Number(conditioning.storage_temp_max_c) : null,
	}
}

type ReceiptHeaderLike = {
	status: string
	source: string
	delivery_note_number: string | null
	supplier_name: string | null
	definitive_at: string | null
	rejected_at: string | null
}

/** "Origem nº · fornecedor" do cabeçalho e do termo impresso. */
export function describeReceiptSource(receipt: Pick<ReceiptHeaderLike, "source" | "delivery_note_number" | "supplier_name">): string {
	const source = receipt.source
	return `${RECEIPT_SOURCE_LABELS[source as ReceiptSource] ?? source}${receipt.delivery_note_number ? ` ${receipt.delivery_note_number}` : ""}${receipt.supplier_name ? ` · ${receipt.supplier_name}` : ""}`
}

/** Provisório (ou divergente) ainda não efetivado: a efetivação é única. */
export function isAwaitingDefinitive(receipt: Pick<ReceiptHeaderLike, "status" | "definitive_at">): boolean {
	return (receipt.status === "provisional" || receipt.status === "divergent") && receipt.definitive_at == null
}

/** Etapa que ainda não tem designado para conferir. */
export function resolveNeedsDesignation(
	status: string,
	awaitingDefinitive: boolean,
	designation: { provisional: unknown; definitive: unknown }
): "provisional" | "definitive" | null {
	return status === "draft" && designation.provisional == null ? "provisional" : awaitingDefinitive && designation.definitive == null ? "definitive" : null
}

export function describeReceiptHeader(receipt: Pick<ReceiptHeaderLike, "status" | "rejected_at">, sourceText: string): string {
	return `Situação: ${RECEIPT_STATUS_LABEL[receipt.status] ?? receipt.status} · ${sourceText}${
		receipt.rejected_at ? ` · Recusado em ${new Date(receipt.rejected_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""
	}`
}

export function getReceiptPrintTitle(status: string): string {
	return status === "rejected" ? "Termo de Recusa de Recebimento" : `Termo de Recebimento — ${status === "definitive" ? "Definitivo" : "Provisório"}`
}

/** Quantos itens exigem cada classe de conservação. */
export function tallyConservation(items: { conditioning: { conservation_class: ConservationClass | null } | null }[]): Record<string, number> {
	return items.reduce<Record<string, number>>((tally, item) => {
		const cls = item.conditioning?.conservation_class
		if (cls) tally[cls] = (tally[cls] ?? 0) + 1
		return tally
	}, {})
}

// ── Lote em edição ─────────────────────────────────────────────────────────

type LotLike = {
	lot_code: string
	expiry_date: string | null
	quantity_base: number
	measured_temperature_c: number | null
	conservation_class: ConservationClass | null
	divergence_note: string | null
}

/** Valores iniciais dos campos do lote; o rascunho de inclusão começa vazio com a classe sugerida. */
export function buildInitialLotFields(lot: LotLike | null, suggested: ConservationClass | null) {
	return {
		code: lot?.lot_code ?? "",
		expiry: lot?.expiry_date ?? "",
		quantity: lot != null ? String(lot.quantity_base) : "",
		temperature: lot?.measured_temperature_c != null ? String(lot.measured_temperature_c) : "",
		conservation: lot?.conservation_class ?? suggested,
		note: lot?.divergence_note ?? "",
	}
}

/** Divergência de classe e veredito da temperatura medida. */
export function evaluateLot(suggested: ConservationClass | null, conservation: ConservationClass | null, temperature: string, range: TemperatureRangeC) {
	const classDivergence = conservationDivergence(suggested, conservation)
	// A faixa sugerida é a da classe sugerida: chegou em outra, ela não se aplica.
	const effectiveRange = classDivergence ? { minC: null, maxC: null } : range
	const measured = temperature.trim() === "" ? null : Number(temperature)
	const verdict = temperatureVerdict(measured, effectiveRange)
	const outOfRange = isTemperatureOutOfRange(verdict)
	return { classDivergence, measured, verdict, outOfRange }
}

/** Sem classe sugerida, "Não declarada" é opção; com ela, só as classes. */
export function buildConservationItems(suggested: ConservationClass | null): { value: ConservationClass | null; label: string }[] {
	return [
		...(suggested ? [] : [{ value: null, label: "Não declarada" }]),
		...CONSERVATION_CLASSES.map((value) => ({ value, label: CONSERVATION_LABELS[value] })),
	]
}

export function getLotRowClassName(outOfRange: boolean, classDivergence: string | null): string | undefined {
	return outOfRange ? "bg-destructive/5" : classDivergence ? "bg-warning/5" : undefined
}

export function buildLotDrafts(lots: LotLike[]): ReceiptLotDraft[] {
	return lots.map((lot) => ({
		lotCode: lot.lot_code,
		expiryDate: lot.expiry_date,
		quantityBase: Number(lot.quantity_base),
		measuredTemperatureC: lot.measured_temperature_c != null ? Number(lot.measured_temperature_c) : null,
	}))
}
