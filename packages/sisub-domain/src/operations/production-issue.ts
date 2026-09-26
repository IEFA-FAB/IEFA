/**
 * Baixa por produção (Fase 5): consumo teórico calculado do SNAPSHOT congelado
 * da receita (`menu_items.recipe`, json), nunca da receita viva — o que foi
 * produzido é o registro auditável (MCASP), imune a edições posteriores.
 *
 * A fórmula é a mesma dos dois motores de procurement (scaleIngredientQuantity);
 * a alocação em lotes usa FEFO (stock-math). Módulo puro: o chamador entrega o
 * snapshot e o efetivo, aqui só a matemática.
 */

import { scaleIngredientQuantity } from "./demand-math.ts"

export interface SnapshotIngredientRow {
	ingredient_id?: string | null
	net_quantity?: number | string | null
	ingredient?: { description?: string | null; measure_unit?: string | null } | null
}

export interface RecipeSnapshotForIssue {
	portion_yield?: number | string | null
	ingredients?: SnapshotIngredientRow[] | null
}

export interface TheoreticalConsumption {
	ingredientId: string
	description: string
	measureUnit: string | null
	quantity: number
}

/**
 * Consumo teórico por ingrediente do snapshot × efetivo planejado.
 * Linhas sem ingredient_id (XOR frouxo do schema permite) ou sem quantidade
 * são ignoradas; ingredientes repetidos somam.
 */
export function computeTheoreticalConsumption(snapshot: RecipeSnapshotForIssue | null | undefined, plannedPortions: number): TheoreticalConsumption[] {
	if (!snapshot?.ingredients || plannedPortions <= 0) return []
	const portionYield = Number(snapshot.portion_yield ?? 0)

	const byIngredient = new Map<string, TheoreticalConsumption>()
	for (const row of snapshot.ingredients) {
		const ingredientId = row.ingredient_id ?? null
		if (!ingredientId) continue
		const net = Number(row.net_quantity ?? 0)
		if (!Number.isFinite(net) || net <= 0) continue

		const quantity = scaleIngredientQuantity(net, plannedPortions, portionYield)
		const existing = byIngredient.get(ingredientId)
		if (existing) {
			existing.quantity = Number((existing.quantity + quantity).toFixed(4))
		} else {
			byIngredient.set(ingredientId, {
				ingredientId,
				description: row.ingredient?.description ?? "(sem descrição)",
				measureUnit: row.ingredient?.measure_unit ?? null,
				quantity: Number(quantity.toFixed(4)),
			})
		}
	}
	return [...byIngredient.values()]
}

/**
 * O que falta baixar de cada insumo depois das saídas TARDIAS já ligadas à tarefa.
 *
 * A saída tardia é de um insumo (o óleo que faltou lançar), não a baixa da tarefa: a Baixa por
 * Produção segue possível e sugere só o que falta — o insumo já baixado por inteiro sai da
 * lista, o parcial vem com o restante. `lateIssued` é a quantidade líquida por insumo.
 */
export function remainingAfterLateIssues<T extends TheoreticalConsumption>(
	lines: readonly T[],
	lateIssued: ReadonlyMap<string, number>
): Array<T & { lateIssued: number }> {
	const out: Array<T & { lateIssued: number }> = []
	for (const line of lines) {
		const already = lateIssued.get(line.ingredientId) ?? 0
		const remaining = Number((line.quantity - already).toFixed(4))
		if (remaining <= 0) continue
		out.push({ ...line, quantity: remaining, lateIssued: already })
	}
	return out
}

/** Validade de sobra congelada: data da produção + shelf_life_days (null = sem validade). */
export function leftoverExpiryDate(productionDate: string, shelfLifeDays: number | null | undefined): string | null {
	if (shelfLifeDays == null || shelfLifeDays <= 0) return null
	const base = new Date(`${productionDate}T00:00:00Z`)
	if (Number.isNaN(base.getTime())) return null
	base.setUTCDate(base.getUTCDate() + shelfLifeDays)
	return base.toISOString().substring(0, 10)
}

