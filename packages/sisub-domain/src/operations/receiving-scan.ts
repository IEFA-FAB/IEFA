/**
 * Casamento da leitura com a linha da NF-e, na conferência do recebimento.
 *
 * O que estava errado antes: a tela comparava o código lido com o GTIN do
 * `ingredient_item` (o SKU do catálogo). Duas consequências reais:
 *  • item casado pelo mapa do fornecedor, cujo SKU não tem GTIN, dava sempre
 *    "não consta na nota" — mesmo estando na nota;
 *  • ler a UNIDADE quando o SKU tem o GTIN da CAIXA (ou o contrário) também
 *    dava falso negativo, porque a hierarquia de embalagem não era consultada.
 *
 * Aqui o casamento é com o que a NOTA declara, nesta ordem:
 *   1. `cEAN` da linha — embalagem comercial (o que o fornecedor vendeu);
 *   2. `cEANTrib` da linha — unidade tributável (o que está dentro);
 *   3. GTIN/alias do insumo casado;
 *   4. hierarquia de embalagem do GTIN do insumo.
 *
 * Cada caminho tem um FATOR em unidade comercial: ler a caixa soma 1 `uCom`;
 * ler a unidade soma `qCom/qTrib` (nota de 10 CX = 120 UN → uma unidade é 1/12
 * de caixa). Conferir caixa contra unidade sem isso erra por 12×.
 */

export interface ReceiptLineForScan {
	receiptItemId: string
	/** `cEAN` da linha da nota — embalagem comercial. */
	invoiceGtin: string | null
	/** `cEANTrib` da linha — unidade tributável. */
	invoiceGtinTrib: string | null
	/** GTIN do `ingredient_item` casado, e aliases aprendidos na operação. */
	catalogGtins: readonly string[]
	/** GTINs da hierarquia de embalagem (pai e filhos do GTIN do catálogo). */
	hierarchyGtins?: readonly string[]
	/** `qCom` — quantidade comercial faturada. */
	commercialQty: number | null
	/** `qTrib` — quantidade tributável faturada. */
	taxableQty: number | null
	/** Quantidade faturada já na unidade base do insumo. */
	invoicedQtyBase: number | null
	/** Já conferido (soma dos eventos), na unidade base. */
	confirmedQtyBase: number
}

export type ScanMatchSource = "invoice_gtin" | "invoice_gtin_trib" | "catalog_gtin" | "package_hierarchy"

export interface ScanMatch {
	receiptItemId: string
	source: ScanMatchSource
	/**
	 * Fator em unidade COMERCIAL da nota: 1 quando o código lido é a embalagem
	 * comercial; `qCom/qTrib` quando é a unidade tributável.
	 */
	packageFactor: number
	/**
	 * Quantidade na unidade base correspondente a UMA leitura. Null quando a
	 * linha não tem conversão resolvida — e aí a leitura conta a embalagem, mas
	 * não pode virar quantidade.
	 */
	quantityBase: number | null
}

/** Ordem de preferência: o que a nota declara vence o que o catálogo acha. */
const SOURCE_ORDER: ScanMatchSource[] = ["invoice_gtin", "invoice_gtin_trib", "catalog_gtin", "package_hierarchy"]

function factorFor(line: ReceiptLineForScan, source: ScanMatchSource): number {
	if (source !== "invoice_gtin_trib") return 1
	const commercial = line.commercialQty ?? 0
	const taxable = line.taxableQty ?? 0
	// sem o par qCom/qTrib não dá para saber quantas unidades vêm na caixa; 1 é
	// o único palpite honesto, e a tela mostra o fator aplicado
	if (commercial <= 0 || taxable <= 0) return 1
	return commercial / taxable
}

/**
 * Casa um GTIN lido com uma das linhas do recebimento.
 *
 * Devolve `null` quando nenhuma linha reconhece o código — e aí quem decide é o
 * operador (associar à linha, registrar troca ou ignorar), nunca o sistema
 * adicionando item que a nota não tem.
 */
