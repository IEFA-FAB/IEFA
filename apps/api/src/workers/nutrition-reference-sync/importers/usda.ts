import { createHash } from "node:crypto"
import { unzipSync } from "fflate"
import { forEachCsvRow, parseCsv } from "./csv.ts"
import { persistSourceImport } from "./persist.ts"
import type { ParsedComponent, ParsedFood, ParsedSource, ParsedValue, SupabaseAny } from "./types.ts"

/**
 * USDA FoodData Central (public domain / CC0). CSV bundles. We import two datasets
 * as separate releases under the same source:
 *   - Foundation Foods (filtered to data_type = 'foundation_food', ~436 foods)
 *   - SR Legacy (frozen 2018-04, ~7793 foods)
 * All amounts are per 100 g. Join: food.fdc_id → food_nutrient.fdc_id → nutrient.id.
 */

const SOURCE_ID = "usda_fdc"
const UPSTREAM_URL = "https://fdc.nal.usda.gov/download-datasets"
const DOWNLOAD_HOST = "https://fdc.nal.usda.gov/fdc-datasets"

// SR Legacy is discontinued — this is the only release and the URL is stable.
const SR_LEGACY_URL = `${DOWNLOAD_HOST}/FoodData_Central_sr_legacy_food_csv_2018-04.zip`
// Foundation is re-released ~twice a year; discovered dynamically with this as fallback.
const FOUNDATION_FALLBACK_URL = `${DOWNLOAD_HOST}/FoodData_Central_foundation_food_csv_2025-12-18.zip`

type Dataset = { versionLabel: string; url: string; dataType: string }

function findFile(files: Record<string, Uint8Array>, basename: string): Uint8Array {
	const key = Object.keys(files).find((k) => k.split("/").pop() === basename)
	if (!key) throw new Error(`USDA: arquivo ${basename} não encontrado no zip`)
	return files[key]
}

function toText(bytes: Uint8Array): string {
	return new TextDecoder("utf-8").decode(bytes)
}

/** Try to resolve the current Foundation CSV url from the downloads page; fall back to the pinned one. */
async function resolveFoundationUrl(): Promise<string> {
	try {
		const res = await fetch(UPSTREAM_URL, { redirect: "follow" })
		if (!res.ok) return FOUNDATION_FALLBACK_URL
		const html = await res.text()
		const matches = [...html.matchAll(/FoodData_Central_foundation_food_csv_(\d{4}-\d{2}-\d{2})\.zip/g)]
		if (matches.length === 0) return FOUNDATION_FALLBACK_URL
		const latest = matches
			.map((m) => m[1])
			.sort()
			.at(-1)
		return `${DOWNLOAD_HOST}/FoodData_Central_foundation_food_csv_${latest}.zip`
	} catch {
		return FOUNDATION_FALLBACK_URL
	}
}

export function parseUsdaDataset(files: Record<string, Uint8Array>, dataType: string): { components: ParsedComponent[]; foods: ParsedFood[] } {
	// Categories: id → description
	const categoryById = new Map<string, string>()
	for (const row of parseCsv(toText(findFile(files, "food_category.csv"))).slice(1)) {
		// id, code, description
		categoryById.set(row[0], row[2] ?? "")
	}

	// Nutrients: id → {name, unit}
	const components: ParsedComponent[] = []
	const nutrientById = new Map<string, { name: string; unit: string }>()
	forEachCsvRow(toText(findFile(files, "nutrient.csv")), (get) => {
		const id = get("id")
		if (!id) return
		const name = get("name")
		const unit = get("unit_name").toLowerCase()
		nutrientById.set(id, { name, unit })
		components.push({ externalCode: id, name, unit: unit || null, infoodsTag: null })
	})

	// Foods of the requested data_type: fdc_id → food
	const foodByFdcId = new Map<string, ParsedFood>()
	forEachCsvRow(toText(findFile(files, "food.csv")), (get) => {
		if (get("data_type") !== dataType) return
		const fdcId = get("fdc_id")
		if (!fdcId) return
		const categoryId = get("food_category_id")
		const groupName = categoryById.get(categoryId) || null
		foodByFdcId.set(fdcId, {
			externalCode: fdcId,
			displayName: get("description"),
			originalName: get("description"),
			groupCode: categoryId || null,
			groupName,
			baseQuantity: 100,
			baseUnit: "g",
			values: [],
			raw: { fdc_id: fdcId, data_type: dataType, publication_date: get("publication_date") },
		})
	})

	// Nutrient values, attached only to kept foods.
	forEachCsvRow(toText(findFile(files, "food_nutrient.csv")), (get) => {
		const fdcId = get("fdc_id")
		const food = foodByFdcId.get(fdcId)
		if (!food) return
		const nutrientId = get("nutrient_id")
		if (!nutrientById.has(nutrientId)) return
		const amountRaw = get("amount")
		const amount = amountRaw === "" ? null : Number(amountRaw)
		const value: ParsedValue = {
			componentCode: nutrientId,
			value: amount != null && Number.isFinite(amount) ? amount : null,
			valueKind: amount != null && Number.isFinite(amount) ? "measured" : "missing",
			rawValue: null,
		}
		food.values.push(value)
	})

	// Only emit components actually referenced, to keep the table lean.
	const usedComponentCodes = new Set<string>()
	for (const food of foodByFdcId.values()) for (const v of food.values) usedComponentCodes.add(v.componentCode)
	const usedComponents = components.filter((c) => usedComponentCodes.has(c.externalCode))

	return { components: usedComponents, foods: [...foodByFdcId.values()] }
}

async function downloadZip(url: string): Promise<{ files: Record<string, Uint8Array>; checksum: string }> {
	const res = await fetch(url, { redirect: "follow" })
	if (!res.ok) throw new Error(`Download USDA falhou (${url}): HTTP ${res.status}`)
	const buf = new Uint8Array(await res.arrayBuffer())
	const checksum = createHash("sha256").update(buf).digest("hex")
	const files = unzipSync(buf)
	return { files, checksum }
}

async function importDataset(supabase: SupabaseAny, ds: Dataset): Promise<number> {
	const { files, checksum } = await downloadZip(ds.url)
	const { components, foods } = parseUsdaDataset(files, ds.dataType)
	if (foods.length === 0) throw new Error(`USDA ${ds.versionLabel}: nenhum alimento (data_type=${ds.dataType}) — layout mudou?`)
	const parsed: ParsedSource = {
		versionLabel: ds.versionLabel,
		upstreamUrl: UPSTREAM_URL,
		downloadUrl: ds.url,
		checksumSha256: checksum,
		components,
		foods,
	}
	return persistSourceImport(supabase, SOURCE_ID, parsed)
}

export async function importUsda(supabase: SupabaseAny): Promise<number> {
	const foundationUrl = await resolveFoundationUrl()
	const datasets: Dataset[] = [
		{ versionLabel: `Foundation ${foundationUrl.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? "latest"}`, url: foundationUrl, dataType: "foundation_food" },
		{ versionLabel: "SR Legacy 2018-04", url: SR_LEGACY_URL, dataType: "sr_legacy_food" },
	]
	let total = 0
	for (const ds of datasets) total += await importDataset(supabase, ds)
	return total
}
