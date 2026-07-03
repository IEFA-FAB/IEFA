import { createClient, type SupabaseClient } from "@supabase/supabase-js"

type SupabaseLike = Pick<SupabaseClient<any, any>, "schema">

export type NutritionSyncTriggeredBy = "test" | "manual" | "cron"

export interface NutritionSyncOptions {
	dryRun?: boolean
	batchSize?: number
	triggeredBy?: NutritionSyncTriggeredBy
	maxNutrients?: number | null
	maxIngredientNutrients?: number | null
	logRun?: boolean
}

export interface NutritionSyncSummary {
	logId: number | null
	triggeredBy: NutritionSyncTriggeredBy
	dryRun: boolean
	limited: boolean
	limits: {
		nutrients: number | null
		ingredientNutrients: number | null
	}
	nutrientsRead: number
	nutrientsSkipped: number
	nutrientsUpserted: number
	nutrientLookupsUpserted: number
	ingredientNutrientsRead: number
	ingredientNutrientsSkipped: number
	ingredientNutrientsUpserted: number
	errors: Array<{ scope: string; message: string }>
}

type LegacyRow = Record<string, unknown>

type NormalizedNutrient = {
	legacyId: number
	name: string
	dailyValue: number | null
	minimumValue: number | null
	isEnergyValue: boolean | null
	enumName: string | null
	displayOrder: number | null
}

type NormalizedIngredientNutrient = {
	legacyIngredientId: number
	legacyNutrientId: number
	nutrientValue: number | null
}

const DEFAULT_BATCH_SIZE = 500
const DEFAULT_TEST_MAX_NUTRIENTS = 25
const DEFAULT_TEST_MAX_INGREDIENT_NUTRIENTS = 100

function getSupabase(): SupabaseClient<any, any> {
	const supabaseUrl = process.env.API_SUPABASE_URL
	const serviceRoleKey = process.env.API_SUPABASE_SERVICE_ROLE_KEY
	if (!supabaseUrl || !serviceRoleKey) {
		throw new Error("API_SUPABASE_URL and API_SUPABASE_SERVICE_ROLE_KEY are required for nutrition sync")
	}

	return createClient(supabaseUrl, serviceRoleKey, {
		auth: { persistSession: false },
	})
}

function asNumber(value: unknown): number | null {
	if (typeof value === "number") return Number.isFinite(value) ? value : null
	if (typeof value !== "string") return null

	const normalized = value.trim().replace(",", ".")
	if (!normalized) return null

	const parsed = Number(normalized)
	return Number.isFinite(parsed) ? parsed : null
}

function asBoolean(value: unknown): boolean | null {
	if (typeof value === "boolean") return value
	if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null
	if (typeof value !== "string") return null

	const normalized = value.trim().toLowerCase()
	if (["true", "t", "1", "sim", "s", "yes"].includes(normalized)) return true
	if (["false", "f", "0", "nao", "não", "n", "no"].includes(normalized)) return false
	return null
}

function pickFirst(row: LegacyRow, keys: string[]): unknown {
	for (const key of keys) {
		if (row[key] !== undefined && row[key] !== null) return row[key]
	}
	return undefined
}

function normalizeLegacyNutrient(row: LegacyRow, index: number): NormalizedNutrient | null {
	const legacyId = asNumber(pickFirst(row, ["id_nutriente", "legacy_id", "id", "idNutriente"]))
	const name = pickFirst(row, ["nutriente", "nome", "descricao", "name"])?.toString().trim()

	if (!legacyId || !name) return null

	const displayOrder = asNumber(pickFirst(row, ["display_order", "ordem", "ordem_exibicao", "ordem_rotulo"])) ?? index
	const explicitEnergy = asBoolean(pickFirst(row, ["is_energy_value", "valor_energetico", "energetico"]))

	return {
		legacyId,
		name,
		dailyValue: asNumber(pickFirst(row, ["daily_value", "valor_diario", "valor_referencia", "vd"])),
		minimumValue: asNumber(pickFirst(row, ["minimum_value", "valor_minimo", "minimo"])),
		isEnergyValue: explicitEnergy ?? /energ[ée]tico|kcal|quilocaloria/i.test(name),
		enumName: pickFirst(row, ["enum_name", "nome_enum", "codigo"])?.toString() ?? null,
		displayOrder,
	}
}

function normalizeLegacyIngredientNutrient(row: LegacyRow): NormalizedIngredientNutrient | null {
	const legacyIngredientId = asNumber(pickFirst(row, ["id_insumo", "legacy_id_insumo", "id_produto", "product_id", "produto_id"]))
	const legacyNutrientId = asNumber(pickFirst(row, ["id_nutriente", "legacy_id_nutriente", "nutrient_id", "nutriente_id"]))
	const nutrientValue = asNumber(pickFirst(row, ["valor", "valor_nutriente", "quantidade", "nutrient_value", "value"]))

	if (!legacyIngredientId || !legacyNutrientId) return null

	return {
		legacyIngredientId,
		legacyNutrientId,
		nutrientValue,
	}
}

