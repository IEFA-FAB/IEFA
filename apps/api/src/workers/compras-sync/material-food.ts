import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { env } from "../../env.ts"
import { fetchAllPages } from "./client.ts"
import type { ComprasItemMaterial, ComprasPdmMaterial, ComprasUnidadeFornecimento } from "./types.ts"

export const FOOD_CLASS_CODES = [8905, 8910, 8915, 8920, 8925, 8930, 8935, 8940, 8945, 8950, 8955, 8960, 8965, 8970] as const

type FoodPdmResponse = ComprasPdmMaterial & {
	codigoGrupo: number
	nomeGrupo: string
	nomeClasse: string
}

type FoodItemResponse = ComprasItemMaterial & {
	codigoGrupo: number
	nomeGrupo: string
	codigoClasse: number
	nomeClasse: string
	nomePdm: string
}

export interface FoodMaterialSyncOptions {
	classCodes?: number[]
	detailConcurrency?: number
	syncUnits?: boolean
}

export interface FoodMaterialSyncSummary {
	classesProcessed: number
	pdmsFound: number
	pdmsUpserted: number
	unitsUpserted: number
	itemsUpserted: number
	errors: Array<{ scope: string; message: string }>
}

const UPSERT_BATCH_SIZE = 100
const SUPABASE_WRITE_RETRY_DELAYS_MS = [1_000, 3_000, 8_000]

function getSupabase(): SupabaseClient<any, any> {
	return createClient(env.API_SUPABASE_URL, env.API_SUPABASE_SERVICE_ROLE_KEY, {
		db: { schema: "sisub" },
		auth: { persistSession: false },
	})
}

function chunk<T>(items: T[], size: number): T[][] {
	const batches: T[][] = []
	for (let index = 0; index < items.length; index += size) {
		batches.push(items.slice(index, index + size))
	}
	return batches
}

function parseSupplyCapacity(value: number | string | null | undefined): number | null {
	if (value == null) return null
	if (typeof value === "number") return Number.isFinite(value) ? value : null

	const normalized = value.trim().replace(",", ".")
	if (!normalized) return null

	const parsed = Number(normalized)
	return Number.isFinite(parsed) ? parsed : null
}

function isRetryableWriteError(message: string): boolean {
	return /statement timeout|lock timeout|deadlock detected|connection terminated|temporarily unavailable/i.test(message)
}

async function retrySupabaseWrite(operation: () => Promise<{ error: { message: string } | null }>, scope: string): Promise<void> {
	for (let attempt = 0; attempt <= SUPABASE_WRITE_RETRY_DELAYS_MS.length; attempt++) {
		const result = await operation()
		if (!result.error) return

		const message = result.error.message
		if (!isRetryableWriteError(message) || attempt === SUPABASE_WRITE_RETRY_DELAYS_MS.length) {
			throw new Error(`${scope}: ${message}`)
		}

		const delay = SUPABASE_WRITE_RETRY_DELAYS_MS[attempt]
		console.warn(`[food-sync] ${scope} falhou (${message}); retry em ${delay}ms`)
		await Bun.sleep(delay)
	}
}

