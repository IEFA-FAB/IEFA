/**
 * Montagem pura da requisição de saída do dia (`issue.fn.ts`): sugestão pela produção, valores da
 * abertura e o retrato que decide o fechamento.
 *
 * Fora de `issue.fn.ts` porque teste unitário não pode importar `@/server/*`; as funções de lá ficam
 * só com as leituras, na mesma ordem.
 */

import {
	type checkDayClosure,
	computeTheoreticalConsumption,
	type IssueLineForVariance,
	type RecipeSnapshotForIssue,
	roundToIssuePackage,
} from "@iefa/sisub-domain"

type Numeric = number | string | null

// ─── Sugestão do dia ─────────────────────────────────────────────────────────

/** Tarefa que já saiu pela "Baixa por Produção" não entra na sugestão do dia. */
export function filterTasksNotIssuedByProduction<T extends { id: string }>(
	tasks: readonly T[],
	issuedMoves: ReadonlyArray<{ production_task_id: string | null }>
): T[] {
	const issuedByProduction = new Set(issuedMoves.map((move) => move.production_task_id))
	return tasks.filter((task) => !issuedByProduction.has(task.id))
}

export function collectDailyMenuIds(menuItems: ReadonlyArray<{ daily_menu_id: string | null }>): string[] {
	return [...new Set(menuItems.map((item) => item.daily_menu_id).filter((id) => id != null))]
}

/** Prato de uma refeição removida sai junto com ela; prato sem refeição fica. */
export function indexActiveMenuItems<M extends { id: string; daily_menu_id: string | null }>(
	menuItems: readonly M[],
	mealTypeByMenu: ReadonlyMap<string, string | null>
): Map<string, M> {
	return new Map(menuItems.filter((item) => item.daily_menu_id == null || mealTypeByMenu.has(item.daily_menu_id)).map((item) => [item.id, item]))
}

export interface MenuItemForIssue {
	recipe: RecipeSnapshotForIssue | null
	planned_portion_quantity: number | null
	daily_menu_id: string | null
}

export interface IssueTotal {
	quantity: number
	mealTypeId: string | null
}

/**
 * Consumo teórico somado por insumo, na ordem das tarefas. A refeição é a da primeira tarefa que
 * cita o insumo; citada por duas refeições diferentes, fica sem rótulo.
 */
export function sumTheoreticalConsumption(
	tasks: ReadonlyArray<{ menu_item_id: string }>,
	menuById: ReadonlyMap<string, unknown>,
	mealTypeByMenu: ReadonlyMap<string, string | null>
): Map<string, IssueTotal> {
	const totals = new Map<string, IssueTotal>()
	for (const task of tasks) {
		const menuItem = menuById.get(task.menu_item_id) as MenuItemForIssue | undefined
		if (!menuItem) continue
		const mealTypeId = menuItem.daily_menu_id ? (mealTypeByMenu.get(menuItem.daily_menu_id) ?? null) : null
		for (const line of computeTheoreticalConsumption(menuItem.recipe ?? null, Number(menuItem.planned_portion_quantity ?? 0))) {
			const current = totals.get(line.ingredientId)
			if (!current) {
				totals.set(line.ingredientId, { quantity: line.quantity, mealTypeId })
				continue
			}
			// O arroz que vai no almoço E no jantar sai do estoque uma vez só, e
			// não é de nenhuma das duas refeições: rotulá-lo com a primeira que
			// apareceu manda o almoxarife separar metade da quantidade. Refeição
			// ambígua não tem rótulo.
			totals.set(line.ingredientId, {
				quantity: current.quantity + line.quantity,
				mealTypeId: current.mealTypeId === mealTypeId ? current.mealTypeId : null,
			})
		}
	}
	return totals
}

/** Quantidade BRUTA (com fator de correção), arredondada para a embalagem de saída do insumo. */
export function buildIssueSuggestionLines(
	totals: ReadonlyMap<string, IssueTotal>,
	metaById: ReadonlyMap<string, { correction_factor: Numeric; issue_package_quantity: number | null }>
): Array<{ ingredientId: string; mealTypeId: string | null; suggestedQty: number }> {
	return [...totals.entries()].map(([ingredientId, total]) => {
		const meta = metaById.get(ingredientId)
		const gross = total.quantity * Number(meta?.correction_factor ?? 1)
		return {
			ingredientId,
			mealTypeId: total.mealTypeId,
			suggestedQty: roundToIssuePackage(gross, meta?.issue_package_quantity),
		}
	})
}

// ─── Abertura ────────────────────────────────────────────────────────────────

