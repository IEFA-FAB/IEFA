/**
 * Sugestão de saída e variância do dia.
 *
 * Duas decisões aqui vieram da revisão de operação, e as duas existem para o
 * sistema não ensinar o operador a mentir:
 *
 *  • **O motivo é pedido uma vez, no fechamento do dia**, não a cada emissão.
 *    Material sai ao longo do dia, em várias idas ao estoque; pedir
 *    justificativa em cada ida faz todo mundo marcar "outro" e seguir.
 *  • **Desvio precisa passar do percentual E de um piso absoluto.** Sem piso,
 *    200 g de sal fora do previsto viram "variância" com a mesma gravidade de
 *    40 kg de carne, e a lista de exceções deixa de significar alguma coisa.
 *
 * A sugestão é arredondada PARA CIMA na embalagem de saída quando o item tem
 * uma: sugerir 3,37 KG de algo que só sai em saco de 5 KG garante desvio em
 * toda linha, todo dia.
 */

export const ISSUE_VARIANCE_REASONS = ["headcount_change", "production_loss", "yield_difference", "recipe_substitution", "portion_adjustment", "other"] as const
export type IssueVarianceReason = (typeof ISSUE_VARIANCE_REASONS)[number]

export const ISSUE_VARIANCE_REASON_LABELS: Record<IssueVarianceReason, string> = {
	headcount_change: "Efetivo diferente do previsto",
	production_loss: "Perda no preparo",
	yield_difference: "Rendimento diferente do previsto",
	recipe_substitution: "Substituição de insumo",
	portion_adjustment: "Per capita ajustado",
	other: "Outro",
}

export interface IssueToleranceSettings {
	/** Percentual de desvio aceito sem motivo. */
	tolerancePct: number
	/** Piso em VALOR: abaixo disso o desvio não pede motivo, qualquer que seja o %. */
	toleranceFloorValue: number
}

export interface IssueLineForVariance {
	ingredientId: string
	/** Sugestão congelada no fechamento. Null/0 = sem planejamento no dia. */
	suggestedQty: number | null
	/** Emitido menos devolvido. */
	issuedNetQty: number
	/** Custo médio do item, para aplicar o piso em valor. */
	unitCost: number | null
	/** Embalagem de saída, quando o item tem uma. */
	issuePackageQuantity?: number | null
	reason?: string | null
}

export interface VarianceVerdict {
	ingredientId: string
	suggestedQty: number | null
	issuedNetQty: number
	deltaQty: number
	deltaPct: number | null
	deltaValue: number
	/** Precisa de motivo no fechamento? */
	requiresReason: boolean
	/** Já tem motivo informado. */
	hasReason: boolean
}

/**
 * Sugestão do dia por ingrediente, arredondada na embalagem de saída.
 *
 * `grossQuantity` já vem com fator de correção aplicado (o mesmo cálculo do
 * MRP): o que sai do estoque é o peso BRUTO, não o líquido da receita.
 */
export function roundToIssuePackage(grossQuantity: number, packageQuantity?: number | null): number {
	if (packageQuantity == null || packageQuantity <= 0) return Number(grossQuantity.toFixed(4))
	return Number((Math.ceil(grossQuantity / packageQuantity) * packageQuantity).toFixed(4))
}

/** Avalia uma linha: quanto desviou e se o desvio pede motivo. */
export function evaluateVariance(line: IssueLineForVariance, settings: IssueToleranceSettings): VarianceVerdict {
	const suggested = line.suggestedQty ?? 0
	const delta = Number((line.issuedNetQty - suggested).toFixed(4))
	const deltaValue = Number((Math.abs(delta) * (line.unitCost ?? 0)).toFixed(2))
	const deltaPct = suggested > 0 ? Number(((Math.abs(delta) / suggested) * 100).toFixed(2)) : null

	// Sem sugestão não há variância: a cozinha que não planeja no sisub não é
	// obrigada a justificar o que o sistema nunca previu.
	const hasSuggestion = suggested > 0
	const overPct = deltaPct != null && deltaPct > settings.tolerancePct
	const overFloor = deltaValue > settings.toleranceFloorValue
	// exige as DUAS condições: percentual grande em item barato é ruído, e
	// valor grande dentro do percentual é o previsto para item caro
	const requiresReason = hasSuggestion && overPct && overFloor

	return {
		ingredientId: line.ingredientId,
		suggestedQty: line.suggestedQty,
		issuedNetQty: line.issuedNetQty,
		deltaQty: delta,
		deltaPct,
		deltaValue,
		requiresReason,
		hasReason: Boolean(line.reason),
	}
}

export interface CloseDayCheck {
	verdicts: VarianceVerdict[]
	/** Linhas que precisam de motivo e ainda não têm. */
	pending: VarianceVerdict[]
	canClose: boolean
}

/** O que falta para fechar o dia. */
export function checkDayClosure(lines: readonly IssueLineForVariance[], settings: IssueToleranceSettings): CloseDayCheck {
	const verdicts = lines.map((line) => evaluateVariance(line, settings))
	const pending = verdicts.filter((verdict) => verdict.requiresReason && !verdict.hasReason)
	return { verdicts, pending, canClose: pending.length === 0 }
}
