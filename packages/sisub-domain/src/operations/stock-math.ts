/**
 * Matemática pura do estoque (Fase 3/5 do ciclo).
 *
 * FEFO — First Expired, First Out: a baixa consome lotes em ordem de validade
 * crescente (nulos por último — sem validade conhecida só saem depois do que
 * vence), atravessando quantos lotes forem necessários. O operador pode
 * sobrescrever a alocação com justificativa (decisão fica na UI/fn; aqui só a
 * alocação default).
 */

export interface LotBalance {
	lotId: string
	/** Saldo disponível do lote na unidade base. */
	balance: number
	/** Validade (ISO date) — null = sem validade conhecida. */
	expiryDate: string | null
}

export interface FefoAllocation {
	lotId: string
	quantity: number
}

export interface FefoResult {
	allocations: FefoAllocation[]
	/** Quanto NÃO coube nos lotes disponíveis (0 = totalmente coberto). */
	shortfall: number
}

/** Ordena por validade asc (null por último); empate estável pela ordem de entrada. */
export function sortFefo<T extends { expiryDate: string | null }>(lots: readonly T[]): T[] {
	return [...lots].sort((a, b) => {
		if (a.expiryDate == null && b.expiryDate == null) return 0
		if (a.expiryDate == null) return 1
		if (b.expiryDate == null) return -1
		return a.expiryDate < b.expiryDate ? -1 : a.expiryDate > b.expiryDate ? 1 : 0
	})
}

export function allocateFefo(lots: readonly LotBalance[], quantity: number): FefoResult {
	if (!Number.isFinite(quantity) || quantity <= 0) return { allocations: [], shortfall: 0 }

	let remaining = quantity
	const allocations: FefoAllocation[] = []
	for (const lot of sortFefo(lots.filter((l) => l.balance > 0))) {
		if (remaining <= 0) break
		const take = Math.min(lot.balance, remaining)
		allocations.push({ lotId: lot.lotId, quantity: take })
		remaining -= take
	}
	return { allocations, shortfall: Math.max(remaining, 0) }
}

/**
 * Suficiência de estoque para uma lista de necessidades (badge N/M do
 * kitchen-production): item é suficiente quando o saldo total cobre o
 * necessário.
 */
export function sufficiency(needs: readonly { itemKey: string; required: number; available: number }[]): {
	total: number
	sufficient: number
	missing: { itemKey: string; required: number; available: number }[]
} {
	const missing = needs.filter((n) => n.available < n.required)
	return { total: needs.length, sufficient: needs.length - missing.length, missing: [...missing] }
}