/**
 * Primeiro dia da janela da "Baixa por Produção": a competência ABERTA.
 *
 * Era "os últimos 30 dias": a tarefa do dia 31 atrás sumia da lista mesmo com o mês aberto, e
 * a baixa dela só se fazia por ajuste. O limite que importa é o fechamento mensal — depois dele
 * o período lock recusa o movimento. Sem fechamento nenhum, a janela começa no primeiro
 * movimento de estoque da cozinha (antes dele não havia estoque a baixar), e nunca antes de
 * `maxDays` atrás, para a tela não varrer anos de tarefas de uma cozinha que nunca controlou estoque.
 */
export function pendingIssueWindowStart(input: {
	/** Última competência fechada (primeiro dia do mês, "AAAA-MM-01"), ou nula. */
	lastClosedCompetencia: string | null
	/** Data civil do primeiro movimento de estoque da cozinha, ou nula. */
	firstMovementDate: string | null
	today: string
	maxDays?: number
}): string {
	const maxDays = input.maxDays ?? 400
	const floor = new Date(`${input.today}T00:00:00Z`)
	floor.setUTCDate(floor.getUTCDate() - maxDays)
	let start = floor.toISOString().slice(0, 10)
	if (input.firstMovementDate && input.firstMovementDate > start) start = input.firstMovementDate
	if (input.lastClosedCompetencia) {
		const [year, month] = input.lastClosedCompetencia.split("-").map(Number) as [number, number]
		const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`
		if (next > start) start = next
	}
	return start
}

/**
 * O que falta na ficha gravada no dia para a sugestão de saída sair certa dela.
 *
 * `computeTheoreticalConsumption` devolve lista vazia quando a ficha não tem insumos ou o item
 * não tem porções, e trata rendimento ausente como 1 porção — a tela mostrava a sugestão vazia
 * (ou multiplicada pelo número de porções) sem dizer por quê. Cada lacuna aqui vira o aviso
 * "ficha incompleta" na tarefa, na sugestão de saída e na pendência da nutricionista. A
 * preparação provisória (criada no turno só com o nome) é lacuna própria: funciona no dia, mas
 * a ficha técnica ainda não existe.
 */
export type SnapshotGap = "provisional" | "no_ingredients" | "no_yield" | "no_portions"

export const SNAPSHOT_GAP_LABELS: Record<SnapshotGap, string> = {
	provisional: "preparação provisória, criada no turno sem ficha técnica",
	no_ingredients: "ficha sem insumos: a sugestão de saída não inclui esta preparação",
	no_yield: "ficha sem rendimento: a sugestão é calculada como se a receita rendesse 1 porção",
	no_portions: "item sem porções planejadas: a sugestão de saída não inclui esta preparação",
}

export interface SnapshotForGaps extends RecipeSnapshotForIssue {
	provisional_since?: string | null
}

export function findSnapshotGaps(snapshot: SnapshotForGaps | null | undefined, plannedPortions: number | string | null | undefined): SnapshotGap[] {
	const gaps: SnapshotGap[] = []
	if (snapshot?.provisional_since) gaps.push("provisional")
	const usable = (snapshot?.ingredients ?? []).filter((row) => row.ingredient_id && Number(row.net_quantity ?? 0) > 0)
	if (usable.length === 0) gaps.push("no_ingredients")
	// Rendimento só importa quando há insumo para escalar: sem insumo o aviso já é o de cima.
	const portionYield = Number(snapshot?.portion_yield ?? 0)
	if (usable.length > 0 && (!Number.isFinite(portionYield) || portionYield <= 0)) gaps.push("no_yield")
	const portions = Number(plannedPortions ?? 0)
	if (!Number.isFinite(portions) || portions <= 0) gaps.push("no_portions")
	return gaps
}

/** Frase única do aviso, para a tarefa e a sugestão de saída dizerem a mesma coisa. */
export function describeSnapshotGaps(gaps: readonly SnapshotGap[]): string | null {
	if (gaps.length === 0) return null
	return `Ficha incompleta — ${gaps.map((gap) => SNAPSHOT_GAP_LABELS[gap]).join("; ")}.`
}
