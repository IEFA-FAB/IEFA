import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Normalized shape every source importer produces. The persistence layer
 * (`persistSourceImport`) turns this into rows across `nutrition_reference.*`,
 * versioned by `source_release` and deduplicated per food by content hash.
 */

export type NutrientValueKind = "measured" | "calculated" | "assumed" | "trace" | "not_analyzed" | "missing"

export type ParsedComponent = {
	/** Stable identifier of the nutrient within the source (column key, USDA nutrient id, …). */
	externalCode: string
	name: string
	unit: string | null
	/** INFOODS tag when known — used to seed mappings to kitchen.nutrient later. */
	infoodsTag?: string | null
}

export type ParsedValue = {
	componentCode: string
	value: number | null
	valueKind: NutrientValueKind
	rawValue?: string | null
}

export type ParsedFood = {
	/** Stable identifier of the food within the source (TACO number, USDA fdc_id, …). */
	externalCode: string
	displayName: string
	originalName?: string | null
	groupCode?: string | null
	groupName?: string | null
	foodType?: string | null
	scientificName?: string | null
	/** Reference amount the values are expressed per. TACO/IBGE/USDA are all per 100 g. */
	baseQuantity?: number
	baseUnit?: string
	values: ParsedValue[]
	raw?: Record<string, unknown>
}

export type ParsedSource = {
	versionLabel: string
	upstreamUrl: string
	downloadUrl: string
	publishedAt?: string | null
	checksumSha256?: string | null
	components: ParsedComponent[]
	foods: ParsedFood[]
}

export type SupabaseAny = SupabaseClient<any, any>
