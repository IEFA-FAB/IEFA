/**
 * Limites do anexo quantitativo: quantidade MÁXIMA (Lei 14.133/2021, art. 82, I) e quantidade
 * MÍNIMA por ordem de fornecimento, derivadas da quantidade estimada (art. 18, § 1º, IV) que o
 * planejamento de cardápio calculou.
 *
 * São duas grandezas de natureza diferente, e confundi-las é o erro que este módulo evita:
 *
 *  • Máxima — teto do que a futura ata de registro de preços registra para a vigência
 *    inteira. É sobre ela que o fornecedor dimensiona a proposta e o valor estimado da
 *    contratação. O acréscimo da máxima sobre a estimada é o que segura a cozinha numa
 *    anormalidade: estoque perdido (câmara que parou, lote condenado), fornecedor que deixa de
 *    entregar e empurra a demanda para o item substituto (sem frango, pede-se mais carne suína
 *    até chamar o cadastro reserva ou abrir outro pregão). E o acréscimo tem que nascer no
 *    anexo: a ata de registro de preços não admite acréscimo depois (Decreto 11.462/2023,
 *    art. 23; o acréscimo de 25% do art. 125 da Lei 14.133 é de CONTRATO). Acréscimo apertado
 *    demais vira aviso; grande demais pede justificativa — quantitativo inflado para vender
 *    adesão é a "barriga de aluguel" que o TCU condena (Acórdãos 1.668/2021 e 80/2022 –
 *    Plenário). A justificativa da quantidade máxima é UMA por anexo, não por item.
 *
 *  • Mínima por ordem de fornecimento — o menor lote que a unidade pode pedir de uma vez. Ela
 *    não mede a vigência, mede o CICLO DE ENTREGA: perecível entra toda semana, não perecível
 *    uma vez por mês. Mínimo alto demais obriga cada pedido a trazer mais do que se consome
 *    até a próxima entrega (perecível estraga, seco ocupa depósito) e esgota a máxima antes
 *    do fim; mínimo baixo demais fragmenta a entrega e encarece o frete que o fornecedor
 *    embute no preço. Precedente: o TR do PE 90004/2025 da 12ª RM fixa a "requisição mínima"
 *    na demanda de uma semana. A sugestão aqui é uma FRAÇÃO do consumo de um ciclo: semana de
 *    feriado ou de efetivo reduzido consome menos, e um mínimo igual à média impediria o
 *    pedido dessa semana.
 *
 * Quantidades são inteiras na unidade de COMPRA: é assim que o item entra no pregão e no
 * Compras.gov (`quantidadeHomologadaItem`). Máxima arredonda para cima (arredondar para
 * baixo cortaria a estimada); mínima arredonda para baixo (arredondar para cima apertaria o
 * fluxo), nunca abaixo de 1.
 */

import { isConservationClass } from "./conditioning.ts"

/** Acréscimo padrão da quantidade máxima sobre a estimada, em %. */
export const DEFAULT_MAX_INCREASE_PERCENT = 20

/** Teto do acréscimo aceito (CHECK do banco). */
export const MAX_INCREASE_PERCENT_LIMIT = 100

/**
 * Acréscimo efetivo abaixo disto (em % da estimada, já com o arredondamento) é "colado": cobre
 * o erro de previsão comum, mas não uma anormalidade de estoque ou de fornecedor.
 */
export const TIGHT_INCREASE_PERCENT = 10

/** Acréscimo acima disto exige a justificativa da quantidade máxima para concluir o anexo. */
export const JUSTIFICATION_INCREASE_PERCENT = 50

/** Fração do consumo de um ciclo de entrega usada como mínimo por pedido sugerido, em %. */
export const MIN_ORDER_SHARE_PERCENT = 50

/** Vigência padrão quando o anexo não declarou a sua (Lei 14.133, art. 84: um ano). */
export const DEFAULT_VALIDITY_MONTHS = 12

/** Vocabulário espelhado nos CHECK de `kitchen.ingredient` e `procurement.quantity_estimate_item`. */
export const DELIVERY_CYCLES = ["weekly", "monthly"] as const
export type DeliveryCycle = (typeof DELIVERY_CYCLES)[number]

export const DELIVERY_CYCLE_LABELS: Record<DeliveryCycle, string> = {
	weekly: "Semanal",
	monthly: "Mensal",
}

export function isDeliveryCycle(value: unknown): value is DeliveryCycle {
	return typeof value === "string" && (DELIVERY_CYCLES as readonly string[]).includes(value)
}

/**
 * De onde veio o ciclo: gravado no item do anexo, padrão do insumo, conservação do item de
 * compra (resfriado entra toda semana) ou o fallback mensal.
 */
export type DeliveryCycleSource = "item" | "ingredient" | "conservation" | "fallback"
export type MinOrderSource = "suggested" | "item"

