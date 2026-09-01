/**
 * Lotes de uma linha de recebimento — regras puras.
 *
 * Uma entrega traz caixas de validades diferentes do mesmo item, e é a
 * validade que dirige o FEFO: colapsar duas validades num lote só faz o
 * sistema consumir o lote errado, e o erro só aparece quando o alimento vence
 * na prateleira. Daí o grão `goods_receipt_item_lot` (migration 20260901120200).
 *
 * A invariante — soma dos lotes = quantidade conferida — é verificada na
 * EFETIVAÇÃO, não em constraint: durante a conferência a soma fica
 * legitimamente parcial enquanto o operador digita o segundo de três lotes.
 * Este módulo é o que a UI usa para mostrar o quanto falta sem bloquear.
 */

import { isTemperatureOutOfRange, type TemperatureRange, type TemperatureVerdict, temperatureVerdict } from "./conditioning.ts"

/** Casas decimais de `numeric(14,4)` — comparar float cru acusaria diferença onde o banco vê igualdade. */
const QUANTITY_SCALE = 4
const EPSILON = 0.5 * 10 ** -QUANTITY_SCALE

export interface ReceiptLotDraft {
	lotCode: string
	/** ISO date (YYYY-MM-DD) ou null quando o fornecedor não informa. */
	expiryDate: string | null
	quantityBase: number
	unitCost?: number | null
	measuredTemperatureC?: number | null
}

export function roundQuantity(value: number): number {
	return Number(value.toFixed(QUANTITY_SCALE))
}

export function sumLotQuantities(lots: readonly ReceiptLotDraft[]): number {
	return roundQuantity(lots.reduce((total, lot) => total + (Number.isFinite(lot.quantityBase) ? lot.quantityBase : 0), 0))
}

export const LOT_BALANCE_STATUSES = ["vazio", "falta", "fecha", "excede"] as const
export type LotBalanceStatus = (typeof LOT_BALANCE_STATUSES)[number]

export interface LotBalanceSummary {
	total: number
	/** Quanto ainda falta lançar. Negativo quando os lotes já passaram do conferido. */
	remaining: number
	status: LotBalanceStatus
}

/**
 * Quanto dos lotes já cobre a quantidade conferida.
 * `vazio` é estado inicial legítimo, não erro — a efetivação trata ausência de
 * lote criando um sintético com a quantidade inteira.
 */
export function lotBalance(receivedQtyBase: number, lots: readonly ReceiptLotDraft[]): LotBalanceSummary {
	const total = sumLotQuantities(lots)
	const remaining = roundQuantity(receivedQtyBase - total)
	if (lots.length === 0) return { total, remaining, status: "vazio" }
	if (Math.abs(remaining) < EPSILON) return { total, remaining: 0, status: "fecha" }
	return { total, remaining, status: remaining > 0 ? "falta" : "excede" }
}

/**
 * Código sintético para lote sem identificação do fornecedor.
 *
 * O sufixo numérico não é enfeite: duas caixas sem código na mesma entrega
 * colidiriam no unique (receipt_item_id, lot_code) e a segunda seria rejeitada
 * — que é exatamente o caso "metade veio com lote, metade não".
 */
export function syntheticLotCode(isoDate: string, sequence: number): string {
	return `SEM-LOTE-${isoDate}-${sequence}`
}

const SYNTHETIC_PATTERN = /^SEM-LOTE-\d{4}-\d{2}-\d{2}-(\d+)$/

/** Próxima sequência livre entre os códigos sintéticos já usados na entrega. */
export function nextSyntheticSequence(existingCodes: readonly string[]): number {
	let max = 0
	for (const code of existingCodes) {
		const match = SYNTHETIC_PATTERN.exec(code.trim())
		if (match) max = Math.max(max, Number(match[1]))
	}
	return max + 1
}

export interface LotValidationIssue {
	code: "quantidade_invalida" | "codigo_vazio" | "codigo_duplicado" | "soma_diverge" | "validade_invalida"
	message: string
	lotCode?: string
}

/**
 * Tudo que impede a efetivação desta linha. Lista, não primeiro-erro: o
 * conferente corrige de uma vez em vez de descobrir um problema por tentativa.
 */
export function validateReceiptLots(receivedQtyBase: number, lots: readonly ReceiptLotDraft[]): LotValidationIssue[] {
	const issues: LotValidationIssue[] = []
	const seen = new Set<string>()

	for (const lot of lots) {
		const code = lot.lotCode?.trim() ?? ""
		if (code === "") {
			issues.push({ code: "codigo_vazio", message: "Lote sem código — informe o lote ou deixe a linha em branco para gerar SEM-LOTE." })
		} else if (seen.has(code.toUpperCase())) {
			issues.push({ code: "codigo_duplicado", message: `Lote "${code}" repetido na mesma linha.`, lotCode: code })
		} else {
			seen.add(code.toUpperCase())
		}

		if (!Number.isFinite(lot.quantityBase) || lot.quantityBase <= 0) {
			issues.push({ code: "quantidade_invalida", message: `Lote "${code || "(sem código)"}" precisa de quantidade maior que zero.`, lotCode: code })
		}

		if (lot.expiryDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(lot.expiryDate)) {
			issues.push({ code: "validade_invalida", message: `Validade do lote "${code || "(sem código)"}" não é uma data.`, lotCode: code })
		}
	}

	// Sem lote nenhum não é erro aqui: a efetivação gera o sintético.
	if (lots.length > 0) {
		const balance = lotBalance(receivedQtyBase, lots)
		if (balance.status !== "fecha") {
			issues.push({
				code: "soma_diverge",
				message: `Soma dos lotes (${balance.total}) difere da quantidade conferida (${roundQuantity(receivedQtyBase)}).`,
			})
		}
	}

	return issues
}

export interface LotTemperatureCheck {
	lotCode: string
	verdict: TemperatureVerdict
	outOfRange: boolean
}

/**
 * Veredito de temperatura por lote.
 *
 * As caixas congeladas e as resfriadas da mesma entrega podem chegar em
 * condições diferentes — por isso a medição é do lote, não da linha do item.
 * Nenhum veredito bloqueia: `outOfRange` alimenta a divergência e o registro
 * de quem aceitou mesmo assim.
 */
export function checkLotTemperatures(lots: readonly ReceiptLotDraft[], range: TemperatureRange): LotTemperatureCheck[] {
	return lots.map((lot) => {
		const verdict = temperatureVerdict(lot.measuredTemperatureC ?? null, range)
		return { lotCode: lot.lotCode, verdict, outOfRange: isTemperatureOutOfRange(verdict) }
	})
}

/** Algum lote da entrega saiu da faixa exigida? É o gatilho da divergência do recebimento. */
export function hasTemperatureDivergence(checks: readonly LotTemperatureCheck[]): boolean {
	return checks.some((check) => check.outOfRange)
}
