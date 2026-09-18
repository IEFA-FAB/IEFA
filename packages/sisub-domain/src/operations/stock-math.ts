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
	/** Marcado "usar primeiro" no painel de vencimentos — fura a fila, como no banco. */
	useFirst?: boolean | null
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
 * Data civil de Brasília de um instante ISO. A entrada do lote chega como
 * timestamp UTC; cortar os 10 primeiros caracteres dava a data UTC, que entre
 * 21h e a meia-noite em São Paulo já é o dia seguinte — e o lote recebido hoje
 * à noite entrava na fila como se fosse de amanhã.
 */
export function brasiliaDate(instant: string): string {
	if (instant.length === 10) return instant
	const parsed = new Date(instant)
	return Number.isNaN(parsed.getTime()) ? instant.slice(0, 10) : brasiliaToday(parsed)
}

/**
 * Espelha `order by l.use_first desc, l.expiry_date asc nulls last,
 * l.received_at asc, l.id asc` da alocação no banco. Fora de ordem, os quatro
 * critérios, a prévia mostra um lote e a baixa consome outro.
 *
 *  • "usar primeiro" (painel de vencimentos) FURA a fila — é o único jeito de
 *    o operador mandar sair o lote aberto antes do lote de validade menor;
 *  • depois a validade asc;
 *  • lote sem validade usa `receivedAt` como validade presumida, entrando na
 *    fila junto com os demais (FIFO) em vez de ir para o fim;
 *  • sem nenhum dos dois, fim da fila;
 *  • `lotId` desempata por último. A ordem em que as linhas chegam do
 *    PostgREST não é garantida, e sort estável sobre entrada instável ainda é
 *    saída instável: sem este critério dois lotes de mesma validade trocavam
 *    de lugar entre a prévia e a baixa.
 */
export function sortFefo<T extends { expiryDate: string | null; receivedAt?: string | null; useFirst?: boolean | null; lotId?: string }>(
	lots: readonly T[]
): T[] {
	const key = (lot: T) => lot.expiryDate ?? (lot.receivedAt ? brasiliaDate(lot.receivedAt) : null)
	return [...lots].sort((a, b) => {
		if (Boolean(a.useFirst) !== Boolean(b.useFirst)) return a.useFirst ? -1 : 1
		const ka = key(a)
		const kb = key(b)
		if (ka !== kb) {
			if (ka == null) return 1
			if (kb == null) return -1
			return ka < kb ? -1 : 1
		}
		const ia = a.lotId ?? ""
		const ib = b.lotId ?? ""
		return ia < ib ? -1 : ia > ib ? 1 : 0
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
