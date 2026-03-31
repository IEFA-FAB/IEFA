import type { SupabaseClient } from "@supabase/supabase-js"
import { fetchAllPages } from "./client.ts"
import type {
	ComprasCaracteristicaMaterial,
	ComprasClasseMaterial,
	ComprasGrupoMaterial,
	ComprasItemMaterial,
	ComprasNaturezaDespesaMaterial,
	ComprasPdmMaterial,
	ComprasUnidadeFornecimento,
} from "./types.ts"

type UpdateProgress = (pageNumber: number, totalPages: number, upserted: number) => Promise<void>

// ─── Step 1: Grupo ────────────────────────────────────────────────────────────

export async function syncMaterialGrupo(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<number> {
	let totalUpserted = 0
	for await (const { page, pageNumber } of fetchAllPages<ComprasGrupoMaterial>("modulo-material/1_consultarGrupoMaterial")) {
		const rows = page.resultado.map((r) => ({
			codigo_grupo: r.codigoGrupo,
			nome_grupo: r.nomeGrupo,
			status_grupo: r.statusGrupo,
			data_hora_atualizacao: r.dataHoraAtualizacao ?? null,
			synced_at: new Date().toISOString(),
		}))
		const { error } = await supabase.from("compras_material_grupo").upsert(rows)
		if (error) throw new Error(`upsert grupo: ${error.message}`)
		totalUpserted += rows.length
		await updateProgress(pageNumber, page.totalPaginas, totalUpserted)
	}
	return totalUpserted
}

// ─── Step 2: Classe ───────────────────────────────────────────────────────────

export async function syncMaterialClasse(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<number> {
	let totalUpserted = 0
	for await (const { page, pageNumber } of fetchAllPages<ComprasClasseMaterial>("modulo-material/2_consultarClasseMaterial")) {
		const rows = page.resultado.map((r) => ({
			codigo_classe: r.codigoClasse,
			codigo_grupo: r.codigoGrupo,
			nome_classe: r.nomeClasse,
			status_classe: r.statusClasse,
			data_hora_atualizacao: r.dataHoraAtualizacao ?? null,
			synced_at: new Date().toISOString(),
		}))
		const { error } = await supabase.from("compras_material_classe").upsert(rows)
		if (error) throw new Error(`upsert classe: ${error.message}`)
		totalUpserted += rows.length
		await updateProgress(pageNumber, page.totalPaginas, totalUpserted)
	}
	return totalUpserted
}

// ─── Step 3: PDM ──────────────────────────────────────────────────────────────

export async function syncMaterialPdm(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<number> {
	let totalUpserted = 0
	for await (const { page, pageNumber } of fetchAllPages<ComprasPdmMaterial>("modulo-material/3_consultarPdmMaterial")) {
		const rows = page.resultado.map((r) => ({
			codigo_pdm: r.codigoPdm,
			codigo_classe: r.codigoClasse,
			nome_pdm: r.nomePdm,
			status_pdm: r.statusPdm,
			data_hora_atualizacao: r.dataHoraAtualizacao ?? null,
			synced_at: new Date().toISOString(),
		}))
		const { error } = await supabase.from("compras_material_pdm").upsert(rows)
		if (error) throw new Error(`upsert pdm: ${error.message}`)
		totalUpserted += rows.length
		await updateProgress(pageNumber, page.totalPaginas, totalUpserted)
	}
	return totalUpserted
}

// ─── Step 4: Item ─────────────────────────────────────────────────────────────

export async function syncMaterialItem(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<number> {
	let totalUpserted = 0
	// Sem filtro de status — necessário para detectar itens desativados
	for await (const { page, pageNumber } of fetchAllPages<ComprasItemMaterial>("modulo-material/4_consultarItemMaterial")) {
		const rows = page.resultado.map((r) => ({
			codigo_item: r.codigoItem,
			codigo_pdm: r.codigoPdm ?? null,
			descricao_item: r.descricaoItem,
			status_item: r.statusItem,
			item_sustentavel: r.itemSustentavel ?? null,
			codigo_ncm: r.codigoNcm ?? null,
			descricao_ncm: r.descricaoNcm ?? null,
			aplica_margem_preferencia: r.aplicaMargemPreferencia ?? null,
			data_hora_atualizacao: r.dataHoraAtualizacao ?? null,
			synced_at: new Date().toISOString(),
		}))
		// Trigger no banco cuida do first_deactivation_detected_at
		const { error } = await supabase.from("compras_material_item").upsert(rows)
		if (error) throw new Error(`upsert item: ${error.message}`)
		totalUpserted += rows.length
		await updateProgress(pageNumber, page.totalPaginas, totalUpserted)
	}
	return totalUpserted
}

// ─── Step 5: Natureza Despesa ─────────────────────────────────────────────────

export async function syncMaterialNaturezaDespesa(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<number> {
	let totalUpserted = 0
	for await (const { page, pageNumber } of fetchAllPages<ComprasNaturezaDespesaMaterial>("modulo-material/5_consultarMaterialNaturezaDespesa")) {
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
			await updateProgress(pageNumber, page.totalPaginas, totalUpserted)
			continue
		}
		const { error } = await supabase.from("compras_material_natureza_despesa").upsert(rows, { onConflict: "codigo_pdm,codigo_natureza_despesa" })
		if (error) throw new Error(`upsert natureza_despesa: ${error.message}`)
		totalUpserted += rows.length
		await updateProgress(pageNumber, page.totalPaginas, totalUpserted)
	}
	return totalUpserted
}

// ─── Step 6: Unidade de Fornecimento ─────────────────────────────────────────

export async function syncMaterialUnidadeFornecimento(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<number> {
	let totalUpserted = 0
	for await (const { page, pageNumber } of fetchAllPages<ComprasUnidadeFornecimento>("modulo-material/6_consultarMaterialUnidadeFornecimento")) {
		const rows = page.resultado.map((r) => ({
			codigo_pdm: r.codigoPdm,
			numero_sequencial_unidade_fornecimento: r.numeroSequencialUnidadeFornecimento ?? null,
			sigla_unidade_fornecimento: r.siglaUnidadeFornecimento ?? null,
			nome_unidade_fornecimento: r.nomeUnidadeFornecimento ?? null,
			descricao_unidade_fornecimento: r.descricaoUnidadeFornecimento ?? null,
			sigla_unidade_medida: r.siglaUnidadeMedida ?? null,
			capacidade_unidade_fornecimento: r.capacidadeUnidadeFornecimento ?? null,
			status_unidade_fornecimento_pdm: r.statusUnidadeFornecimentoPdm,
			data_hora_atualizacao: r.dataHoraAtualizacao ?? null,
			synced_at: new Date().toISOString(),
		}))
		// Filtrar rows sem numero_sequencial (parte da unique constraint) para evitar erro
		const withSeq = rows.filter((r) => r.numero_sequencial_unidade_fornecimento !== null)
		if (withSeq.length === 0) {
			await updateProgress(pageNumber, page.totalPaginas, totalUpserted)
			continue
		}
		// Deduplicate dentro da página para evitar "ON CONFLICT DO UPDATE cannot affect row a second time"
		const deduped = [...new Map(withSeq.map((r) => [`${r.codigo_pdm}|${r.numero_sequencial_unidade_fornecimento}`, r])).values()]
		const { error } = await supabase
			.from("compras_material_unidade_fornecimento")
			.upsert(deduped, { onConflict: "codigo_pdm,numero_sequencial_unidade_fornecimento" })
		if (error) throw new Error(`upsert unidade_fornecimento: ${error.message}`)
		totalUpserted += withSeq.length
		await updateProgress(pageNumber, page.totalPaginas, totalUpserted)
	}
	return totalUpserted
}

// ─── Step 7: Características ──────────────────────────────────────────────────

export async function syncMaterialCaracteristica(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<number> {
	let totalUpserted = 0
	// Sem filtro de status (plano: sem filtro de status)
	for await (const { page, pageNumber } of fetchAllPages<ComprasCaracteristicaMaterial>("modulo-material/7_consultarMaterialCaracteristicas")) {
		const rows = page.resultado.map((r) => ({
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
			synced_at: new Date().toISOString(),
		}))
		const { error } = await supabase
			.from("compras_material_caracteristica")
			.upsert(rows, { onConflict: "codigo_item,codigo_caracteristica,codigo_valor_caracteristica" })
		if (error) throw new Error(`upsert caracteristica: ${error.message}`)
		totalUpserted += rows.length
		await updateProgress(pageNumber, page.totalPaginas, totalUpserted)
	}
	return totalUpserted
}