async function fetchAllRows(client: SupabaseLike, schema: string, table: string, batchSize: number, maxRows: number | null = null): Promise<LegacyRow[]> {
	const rows: LegacyRow[] = []

	for (let offset = 0; ; offset += batchSize) {
		const remaining = maxRows == null ? batchSize : maxRows - rows.length
		if (remaining <= 0) return rows
		const pageSize = Math.min(batchSize, remaining)
		const { data, error } = await client
			.schema(schema)
			.from(table)
			.select("*")
			.range(offset, offset + pageSize - 1)

		if (error) throw new Error(`${schema}.${table}: ${error.message}`)

		const batch = (data ?? []) as LegacyRow[]
		rows.push(...batch)
		if (batch.length < pageSize) return rows
	}
}

async function fetchLookupMap(client: SupabaseLike, table: string, legacyColumn: string, newColumn: string, batchSize: number): Promise<Map<number, string>> {
	const rows = await fetchAllRows(client, "core", table, batchSize)
	const map = new Map<number, string>()

	for (const row of rows) {
		const legacyId = asNumber(row[legacyColumn])
		const newId = row[newColumn]?.toString()
		if (legacyId && newId) map.set(legacyId, newId)
	}

	return map
}

function chunk<T>(items: T[], size: number): T[][] {
	const batches: T[][] = []
	for (let index = 0; index < items.length; index += size) {
		batches.push(items.slice(index, index + size))
	}
	return batches
}

async function syncNutrients(client: SupabaseLike, options: NormalizedNutritionSyncOptions, summary: NutritionSyncSummary): Promise<Map<number, string>> {
	const legacyRows = await fetchAllRows(client, "public", "nutriente", options.batchSize, options.maxNutrients)
	const nutrients = legacyRows.map((row, index) => normalizeLegacyNutrient(row, index)).filter((row): row is NormalizedNutrient => row !== null)

	summary.nutrientsRead = legacyRows.length
	summary.nutrientsSkipped = legacyRows.length - nutrients.length

	if (options.dryRun || nutrients.length === 0) {
		return fetchLookupMap(client, "migration_nutrient_lookup", "legacy_id_nutriente", "new_nutrient_id", options.batchSize)
	}

	const upserted = new Map<number, string>()

	for (const batch of chunk(nutrients, options.batchSize)) {
		const rows = batch.map((nutrient) => ({
			legacy_id: nutrient.legacyId,
			name: nutrient.name,
			daily_value: nutrient.dailyValue,
			minimum_value: nutrient.minimumValue,
			is_energy_value: nutrient.isEnergyValue,
			enum_name: nutrient.enumName,
			display_order: nutrient.displayOrder,
			deleted_at: null,
		}))

		const { data, error } = await client.schema("kitchen").from("nutrient").upsert(rows, { onConflict: "legacy_id" }).select("id, legacy_id")
		if (error) throw new Error(`kitchen.nutrient: ${error.message}`)

		for (const row of (data ?? []) as LegacyRow[]) {
			const legacyId = asNumber(row.legacy_id)
			const newId = row.id?.toString()
			if (legacyId && newId) upserted.set(legacyId, newId)
		}
	}

	const lookupRows = [...upserted.entries()].map(([legacyId, nutrientId]) => ({
		legacy_id_nutriente: legacyId,
		new_nutrient_id: nutrientId,
	}))

	for (const batch of chunk(lookupRows, options.batchSize)) {
		const { error } = await client
			.schema("core")
			.from("migration_nutrient_lookup")
			.upsert(batch, { onConflict: "legacy_id_nutriente" })
			.select("legacy_id_nutriente")
		if (error) throw new Error(`core.migration_nutrient_lookup: ${error.message}`)
	}

	summary.nutrientsUpserted = upserted.size
	summary.nutrientLookupsUpserted = lookupRows.length

	return upserted
}

async function syncIngredientNutrients(
	client: SupabaseLike,
	options: NormalizedNutritionSyncOptions,
	nutrientLookup: Map<number, string>,
	summary: NutritionSyncSummary
): Promise<void> {
	const [legacyRows, productLookup] = await Promise.all([
		fetchAllRows(client, "public", "produto_nutriente", options.batchSize, options.maxIngredientNutrients),
		fetchLookupMap(client, "migration_product_lookup", "legacy_id_insumo", "new_product_id", options.batchSize),
	])

	const rows = legacyRows.map(normalizeLegacyIngredientNutrient).filter((row): row is NormalizedIngredientNutrient => row !== null)
	const upsertRows = rows
		.map((row) => {
			const ingredientId = productLookup.get(row.legacyIngredientId)
			const nutrientId = nutrientLookup.get(row.legacyNutrientId)
			if (!ingredientId || !nutrientId) return null

			return {
				ingredient_id: ingredientId,
				nutrient_id: nutrientId,
				nutrient_value: row.nutrientValue,
				deleted_at: null,
			}
		})
		.filter((row): row is NonNullable<typeof row> => row !== null)

	summary.ingredientNutrientsRead = legacyRows.length
	summary.ingredientNutrientsSkipped = legacyRows.length - upsertRows.length

	if (options.dryRun || upsertRows.length === 0) return

	for (const batch of chunk(upsertRows, options.batchSize)) {
		const { data, error } = await client
			.schema("kitchen")
			.from("ingredient_nutrient")
			.upsert(batch, { onConflict: "ingredient_id,nutrient_id" })
			.select("ingredient_id")
		if (error) throw new Error(`kitchen.ingredient_nutrient: ${error.message}`)
		summary.ingredientNutrientsUpserted += (data ?? []).length
	}
}

