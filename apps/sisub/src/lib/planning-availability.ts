/**
 * Disponibilidade dos insumos do que está agendado: "dá para produzir isto?".
 *
 * O cardápio que foi base da contratação não é, necessariamente, o que se produz: depois da
 * homologação a nutricionista troca preparações. Se ela agenda algo cujo insumo não tem como
 * chegar, o aviso tem de aparecer no agendamento, enquanto ainda dá para trocar, e não no dia,
 * quando o turno descobre a falta. A pergunta muda com a distância da data:
 *
 * - **Semana atual:** só o estoque resolve a tempo. Avisa quando o saldo não cobre o que a semana
 *   agendada consome.
 * - **Resto do mês:** estoque, OF a caminho ou empenho com saldo. Sem nenhum dos três, a unidade
 *   ainda tem de empenhar, e talvez não dê tempo.
 * - **Depois do mês:** precisa haver uma contratação vigente na data (item de ARP com saldo, ou
 *   empenho de contratação de origem cuja vigência alcança a data).
 *
 * Nunca bloqueia: é aviso para trocar a preparação ou acionar a unidade (a execução não trava).
 * Módulo puro: as leituras ficam em `planning-availability.fn.ts`.
 */

import { resolveItemDemand, scaleIngredientQuantity } from "@iefa/sisub-domain"
import { addCivilDays, getCivilMonthBounds } from "@iefa/sisub-domain/civil-date"

export type AvailabilityHorizon = "week" | "month" | "future"

export type AvailabilityGap =
	/** Insumo sem item de compra: não há como comprá-lo por processo nenhum. */
	| "no_purchase_item"
	/** Nenhuma ata nem contratação vigente na data. */
	| "no_contract"
	/** No mês: nem estoque, nem OF a caminho, nem empenho com saldo. */
	| "no_empenho_or_stock"
	/** Na semana: o estoque não cobre o que a semana agendada consome. */
	| "short_stock"

export interface PlannedNeed {
	date: string
	dailyMenuId: string
	mealName: string
	menuItemId: string
	recipeName: string
	ingredientId: string
	description: string
	measureUnit: string | null
	/** Quantidade líquida da ficha × efetivo; 0 quando o efetivo ainda não foi definido. */
	quantity: number
	excludedFromProcurement: boolean
}

export interface AvailabilityWarning {
	date: string
	dailyMenuId: string
	mealName: string
	menuItemId: string
	recipeName: string
	ingredientId: string
	description: string
	measureUnit: string | null
	horizon: AvailabilityHorizon
	gap: AvailabilityGap
	/** Só em `short_stock`: o que a semana agendada consome e o saldo de hoje. */
	weekNeed?: number
	stock?: number
	/** Há OF enviada para o insumo: na semana, pode chegar a tempo. */
	inTransit: boolean
}

export interface CoverageIndex {
	/** Insumos com item de compra vinculado. */
	purchasable: ReadonlySet<string>
	/** Janelas de vigência (datas civis, inclusive; nulo = aberta) das contratações que cobrem o insumo. */
	contractWindows: ReadonlyMap<string, ReadonlyArray<{ from: string | null; to: string | null }>>
	/** Insumos com item em empenho ativo da unidade compradora e saldo a liquidar. */
	empenhoCovered: ReadonlySet<string>
	/** Insumos com OF enviada ou parcialmente recebida. */
	inTransit: ReadonlySet<string>
	/** Saldo disponível hoje (sem quarentena e sem vencido), na unidade do insumo. */
	stock: ReadonlyMap<string, number>
	/** Insumos em contagem cega aberta: o saldo não pode ser lido nem inferido daqui. */
	hiddenStock: ReadonlySet<string>
	/**
	 * Fontes que a OM de fato usa no sisub. Cozinha que não controla estoque aqui, ou unidade que
	 * não registra ata nem empenho, teria aviso em todo insumo de todo dia: a checagem daquela
	 * fonte fica desligada (e a tela diz isso), em vez de ensinar a ignorar o aviso.
	 */
	checks: AvailabilityChecks
}

export interface AvailabilityChecks {
	/** A cozinha tem lote no Estoque do sisub. */
	stock: boolean
	/** A unidade compradora tem ata ou empenho registrado no sisub. */
	contracts: boolean
}