async function upsertFoodPdms(supabase: SupabaseClient<any, any>, pdms: FoodPdmResponse[]): Promise<void> {
	if (pdms.length === 0) return

	const groupRows = [...new Map(pdms.map((pdm) => [pdm.codigoGrupo, pdm])).values()].map((pdm) => ({
		codigo_grupo: pdm.codigoGrupo,
		nome_grupo: pdm.nomeGrupo,
		status_grupo: true,
		data_hora_atualizacao: pdm.dataHoraAtualizacao ?? null,
		synced_at: new Date().toISOString(),
	}))

	const classRows = [...new Map(pdms.map((pdm) => [pdm.codigoClasse, pdm])).values()].map((pdm) => ({
		codigo_classe: pdm.codigoClasse,
		codigo_grupo: pdm.codigoGrupo,
		nome_classe: pdm.nomeClasse,
		status_classe: true,
		data_hora_atualizacao: pdm.dataHoraAtualizacao ?? null,
		synced_at: new Date().toISOString(),
	}))

	const pdmRows = pdms.map((pdm) => ({
		codigo_pdm: pdm.codigoPdm,
		codigo_classe: pdm.codigoClasse,
		nome_pdm: pdm.nomePdm,
		status_pdm: pdm.statusPdm,
		data_hora_atualizacao: pdm.dataHoraAtualizacao ?? null,
		synced_at: new Date().toISOString(),
	}))

	const [groupResult, classResult, pdmResult] = await Promise.all([
		supabase.from("compras_material_grupo").upsert(groupRows),
		supabase.from("compras_material_classe").upsert(classRows),
		supabase.from("compras_material_pdm").upsert(pdmRows),
	])

	if (groupResult.error) throw new Error(`upsert grupo alimentar: ${groupResult.error.message}`)
	if (classResult.error) throw new Error(`upsert classe alimentar: ${classResult.error.message}`)
	if (pdmResult.error) throw new Error(`upsert pdm alimentar: ${pdmResult.error.message}`)
}

async function upsertFoodItems(supabase: SupabaseClient<any, any>, items: FoodItemResponse[]): Promise<void> {
	if (items.length === 0) return

	const rows = items.map((item) => ({
		codigo_item: item.codigoItem,
		codigo_pdm: item.codigoPdm ?? null,
		descricao_item: item.descricaoItem,
		status_item: item.statusItem,
		item_sustentavel: item.itemSustentavel ?? null,
		codigo_ncm: item.codigoNcm ?? item.codigo_ncm ?? null,
		descricao_ncm: item.descricaoNcm ?? item.descricao_ncm ?? null,
		aplica_margem_preferencia: item.aplicaMargemPreferencia ?? item.aplica_margem_preferencia ?? null,
		data_hora_atualizacao: item.dataHoraAtualizacao ?? null,
		synced_at: new Date().toISOString(),
	}))

	for (const batch of chunk(rows, UPSERT_BATCH_SIZE)) {
		await retrySupabaseWrite(async () => await supabase.from("compras_material_item").upsert(batch, { onConflict: "codigo_item" }), "upsert item alimentar")
	}
}

async function upsertFoodUnits(supabase: SupabaseClient<any, any>, units: ComprasUnidadeFornecimento[]): Promise<void> {
	if (units.length === 0) return

	const rows = units
		.map((unit) => ({
			codigo_pdm: unit.codigoPdm,
			numero_sequencial_unidade_fornecimento: unit.numeroSequencialUnidadeFornecimento ?? null,
			sigla_unidade_fornecimento: unit.siglaUnidadeFornecimento ?? null,
			nome_unidade_fornecimento: unit.nomeUnidadeFornecimento ?? null,
			descricao_unidade_fornecimento: unit.descricaoUnidadeFornecimento ?? null,
			sigla_unidade_medida: unit.siglaUnidadeMedida ?? null,
			capacidade_unidade_fornecimento: parseSupplyCapacity(unit.capacidadeUnidadeFornecimento),
			status_unidade_fornecimento_pdm: unit.statusUnidadeFornecimentoPdm,
			data_hora_atualizacao: unit.dataHoraAtualizacao ?? null,
			synced_at: new Date().toISOString(),
		}))
		.filter((row) => row.numero_sequencial_unidade_fornecimento !== null)

	if (rows.length === 0) return

	const deduped = [...new Map(rows.map((row) => [`${row.codigo_pdm}|${row.numero_sequencial_unidade_fornecimento}`, row])).values()]

	for (const batch of chunk(deduped, UPSERT_BATCH_SIZE)) {
		await retrySupabaseWrite(
			async () =>
				await supabase.from("compras_material_unidade_fornecimento").upsert(batch, { onConflict: "codigo_pdm,numero_sequencial_unidade_fornecimento" }),
			"upsert unidade alimentar"
		)
	}
}

