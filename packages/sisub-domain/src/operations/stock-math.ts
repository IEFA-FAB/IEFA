/**
 * Matemática pura do estoque (Fase 3/5 do ciclo).
 *
 * FEFO — First Expired, First Out: a baixa consome lotes em ordem de validade
 * crescente, atravessando quantos lotes forem necessários.
 *
 * Duas regras que não são óbvias e vieram de bug real:
 *  • lote VENCIDO não é alocado. Consumir vencido é decisão explícita do nível
 *    3, com justificativa — antes, o vencido saía primeiro por ser o de menor
 *    validade.
 *  • lote SEM validade entra pela data de entrada (FIFO), junto com os demais.
 *    Mandá-lo "para o fim da fila" fazia o hortifrúti — que quase nunca tem
 *    validade na nota — apodrecer na câmara.
 *
 * Esta função é o espelho da alocação feita em `inventory.register_production_issue`
 * (a alocação que VALE é a do banco, dentro da transação e com os lotes
 * travados); aqui é a previsão mostrada ao operador antes de confirmar.
 */

export interface LotBalance {
	lotId: string
	/** Saldo disponível do lote na unidade base. */
	balance: number
	/** Validade (ISO date) — null = sem validade conhecida. */
	expiryDate: string | null
	/** Entrada do lote (ISO date/timestamp) — desempata e ordena o lote sem validade. */
	receivedAt?: string | null
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

/** Hoje no fuso de Brasília (o vencimento é uma data civil, não UTC). */
export function brasiliaToday(now: Date = new Date()): string {
	return now.toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 10)
}

/**
 * Ordena por validade asc; lote sem validade usa `receivedAt` como validade
 * presumida para ficar na fila junto com os demais (FIFO), e sem nenhum dos
 * dois vai para o fim. Empate estável pela ordem de entrada.
 */
export function sortFefo<T extends { expiryDate: string | null; receivedAt?: string | null }>(lots: readonly T[]): T[] {
	const key = (lot: T) => lot.expiryDate ?? (lot.receivedAt ? lot.receivedAt.slice(0, 10) : null)
	return [...lots].sort((a, b) => {
		const ka = key(a)
		const kb = key(b)
		if (ka == null && kb == null) return 0
		if (ka == null) return 1
		if (kb == null) return -1
		return ka < kb ? -1 : ka > kb ? 1 : 0
	})
}

export interface FefoOptions {
	/** Data de referência do vencimento (ISO date). Default: hoje em Brasília. */
	referenceDate?: string
	/** Lotes a ignorar (quarentena, escolha manual já alocada). */
	excludeLotIds?: readonly string[]
}

export function allocateFefo(lots: readonly LotBalance[], quantity: number, options: FefoOptions = {}): FefoResult {
	if (!Number.isFinite(quantity) || quantity <= 0) return { allocations: [], shortfall: 0 }

	const today = options.referenceDate ?? brasiliaToday()
	const excluded = new Set(options.excludeLotIds ?? [])
	let remaining = quantity
	const allocations: FefoAllocation[] = []
	const eligible = lots.filter((l) => l.balance > 0 && !excluded.has(l.lotId) && !(l.expiryDate != null && l.expiryDate < today))
	for (const lot of sortFefo(eligible)) {
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
