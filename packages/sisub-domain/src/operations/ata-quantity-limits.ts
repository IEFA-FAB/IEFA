/**
 * Limites do anexo de quantitativos da ATA: quantidade MÁXIMA registrada e quantidade
 * MÍNIMA por pedido, derivadas do alvo que o planejamento de cardápio calculou.
 *
 * São duas grandezas de natureza diferente, e confundi-las é o erro que este módulo evita:
 *
 *  • Máxima — teto do que a ata registra para a vigência inteira. É sobre ela que o
 *    fornecedor dimensiona a proposta e o valor estimado da ata. A folga entre o alvo e a
 *    máxima é o que segura o rancho numa anormalidade: estoque perdido (câmara que parou,
 *    lote condenado), fornecedor que deixa de entregar e empurra a demanda para o item
 *    substituto (sem frango, pede-se mais carne suína até chamar o cadastro reserva ou abrir
 *    outro pregão). E a folga tem que nascer na ata: ela não admite acréscimo depois
 *    (Decreto 11.462/2023, art. 23; o acréscimo de 25% do art. 125 da Lei 14.133 é de
 *    CONTRATO). Folga apertada demais vira aviso; folga grande demais pede justificativa —
 *    quantitativo inflado para vender adesão é a "barriga de aluguel" que o TCU condena
 *    (Acórdãos 1.668/2021 e 80/2022 – Plenário). A justificativa é UMA por ata, não por item.
 *
 *  • Mínima por pedido — o menor lote que a unidade pode pedir de uma vez. Ela não mede a
 *    vigência, mede o CICLO DE ENTREGA: perecível entra toda semana, não perecível uma vez
 *    por mês. Mínimo alto demais obriga cada pedido a trazer mais do que se consome até a
 *    próxima entrega (perecível estraga, seco ocupa depósito) e esgota a ata antes do fim;
 *    mínimo baixo demais fragmenta a entrega e encarece o frete que o fornecedor embute no
 *    preço. Precedente: o TR do PE 90004/2025 da 12ª RM fixa a "requisição mínima" na
 *    demanda de uma semana. A sugestão aqui é uma FRAÇÃO do consumo de um ciclo: semana de
 *    feriado ou de efetivo reduzido consome menos, e um mínimo igual à média impediria o
 *    pedido dessa semana.
 *
 * Quantidades são inteiras na unidade de COMPRA: é assim que o item entra no pregão e no
 * Compras.gov (`quantidadeHomologadaItem`). Máxima arredonda para cima (arredondar para
 * baixo cortaria o alvo); mínima arredonda para baixo (arredondar para cima apertaria o
 * fluxo), nunca abaixo de 1.
 */

import { isConservationClass } from "./conditioning.ts"

/** Margem padrão da quantidade máxima sobre o alvo planejado, em %. */
export const DEFAULT_MAX_MARGIN_PERCENT = 20

/** Teto da margem aceita (CHECK do banco). */
export const MAX_MARGIN_PERCENT_LIMIT = 100

/**
 * Folga efetiva abaixo disto (em % do alvo, já com o arredondamento) é "colada": cobre o
 * erro de previsão comum, mas não uma anormalidade de estoque ou de fornecedor.
 */
export const TIGHT_MARGIN_PERCENT = 10

/** Margem acima disto exige a justificativa da ata para publicar. */
export const JUSTIFICATION_MARGIN_PERCENT = 50

/** Fração do consumo de um ciclo de entrega usada como mínimo por pedido sugerido, em %. */
export const MIN_ORDER_SHARE_PERCENT = 50

/** Validade padrão quando a ata não declarou a sua (Lei 14.133, art. 84: um ano). */
export const DEFAULT_VALIDITY_MONTHS = 12

/** Vocabulário espelhado nos CHECK de `kitchen.ingredient` e `procurement.procurement_list_item`. */
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
 * De onde veio o ciclo: gravado no item da ata, padrão do insumo, conservação do item de
 * compra (resfriado entra toda semana) ou o fallback mensal.
 */
export type DeliveryCycleSource = "ata" | "ingredient" | "conservation" | "fallback"
export type MinOrderSource = "suggested" | "item"

export type QuantityLimitWarning =
	/** Folga efetiva abaixo de TIGHT_MARGIN_PERCENT: pode faltar numa anormalidade. */
	| "margin_tight"
	/** Margem acima de JUSTIFICATION_MARGIN_PERCENT: entra na justificativa da ata. */
	| "margin_requires_justification"
	/** O mínimo passa da máxima: a ata não admite nem um pedido. */
	| "min_exceeds_max"
	/** Cada pedido traz mais do que se consome num ciclo de entrega. */
	| "min_exceeds_cycle_consumption"
	/** Pedindo sempre o mínimo, a máxima acaba antes de cobrir os ciclos da vigência. */
	| "min_exhausts_before_validity"

export interface QuantityLimits {
	/** Alvo planejado, na unidade de compra (sem margem). */
	targetQuantity: number
	marginPercent: number
	/** Quantidade máxima registrada na ata. */
	maxQuantity: number
	/** Folga efetiva da máxima sobre o alvo, em %, já com o arredondamento. Null sem alvo. */
	effectiveMarginPercent: number | null
	deliveryCycle: DeliveryCycle
	deliveryCycleSource: DeliveryCycleSource
	/** Entregas que cabem na vigência no ciclo resolvido. */
	deliveriesInValidity: number
	/** Consumo planejado de um ciclo de entrega (alvo ÷ entregas), sem arredondar. */
	cycleConsumption: number
	suggestedMinOrderQuantity: number
	/** Mínimo por pedido efetivo: o do item quando informado, senão o sugerido. */
	minOrderQuantity: number
	minOrderSource: MinOrderSource
	warnings: QuantityLimitWarning[]
}