/** Domingo da semana (segunda a domingo, a mesma do calendário) que contém `today`. */
export function endOfCivilWeek(today: string): string {
	const weekday = new Date(`${today}T12:00:00Z`).getUTCDay() // 0 = domingo
	return addCivilDays(today, weekday === 0 ? 0 : 7 - weekday)
}

/**
 * Em que horizonte a data cai. `null` para o passado e para HOJE: o dia de hoje já é execução
 * (o turno troca a preparação ou o insumo, GC-AGD-05/06), e o saldo de hoje já desconta o que
 * saiu de manhã; somar o almoço já baixado à demanda contaria a mesma saída duas vezes.
 */
export function horizonOf(date: string, today: string): AvailabilityHorizon | null {
	if (date <= today) return null
	if (date <= endOfCivilWeek(today)) return "week"
	if (date <= getCivilMonthBounds(today).end) return "month"
	return "future"
}

// ─── Do agendamento às necessidades ──────────────────────────────────────────

interface SnapshotIngredient {
	ingredient_id?: string | null
	net_quantity?: number | string | null
	is_optional?: boolean | null
	ingredient?: { description?: string | null; measure_unit?: string | null } | null
}

interface MenuItemForAvailability {
	id: string
	recipe: unknown
	planned_portion_quantity: number | null
	recommended_proportion: number | null
	excluded_from_procurement: number | null
	substitutions: unknown
	recipe_origin?: { name?: string | null } | null
}

export interface DailyMenuForAvailability {
	id: string
	service_date: string | null
	forecasted_headcount: number | null
	meal_type: { name?: string | null } | null
	menu_items: readonly MenuItemForAvailability[]
}

type SubstitutionEntry = { substitute_ingredient_id?: string | null; substitute_description?: string | null }

