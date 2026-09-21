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

/** Status da carga de abertura (`inventory.opening_balance.status`). */
export const OPENING_BALANCE_STATUSES = ["draft", "posted", "cancelled"] as const
export type OpeningBalanceStatus = (typeof OPENING_BALANCE_STATUSES)[number]

/** De onde vieram as linhas da carga: planilha livre ou a folha gerada do catálogo. */
export const OPENING_BALANCE_SOURCES = ["spreadsheet", "catalog_sheet"] as const
export type OpeningBalanceSource = (typeof OPENING_BALANCE_SOURCES)[number]

/**
 * Fonte do custo de cada linha da carga (`opening_balance_item.cost_source`).
 * Gravada porque o custo de abertura vira custo médio e depois valor de balancete:
 * quem audita precisa saber se o número foi homologado, estimado ou digitado.
 */
export const OPENING_COST_SOURCES = ["ata", "price_research", "manual"] as const
export type OpeningCostSource = (typeof OPENING_COST_SOURCES)[number]

export const OPENING_COST_SOURCE_LABELS: Record<OpeningCostSource, string> = {
	ata: "ATA (preço homologado)",
	price_research: "Pesquisa de preço",
	manual: "Informado",
}

/** Derivação de lote: produto aberto, fracionado ou descongelado (RDC 216). */
export const LOT_DERIVATIONS = ["opened", "portioned", "thawed"] as const
export type LotDerivation = (typeof LOT_DERIVATIONS)[number]

/**
 * Rótulos em português dos tipos de movimento.
 *
 * Ficam aqui, e não na tela, porque o mesmo vocabulário aparece no painel, na
 * ficha de almoxarifado, no relatório de perdas e no chat dos módulos — quatro
 * cópias divergentes é o caminho curto para "Ajuste (entrada)" numa tela e
 * "adjustment_in" na outra.
 */
export const STOCK_MOVEMENT_LABELS: Record<StockMovementType, string> = {
	receipt: "Entrada (recebimento)",
	production_issue: "Saída (produção)",
	issue_return: "Devolução ao estoque",
	leftover_return: "Retorno de sobra",
	waste: "Descarte",
	transfer_in: "Transferência (entrada)",
	transfer_out: "Transferência (saída)",
	lot_split_in: "Fracionamento (lote novo)",
	lot_split_out: "Fracionamento (lote de origem)",
	adjustment_in: "Ajuste (entrada)",
	adjustment_out: "Ajuste (saída)",
}

/** Rótulos dos motivos de ajuste, na linguagem de quem opera o almoxarifado. */
export const STOCK_ADJUSTMENT_REASON_LABELS: Record<StockAdjustmentReason, string> = {
	expired: "Vencido",
	spoiled: "Deteriorado",
	damaged: "Avaria",
	cold_chain_failure: "Falha de refrigeração",
	sanitary_recall: "Recolhimento sanitário",
	lost: "Extravio",
	theft: "Furto ou roubo",
	quality_sample: "Amostra para análise",
	supplier_return: "Devolução ao fornecedor",
	donation: "Doação",
	entry_error_in: "Correção de lançamento (entrada)",
	entry_error_out: "Correção de lançamento (saída)",
	count_gain: "Sobra de inventário",
	count_loss: "Falta de inventário",
	found_stock: "Achado sem registro",
	opening_balance: "Carga de abertura",
}

/**
 * Natureza contábil por motivo — é o que separa perda de consumo e de valor em
 * apuração. `lost`, `theft` e `cold_chain_failure` deixam o valor "em
 * apuração": na administração pública, perda com indício de responsabilidade
 * abre processo (IN SEDAP 205/88, item 10), e o sisub registra, não conduz.
 */
export const REASON_NATURE: Record<
	StockAdjustmentReason,
	"loss" | "under_investigation" | "consumption" | "cost_reduction" | "correction" | "inventory" | "donation" | "implantation"
> = {
	expired: "loss",
	spoiled: "loss",
	damaged: "loss",
	cold_chain_failure: "under_investigation",
	sanitary_recall: "loss",
	lost: "under_investigation",
	theft: "under_investigation",
	quality_sample: "consumption",
	supplier_return: "cost_reduction",
	donation: "donation",
	entry_error_in: "correction",
	entry_error_out: "correction",
	count_gain: "inventory",
	count_loss: "inventory",
	found_stock: "inventory",
	opening_balance: "implantation",
}

export const NATURE_LABELS: Record<(typeof REASON_NATURE)[StockAdjustmentReason], string> = {
	loss: "Perda",
	under_investigation: "Em apuração",
	consumption: "Consumo",
	cost_reduction: "Redução de custo",
	correction: "Correção",
	inventory: "Inventário",
	donation: "Doação",
	implantation: "Implantação",
}

/**
 * Antecedência default do alerta de validade, por classe de conservação.
 *
 * Espelha o `case` de `inventory.expiry_alert_days` (migration
 * 20260919120000). Existe em TypeScript porque a tela explica o default ao
 * usuário — "sem política, valem 3 dias para resfriado" — e um número escrito à
 * mão num texto de interface é a forma mais silenciosa de divergir do banco:
 * ninguém percebe até alguém contar os dias na prateleira.
 *
 * `sql-vocabulary.contract.test.ts` compara os dois.
 */
export const EXPIRY_DEFAULT_ALERT_DAYS = {
	resfriado: 3,
	congelado: 15,
	/** Demais classes: seco, climatizado e não aplicável. */
	outras: 30,
} as const

/** Faixas do painel de vencimentos, da mais urgente para a menos. */
export const EXPIRY_BANDS = ["expired", "critical", "warning", "no_expiry"] as const
export type ExpiryBand = (typeof EXPIRY_BANDS)[number]

export const EXPIRY_BAND_LABELS: Record<ExpiryBand, string> = {
	expired: "Vencido",
	critical: "Crítico",
	warning: "Atenção",
	no_expiry: "Perecíveis sem validade",
}