export function matchScanToLine(gtin: string, lines: readonly ReceiptLineForScan[]): ScanMatch | null {
	for (const source of SOURCE_ORDER) {
		for (const line of lines) {
			const matches =
				source === "invoice_gtin"
					? line.invoiceGtin === gtin
					: source === "invoice_gtin_trib"
						? line.invoiceGtinTrib === gtin
						: source === "catalog_gtin"
							? line.catalogGtins.includes(gtin)
							: (line.hierarchyGtins ?? []).includes(gtin)
			if (!matches) continue

			const packageFactor = factorFor(line, source)
			const commercial = line.commercialQty ?? 0
			const quantityBase = line.invoicedQtyBase != null && commercial > 0 ? Number(((line.invoicedQtyBase / commercial) * packageFactor).toFixed(4)) : null
			return { receiptItemId: line.receiptItemId, source, packageFactor, quantityBase }
		}
	}
	return null
}

export interface LineProgress {
	receiptItemId: string
	invoicedQtyBase: number | null
	confirmedQtyBase: number
	/** Falta conferir, na unidade base. Null quando a linha não tem faturado. */
	remainingQtyBase: number | null
	/** Já passou do faturado (recebimento a maior). */
	over: boolean
}

/** Progresso por linha, para o contador "esperado × conferido" da tela. */
export function lineProgress(lines: readonly ReceiptLineForScan[]): LineProgress[] {
	return lines.map((line) => {
		const remaining = line.invoicedQtyBase == null ? null : Number((line.invoicedQtyBase - line.confirmedQtyBase).toFixed(4))
		return {
			receiptItemId: line.receiptItemId,
			invoicedQtyBase: line.invoicedQtyBase,
			confirmedQtyBase: line.confirmedQtyBase,
			remainingQtyBase: remaining,
			over: remaining != null && remaining < 0,
		}
	})
}

/**
 * Multiplicador sugerido para "ler uma e informar ×N": o que falta da linha,
 * em embalagens. Conferir 30 caixas iguais lendo 30 vezes é o que faz o
 * conferente desistir e digitar tudo no fim — que é como o controle morre.
 */
export function suggestedMultiplier(line: ReceiptLineForScan, quantityPerScan: number | null): number | null {
	if (quantityPerScan == null || quantityPerScan <= 0) return null
	if (line.invoicedQtyBase == null) return null
	const remaining = line.invoicedQtyBase - line.confirmedQtyBase
	if (remaining <= 0) return null
	return Math.max(1, Math.round(remaining / quantityPerScan))
}

/**
 * A diferença entre conferido e faturado está dentro da tolerância do item?
 *
 * Peso variável (carne, hortifrúti) nunca bate exatamente com a nota. Tratar
 * 300 g de diferença como divergência ensina o operador a marcar qualquer
 * motivo e seguir — e aí a divergência que importa também vira ruído.
 */
export function withinTolerance(invoicedQtyBase: number | null, confirmedQtyBase: number, tolerancePct: number): boolean {
	if (invoicedQtyBase == null || invoicedQtyBase === 0) return false
	const difference = Math.abs(confirmedQtyBase - invoicedQtyBase)
	return difference <= Math.abs(invoicedQtyBase) * (tolerancePct / 100)
}

/**
 * Pendência fiscal: recebido a MENOR que o faturado, em valor.
 *
 * Existe mesmo dentro da tolerância. A nota continua dizendo 100 e o estoque
 * 90, e carta de correção não altera quantidade nem valor (Ajuste SINIEF
 * 07/05): ou vem nota de devolução, ou nota substituta, ou glosa registrada.
 */
export function fiscalShortfallValue(lines: readonly { invoicedQtyBase: number | null; receivedQtyBase: number; unitCost: number | null }[]): number {
	let total = 0
	for (const line of lines) {
		if (line.invoicedQtyBase == null || line.unitCost == null) continue
		const shortfall = line.invoicedQtyBase - line.receivedQtyBase
		if (shortfall > 0) total += shortfall * line.unitCost
	}
	return Number(total.toFixed(2))
}