export interface IssueRequestOpenInput {
	kitchenId: number
	origin: "production" | "ad_hoc"
	destination?: string
	purpose?: string
	authorizationReference?: string
}

/** Saída avulsa sem destino ou sem motivo é saída sem dono. */
export function isAdHocMissingOwner(data: Pick<IssueRequestOpenInput, "origin" | "destination" | "purpose">): boolean {
	return data.origin === "ad_hoc" && (!data.purpose?.trim() || !data.destination?.trim())
}

export function buildIssueRequestValues(data: IssueRequestOpenInput, issueDate: string, userId: string) {
	return {
		kitchen_id: data.kitchenId,
		issue_date: issueDate,
		origin: data.origin,
		destination: data.destination?.trim() || null,
		purpose: data.purpose?.trim() || null,
		authorization_reference: data.authorizationReference?.trim() || null,
		created_by: userId,
	}
}

// ─── Retrato do dia ──────────────────────────────────────────────────────────

/** Emitido, devolvido e o último custo unitário por insumo, a partir dos movimentos da requisição. */
export function tallyIssueMovements(movements: ReadonlyArray<{ ingredient_id: string | null; type: string; quantity: Numeric; unit_cost: Numeric }>): {
	issued: Map<string, number>
	returned: Map<string, number>
	costs: Map<string, number>
} {
	const issued = new Map<string, number>()
	const returned = new Map<string, number>()
	const costs = new Map<string, number>()
	for (const move of movements) {
		if (move.ingredient_id == null) continue
		const target = move.type === "issue_return" ? returned : issued
		target.set(move.ingredient_id, (target.get(move.ingredient_id) ?? 0) + Number(move.quantity))
		if (move.unit_cost != null) costs.set(move.ingredient_id, Number(move.unit_cost))
	}
	return { issued, returned, costs }
}

/** Insumos do retrato: os planejados e os que saíram sem plano, sem repetição. */
export function collectIssueIngredientIds(rows: ReadonlyArray<{ ingredient_id: string }>, issued: ReadonlyMap<string, number>): string[] {
	return [...new Set([...rows.map((row) => row.ingredient_id), ...issued.keys()])]
}

/** Custo médio só para o insumo que não teve movimento com custo nesta requisição (muta `costs`). */
export function fillMissingAverageCosts(costs: Map<string, number>, averages: ReadonlyArray<{ ingredient_id: string | null; avg_unit_cost: Numeric }>): void {
	for (const row of averages) {
		if (row.ingredient_id == null) continue
		if (!costs.has(row.ingredient_id) && row.avg_unit_cost != null) costs.set(row.ingredient_id, Number(row.avg_unit_cost))
	}
}

export interface IssueRequestItemRow {
	id: string
	ingredient_id: string
	suggested_qty: Numeric
	variance_reason: string | null
}

export function buildIssueVarianceLines(input: {
	ingredientIds: readonly string[]
	rows: readonly IssueRequestItemRow[]
	issued: ReadonlyMap<string, number>
	returned: ReadonlyMap<string, number>
	costs: ReadonlyMap<string, number>
}): IssueLineForVariance[] {
	const { rows, issued, returned, costs } = input
	return input.ingredientIds.map((ingredientId) => {
		const row = rows.find((item) => item.ingredient_id === ingredientId)
		return {
			ingredientId,
			suggestedQty: row?.suggested_qty != null ? Number(row.suggested_qty) : null,
			issuedNetQty: Number(((issued.get(ingredientId) ?? 0) - (returned.get(ingredientId) ?? 0)).toFixed(4)),
			unitCost: costs.get(ingredientId) ?? null,
			reason: row?.variance_reason ?? null,
		}
	})
}

type VarianceVerdict = ReturnType<typeof checkDayClosure>["verdicts"][number]

/** Veredito de cada linha com o que a tela mostra: a linha da requisição, o nome e o motivo. */
export function decorateIssueVerdicts(input: {
	verdicts: readonly VarianceVerdict[]
	rows: readonly IssueRequestItemRow[]
	names: ReadonlyMap<string, { description: string | null; measure_unit: string | null }>
	lines: readonly IssueLineForVariance[]
}) {
	const { rows, names, lines } = input
	return input.verdicts.map((verdict) => ({
		...verdict,
		itemId: rows.find((row) => row.ingredient_id === verdict.ingredientId)?.id ?? null,
		description: names.get(verdict.ingredientId)?.description ?? "—",
		measureUnit: names.get(verdict.ingredientId)?.measure_unit ?? null,
		reason: lines.find((line) => line.ingredientId === verdict.ingredientId)?.reason ?? null,
	}))
}
