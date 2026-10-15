/**
 * Configuração de estoque da cozinha (`inventory.kitchen_stock_settings`): forma da tela, colunas,
 * rascunho e conferência de versão. Puro, para a tela e o teste unitário; a leitura e a gravação
 * ficam em `kitchen-stock-settings.server.ts`.
 *
 * Os defaults (cozinha sem linha) não se repetem aqui: a leitura passa por
 * `inventory.kitchen_settings`, que os resolve no banco. O prazo de entrega padrão não tem
 * default: nulo é "não configurado", e a reposição mostra a pendência em vez de presumir um número.
 */

export type Segregation = "strict" | "dual"

// `type`, não `interface`: o merge de três vias (`rebaseDraftValues`) e o rascunho pedem um Record.
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

/**
 * Coluna de cada campo editável — a ÚNICA lista: a leitura, o insert e o update do servidor saem
 * dela. Campo novo entra aqui (o `satisfies` cobra a chave) e no parser abaixo.
 */
export const STOCK_SETTINGS_COLUMNS = {
	segregation: "segregation",
	adjustmentApprovalValue: "adjustment_approval_value",
	issueTolerancePct: "issue_tolerance_pct",
	issueToleranceFloorValue: "issue_tolerance_floor_value",
	countTolerancePct: "count_tolerance_pct",
	countToleranceValue: "count_tolerance_value",
	defaultLeadTimeDays: "default_lead_time_days",
} as const satisfies Record<keyof StockSettingsValues, string>

export type StockSettingsColumn = (typeof STOCK_SETTINGS_COLUMNS)[keyof typeof STOCK_SETTINGS_COLUMNS]

/** Linha lida: toda coluna em texto (numeric e timestamptz sem perder precisão) e se a linha existe. */
export type StockSettingsRow = { [C in StockSettingsColumn]: string | null } & { updated_at: string | null; has_row: boolean }

/** Teto do prazo de entrega padrão: acima de um ano é erro de digitação, não prazo. */
export const MAX_LEAD_TIME_DAYS = 365

/** `updated_at::text` do Postgres (`2026-10-14 12:00:00.123456+00`): o formato que a versão aceita. */
export const STOCK_SETTINGS_VERSION_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/

/** Prefixo da recusa por versão: a tela reconhece por ele e oferece levar a edição para a atual. */
export const STOCK_SETTINGS_CONFLICT_PREFIX = "As configurações de estoque mudaram"

export const STOCK_SETTINGS_CONFLICT_MESSAGE = `${STOCK_SETTINGS_CONFLICT_PREFIX} depois que você abriu a tela (outra pessoa salvou). Abra a versão atual levando as suas alterações.`

export function isStockSettingsConflict(message: string): boolean {
	return message.startsWith(STOCK_SETTINGS_CONFLICT_PREFIX)
}

function toNumber(value: string | null, column: string): number {
	const parsed = value == null ? Number.NaN : Number(value)
	// `inventory.kitchen_settings` sempre devolve as colunas obrigatórias preenchidas
	if (!Number.isFinite(parsed)) throw new Error(`Configuração de estoque inválida: ${column}`)
	return parsed
}

/** Linha de `inventory.kitchen_settings` (já com os defaults do banco) → forma da tela. */
export function parseStockSettingsRow(row: StockSettingsRow): StockSettings {
	const leadTime = row.default_lead_time_days == null ? null : Number(row.default_lead_time_days)
	return {
		segregation: row.segregation === "strict" ? "strict" : "dual",
		adjustmentApprovalValue: toNumber(row.adjustment_approval_value, "adjustment_approval_value"),
		issueTolerancePct: toNumber(row.issue_tolerance_pct, "issue_tolerance_pct"),
		issueToleranceFloorValue: toNumber(row.issue_tolerance_floor_value, "issue_tolerance_floor_value"),
		countTolerancePct: toNumber(row.count_tolerance_pct, "count_tolerance_pct"),
		countToleranceValue: toNumber(row.count_tolerance_value, "count_tolerance_value"),
		defaultLeadTimeDays: leadTime != null && Number.isInteger(leadTime) && leadTime > 0 ? leadTime : null,
		// Sem linha, a versão é "nenhuma": a gravação insere e recusa se alguém criou no meio-tempo.
		version: row.has_row ? row.updated_at : null,
	}
}

// ─── Rascunho da tela ────────────────────────────────────────────────────────

/**
 * O que a tela edita e o rascunho local guarda. O prazo vai como o TEXTO digitado: texto inválido
 * ("0", "2,5") sobrevive ao rascunho e ao merge de três vias como está, em vez de virar `null`
 * ("não configurado") e apagar o prazo de alguém.
 */
export type StockSettingsDraft = Omit<StockSettingsValues, "defaultLeadTimeDays"> & { defaultLeadTimeText: string }

export function toStockSettingsDraft(settings: StockSettingsValues): StockSettingsDraft {
	const { defaultLeadTimeDays, ...rest } = settings
	return {
		segregation: rest.segregation,
		adjustmentApprovalValue: rest.adjustmentApprovalValue,
		issueTolerancePct: rest.issueTolerancePct,
		issueToleranceFloorValue: rest.issueToleranceFloorValue,
		countTolerancePct: rest.countTolerancePct,
		countToleranceValue: rest.countToleranceValue,
		defaultLeadTimeText: defaultLeadTimeDays?.toString() ?? "",
	}
}

/**
 * Texto do campo "prazo de entrega padrão" → valor. Vazio é "não configurado" (válido); o resto
 * tem de ser inteiro de 1 a 365. `invalid` deixa a tela marcar o campo e não gravar.
 */
export function parseLeadTimeInput(text: string): { value: number | null; invalid: boolean } {
	const trimmed = text.trim()
	if (trimmed === "") return { value: null, invalid: false }
	if (!/^\d+$/.test(trimmed)) return { value: null, invalid: true }
	const value = Number(trimmed)
	if (value < 1 || value > MAX_LEAD_TIME_DAYS) return { value: null, invalid: true }
	return { value, invalid: false }
}

/** Rascunho → valores a gravar; `null` enquanto houver campo inválido (a tela não grava). */
export function stockSettingsFromDraft(draft: StockSettingsDraft): StockSettingsValues | null {
	const { defaultLeadTimeText, ...rest } = draft
	const leadTime = parseLeadTimeInput(defaultLeadTimeText)
	if (leadTime.invalid) return null
	return { ...rest, defaultLeadTimeDays: leadTime.value }
}

/** Chave do rascunho local (por conta, pelo `draftStore`): uma por cozinha. */
export function stockSettingsDraftKey(kitchenId: number | string): string {
	return `sisub:stock-settings:${kitchenId}`
}