function asRecord(value: unknown): Record<string, unknown> | null {
	return value != null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/**
 * Uma linha por insumo de cada preparação agendada depois de hoje, já com a substituição do dia
 * aplicada: o substituto é o que vai ser usado, então é ele que precisa existir. Substituição sem
 * insumo do catálogo (texto livre) sai da conta: quem a registrou já resolveu à mão. Insumo
 * opcional e preparação congelada (produzida em casa) também ficam de fora. O mesmo insumo duas
 * vezes na ficha (óleo da fritura e do tempero) vira uma linha só, somada.
 */
export function collectPlannedNeeds(menus: readonly DailyMenuForAvailability[], today: string): PlannedNeed[] {
	const needs = new Map<string, PlannedNeed>()
	for (const menu of menus) {
		if (!menu.service_date || menu.service_date <= today) continue
		for (const item of menu.menu_items) {
			const snapshot = asRecord(item.recipe)
			const rows = Array.isArray(snapshot?.ingredients) ? (snapshot.ingredients as SnapshotIngredient[]) : []
			if (rows.length === 0) continue
			const substitutions = asRecord(item.substitutions) ?? {}
			const demand =
				item.planned_portion_quantity ??
				resolveItemDemand({ baseHeadcount: menu.forecasted_headcount, recommendedProportion: item.recommended_proportion }) ??
				0
			// Ficha sem rendimento não tem por que número dividir (`scaleIngredientQuantity` usaria 1 e
			// inflaria a conta pelo rendimento real): a quantidade fica desconhecida, e basta ter saldo.
			const portionYield = Number(snapshot?.portion_yield ?? 0)
			const recipeName = (typeof snapshot?.name === "string" ? snapshot.name : null) ?? item.recipe_origin?.name ?? "Preparação"

			for (const row of rows) {
				if (!row.ingredient_id || row.is_optional) continue
				const substitution = asRecord(substitutions[row.ingredient_id]) as SubstitutionEntry | null
				if (substitution && !substitution.substitute_ingredient_id) continue
				const net = Number(row.net_quantity ?? 0)
				const ingredientId = substitution?.substitute_ingredient_id ?? row.ingredient_id
				const quantity = Number.isFinite(net) && net > 0 && demand > 0 && portionYield > 0 ? scaleIngredientQuantity(net, demand, portionYield) : 0
				const key = `${item.id}:${ingredientId}`
				const existing = needs.get(key)
				if (existing) {
					existing.quantity += quantity
					continue
				}
				needs.set(key, {
					date: menu.service_date,
					dailyMenuId: menu.id,
					mealName: menu.meal_type?.name ?? "Refeição",
					menuItemId: item.id,
					recipeName,
					ingredientId,
					description: substitution?.substitute_description ?? row.ingredient?.description ?? "(insumo sem descrição)",
					// Unidade do substituto não está no registro; a do original é a melhor pista.
					measureUnit: row.ingredient?.measure_unit ?? null,
					quantity,
					excludedFromProcurement: (item.excluded_from_procurement ?? 0) > 0,
				})
			}
		}
	}
	return [...needs.values()]
}

// ─── Classificação ───────────────────────────────────────────────────────────

function isCoveredOn(windows: ReadonlyArray<{ from: string | null; to: string | null }> | undefined, date: string): boolean {
	return (windows ?? []).some((w) => (w.from == null || w.from <= date) && (w.to == null || date <= w.to))
}

function sumBy(needs: readonly PlannedNeed[], today: string, horizon: AvailabilityHorizon): Map<string, number> {
	const total = new Map<string, number>()
	for (const need of needs) {
		if (horizonOf(need.date, today) !== horizon) continue
		total.set(need.ingredientId, (total.get(need.ingredientId) ?? 0) + need.quantity)
	}
	return total
}

/**
 * Os avisos, um por insumo de cada preparação agendada que não tem como ser atendido no horizonte
 * da data. Silêncio é "atende": a lista vazia não precisa de outro sinal.
 */
export function classifyAvailability(needs: readonly PlannedNeed[], coverage: CoverageIndex, today: string): AvailabilityWarning[] {
	// Os totais se medem por horizonte: o arroz de terça e o de quinta saem do mesmo saldo, e o do
	// resto do mês sai do que a semana deixar.
	const weekNeed = sumBy(needs, today, "week")
	const monthNeed = sumBy(needs, today, "month")

	const warnings: AvailabilityWarning[] = []
	for (const need of needs) {
		const horizon = horizonOf(need.date, today)
		if (!horizon) continue
		const id = need.ingredientId
		const hidden = coverage.hiddenStock.has(id)
		const stock = coverage.stock.get(id) ?? 0
		const inTransit = coverage.inTransit.has(id)
		const purchasable = coverage.purchasable.has(id)
		const { quantity: _quantity, excludedFromProcurement, ...rest } = need
		const base = { ...rest, horizon, inTransit }

		if (horizon === "week") {
			if (!coverage.checks.stock) continue
			// Em contagem cega o saldo não sai daqui, nem como "falta": seria dizer o esperado.
			if (hidden) continue
			const total = weekNeed.get(id) ?? 0
			// Sem quantidade conhecida (efetivo ou rendimento em falta): basta ter algum saldo.
			if (total > 0 ? stock >= total : stock > 0) continue
			warnings.push({ ...base, gap: "short_stock", weekNeed: total, stock })
			continue
		}

		// Item fora da compra (doação, produção própria) não depende de contratação.
		if (excludedFromProcurement) continue

		if (horizon === "month") {
			// O estoque cobre o mês se sobrar, depois da semana, o que o resto do mês agendado usa.
			const needed = (weekNeed.get(id) ?? 0) + (monthNeed.get(id) ?? 0)
			const stockCovers = coverage.checks.stock && (needed > 0 ? stock >= needed : stock > 0)
			if (hidden || stockCovers || inTransit || coverage.empenhoCovered.has(id)) continue
			// Sem item de compra não há como comprar, com ou sem ata no sisub.
			if (!purchasable) warnings.push({ ...base, gap: "no_purchase_item" })
			else if (coverage.checks.contracts) warnings.push({ ...base, gap: "no_empenho_or_stock" })
			continue
		}

		if (!purchasable) {
			warnings.push({ ...base, gap: "no_purchase_item" })
			continue
		}
		// Sem ata nem empenho no sisub, não há com o que comparar.
		if (!coverage.checks.contracts || isCoveredOn(coverage.contractWindows.get(id), need.date)) continue
		warnings.push({ ...base, gap: "no_contract" })
	}
	return warnings
}
