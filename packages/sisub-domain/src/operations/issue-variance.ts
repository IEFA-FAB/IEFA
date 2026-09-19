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
	/**
	 * Sugestão congelada no fechamento. `null` = o item NUNCA esteve no plano do
	 * dia (lançado avulso). `0` = esteve e saiu (ou foi planejado com zero): a
	 * linha só nasce da sugestão, então zero é "o plano disse nada disto".
	 */
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
	// obrigada a justificar o que o sistema nunca previu. Mas "nunca previu" é
	// `null`. Sugestão ZERO é o plano dizendo "nada disto" — o insumo saiu do
	// cardápio depois de 40 KG terem saído do estoque —, e contar isso como "sem
	// planejamento" fechava o dia sem justificativa para a saída inteira.
	const hasSuggestion = line.suggestedQty != null
	// contra zero, qualquer saída é desvio de 100 % ou mais: o percentual não
	// tem denominador, e quem decide se é relevante é o piso em valor
	const overPct = suggested > 0 ? deltaPct != null && deltaPct > settings.tolerancePct : delta !== 0
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

/**
 * Forma canônica da sugestão de uma requisição — a MESMA string que
 * `inventory.issue_suggestion_fingerprint` monta no banco: `ingrediente=qtd`
 * com 4 casas, em ordem de ingrediente, separados por vírgula; nula vira vazio.
 *
 * O fechamento a manda junto com a contagem de movimentos: se a sugestão mudou
 * entre o retrato de variância e a trava, o banco recusa. Só a contagem não
 * enxergava "recalcular sugestão" no meio do fechamento.
 */
export function issueSuggestionFingerprint(rows: readonly { ingredientId: string; suggestedQty: number | string | null }[]): string {
	return [...rows]
		.sort((a, b) => (a.ingredientId < b.ingredientId ? -1 : a.ingredientId > b.ingredientId ? 1 : 0))
		.map((row) => `${row.ingredientId}=${row.suggestedQty == null ? "" : Number(row.suggestedQty).toFixed(4)}`)
		.join(",")
}
