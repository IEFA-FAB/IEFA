/**
 * Vocabulário do módulo de estoque — os valores que o banco aceita nas colunas
 * de tipo e situação.
 *
 * Existiam só como string literal espalhada: `"receipt"` em três arquivos,
 * `"draft"` em quinze. Sem constante, o `CHECK` do banco e o código não têm
 * como ser comparados, e é isso que `sql-vocabulary.contract.test.ts` passa a
 * fazer.
 */

/** `inventory.stock_movement.type` — o sinal do movimento vem daqui, não da quantidade. */
export const STOCK_MOVEMENT_TYPES = [
	"receipt",
	"production_issue",
	"leftover_return",
	"waste",
	"transfer_in",
	"transfer_out",
	"adjustment_in",
	"adjustment_out",
] as const
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number]

/**
 * Tipos que AUMENTAM o saldo. A partição entrada/saída é replicada nas triggers
 * de custo médio; `sql-vocabulary.contract.test.ts` prova que as duas listas do
 * SQL cobrem exatamente o vocabulário — tipo novo fora das duas passa pelo
 * ledger sem afetar o custo, e isso só aparece no balancete do mês seguinte.
 */
export const STOCK_INFLOW_TYPES = ["receipt", "leftover_return", "transfer_in", "adjustment_in"] as const satisfies readonly StockMovementType[]

/** Tipos que DIMINUEM o saldo. */
export const STOCK_OUTFLOW_TYPES = ["production_issue", "waste", "transfer_out", "adjustment_out"] as const satisfies readonly StockMovementType[]

export function isInflow(type: StockMovementType): boolean {
	return (STOCK_INFLOW_TYPES as readonly string[]).includes(type)
}

/** `inventory.goods_receipt.status` — recebimento em dois estágios (Lei 14.133, art. 140). */
export const GOODS_RECEIPT_STATUSES = ["draft", "provisional", "definitive", "divergent", "rejected"] as const
export type GoodsReceiptStatus = (typeof GOODS_RECEIPT_STATUSES)[number]

/** Situações em que a conferência ainda aceita escrita. */
export const EDITABLE_RECEIPT_STATUSES = ["draft", "provisional"] as const satisfies readonly GoodsReceiptStatus[]

export function isReceiptEditable(status: GoodsReceiptStatus): boolean {
	return (EDITABLE_RECEIPT_STATUSES as readonly string[]).includes(status)
}

/** `procurement.supply_order.status`. */
export const SUPPLY_ORDER_STATUSES = ["draft", "sent", "partially_received", "received", "cancelled", "expired"] as const
export type SupplyOrderStatus = (typeof SUPPLY_ORDER_STATUSES)[number]