export type QuantityLimitWarning =
	/** Acréscimo efetivo abaixo de TIGHT_INCREASE_PERCENT: pode faltar numa anormalidade. */
	| "increase_tight"
	/** Acréscimo acima de JUSTIFICATION_INCREASE_PERCENT: entra na justificativa da quantidade máxima. */
	| "increase_requires_justification"
	/** O mínimo passa da máxima: não cabe nem uma ordem de fornecimento. */
	| "min_exceeds_max"
	/** Cada pedido traz mais do que se consome num ciclo de entrega. */
	| "min_exceeds_cycle_consumption"
	/** Pedindo sempre o mínimo, a máxima acaba antes de cobrir os ciclos da vigência. */
	| "min_exhausts_before_validity"

export interface QuantityLimits {
	/** Quantidade estimada, na unidade de compra (sem acréscimo). */
	estimatedQuantity: number
	increasePercent: number
	/** Quantidade máxima do anexo (Lei 14.133, art. 82, I). */
	maxQuantity: number
	/** Acréscimo efetivo da máxima sobre a estimada, em %, já com o arredondamento. Null sem estimada. */
	effectiveIncreasePercent: number | null
	deliveryCycle: DeliveryCycle
	deliveryCycleSource: DeliveryCycleSource
	/** Entregas que cabem na vigência no ciclo resolvido. */
	deliveriesInValidity: number
	/** Consumo planejado de um ciclo de entrega (estimada ÷ entregas), sem arredondar. */
	cycleConsumption: number
	suggestedMinOrderQuantity: number
	/** Mínimo por pedido efetivo: o do item quando informado, senão o sugerido. */
	minOrderQuantity: number
	minOrderSource: MinOrderSource
	warnings: QuantityLimitWarning[]
}

/** Ciclo do item: o gravado no item do anexo, senão o padrão do insumo, senão a conservação, senão mensal. */
export function resolveDeliveryCycle({
	itemCycle,
	ingredientCycle,
	conservationClass,
}: {
	itemCycle?: string | null
	ingredientCycle?: string | null
	conservationClass?: string | null
}): { cycle: DeliveryCycle; source: DeliveryCycleSource } {
	if (isDeliveryCycle(itemCycle)) return { cycle: itemCycle, source: "item" }
	if (isDeliveryCycle(ingredientCycle)) return { cycle: ingredientCycle, source: "ingredient" }
	// Só resfriado indica perecível: congelado e seco aguentam o mês no estoque.
	if (isConservationClass(conservationClass) && conservationClass === "resfriado") return { cycle: "weekly", source: "conservation" }
	return { cycle: "monthly", source: "fallback" }
}

/** Entregas de um ciclo dentro da vigência: 52 semanas ou 12 meses por ano, nunca zero. */
export function countDeliveries(cycle: DeliveryCycle, validityMonths: number): number {
	const months = Math.max(1, validityMonths)
	if (cycle === "monthly") return months
	return Math.max(1, Math.floor((months * 365) / 12 / 7))
}

/** Acréscimo do item quando informado, senão o do anexo. */
export function resolveIncreasePercent(itemPercent: number | null | undefined, quantityEstimatePercent: number | null | undefined): number {
	if (itemPercent != null) return itemPercent
	return quantityEstimatePercent ?? DEFAULT_MAX_INCREASE_PERCENT
}

/** Quantidade máxima = estimada × (1 + acréscimo), arredondada para cima na unidade inteira. */
export function computeMaxQuantity(estimatedQuantity: number, increasePercent: number): number {
	if (!(estimatedQuantity > 0)) return 0
	// Arredondar o produto em 6 casas antes do ceil: 100 × 1.1 = 110.00000000000001 viraria 111.
	return Math.ceil(Number((estimatedQuantity * (1 + increasePercent / 100)).toFixed(6)))
}

/** Percentual padrão da quantidade mínima a ser cotada: o licitante cota a máxima inteira. */
export const DEFAULT_MIN_QUOTE_PERCENT = 100

/**
 * Quantidade mínima a ser cotada (Lei 14.133/2021, art. 82, II): percentual da quantidade máxima,
 * arredondado para cima. O produto é arredondado em 6 casas antes do teto, como em
 * `computeMaxQuantity`: `Math.ceil(100 * 0.07)` daria 8.
 */
export function computeMinQuoteQuantity(maxQuantity: number | null | undefined, percent: number | null | undefined): number | null {
	if (maxQuantity == null || !(maxQuantity > 0)) return maxQuantity == null ? null : 0
	const share = percent ?? DEFAULT_MIN_QUOTE_PERCENT
	return Math.ceil(Number(((maxQuantity * share) / 100).toFixed(6)))
}

