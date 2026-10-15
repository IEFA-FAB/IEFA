/**
 * Agregação pura do saldo por item a partir da view do ledger (`fetchStockBalanceFn`).
 *
 * Fora de `stock.fn.ts` porque teste unitário não pode importar `@/server/*`; o handler fica só com
 * as leituras, na mesma ordem.
 */

type Numeric = number | string | null

export interface StockLotBalanceRow {
	lot_id: string | null
	lot_code: string | null
	expiry_date: string | null
	balance: number
	balance_value: number
	/** Código da etiqueta interna — null no saldo sem lote (falta de alocação). */
	short_code: string | null
	location: string | null
	use_first: boolean
	quarantined: boolean
	derivation: string | null
}

export interface StockBalanceItem {
	ingredientId: string | null
	frozenPreparationId: string | null
	description: string
	measureUnit: string | null
	balance: number
	balanceValue: number
	lots: StockLotBalanceRow[]
	nextExpiry: string | null
	/** Parte do saldo que está em quarentena — existe, mas não é alocável. */
	quarantinedBalance: number
	/**
	 * Saldo preso em lote VENCIDO.
	 *
	 * A alocação de saída pula lote vencido, exatamente como pula quarentena.
	 * Uma tela que desconta só a quarentena oferece saldo que o banco nunca vai
	 * tocar: o operador pede 20 KG, existem 20 KG "disponíveis" todos vencidos,
	 * e a baixa sai inteira como movimento sem lote — estoque negativo, sem
	 * nenhum aviso.
	 */
	expiredBalance: number
}

/**
 * Linha de `inventory.v_stock_balance` (fora dos tipos gerados), já com o `item_id` do estoque
 * traduzido para o par da tela (insumo ou preparação congelada) por `stock-item.server`.
 */
export interface StockBalanceViewRow {
	ingredient_id: string | null
	frozen_preparation_id: string | null
	lot_id: string | null
	lot_code: string | null
	expiry_date: string | null
	balance: Numeric
	balance_value: Numeric
}

/** Metadados do lote que a view não conhece: quarentena, etiqueta, local e "usar primeiro". */
export interface StockLotMeta {
	short_code: string
	location: string | null
	use_first: boolean
	quarantined_at: string | null
	derivation: string | null
}

/** Lotes presentes na view, sem repetição (saldo sem lote fica de fora). */
export function collectLotIds(rows: ReadonlyArray<{ lot_id: string | null }>): string[] {
	return [...new Set(rows.map((row) => row.lot_id).filter(Boolean))] as string[]
}

/** Chave do item: insumo (`i:`) ou preparação congelada (`f:`), a mesma de `describeItems`. */
export function buildStockItemKey(row: Pick<StockBalanceViewRow, "ingredient_id" | "frozen_preparation_id">): string {
	return row.ingredient_id ? `i:${row.ingredient_id}` : `f:${row.frozen_preparation_id}`
}

function createEmptyStockItem(row: StockBalanceViewRow): StockBalanceItem {
	return {
		ingredientId: row.ingredient_id,
		frozenPreparationId: row.frozen_preparation_id,
		description: "",
		measureUnit: null,
		balance: 0,
		balanceValue: 0,
		lots: [],
		nextExpiry: null,
		quarantinedBalance: 0,
		expiredBalance: 0,
	}
}

function toLotBalanceRow(row: StockBalanceViewRow, meta: StockLotMeta | undefined): StockLotBalanceRow {
	return {
		lot_id: row.lot_id,
		lot_code: row.lot_code,
		expiry_date: row.expiry_date,
		balance: Number(row.balance ?? 0),
		balance_value: Number(row.balance_value ?? 0),
		short_code: meta?.short_code ?? null,
		location: meta?.location ?? null,
		use_first: meta?.use_first ?? false,
		quarantined: meta?.quarantined_at != null,
		derivation: meta?.derivation ?? null,
	}
}

/** Próximo vencimento só de lote com saldo e fora de quarentena. */
function isEarlierAllocatableExpiry(row: StockBalanceViewRow, meta: StockLotMeta | undefined, current: string | null): boolean {
	return Boolean(row.expiry_date && Number(row.balance ?? 0) > 0 && meta?.quarantined_at == null && (current == null || row.expiry_date < current))
}

function accumulateStockRow(item: StockBalanceItem, row: StockBalanceViewRow, meta: StockLotMeta | undefined, getToday: () => string): void {
	item.balance += Number(row.balance ?? 0)
	item.balanceValue += Number(row.balance_value ?? 0)
	item.lots.push(toLotBalanceRow(row, meta))
	if (meta?.quarantined_at != null) item.quarantinedBalance += Number(row.balance ?? 0)
	// vencido na data civil de Brasília, como a alocação mede
	else if (row.expiry_date != null && row.expiry_date < getToday()) item.expiredBalance += Number(row.balance ?? 0)
	if (isEarlierAllocatableExpiry(row, meta, item.nextExpiry)) {
		item.nextExpiry = row.expiry_date
	}
}

/**
 * Soma as linhas da view por item, com os lotes. `getToday` é chamado por linha, só quando a linha
 * não está em quarentena e tem validade — como a leitura fazia antes.
 */
export function aggregateStockBalance(
	rows: readonly StockBalanceViewRow[],
	lotMeta: ReadonlyMap<string, StockLotMeta>,
	getToday: () => string
): Map<string, StockBalanceItem> {
	const byItem = new Map<string, StockBalanceItem>()
	for (const row of rows) {
		const key = buildStockItemKey(row)
		const item: StockBalanceItem = byItem.get(key) ?? createEmptyStockItem(row)
		const meta = row.lot_id ? lotMeta.get(row.lot_id) : undefined
		accumulateStockRow(item, row, meta, getToday)
		byItem.set(key, item)
	}
	return byItem
}

/** Ids a descrever, insumos e preparações, na ordem dos itens. */
export function listDescribableIds(byItem: ReadonlyMap<string, StockBalanceItem>): { ingredientIds: string[]; frozenIds: string[] } {
	return {
		ingredientIds: [...byItem.values()].map((i) => i.ingredientId).filter((id): id is string => id != null),
		frozenIds: [...byItem.values()].map((i) => i.frozenPreparationId).filter((id): id is string => id != null),
	}
}

/** Nome e unidade de cada item (a chave quando não há nome) e lotes pelo vencimento, sem validade no fim. */
export function applyStockItemNames(
	byItem: ReadonlyMap<string, StockBalanceItem>,
	names: ReadonlyMap<string, { description: string; measureUnit: string | null }>
): void {
	for (const [key, item] of byItem) {
		const meta = names.get(key)
		item.description = meta?.description ?? key
		item.measureUnit = meta?.measureUnit ?? null
		item.lots.sort((a, b) => ((a.expiry_date ?? "9999") < (b.expiry_date ?? "9999") ? -1 : 1))
	}
}

/** Tira o que a contagem cega esconde e ordena pela descrição. */
export function selectVisibleStockItems(byItem: ReadonlyMap<string, StockBalanceItem>, hidden: ReadonlySet<string>): StockBalanceItem[] {
	const visible = [...byItem.values()].filter((item) => !hidden.has(item.ingredientId ?? item.frozenPreparationId ?? ""))
	return visible.sort((a, b) => a.description.localeCompare(b.description, "pt-BR"))
}
