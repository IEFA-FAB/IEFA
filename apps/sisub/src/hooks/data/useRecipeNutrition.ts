import { useQueries } from "@tanstack/react-query"
import { useMemo } from "react"
import { ingredientEffectiveNutrientsQueryOptions } from "@/services/IngredientsService"

/**
 * Tabela nutricional automática de uma preparação — POR 100 g do preparo.
 *
 * Base de cálculo (decisão de produto):
 *   - Usa o PESO LÍQUIDO (net_quantity) de cada ingrediente. Os fatores de correção,
 *     cocção e reidratação NÃO entram aqui — eles dimensionam peso bruto/compras, não
 *     a composição da parte comestível.
 *   - A composição de cada insumo vem de `listIngredientEffectiveNutrients` (manual ou
 *     tabela alimentar vinculada), sempre normalizada por 100 g do insumo.
 *   - Ingredientes opcionais são excluídos (representam a preparação base).
 *
 * Cálculo, por nutriente:
 *   totalDoNutriente = Σ (netQtyG_i / 100) × valorPor100g_i        [g do preparo]
 *   valorPor100gPreparo = totalDoNutriente / massaComDadosG × 100
 *
 * `massaComDadosG` considera apenas os ingredientes com composição conhecida; a
 * `coverage` informa qual fração da massa foi caracterizada (o restante não entra).
 *
 * Premissa de unidade: net_quantity é tratado em GRAMAS (g/kg/mg são convertidos;
 * demais unidades assumem grama). Conversão por densidade/volume está fora de escopo.
 */

export interface RecipeNutritionInputIngredient {
	ingredientId: string | null
	ingredientName: string
	// numeric do Drizzle/form pode chegar como string; coagido internamente.
	netQuantity: number | string | null
	measureUnit?: string | null
	isOptional?: boolean
}

export interface RecipeNutrientRow {
	nutrientId: string
	name: string
	isEnergy: boolean
	dailyValue: number | null
	displayOrder: number | null
	/** Valor por 100 g do preparo. */
	per100g: number
}

export interface RecipeNutritionResult {
	isLoading: boolean
	isError: boolean
	rows: RecipeNutrientRow[]
	coverage: {
		/** Ingredientes (não-opcionais, com quantidade) considerados. */
		totalIngredients: number
		/** Quantos deles têm composição nutricional conhecida. */
		withData: number
		/** Ingredientes sem composição (não entram no cálculo). */
		missing: string[]
	}
	/** Massa (g) dos ingredientes com dados — base da normalização por 100 g. */
	massWithDataG: number
}

/** Converte uma quantidade para gramas a partir da unidade de medida (heurística g/kg/mg). */
function toGrams(quantity: number | string, unit?: string | null): number {
	// net_quantity chega como string (numeric do Drizzle) — coage p/ número ANTES de qualquer
	// aritmética; senão o ramo "return q" propaga string e `massWithDataG += grams` vira
	// concatenação, distorcendo a normalização por 100 g.
	const q = Number(quantity)
	if (!Number.isFinite(q)) return 0
	const u = (unit ?? "").trim().toLowerCase()
	if (u === "kg" || u === "quilograma" || u === "quilo" || u === "l" || u === "lt" || u === "litro") return q * 1000
	if (u === "mg" || u === "miligrama") return q / 1000
	// g, grama, ml, un, porção e afins: assume grama (1 g ≈ 1 ml para caldos/água).
	return q
}

export function useRecipeNutrition(ingredients: RecipeNutritionInputIngredient[]): RecipeNutritionResult {
	// Ingredientes que participam do cálculo: não-opcionais, com id e quantidade > 0.
	const active = useMemo(
		() =>
			ingredients
				.filter((i) => !!i.ingredientId && Number(i.netQuantity ?? 0) > 0 && !i.isOptional)
				.map((i) => ({
					ingredientId: i.ingredientId as string,
					name: i.ingredientName,
					grams: toGrams(i.netQuantity ?? 0, i.measureUnit),
				})),
		[ingredients]
	)

	// Uma query de composição efetiva por insumo distinto (react-query desdup/cacheia).
	const uniqueIds = useMemo(() => Array.from(new Set(active.map((a) => a.ingredientId))), [active])

	const queries = useQueries({
		queries: uniqueIds.map((id) => ingredientEffectiveNutrientsQueryOptions(id)),
	})

	return useMemo<RecipeNutritionResult>(() => {
		const isLoading = queries.some((q) => q.isLoading)
		const isError = queries.some((q) => q.isError)

		// Mapa insumo → nutrientes efetivos (por 100 g do insumo).
		const byIngredient = new Map<string, (typeof queries)[number]["data"]>()
		uniqueIds.forEach((id, idx) => {
			byIngredient.set(id, queries[idx]?.data)
		})

		// Acumuladores por nutriente.
		type Acc = { total: number; meta: { name: string; isEnergy: boolean; dailyValue: number | null; displayOrder: number | null } }
		const acc = new Map<string, Acc>()
		let massWithDataG = 0
		const missing: string[] = []
		let withData = 0

		for (const item of active) {
			const result = byIngredient.get(item.ingredientId)
			const nutrients = result?.nutrients ?? []
			if (nutrients.length === 0) {
				missing.push(item.name)
				continue
			}
			withData += 1
			massWithDataG += item.grams
			const scale = item.grams / 100 // porções de 100 g deste insumo
			for (const n of nutrients) {
				if (n.nutrient_value == null || n.nutrient == null) continue
				const value = Number(n.nutrient_value) // numeric do Drizzle chega como string
				if (!Number.isFinite(value)) continue
				const key = n.nutrient.id
				const prev = acc.get(key)
				const contribution = value * scale
				if (prev) {
					prev.total += contribution
				} else {
					acc.set(key, {
						total: contribution,
						meta: {
							name: n.nutrient.name,
							isEnergy: !!n.nutrient.is_energy_value,
							dailyValue: n.nutrient.daily_value ?? null,
							displayOrder: n.nutrient.display_order ?? null,
						},
					})
				}
			}
		}

		const rows: RecipeNutrientRow[] =
			massWithDataG > 0
				? Array.from(acc.entries())
						.map(([nutrientId, a]) => ({
							nutrientId,
							name: a.meta.name,
							isEnergy: a.meta.isEnergy,
							dailyValue: a.meta.dailyValue,
							displayOrder: a.meta.displayOrder,
							per100g: (a.total / massWithDataG) * 100,
						}))
						.sort((x, y) => {
							const ox = x.displayOrder ?? Number.MAX_SAFE_INTEGER
							const oy = y.displayOrder ?? Number.MAX_SAFE_INTEGER
							if (ox !== oy) return ox - oy
							return x.name.localeCompare(y.name, "pt-BR")
						})
				: []

		return {
			isLoading,
			isError,
			rows,
			coverage: { totalIngredients: active.length, withData, missing },
			massWithDataG,
		}
	}, [queries, uniqueIds, active])
}
