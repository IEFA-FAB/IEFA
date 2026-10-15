/**
 * Decisões puras do registro de ajuste de estoque (`createAdjustmentFn`): conferência dos lotes,
 * linhas gravadas e a recuperação quando o lançamento automático falha.
 *
 * Fora de `adjustment.fn.ts` porque teste unitário não pode importar `@/server/*`.
 */

/**
 * Lote informado tem de ser do local de estoque do ajuste — o guard é pelo local, e sem esta
 * checagem o nível 2 de uma cozinha ajustaria lote de outra. "Outra cozinha" é conferido antes de
 * "não encontrado".
 */
export function findAdjustmentLotProblem(
	lots: ReadonlyArray<{ location_id: number }>,
	locationId: number,
	requestedLotIds: readonly string[]
): "Lote de outra cozinha" | "Lote não encontrado" | null {
	for (const lot of lots) {
		if (lot.location_id !== locationId) return "Lote de outra cozinha"
	}
	if (lots.length !== new Set(requestedLotIds).size) return "Lote não encontrado"
	return null
}

/** Cabeçalho do documento; observação vazia vira null. */
export function buildAdjustmentDocumentRow(input: {
	locationId: number
	notes: string | undefined
	isEvidencePending: boolean
	userId: string
	submittedAt: string
}) {
	return {
		location_id: input.locationId,
		notes: input.notes?.trim() || null,
		evidence_status: input.isEvidencePending ? ("pending" as const) : ("complete" as const),
		created_by: input.userId,
		submitted_at: input.submittedAt,
	}
}

export interface AdjustmentItemRowInput {
	lotId?: string
	ingredientId?: string
	frozenPreparationId?: string
	direction: "in" | "out"
	quantity: number
	unitCost?: number
	reasonCode: string
	note?: string
	evidenceKind?: string
	evidenceReference?: string
	measuredTemperatureC?: number
	correctedMovementId?: string
}

export function buildAdjustmentItemRow<T extends AdjustmentItemRowInput>(adjustmentId: string, item: T) {
	return {
		adjustment_id: adjustmentId,
		lot_id: item.lotId ?? null,
		// o id do insumo ou da preparação é o `item_id`; ajuste só por lote não o informa
		item_id: item.ingredientId ?? item.frozenPreparationId ?? null,
		direction: item.direction,
		quantity: item.quantity,
		unit_cost: item.unitCost ?? null,
		reason_code: item.reasonCode,
		note: item.note?.trim() || null,
		evidence_kind: item.evidenceKind ?? null,
		evidence_reference: item.evidenceReference?.trim() || null,
		measured_temperature_c: item.measuredTemperatureC ?? null,
		corrected_movement_id: item.correctedMovementId ?? null,
	}
}

/**
 * A falha do lançamento é ACRESCENTADA à observação, nunca escrita por cima: o que o operador
 * digitou é o que explica o ajuste para quem vai aprová-lo.
 */
export function composeRecoveryNotes(operatorNote: string | undefined, failureNote: string): string {
	return operatorNote ? `${operatorNote}\n\n${failureNote}` : failureNote
}

/**
 * Update da recuperação: o documento vai para a fila de aprovação com a observação acrescida. A
 * exigência de aprovação é gravada quando a regra, relida, passou a exigir — ou quando a releitura
 * falhou (falha FECHADA).
 */
export function buildPostFailureRecovery(input: {
	operatorNote: string | undefined
	failureNote: string
	isRequirementUnknown: boolean
	nowRequires: unknown
}): { status: "pending_approval"; notes: string; approval_required?: true } {
	return {
		status: "pending_approval",
		notes: composeRecoveryNotes(input.operatorNote, input.failureNote),
		...(input.isRequirementUnknown || input.nowRequires === true ? { approval_required: true as const } : {}),
	}
}