export function computeQuantityLimits({
	estimatedQuantity,
	validityMonths,
	increasePercent,
	deliveryCycle,
	minOrderOverride,
}: {
	estimatedQuantity: number
	validityMonths: number
	increasePercent: number
	deliveryCycle: { cycle: DeliveryCycle; source: DeliveryCycleSource }
	minOrderOverride?: number | null
}): QuantityLimits {
	const target = estimatedQuantity > 0 ? estimatedQuantity : 0
	const maxQuantity = computeMaxQuantity(target, increasePercent)
	const effectiveIncreasePercent = target > 0 ? ((maxQuantity - target) / target) * 100 : null

	const deliveriesInValidity = countDeliveries(deliveryCycle.cycle, validityMonths)
	const cycleConsumption = target / deliveriesInValidity

	const suggestedMinOrderQuantity = maxQuantity === 0 ? 0 : Math.min(maxQuantity, Math.max(1, Math.floor((cycleConsumption * MIN_ORDER_SHARE_PERCENT) / 100)))

	const hasOverride = minOrderOverride != null && minOrderOverride > 0
	const minOrderQuantity = hasOverride ? minOrderOverride : suggestedMinOrderQuantity

	const warnings: QuantityLimitWarning[] = []
	// Pelo acréscimo EFETIVO: 3 kg com 5% de acréscimo viram 4 kg (33% efetivos), e isso não é colado.
	if (effectiveIncreasePercent != null && effectiveIncreasePercent < TIGHT_INCREASE_PERCENT) warnings.push("increase_tight")
	if (increasePercent > JUSTIFICATION_INCREASE_PERCENT) warnings.push("increase_requires_justification")
	if (maxQuantity > 0 && minOrderQuantity > 0) {
		if (minOrderQuantity > maxQuantity) {
			warnings.push("min_exceeds_max")
		} else {
			// Tolerância do arredondamento para inteiro: o sugerido nunca dispara os avisos.
			if (minOrderQuantity > Math.max(1, Math.ceil(cycleConsumption))) warnings.push("min_exceeds_cycle_consumption")
			if (Math.floor(maxQuantity / minOrderQuantity) < deliveriesInValidity && minOrderQuantity > 1) warnings.push("min_exhausts_before_validity")
		}
	}

	return {
		estimatedQuantity: target,
		increasePercent,
		maxQuantity,
		effectiveIncreasePercent,
		deliveryCycle: deliveryCycle.cycle,
		deliveryCycleSource: deliveryCycle.source,
		deliveriesInValidity,
		cycleConsumption,
		suggestedMinOrderQuantity,
		minOrderQuantity,
		minOrderSource: hasOverride ? "item" : "suggested",
		warnings,
	}
}

/**
 * Limites de UM item do anexo, com as heranças resolvidas. É a única entrada usada pela tela,
 * pela exportação, pela trava de conclusão e pelo snapshot — cálculos separados divergiriam
 * no primeiro ajuste de regra.
 *
 * A estimada é a quantidade na unidade de COMPRA quando o insumo tem item de compra vinculado;
 * sem vínculo, a da cozinha (é o que o anexo registraria).
 */
export function computeQuantityEstimateItemLimits(
	item: {
		purchaseQuantity: number | null | undefined
		estimatedQuantity: number
		deliveryCycle?: string | null
		ingredientDeliveryCycle?: string | null
		conservationClass?: string | null
		maxIncreasePercent?: number | null
		minOrderQuantity?: number | null
	},
	list: { validityMonths?: number | null; maxIncreasePercent?: number | null }
): QuantityLimits {
	return computeQuantityLimits({
		estimatedQuantity: item.purchaseQuantity ?? item.estimatedQuantity,
		validityMonths: list.validityMonths ?? DEFAULT_VALIDITY_MONTHS,
		increasePercent: resolveIncreasePercent(item.maxIncreasePercent, list.maxIncreasePercent),
		deliveryCycle: resolveDeliveryCycle({
			itemCycle: item.deliveryCycle,
			ingredientCycle: item.ingredientDeliveryCycle,
			conservationClass: item.conservationClass,
		}),
		minOrderOverride: item.minOrderQuantity,
	})
}

/** O anexo precisa da justificativa da quantidade máxima quando algum item passou do acréscimo de referência. */
export function requiresMaxQuantityJustification(limits: readonly Pick<QuantityLimits, "warnings">[]): boolean {
	return limits.some((l) => l.warnings.includes("increase_requires_justification"))
}

export const QUANTITY_LIMIT_WARNING_LABELS: Record<QuantityLimitWarning, string> = {
	increase_tight: `Acréscimo abaixo de ${TIGHT_INCREASE_PERCENT}% sobre a quantidade estimada: pode faltar numa situação anormal — perda de estoque, ou fornecedor de outro item que deixa de entregar e joga a demanda neste até chamar o reserva ou abrir novo pregão.`,
	increase_requires_justification: `Acréscimo acima de ${JUSTIFICATION_INCREASE_PERCENT}%: entra na justificativa da quantidade máxima, exigida para concluir o anexo.`,
	min_exceeds_max: "O mínimo por ordem de fornecimento é maior que a quantidade máxima: nenhuma ordem cabe.",
	min_exceeds_cycle_consumption: "Cada ordem de fornecimento traria mais do que se consome até a próxima entrega.",
	min_exhausts_before_validity: "Pedindo sempre o mínimo, a quantidade máxima acaba antes do fim da vigência.",
}
