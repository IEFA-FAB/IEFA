/**
 * Review metrics: agregação do progresso de revisão (conferência pelos nutricionistas)
 * de insumos e preparações, para o painel lateral de métricas (telas globais SDAB).
 *
 * - Cobertura geral (`reviewed_ever` / `total`): itens ATIVOS já revisados alguma vez.
 *   Independe da janela temporal — responde "quanto do catálogo já foi conferido".
 * - Janela temporal (`from`/`to`): governa `reviewed_in_period`, o feed diário (`daily`)
 *   e a lista recente (`recent`).
 * - Itens com soft-delete (deleted_at) NUNCA entram (não precisam de revisão).
 * - Insumos = catálogo único; preparações = apenas globais (kitchen_id IS NULL).
 */

import { ingredientInKitchen, ingredientReviewInKitchen, recipeReviewInKitchen, recipesInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import { and, count, countDistinct, desc, eq, gte, isNull, lte, type SQL, sql } from "drizzle-orm"
import { requireAnyPermission } from "../guards/require-permission.ts"
import type { GetReviewMetrics } from "../schemas/review-metrics.ts"
import type { UserContext } from "../types/context.ts"
import { runQuery } from "../utils/index.ts"

export interface ReviewTypeMetrics {
	/** Itens ativos (não deletados). Denominador da cobertura. */
	total: number
	/** Itens ativos revisados ao menos uma vez (qualquer data). */
	reviewed_ever: number
	/** Itens ativos revisados dentro da janela [from, to]. */
	reviewed_in_period: number
}

/** Atividade de revisão de um dia (fuso America/Sao_Paulo), separada por tipo. */
export interface ReviewActivityDay {
	date: string
	ingredient_count: number
	recipe_count: number
}

/** Um evento de revisão recente (para o feed estilo GitHub). */
export interface ReviewActivityEntry {
	type: "ingredient" | "recipe"
	id: string
	name: string
	reviewed_at: string
	reviewed_by_name: string | null
}

export interface ReviewMetrics {
	from: string
	to: string
	ingredients: ReviewTypeMetrics
	recipes: ReviewTypeMetrics
	daily: ReviewActivityDay[]
	recent: ReviewActivityEntry[]
}

/** Bucket do dia no fuso local — alinha o feed ao calendário do usuário (BR). */
const ingredientDayExpr = sql<string>`to_char((${ingredientReviewInKitchen.reviewedAt} AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD')`
const recipeDayExpr = sql<string>`to_char((${recipeReviewInKitchen.reviewedAt} AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD')`

/** Subtrai meses sem o overflow do `setMonth` (ex.: 31/03 − 6 meses → 30/09, não 01/10). */
function subMonthsClamped(date: Date, months: number): Date {
	const d = new Date(date)
	const targetDay = d.getDate()
	d.setDate(1)
	d.setMonth(d.getMonth() - months)
	const daysInTarget = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
	d.setDate(Math.min(targetDay, daysInTarget))
	return d
}

function resolveWindow(input: GetReviewMetrics): { from: string; to: string } {
	const to = input.to ? new Date(input.to) : new Date()
	const from = input.from ? new Date(input.from) : subMonthsClamped(to, 6)
	return { from: from.toISOString(), to: to.toISOString() }
}

export async function getReviewMetrics(db: SisubDb, ctx: UserContext, input: GetReviewMetrics): Promise<ReviewMetrics> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)

	const { from, to } = resolveWindow(input)

	// Itens ativos.
	const activeIngredient = isNull(ingredientInKitchen.deletedAt)
	const activeRecipe = and(isNull(recipesInKitchen.deletedAt), isNull(recipesInKitchen.kitchenId)) as SQL
	const inWindowIngredient = and(gte(ingredientReviewInKitchen.reviewedAt, from), lte(ingredientReviewInKitchen.reviewedAt, to)) as SQL
	const inWindowRecipe = and(gte(recipeReviewInKitchen.reviewedAt, from), lte(recipeReviewInKitchen.reviewedAt, to)) as SQL

	const [ingTotal, ingEver, ingPeriod, recTotal, recEver, recPeriod, ingDaily, recDaily, ingRecent, recRecent] = await Promise.all([
		runQuery("QUERY_FAILED", () => db.select({ value: count() }).from(ingredientInKitchen).where(activeIngredient)),
		runQuery("QUERY_FAILED", () =>
			db
				.select({ value: countDistinct(ingredientReviewInKitchen.ingredientId) })
				.from(ingredientReviewInKitchen)
				.innerJoin(ingredientInKitchen, eq(ingredientInKitchen.id, ingredientReviewInKitchen.ingredientId))
				.where(activeIngredient)
		),
		runQuery("QUERY_FAILED", () =>
			db
				.select({ value: countDistinct(ingredientReviewInKitchen.ingredientId) })
				.from(ingredientReviewInKitchen)
				.innerJoin(ingredientInKitchen, eq(ingredientInKitchen.id, ingredientReviewInKitchen.ingredientId))
				.where(and(activeIngredient, inWindowIngredient))
		),
		runQuery("QUERY_FAILED", () => db.select({ value: count() }).from(recipesInKitchen).where(activeRecipe)),
		runQuery("QUERY_FAILED", () =>
			db
				.select({ value: countDistinct(recipeReviewInKitchen.recipeId) })
				.from(recipeReviewInKitchen)
				.innerJoin(recipesInKitchen, eq(recipesInKitchen.id, recipeReviewInKitchen.recipeId))
				.where(activeRecipe)
		),
		runQuery("QUERY_FAILED", () =>
			db
				.select({ value: countDistinct(recipeReviewInKitchen.recipeId) })
				.from(recipeReviewInKitchen)
				.innerJoin(recipesInKitchen, eq(recipesInKitchen.id, recipeReviewInKitchen.recipeId))
				.where(and(activeRecipe, inWindowRecipe))
		),
		runQuery("QUERY_FAILED", () =>
			db
				.select({ day: ingredientDayExpr, n: count() })
				.from(ingredientReviewInKitchen)
				.innerJoin(ingredientInKitchen, eq(ingredientInKitchen.id, ingredientReviewInKitchen.ingredientId))
				.where(and(activeIngredient, inWindowIngredient))
				.groupBy(ingredientDayExpr)
		),
		runQuery("QUERY_FAILED", () =>
			db
				.select({ day: recipeDayExpr, n: count() })
				.from(recipeReviewInKitchen)
				.innerJoin(recipesInKitchen, eq(recipesInKitchen.id, recipeReviewInKitchen.recipeId))
				.where(and(activeRecipe, inWindowRecipe))
				.groupBy(recipeDayExpr)
		),
		runQuery("QUERY_FAILED", () =>
			db
				.select({
					id: ingredientReviewInKitchen.ingredientId,
					name: ingredientInKitchen.description,
					reviewed_at: ingredientReviewInKitchen.reviewedAt,
					reviewed_by_name: ingredientReviewInKitchen.reviewedByName,
				})
				.from(ingredientReviewInKitchen)
				.innerJoin(ingredientInKitchen, eq(ingredientInKitchen.id, ingredientReviewInKitchen.ingredientId))
				.where(and(activeIngredient, inWindowIngredient))
				.orderBy(desc(ingredientReviewInKitchen.reviewedAt))
				.limit(50)
		),
		runQuery("QUERY_FAILED", () =>
			db
				.select({
					id: recipeReviewInKitchen.recipeId,
					name: recipesInKitchen.name,
					reviewed_at: recipeReviewInKitchen.reviewedAt,
					reviewed_by_name: recipeReviewInKitchen.reviewedByName,
				})
				.from(recipeReviewInKitchen)
				.innerJoin(recipesInKitchen, eq(recipesInKitchen.id, recipeReviewInKitchen.recipeId))
				.where(and(activeRecipe, inWindowRecipe))
				.orderBy(desc(recipeReviewInKitchen.reviewedAt))
				.limit(50)
		),
	])

	// Merge dos buckets diários por data.
	const byDay = new Map<string, ReviewActivityDay>()
	for (const r of ingDaily) {
		const day = r.day
		byDay.set(day, { date: day, ingredient_count: Number(r.n), recipe_count: 0 })
	}
	for (const r of recDaily) {
		const existing = byDay.get(r.day)
		if (existing) existing.recipe_count = Number(r.n)
		else byDay.set(r.day, { date: r.day, ingredient_count: 0, recipe_count: Number(r.n) })
	}
	const daily = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date))

	const recent: ReviewActivityEntry[] = [
		...ingRecent.map((r) => ({
			type: "ingredient" as const,
			id: r.id,
			name: r.name ?? "(sem descrição)",
			reviewed_at: r.reviewed_at,
			reviewed_by_name: r.reviewed_by_name,
		})),
		...recRecent.map((r) => ({
			type: "recipe" as const,
			id: r.id,
			name: r.name ?? "(sem nome)",
			reviewed_at: r.reviewed_at,
			reviewed_by_name: r.reviewed_by_name,
		})),
	]
		.sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at))
		.slice(0, 50)

	return {
		from,
		to,
		ingredients: {
			total: Number(ingTotal[0]?.value ?? 0),
			reviewed_ever: Number(ingEver[0]?.value ?? 0),
			reviewed_in_period: Number(ingPeriod[0]?.value ?? 0),
		},
		recipes: {
			total: Number(recTotal[0]?.value ?? 0),
			reviewed_ever: Number(recEver[0]?.value ?? 0),
			reviewed_in_period: Number(recPeriod[0]?.value ?? 0),
		},
		daily,
		recent,
	}
}
