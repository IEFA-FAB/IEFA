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
	"issue_return",
	"leftover_return",
	"waste",
	"transfer_in",
	"transfer_out",
	"lot_split_in",
	"lot_split_out",
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
export const STOCK_INFLOW_TYPES = [
	"receipt",
	"issue_return",
	"leftover_return",
	"transfer_in",
	"lot_split_in",
	"adjustment_in",
] as const satisfies readonly StockMovementType[]

/** Tipos que DIMINUEM o saldo. */
export const STOCK_OUTFLOW_TYPES = [
	"production_issue",
	"waste",
	"transfer_out",
	"lot_split_out",
	"adjustment_out",
] as const satisfies readonly StockMovementType[]

/**
 * Aceita `string`, não `StockMovementType`: quem chama lê a coluna do banco por
 * um client sem tipo. Estreitar a assinatura empurraria um cast para cada call
 * site, e cast é o lugar onde o valor inesperado passa sem ninguém olhar.
 */
export function isInflow(type: string): boolean {
	return (STOCK_INFLOW_TYPES as readonly string[]).includes(type)
}

/** `inventory.goods_receipt.status` — recebimento em dois estágios (Lei 14.133, art. 140). */
export const GOODS_RECEIPT_STATUSES = ["draft", "provisional", "definitive", "divergent", "rejected"] as const
export type GoodsReceiptStatus = (typeof GOODS_RECEIPT_STATUSES)[number]

/** Situações em que a conferência ainda aceita escrita. */
export const EDITABLE_RECEIPT_STATUSES = ["draft", "provisional"] as const satisfies readonly GoodsReceiptStatus[]

/** Aceita `string` pelo mesmo motivo de `isInflow`. */
export function isReceiptEditable(status: string): boolean {
	return (EDITABLE_RECEIPT_STATUSES as readonly string[]).includes(status)
}

/** `procurement.supply_order.status`. */
export const SUPPLY_ORDER_STATUSES = ["draft", "sent", "partially_received", "received", "cancelled", "expired"] as const
export type SupplyOrderStatus = (typeof SUPPLY_ORDER_STATUSES)[number]

/**
 * `inventory.stock_movement.reason_code` e `stock_adjustment_item.reason_code`.
 *
 * Texto livre não vira relatório de perdas nem evento contábil: "estragou" e
 * "furtado" têm consequências administrativas diferentes (o segundo abre
 * apuração de responsabilidade), e é o motivo tipado que separa os dois.
 */
export const STOCK_ADJUSTMENT_REASONS = [
	"expired",
	"spoiled",
	"damaged",
	"cold_chain_failure",
	"sanitary_recall",
	"lost",
	"theft",
	"quality_sample",
	"supplier_return",
	"donation",
	"entry_error_in",
	"entry_error_out",
	"count_gain",
	"count_loss",
	"found_stock",
	"opening_balance",
] as const
export type StockAdjustmentReason = (typeof STOCK_ADJUSTMENT_REASONS)[number]

/** Motivo de descarte de sobra de produção — mora em `waste`, não em ajuste. */
export const PRODUCTION_LEFTOVER_DISCARD = "production_leftover_discard" as const

/** Vocabulário completo de `stock_movement.reason_code` (ajuste + descarte). */
export const STOCK_MOVEMENT_REASONS = [...STOCK_ADJUSTMENT_REASONS, PRODUCTION_LEFTOVER_DISCARD] as const

/** Motivos que só existem como ENTRADA. */
export const INFLOW_REASONS = ["entry_error_in", "count_gain", "found_stock", "opening_balance"] as const satisfies readonly StockAdjustmentReason[]

/** Motivos que só existem como SAÍDA. */
export const OUTFLOW_REASONS = [
	"expired",
	"spoiled",
	"damaged",
	"cold_chain_failure",
	"sanitary_recall",
	"lost",
	"theft",
	"quality_sample",
	"supplier_return",
	"donation",
	"entry_error_out",
	"count_loss",
] as const satisfies readonly StockAdjustmentReason[]

/** `inventory.stock_adjustment.status`. */
export const STOCK_ADJUSTMENT_STATUSES = ["draft", "pending_approval", "posted", "rejected"] as const
export type StockAdjustmentStatus = (typeof STOCK_ADJUSTMENT_STATUSES)[number]

/** Regime de segregação de funções da cozinha (`kitchen_stock_settings.segregation`). */
export const SEGREGATION_MODES = ["strict", "dual"] as const
export type SegregationMode = (typeof SEGREGATION_MODES)[number]

/** Derivação de lote: produto aberto, fracionado ou descongelado (RDC 216). */
export const LOT_DERIVATIONS = ["opened", "portioned", "thawed"] as const
export type LotDerivation = (typeof LOT_DERIVATIONS)[number]