async function syncPdmDetails(
	supabase: SupabaseClient<any, any>,
	pdm: FoodPdmResponse,
	options: Required<Pick<FoodMaterialSyncOptions, "syncUnits">>,
	summary: FoodMaterialSyncSummary
): Promise<void> {
	if (options.syncUnits) {
		for await (const { page } of fetchAllPages<ComprasUnidadeFornecimento>("modulo-material/6_consultarMaterialUnidadeFornecimento", {
			codigoPdm: pdm.codigoPdm,
			statusUnidadeFornecimentoPdm: 1,
		})) {
			await upsertFoodUnits(supabase, page.resultado)
			summary.unitsUpserted += page.resultado.filter((row) => row.numeroSequencialUnidadeFornecimento != null).length
		}
	}

	for await (const { page } of fetchAllPages<FoodItemResponse>("modulo-material/4_consultarItemMaterial", {
		codigoPdm: pdm.codigoPdm,
	})) {
		await upsertFoodItems(supabase, page.resultado)
		summary.itemsUpserted += page.resultado.length
	}
}

export async function runFoodMaterialSync(options: FoodMaterialSyncOptions = {}): Promise<FoodMaterialSyncSummary> {
	const supabase = getSupabase()
	const classCodes = options.classCodes ?? [...FOOD_CLASS_CODES]
	const detailConcurrency = Math.max(1, Math.min(options.detailConcurrency ?? 3, 16))
	const summary: FoodMaterialSyncSummary = {
		classesProcessed: 0,
		pdmsFound: 0,
		pdmsUpserted: 0,
		unitsUpserted: 0,
		itemsUpserted: 0,
		errors: [],
	}

	const pdmMap = new Map<number, FoodPdmResponse>()

	for (const classCode of classCodes) {
		try {
			let classPdms = 0
			for await (const { page } of fetchAllPages<FoodPdmResponse>("modulo-material/3_consultarPdmMaterial", {
				codigoClasse: classCode,
				statusPdm: 1,
			})) {
				await upsertFoodPdms(supabase, page.resultado)
				summary.pdmsUpserted += page.resultado.length
				classPdms += page.resultado.length

				for (const pdm of page.resultado) {
					pdmMap.set(pdm.codigoPdm, pdm)
				}
			}

			summary.classesProcessed++
			console.log(`[food-sync] classe ${classCode}: ${classPdms} PDM(s) processado(s)`)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			summary.errors.push({ scope: `classe:${classCode}`, message })
			console.error(`[food-sync] falha ao sincronizar classe ${classCode}: ${message}`)
		}
	}

	const pdms = [...pdmMap.values()].sort((a, b) => a.codigoPdm - b.codigoPdm)
	summary.pdmsFound = pdms.length
	console.log(`[food-sync] ${pdms.length} PDM(s) alimentício(s) identificados para sync detalhado`)

	let nextIndex = 0
	let completed = 0

	async function worker(workerId: number): Promise<void> {
		while (true) {
			const currentIndex = nextIndex++
			if (currentIndex >= pdms.length) return

			const pdm = pdms[currentIndex]

			try {
				await syncPdmDetails(supabase, pdm, { syncUnits: options.syncUnits ?? true }, summary)
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				summary.errors.push({ scope: `pdm:${pdm.codigoPdm}`, message })
				console.error(`[food-sync] worker ${workerId} falhou no PDM ${pdm.codigoPdm} (${pdm.nomePdm}): ${message}`)
			} finally {
				completed++
				if (completed % 25 === 0 || completed === pdms.length) {
					console.log(`[food-sync] detalhes ${completed}/${pdms.length} PDM(s) concluídos`)
				}
			}
		}
	}

	await Promise.all(Array.from({ length: Math.min(detailConcurrency, Math.max(pdms.length, 1)) }, (_, index) => worker(index + 1)))

	return summary
}