type NormalizedNutritionSyncOptions = Required<Pick<NutritionSyncOptions, "dryRun" | "batchSize" | "triggeredBy" | "logRun">> &
	Pick<NutritionSyncOptions, "maxNutrients" | "maxIngredientNutrients">

function normalizeOptions(options: NutritionSyncOptions): NormalizedNutritionSyncOptions {
	const triggeredBy = options.triggeredBy ?? "manual"
	const maxNutrients = options.maxNutrients ?? (triggeredBy === "test" ? DEFAULT_TEST_MAX_NUTRIENTS : null)
	const maxIngredientNutrients = options.maxIngredientNutrients ?? (triggeredBy === "test" ? DEFAULT_TEST_MAX_INGREDIENT_NUTRIENTS : null)

	return {
		triggeredBy,
		dryRun: options.dryRun ?? false,
		batchSize: Math.max(1, Math.min(options.batchSize ?? DEFAULT_BATCH_SIZE, 1_000)),
		maxNutrients,
		maxIngredientNutrients,
		logRun: options.logRun ?? true,
	}
}

async function createSyncLog(client: SupabaseLike, options: NormalizedNutritionSyncOptions): Promise<number | null> {
	if (!options.logRun) return null

	const { data, error } = await client
		.schema("kitchen")
		.from("nutrition_sync_log")
		.insert({
			triggered_by: options.triggeredBy,
			dry_run: options.dryRun,
			status: "running",
			max_nutrients: options.maxNutrients,
			max_ingredient_nutrients: options.maxIngredientNutrients,
		})
		.select("id")
		.single()

	if (error) throw new Error(`kitchen.nutrition_sync_log: ${error.message}`)
	return asNumber((data as LegacyRow | null)?.id)
}

async function finishSyncLog(
	client: SupabaseLike,
	logId: number | null,
	status: "success" | "error",
	summary: NutritionSyncSummary,
	errorMessage?: string
): Promise<void> {
	if (!logId) return

	const { error } = await client
		.schema("kitchen")
		.from("nutrition_sync_log")
		.update({
			finished_at: new Date().toISOString(),
			status,
			nutrients_read: summary.nutrientsRead,
			nutrients_skipped: summary.nutrientsSkipped,
			nutrients_upserted: summary.nutrientsUpserted,
			nutrient_lookups_upserted: summary.nutrientLookupsUpserted,
			ingredient_nutrients_read: summary.ingredientNutrientsRead,
			ingredient_nutrients_skipped: summary.ingredientNutrientsSkipped,
			ingredient_nutrients_upserted: summary.ingredientNutrientsUpserted,
			error_message: errorMessage ?? null,
			summary,
		})
		.eq("id", logId)

	if (error) throw new Error(`kitchen.nutrition_sync_log update: ${error.message}`)
}

export async function runNutritionSync(options: NutritionSyncOptions = {}, client: SupabaseLike = getSupabase()): Promise<NutritionSyncSummary> {
	const normalizedOptions = normalizeOptions(options)
	const summary: NutritionSyncSummary = {
		logId: null,
		triggeredBy: normalizedOptions.triggeredBy,
		dryRun: normalizedOptions.dryRun,
		limited: normalizedOptions.maxNutrients != null || normalizedOptions.maxIngredientNutrients != null,
		limits: {
			nutrients: normalizedOptions.maxNutrients ?? null,
			ingredientNutrients: normalizedOptions.maxIngredientNutrients ?? null,
		},
		nutrientsRead: 0,
		nutrientsSkipped: 0,
		nutrientsUpserted: 0,
		nutrientLookupsUpserted: 0,
		ingredientNutrientsRead: 0,
		ingredientNutrientsSkipped: 0,
		ingredientNutrientsUpserted: 0,
		errors: [],
	}

	try {
		summary.logId = await createSyncLog(client, normalizedOptions)
		const nutrientLookup = await syncNutrients(client, normalizedOptions, summary)
		await syncIngredientNutrients(client, normalizedOptions, nutrientLookup, summary)
		await finishSyncLog(client, summary.logId, "success", summary)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		summary.errors.push({ scope: "nutrition-sync", message })
		await finishSyncLog(client, summary.logId, "error", summary, message)
		throw Object.assign(new Error(message), { summary })
	}

	return summary
}
