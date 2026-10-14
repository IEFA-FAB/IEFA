/**
 * Configuração de estoque da cozinha (`inventory.kitchen_stock_settings`): forma da tela, defaults
 * e conferência de versão. Puro, para a tela e o teste unitário; a leitura e a gravação ficam em
 * `kitchen-stock-settings.server.ts`.
 *
 * Os defaults espelham os da tabela e de `inventory.kitchen_settings` (cozinha sem linha). O prazo
 * de entrega padrão NÃO tem default: nulo é "não configurado", e a reposição mostra a pendência em
 * vez de presumir um número.
 */

export type Segregation = "strict" | "dual"

// `type`, não `interface`: o merge de três vias (`rebaseDraftValues`) pede um Record.
export type StockSettingsValues = {
	segregation: Segregation
	adjustmentApprovalValue: number
	issueTolerancePct: number
	issueToleranceFloorValue: number
	countTolerancePct: number
	countToleranceValue: number
	/** Prazo de entrega padrão, em dias; null = não configurado. */
	defaultLeadTimeDays: number | null
}

export type StockSettings = StockSettingsValues & {
	/**
	 * `updated_at` da linha como o banco o escreve (texto, com microssegundos), ou null quando a
	 * cozinha ainda não tem linha. A gravação confere este valor no servidor.
	 */
	version: string | null
}

export const STOCK_SETTINGS_DEFAULTS: StockSettingsValues = {
	segregation: "dual",
	adjustmentApprovalValue: 500,
	issueTolerancePct: 10,
	issueToleranceFloorValue: 20,
	countTolerancePct: 5,
	countToleranceValue: 50,
	defaultLeadTimeDays: null,
}

/** Teto do prazo de entrega padrão: acima de um ano é erro de digitação, não prazo. */
export const MAX_LEAD_TIME_DAYS = 365

/** Prefixo da recusa por versão: a tela reconhece por ele e oferece levar a edição para a atual. */
export const STOCK_SETTINGS_CONFLICT_PREFIX = "As configurações de estoque mudaram"

export const STOCK_SETTINGS_CONFLICT_MESSAGE = `${STOCK_SETTINGS_CONFLICT_PREFIX} depois que você abriu a tela (outra pessoa salvou). Abra a versão atual levando as suas alterações.`

export function isStockSettingsConflict(message: string): boolean {
	return message.startsWith(STOCK_SETTINGS_CONFLICT_PREFIX)
}

type Numeric = number | string | null

export interface StockSettingsRow {
	segregation: string | null
	adjustment_approval_value: Numeric
	issue_tolerance_pct: Numeric
	issue_tolerance_floor_value: Numeric
	count_tolerance_pct: Numeric
	count_tolerance_value: Numeric
	default_lead_time_days: Numeric
	updated_at: string | null
}

const toNumber = (value: Numeric, fallback: number): number => (value == null || !Number.isFinite(Number(value)) ? fallback : Number(value))

/** Linha do banco → forma da tela. Sem linha, os defaults e `version: null`. */
export function parseStockSettingsRow(row: StockSettingsRow | null | undefined): StockSettings {
	if (!row) return { ...STOCK_SETTINGS_DEFAULTS, version: null }
	const leadTime = row.default_lead_time_days == null ? null : Number(row.default_lead_time_days)
	return {
		segregation: row.segregation === "strict" ? "strict" : "dual",
		adjustmentApprovalValue: toNumber(row.adjustment_approval_value, STOCK_SETTINGS_DEFAULTS.adjustmentApprovalValue),
		issueTolerancePct: toNumber(row.issue_tolerance_pct, STOCK_SETTINGS_DEFAULTS.issueTolerancePct),
		issueToleranceFloorValue: toNumber(row.issue_tolerance_floor_value, STOCK_SETTINGS_DEFAULTS.issueToleranceFloorValue),
		countTolerancePct: toNumber(row.count_tolerance_pct, STOCK_SETTINGS_DEFAULTS.countTolerancePct),
		countToleranceValue: toNumber(row.count_tolerance_value, STOCK_SETTINGS_DEFAULTS.countToleranceValue),
		defaultLeadTimeDays: leadTime != null && Number.isInteger(leadTime) && leadTime > 0 ? leadTime : null,
		version: row.updated_at,
	}
}

/** Só os valores editáveis, sem a versão: é o que o merge de três vias compara. */
export function stockSettingsValues(settings: StockSettings): StockSettingsValues {
	const { version: _version, ...values } = settings
	return values
}

/**
 * Texto do campo "prazo de entrega padrão" → valor. Vazio é "não configurado" (válido); o resto
 * tem de ser inteiro de 1 a 365. `invalid` deixa a tela marcar o campo e não gravar.
 */
export function parseLeadTimeInput(text: string): { value: number | null; invalid: boolean } {
	const trimmed = text.trim()
	if (trimmed === "") return { value: null, invalid: false }
	const value = Number(trimmed)
	if (!Number.isInteger(value) || value < 1 || value > MAX_LEAD_TIME_DAYS) return { value: null, invalid: true }
	return { value, invalid: false }
}
