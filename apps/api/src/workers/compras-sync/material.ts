import type { SupabaseClient } from "@supabase/supabase-js"
import { calcConcurrency, comprasRequest, fetchAllPages, fetchAllPagesParallel } from "./client.ts"
import type {
	ComprasCaracteristicaMaterial,
	ComprasClasseMaterial,
	ComprasGrupoMaterial,
	ComprasItemMaterial,
	ComprasNaturezaDespesaMaterial,
	ComprasPdmMaterial,
	ComprasUnidadeFornecimento,
} from "./types.ts"
import { createStepCounts, dedupeByKey, type StepCounts, type UpdateProgress, upsertCountingWrites } from "./upsert.ts"

function parseSupplyCapacity(value: number | string | null | undefined): number | null {
	if (value == null) return null
	if (typeof value === "number") return Number.isFinite(value) ? value : null

	const normalized = value.trim().replace(",", ".")
	if (!normalized) return null

	const parsed = Number(normalized)
	return Number.isFinite(parsed) ? parsed : null
}

// ─── Step 1: Grupo ────────────────────────────────────────────────────────────

export async function syncMaterialGrupo(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<StepCounts> {
	const counts = createStepCounts()
	for await (const { page, pageNumber } of fetchAllPages<ComprasGrupoMaterial>(comprasRequest("/modulo-material/1_consultarGrupoMaterial"))) {
		const rows = page.resultado.map((r) => ({
			codigo_grupo: r.codigoGrupo,
			nome_grupo: r.nomeGrupo,
			status_grupo: r.statusGrupo,
			data_hora_atualizacao: r.dataHoraAtualizacao ?? null,
			synced_at: new Date().toISOString(),
		}))
		const written = await upsertCountingWrites(supabase, "compras_material_grupo", rows, { label: "upsert grupo" })
		await updateProgress(pageNumber, page.totalPaginas, counts.add(rows.length, written))
	}
	return { processed: counts.processed, written: counts.written }
}

// ─── Step 2: Classe ───────────────────────────────────────────────────────────

export async function syncMaterialClasse(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<StepCounts> {
	const counts = createStepCounts()
	for await (const { page, pageNumber } of fetchAllPages<ComprasClasseMaterial>(comprasRequest("/modulo-material/2_consultarClasseMaterial"))) {
		const rows = page.resultado.map((r) => ({
			codigo_classe: r.codigoClasse,
			codigo_grupo: r.codigoGrupo,
			nome_classe: r.nomeClasse,
			status_classe: r.statusClasse,
			data_hora_atualizacao: r.dataHoraAtualizacao ?? null,
			synced_at: new Date().toISOString(),
		}))
		const written = await upsertCountingWrites(supabase, "compras_material_classe", rows, { label: "upsert classe" })
		await updateProgress(pageNumber, page.totalPaginas, counts.add(rows.length, written))
	}
	return { processed: counts.processed, written: counts.written }
}

// ─── Step 3: PDM ──────────────────────────────────────────────────────────────

export async function syncMaterialPdm(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<StepCounts> {
	const counts = createStepCounts()
	for await (const { page, pageNumber } of fetchAllPages<ComprasPdmMaterial>(comprasRequest("/modulo-material/3_consultarPdmMaterial"))) {
		const rows = page.resultado.map((r) => ({
			codigo_pdm: r.codigoPdm,
			codigo_classe: r.codigoClasse,
			nome_pdm: r.nomePdm,
			status_pdm: r.statusPdm,
			data_hora_atualizacao: r.dataHoraAtualizacao ?? null,
			synced_at: new Date().toISOString(),
		}))
		const written = await upsertCountingWrites(supabase, "compras_material_pdm", rows, { label: "upsert pdm" })
		await updateProgress(pageNumber, page.totalPaginas, counts.add(rows.length, written))
	}
	return { processed: counts.processed, written: counts.written }
}

// ─── Step 4: Item ─────────────────────────────────────────────────────────────

export async function syncMaterialItem(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<StepCounts> {
	// Sem filtro de status — necessário para detectar itens desativados
	const counts = createStepCounts()
	let completedPages = 0
	let totalPages = 0

	const concurrency = calcConcurrency()
	await fetchAllPagesParallel<ComprasItemMaterial>(comprasRequest("/modulo-material/4_consultarItemMaterial"), concurrency, async (page, pageNumber) => {
		totalPages = page.totalPaginas

		const rows = page.resultado.map((r) => ({
			codigo_item: r.codigoItem,
			codigo_pdm: r.codigoPdm ?? null,
			descricao_item: r.descricaoItem,
			status_item: r.statusItem,
			item_sustentavel: r.itemSustentavel ?? null,
			codigo_ncm: r.codigoNcm ?? r.codigo_ncm ?? null,
			descricao_ncm: r.descricaoNcm ?? r.descricao_ncm ?? null,
			aplica_margem_preferencia: r.aplicaMargemPreferencia ?? r.aplica_margem_preferencia ?? null,
			data_hora_atualizacao: r.dataHoraAtualizacao ?? null,
			synced_at: new Date().toISOString(),
		}))

		// Triggers no banco: a_skip_unchanged_sync_row descarta a linha idêntica, e o de
		// desativação cuida do first_deactivation_detected_at
		const written = await upsertCountingWrites(supabase, "compras_material_item", rows, { label: `upsert item (p${pageNumber})` })

		// Acumuladores são seguros: JS usa event loop cooperativo (single-thread)
		const progress = counts.add(rows.length, written)
		completedPages++
		// current_page aqui representa páginas concluídas (não a página em curso)
		await updateProgress(completedPages, totalPages, progress)
	})

	return { processed: counts.processed, written: counts.written }
}

// ─── Step 5: Natureza Despesa ─────────────────────────────────────────────────

export async function syncMaterialNaturezaDespesa(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<StepCounts> {
	const counts = createStepCounts()
	for await (const { page, pageNumber } of fetchAllPages<ComprasNaturezaDespesaMaterial>(
		comprasRequest("/modulo-material/5_consultarMaterialNaturezaDespesa")
	)) {
		const rows = page.resultado
			.filter((r) => r.nomeNaturezaDespesa != null)
			.map((r) => ({
				codigo_pdm: r.codigoPdm,
				codigo_natureza_despesa: r.codigoNaturezaDespesa,
				nome_natureza_despesa: r.nomeNaturezaDespesa,
				status_natureza_despesa: r.statusNaturezaDespesa,
				synced_at: new Date().toISOString(),
			}))
		if (rows.length === 0) {
			await updateProgress(pageNumber, page.totalPaginas, counts.add(0, 0))
			continue
		}
		const written = await upsertCountingWrites(supabase, "compras_material_natureza_despesa", rows, {
			label: "upsert natureza_despesa",
			onConflict: "codigo_pdm,codigo_natureza_despesa",
		})
		await updateProgress(pageNumber, page.totalPaginas, counts.add(rows.length, written))
	}
	return { processed: counts.processed, written: counts.written }
}

// ─── Step 6: Unidade de Fornecimento ─────────────────────────────────────────

export async function syncMaterialUnidadeFornecimento(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<StepCounts> {
	const counts = createStepCounts()
	for await (const { page, pageNumber } of fetchAllPages<ComprasUnidadeFornecimento>(
		comprasRequest("/modulo-material/6_consultarMaterialUnidadeFornecimento")
	)) {
		const rows = page.resultado.map((r) => ({
			codigo_pdm: r.codigoPdm,
			numero_sequencial_unidade_fornecimento: r.numeroSequencialUnidadeFornecimento ?? null,
			sigla_unidade_fornecimento: r.siglaUnidadeFornecimento ?? null,
			nome_unidade_fornecimento: r.nomeUnidadeFornecimento ?? null,
			descricao_unidade_fornecimento: r.descricaoUnidadeFornecimento ?? null,
			sigla_unidade_medida: r.siglaUnidadeMedida ?? null,
			capacidade_unidade_fornecimento: parseSupplyCapacity(r.capacidadeUnidadeFornecimento),
			status_unidade_fornecimento_pdm: r.statusUnidadeFornecimentoPdm,
			data_hora_atualizacao: r.dataHoraAtualizacao ?? null,
			synced_at: new Date().toISOString(),
		}))
		// Filtrar rows sem numero_sequencial (parte da unique constraint) para evitar erro
		const withSeq = rows.filter((r) => r.numero_sequencial_unidade_fornecimento !== null)
		if (withSeq.length === 0) {
			await updateProgress(pageNumber, page.totalPaginas, counts.add(0, 0))
			continue
		}
		// Deduplicate dentro da página para evitar "ON CONFLICT DO UPDATE cannot affect row a second time"
		const deduped = [...new Map(withSeq.map((r) => [`${r.codigo_pdm}|${r.numero_sequencial_unidade_fornecimento}`, r])).values()]
		const written = await upsertCountingWrites(supabase, "compras_material_unidade_fornecimento", deduped, {
			label: "upsert unidade_fornecimento",
			onConflict: "codigo_pdm,numero_sequencial_unidade_fornecimento",
		})
		await updateProgress(pageNumber, page.totalPaginas, counts.add(deduped.length, written))
	}
	return { processed: counts.processed, written: counts.written }
}

// ─── Step 7: Características ──────────────────────────────────────────────────

/** Chave do unique de `compras_material_caracteristica` (NULLS NOT DISTINCT desde o PR 467). */
export const CARACTERISTICA_KEY = ["codigo_item", "codigo_caracteristica", "codigo_valor_caracteristica"] as const

/**
 * Linhas de uma página de características, uma por chave (a última ocorrência). Com o unique
 * NULLS NOT DISTINCT, duas linhas da mesma chave no lote (inclusive com valor nulo) abortariam o
 * upsert inteiro com "ON CONFLICT DO UPDATE command cannot affect row a second time".
 */
export function buildCaracteristicaRows(resultado: readonly ComprasCaracteristicaMaterial[], syncedAt = new Date().toISOString()) {
	const rows = resultado.map((r) => ({
		codigo_item: r.codigoItem,
		codigo_caracteristica: r.codigoCaracteristica,
		nome_caracteristica: r.nomeCaracteristica,
		status_caracteristica: r.statusCaracteristica,
		codigo_valor_caracteristica: r.codigoValorCaracteristica ?? null,
		nome_valor_caracteristica: r.nomeValorCaracteristica ?? null,
		status_valor_caracteristica: r.statusValorCaracteristica ?? null,
		numero_caracteristica: r.numeroCaracteristica ?? null,
		sigla_unidade_medida: r.siglaUnidadeMedida ?? null,
		data_hora_atualizacao: r.dataHoraAtualizacao ?? null,
		synced_at: syncedAt,
	}))
	return dedupeByKey(rows, CARACTERISTICA_KEY)
}

export async function syncMaterialCaracteristica(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<StepCounts> {
	const counts = createStepCounts()
	// Sem filtro de status (plano: sem filtro de status)
	for await (const { page, pageNumber } of fetchAllPages<ComprasCaracteristicaMaterial>(
		comprasRequest("/modulo-material/7_consultarMaterialCaracteristicas")
	)) {
		const rows = buildCaracteristicaRows(page.resultado)
		const written = await upsertCountingWrites(supabase, "compras_material_caracteristica", rows, {
			label: "upsert caracteristica",
			onConflict: CARACTERISTICA_KEY.join(","),
		})
		await updateProgress(pageNumber, page.totalPaginas, counts.add(rows.length, written))
	}
	return { processed: counts.processed, written: counts.written }
}
