import type { SupabaseClient } from "@supabase/supabase-js"
import { fetchAllPages } from "./client.ts"
import type {
	ComprasClasseServico,
	ComprasDivisaoServico,
	ComprasGrupoServico,
	ComprasItemServico,
	ComprasNaturezaDespesaServico,
	ComprasSecaoServico,
	ComprasSubclasseServico,
	ComprasUnidadeMedidaServico,
} from "./types.ts"

type UpdateProgress = (pageNumber: number, totalPages: number, upserted: number) => Promise<void>

// ─── Step 8: Seção ────────────────────────────────────────────────────────────

export async function syncServicoSecao(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<number> {
	let totalUpserted = 0
	for await (const { page, pageNumber } of fetchAllPages<ComprasSecaoServico>("modulo-servico/1_consultarSecaoServico")) {
		const rows = page.resultado.map((r) => ({
			codigo_secao: r.codigoSecao,
			nome_secao: r.nomeSecao,
			status_secao: r.statusSecao,
			data_hora_atualizacao: r.dataHoraAtualizacao ?? null,
			synced_at: new Date().toISOString(),
		}))
		const { error } = await supabase.from("compras_servico_secao").upsert(rows)
		if (error) throw new Error(`upsert servico_secao: ${error.message}`)
		totalUpserted += rows.length
		await updateProgress(pageNumber, page.totalPaginas, totalUpserted)
	}
	return totalUpserted
}

// ─── Step 9: Divisão ──────────────────────────────────────────────────────────

export async function syncServicoDivisao(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<number> {
	let totalUpserted = 0
	for await (const { page, pageNumber } of fetchAllPages<ComprasDivisaoServico>("modulo-servico/2_consultarDivisaoServico")) {
		const rows = page.resultado.map((r) => ({
			codigo_divisao: r.codigoDivisao,
			codigo_secao: r.codigoSecao,
			nome_divisao: r.nomeDivisao,
			status_divisao: r.statusDivisao,
			data_hora_atualizacao: r.dataHoraAtualizacao ?? null,
			synced_at: new Date().toISOString(),
		}))
		const { error } = await supabase.from("compras_servico_divisao").upsert(rows)
		if (error) throw new Error(`upsert servico_divisao: ${error.message}`)
		totalUpserted += rows.length
		await updateProgress(pageNumber, page.totalPaginas, totalUpserted)
	}
	return totalUpserted
}

// ─── Step 10: Grupo ───────────────────────────────────────────────────────────

export async function syncServicoGrupo(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<number> {
	let totalUpserted = 0
	for await (const { page, pageNumber } of fetchAllPages<ComprasGrupoServico>("modulo-servico/3_consultarGrupoServico")) {
		const rows = page.resultado.map((r) => ({
			codigo_grupo: r.codigoGrupo,
			codigo_divisao: r.codigoDivisao,
			nome_grupo: r.nomeGrupo,
			status_grupo: r.statusGrupo,
			data_hora_atualizacao: r.dataHoraAtualizacao ?? null,
			synced_at: new Date().toISOString(),
		}))
		const { error } = await supabase.from("compras_servico_grupo").upsert(rows)
		if (error) throw new Error(`upsert servico_grupo: ${error.message}`)
		totalUpserted += rows.length
		await updateProgress(pageNumber, page.totalPaginas, totalUpserted)
	}
	return totalUpserted
}

// ─── Step 11: Classe ──────────────────────────────────────────────────────────

export async function syncServicoClasse(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<number> {
	let totalUpserted = 0
	for await (const { page, pageNumber } of fetchAllPages<ComprasClasseServico>("modulo-servico/4_consultarClasseServico")) {
		const rows = page.resultado.map((r) => ({
			codigo_classe: r.codigoClasse,
			codigo_grupo: r.codigoGrupo,
			nome_classe: r.nomeClasse,
			status_grupo: r.statusGrupo,
			data_hora_atualizacao: r.dataHoraAtualizacao ?? null,
			synced_at: new Date().toISOString(),
		}))
		const { error } = await supabase.from("compras_servico_classe").upsert(rows)
		if (error) throw new Error(`upsert servico_classe: ${error.message}`)
		totalUpserted += rows.length
		await updateProgress(pageNumber, page.totalPaginas, totalUpserted)
	}
	return totalUpserted
}

// ─── Step 12: Subclasse ───────────────────────────────────────────────────────

export async function syncServicoSubclasse(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<number> {
	let totalUpserted = 0
	for await (const { page, pageNumber } of fetchAllPages<ComprasSubclasseServico>("modulo-servico/5_consultarSubClasseServico")) {
		const rows = page.resultado.map((r) => ({
			codigo_subclasse: r.codigoSubclasse,
			codigo_classe: r.codigoClasse,
			nome_subclasse: r.nomeSubclasse,
			status_subclasse: r.statusSubclasse,
			data_hora_atualizacao: r.dataHoraAtualizacao ?? null,
			synced_at: new Date().toISOString(),
		}))
		const { error } = await supabase.from("compras_servico_subclasse").upsert(rows)
		if (error) throw new Error(`upsert servico_subclasse: ${error.message}`)
		totalUpserted += rows.length
		await updateProgress(pageNumber, page.totalPaginas, totalUpserted)
	}
	return totalUpserted
}

// ─── Step 13: Item ────────────────────────────────────────────────────────────

export async function syncServicoItem(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<number> {
	let totalUpserted = 0
	// Sem filtro de status — necessário para detectar itens desativados
	for await (const { page, pageNumber } of fetchAllPages<ComprasItemServico>("modulo-servico/6_consultarItemServico")) {
		const rows = page.resultado.map((r) => ({
			codigo_servico: r.codigoServico,
			codigo_subclasse: r.codigoSubclasse ?? null,
			nome_servico: r.nomeServico,
			codigo_cpc: r.codigoCpc ?? null,
			exclusivo_central_compras: r.exclusivoCentralCompras ?? null,
			status_servico: r.statusServico,
			data_hora_atualizacao: r.dataHoraAtualizacao ?? null,
			synced_at: new Date().toISOString(),
		}))
		// Trigger no banco cuida do first_deactivation_detected_at
		const { error } = await supabase.from("compras_servico_item").upsert(rows)
		if (error) throw new Error(`upsert servico_item: ${error.message}`)
		totalUpserted += rows.length
		await updateProgress(pageNumber, page.totalPaginas, totalUpserted)
	}
	return totalUpserted
}

// ─── Step 14: Unidade de Medida ───────────────────────────────────────────────

export async function syncServicoUnidadeMedida(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<number> {
	let totalUpserted = 0
	for await (const { page, pageNumber } of fetchAllPages<ComprasUnidadeMedidaServico>("modulo-servico/7_consultarUndMedidaServico")) {
		const rows = page.resultado.map((r) => ({
			codigo_servico: r.codigoServico,
			sigla_unidade_medida: r.siglaUnidadeMedida,
			nome_unidade_medida: r.nomeUnidadeMedida ?? null,
			status_unidade_medida: r.statusUnidadeMedida,
			synced_at: new Date().toISOString(),
		}))
		const { error } = await supabase.from("compras_servico_unidade_medida").upsert(rows, { onConflict: "codigo_servico,sigla_unidade_medida" })
		if (error) throw new Error(`upsert servico_unidade_medida: ${error.message}`)
		totalUpserted += rows.length
		await updateProgress(pageNumber, page.totalPaginas, totalUpserted)
	}
	return totalUpserted
}

// ─── Step 15: Natureza Despesa ────────────────────────────────────────────────

export async function syncServicoNaturezaDespesa(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<number> {
	let totalUpserted = 0
	for await (const { page, pageNumber } of fetchAllPages<ComprasNaturezaDespesaServico>("modulo-servico/8_consultarNaturezaDespesaServico")) {
		const rows = page.resultado
			.filter((r) => r.nomeNaturezaDespesa != null)
			.map((r) => ({
				codigo_servico: r.codigoServico,
				codigo_natureza_despesa: r.codigoNaturezaDespesa,
				nome_natureza_despesa: r.nomeNaturezaDespesa,
				status_natureza_despesa: r.statusNaturezaDespesa,
				synced_at: new Date().toISOString(),
			}))
		if (rows.length === 0) {
			await updateProgress(pageNumber, page.totalPaginas, totalUpserted)
			continue
		}
		const { error } = await supabase.from("compras_servico_natureza_despesa").upsert(rows, { onConflict: "codigo_servico,codigo_natureza_despesa" })
		if (error) throw new Error(`upsert servico_natureza_despesa: ${error.message}`)
		totalUpserted += rows.length
		await updateProgress(pageNumber, page.totalPaginas, totalUpserted)
	}
	return totalUpserted
}