/** Ciclo do item: o gravado na ata, senão o padrão do insumo, senão a conservação, senão mensal. */
export function resolveDeliveryCycle({
	ataCycle,
	ingredientCycle,
	conservationClass,
}: {
	ataCycle?: string | null
	ingredientCycle?: string | null
	conservationClass?: string | null
}): { cycle: DeliveryCycle; source: DeliveryCycleSource } {
	if (isDeliveryCycle(ataCycle)) return { cycle: ataCycle, source: "ata" }
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

/** Margem do item quando informada, senão a da ata. */
export function resolveMarginPercent(itemPercent: number | null | undefined, listPercent: number | null | undefined): number {
	if (itemPercent != null) return itemPercent
	return listPercent ?? DEFAULT_MAX_MARGIN_PERCENT
}

/** Quantidade máxima = alvo × (1 + margem), arredondada para cima na unidade inteira. */
export function computeMaxQuantity(targetQuantity: number, marginPercent: number): number {
	if (!(targetQuantity > 0)) return 0
	// Arredondar o produto em 6 casas antes do ceil: 100 × 1.1 = 110.00000000000001 viraria 111.
	return Math.ceil(Number((targetQuantity * (1 + marginPercent / 100)).toFixed(6)))
}

export function computeQuantityLimits({
	targetQuantity,
	validityMonths,
	marginPercent,
	deliveryCycle,
	minOrderOverride,
}: {
	targetQuantity: number
	validityMonths: number
	marginPercent: number
	deliveryCycle: { cycle: DeliveryCycle; source: DeliveryCycleSource }
	minOrderOverride?: number | null
}): QuantityLimits {
	const target = targetQuantity > 0 ? targetQuantity : 0
	const maxQuantity = computeMaxQuantity(target, marginPercent)
	const effectiveMarginPercent = target > 0 ? ((maxQuantity - target) / target) * 100 : null

	const deliveriesInValidity = countDeliveries(deliveryCycle.cycle, validityMonths)
	const cycleConsumption = target / deliveriesInValidity

	const suggestedMinOrderQuantity = maxQuantity === 0 ? 0 : Math.min(maxQuantity, Math.max(1, Math.floor((cycleConsumption * MIN_ORDER_SHARE_PERCENT) / 100)))

	const hasOverride = minOrderOverride != null && minOrderOverride > 0
	const minOrderQuantity = hasOverride ? minOrderOverride : suggestedMinOrderQuantity

	const warnings: QuantityLimitWarning[] = []
	// Pela folga EFETIVA: 3 kg com 5% de margem viram 4 kg (33% de folga), e isso não é colado.
	if (effectiveMarginPercent != null && effectiveMarginPercent < TIGHT_MARGIN_PERCENT) warnings.push("margin_tight")
	if (marginPercent > JUSTIFICATION_MARGIN_PERCENT) warnings.push("margin_requires_justification")
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
		targetQuantity: target,
		marginPercent,
		maxQuantity,
		effectiveMarginPercent,
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
 * Limites de UM item da ata, com as heranças resolvidas. É a única entrada usada pela tela,
 * pela exportação, pela trava de publicação e pelo snapshot — cálculos separados divergiriam
 * no primeiro ajuste de regra.
 *
 * O alvo é a quantidade na unidade de COMPRA quando o insumo tem item de compra vinculado;
 * sem vínculo, a da cozinha (é o que a ata registraria).
 */
export function computeAtaItemLimits(
	item: {
		purchaseQuantity: number | null | undefined
		totalQuantity: number
		deliveryCycle?: string | null
		ingredientDeliveryCycle?: string | null
		conservationClass?: string | null
		maxMarginPercent?: number | null
		minOrderQuantity?: number | null
	},
	list: { validityMonths?: number | null; maxMarginPercent?: number | null }
): QuantityLimits {
	return computeQuantityLimits({
		targetQuantity: item.purchaseQuantity ?? item.totalQuantity,
		validityMonths: list.validityMonths ?? DEFAULT_VALIDITY_MONTHS,
		marginPercent: resolveMarginPercent(item.maxMarginPercent, list.maxMarginPercent),
		deliveryCycle: resolveDeliveryCycle({
			ataCycle: item.deliveryCycle,
			ingredientCycle: item.ingredientDeliveryCycle,
			conservationClass: item.conservationClass,
		}),
		minOrderOverride: item.minOrderQuantity,
	})
}

/** A ata precisa de justificativa quando algum item passou da margem de referência. */
export function requiresMarginJustification(limits: readonly Pick<QuantityLimits, "warnings">[]): boolean {
	return limits.some((l) => l.warnings.includes("margin_requires_justification"))
}

export const QUANTITY_LIMIT_WARNING_LABELS: Record<QuantityLimitWarning, string> = {
	margin_tight: `Folga abaixo de ${TIGHT_MARGIN_PERCENT}% sobre o previsto: pode faltar numa situação anormal — perda de estoque, ou fornecedor de outro item que deixa de entregar e joga a demanda neste até chamar o reserva ou abrir novo pregão.`,
	margin_requires_justification: `Margem acima de ${JUSTIFICATION_MARGIN_PERCENT}%: entra na justificativa da ata, exigida para publicar.`,
	min_exceeds_max: "O mínimo por pedido é maior que a quantidade máxima — nenhum pedido cabe na ata.",
	min_exceeds_cycle_consumption: "Cada pedido traria mais do que se consome até a próxima entrega.",
	min_exhausts_before_validity: "Pedindo sempre o mínimo, a quantidade máxima acaba antes do fim da vigência.",
}
