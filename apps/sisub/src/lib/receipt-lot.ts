/**
 * Lote da linha do recebimento (`receiving.fn.ts`): o julgamento do lote contra a especificação
 * (classe, temperatura, validade) e as linhas que vão para `goods_receipt_item_lot`.
 *
 * Nada aqui lê nem grava: a fn lê a especificação, decide com estas funções e escreve. Fica fora
 * de `receiving.fn.ts` porque teste unitário não importa `@/server/*`.
 */

import {
	type ConservationClass,
	composeLotDivergence,
	conservationDivergence,
	getBrasiliaToday,
	isTemperatureOutOfRange,
	shelfLifeDivergence,
	temperatureDivergenceReason,
	temperatureVerdict,
} from "@iefa/sisub-domain/operations"
import { publicDbMessage } from "@/lib/db-error-message"
import type { RequiredRange } from "@/lib/receipt-spec"

/** Data (Brasília) em que a carga chegou: a criação do recebimento. É contra ela que se mede a validade. */
export function arrivalDate(receiptCreatedAt: string | null | undefined): string {
	return getBrasiliaToday(receiptCreatedAt ? new Date(receiptCreatedAt) : new Date())
}

export interface LotAssessmentInput {
	spec: RequiredRange
	/** Classe em que o lote chegou; nula = a sugerida. */
	received: ConservationClass | null
	measured: number | null
	expiryDate: string | null
	/** Dia em que a carga chegou (`arrivalDate`). */
	arrival: string
	divergenceNote: string | null | undefined
}

/**
 * O lote contra a especificação. Nada bloqueia o que chegou diferente do sugerido: cada desvio
 * vira uma frase do motivo. `temperatureReason` só existe quando a temperatura saiu da faixa —
 * é a frase da recusa enquanto o aceite não vier.
 */
export function assessLot(input: LotAssessmentInput) {
	const classReason = conservationDivergence(input.spec.conservationClass, input.received, input.measured)
	// Chegou em outra classe: a faixa sugerida era a da classe sugerida, não a desta. A
	// temperatura medida vai na frase da classe, para quem fiscaliza julgar.
	const range = classReason ? { minC: null, maxC: null } : input.spec
	const verdict = temperatureVerdict(input.measured, range)
	const outOfRange = isTemperatureOutOfRange(verdict)
	const temperatureReason = outOfRange ? temperatureDivergenceReason(input.measured as number, range) : null
	const divergence = composeLotDivergence(
		[
			classReason,
			temperatureReason,
			// Contra o dia em que a carga CHEGOU: editar o lote dias depois não pode torná-lo divergente.
			shelfLifeDivergence(input.expiryDate, input.arrival, input.spec.minShelfLifeDays),
		],
		input.divergenceNote
	)
	return { verdict, outOfRange, temperatureReason, divergence }
}

export interface LotFields {
	receiptItemId: string
	lotCode: string
	expiryDate?: string | null
	quantityBase: number
	unitCost?: number | null
	divergenceNote?: string | null
}

/** A linha de `goods_receipt_item_lot` que a conferência grava (insert ou update). */
export function buildLotPayload(
	fields: LotFields,
	lot: { measured: number | null; received: ConservationClass | null; divergence: string | null; outOfRange: boolean },
	userId: string
) {
	return {
		receipt_item_id: fields.receiptItemId,
		lot_code: fields.lotCode.trim(),
		expiry_date: fields.expiryDate ?? null,
		quantity_base: fields.quantityBase,
		unit_cost: fields.unitCost ?? null,
		measured_temperature_c: lot.measured,
		// Gravada sempre que informada — igual à sugerida inclusive. Nula só quando ninguém
		// escolheu; aí a efetivação usa a da especificação. Assim o lote de estoque recebe
		// exatamente o que a tela mostrou, sem depender de as duas resoluções coincidirem.
		conservation_class: lot.received,
		divergence_note: fields.divergenceNote?.trim() || null,
		divergence_reason: lot.divergence,
		temperature_ack_by: lot.outOfRange ? userId : null,
		temperature_ack_at: lot.outOfRange ? new Date().toISOString() : null,
	}
}

/** Erro da escrita do lote: o código repetido na linha tem frase própria. */
export function createLotWriteError(error: { code?: string; message: string }, lotCode: string): Error {
	return error.code === "23505" ? new Error(`Lote "${lotCode}" já lançado nesta linha`) : new Error(`Erro ao gravar lote: ${publicDbMessage(error)}`)
}

/** Linha do recebimento criada da NF-e, com o rastro de lote/validade da nota. */
export interface InvoiceLotSource {
	row: { purchase_item_id: string | null; item_id: string }
	lotCode: string | null
	expiryDate: string | null
}

/** A linha da NF-e de onde o item inserido veio. */
export function findInvoiceLotSource<S>(nfeItemId: string | null, byNfeItem: ReadonlyMap<string, S>): S | undefined {
	return nfeItemId ? byNfeItem.get(nfeItemId) : undefined
}

/**
 * Lote inicial com o rastro da nota. Sem código de lote na nota, um sintético por posição; a
 * validade que veio na nota é julgada contra o mínimo da especificação (EST-REC-05).
 */
export function buildInitialInvoiceLot(
	item: { id: string; received_qty_base: number; unit_cost: number | null },
	source: InvoiceLotSource | undefined,
	position: { index: number; today: string },
	minShelfLifeDays: number | null
) {
	const expiryDate = source?.expiryDate ?? null
	return {
		receipt_item_id: item.id,
		lot_code: source?.lotCode?.trim() || `SEM-LOTE-${position.today}-${position.index + 1}`,
		expiry_date: expiryDate,
		quantity_base: Number(item.received_qty_base),
		unit_cost: item.unit_cost,
		divergence_reason: shelfLifeDivergence(expiryDate, position.today, minShelfLifeDays),
	}
}

/** Lote e validade da entrega sem nota: só existe update quando a linha trouxe um dos dois. */
export function hasLotInfo(line: { lotCode?: string | null; expiryDate?: string | null }): boolean {
	return !!line.lotCode?.trim() || !!line.expiryDate
}

/**
 * O que a entrega sem nota grava no lote sem código que a conferência criou. Sem código
 * informado, o código sintético fica.
 */
export function buildLotUpdateFromLine(line: { lotCode?: string | null; expiryDate?: string | null }, arrival: string, minShelfLifeDays: number | null) {
	return {
		...(line.lotCode?.trim() ? { lot_code: line.lotCode.trim() } : {}),
		expiry_date: line.expiryDate ?? null,
		divergence_reason: shelfLifeDivergence(line.expiryDate ?? null, arrival, minShelfLifeDays),
	}
}
