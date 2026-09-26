import type { SupabaseClient } from "@supabase/supabase-js"
import { comprasRequest, fetchAllPages } from "./client.ts"
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
import { createStepCounts, type StepCounts, type UpdateProgress, upsertCountingWrites } from "./upsert.ts"

// ─── Step 8: Seção ────────────────────────────────────────────────────────────

export async function syncServicoSecao(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<StepCounts> {
	const counts = createStepCounts()
	for await (const { page, pageNumber } of fetchAllPages<ComprasSecaoServico>(comprasRequest("/modulo-servico/1_consultarSecaoServico"))) {
		const rows = page.resultado.map((r) => ({
			codigo_secao: r.codigoSecao,
			nome_secao: r.nomeSecao,
			status_secao: r.statusSecao,
			data_hora_atualizacao: r.dataHoraAtualizacao ?? null,
			synced_at: new Date().toISOString(),
		}))
		const written = await upsertCountingWrites(supabase, "compras_servico_secao", rows, { label: "upsert servico_secao" })
		await updateProgress(pageNumber, page.totalPaginas, counts.add(rows.length, written))
	}
	return { processed: counts.processed, written: counts.written }
}

// ─── Step 9: Divisão ──────────────────────────────────────────────────────────

export async function syncServicoDivisao(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<StepCounts> {
	const counts = createStepCounts()
	for await (const { page, pageNumber } of fetchAllPages<ComprasDivisaoServico>(comprasRequest("/modulo-servico/2_consultarDivisaoServico"))) {
		const rows = page.resultado.map((r) => ({
			codigo_divisao: r.codigoDivisao,
			codigo_secao: r.codigoSecao,
			nome_divisao: r.nomeDivisao,
			status_divisao: r.statusDivisao,
			data_hora_atualizacao: r.dataHoraAtualizacao ?? null,
			synced_at: new Date().toISOString(),
		}))
		const written = await upsertCountingWrites(supabase, "compras_servico_divisao", rows, { label: "upsert servico_divisao" })
		await updateProgress(pageNumber, page.totalPaginas, counts.add(rows.length, written))
	}
	return { processed: counts.processed, written: counts.written }
}

// ─── Step 10: Grupo ───────────────────────────────────────────────────────────

export async function syncServicoGrupo(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<StepCounts> {
	const counts = createStepCounts()
	for await (const { page, pageNumber } of fetchAllPages<ComprasGrupoServico>(comprasRequest("/modulo-servico/3_consultarGrupoServico"))) {
		const rows = page.resultado.map((r) => ({
			codigo_grupo: r.codigoGrupo,
			codigo_divisao: r.codigoDivisao,
			nome_grupo: r.nomeGrupo,
			status_grupo: r.statusGrupo,
			data_hora_atualizacao: r.dataHoraAtualizacao ?? null,
			synced_at: new Date().toISOString(),
		}))
		const written = await upsertCountingWrites(supabase, "compras_servico_grupo", rows, { label: "upsert servico_grupo" })
		await updateProgress(pageNumber, page.totalPaginas, counts.add(rows.length, written))
	}
	return { processed: counts.processed, written: counts.written }
}

// ─── Step 11: Classe ──────────────────────────────────────────────────────────

export async function syncServicoClasse(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<StepCounts> {
	const counts = createStepCounts()
	for await (const { page, pageNumber } of fetchAllPages<ComprasClasseServico>(comprasRequest("/modulo-servico/4_consultarClasseServico"))) {
		const rows = page.resultado.map((r) => ({
			codigo_classe: r.codigoClasse,
			codigo_grupo: r.codigoGrupo,
			nome_classe: r.nomeClasse,
			status_grupo: r.statusGrupo,
			data_hora_atualizacao: r.dataHoraAtualizacao ?? null,
			synced_at: new Date().toISOString(),
		}))
		const written = await upsertCountingWrites(supabase, "compras_servico_classe", rows, { label: "upsert servico_classe" })
		await updateProgress(pageNumber, page.totalPaginas, counts.add(rows.length, written))
	}
	return { processed: counts.processed, written: counts.written }
}

// ─── Step 12: Subclasse ───────────────────────────────────────────────────────

export async function syncServicoSubclasse(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<StepCounts> {
	const counts = createStepCounts()
	for await (const { page, pageNumber } of fetchAllPages<ComprasSubclasseServico>(comprasRequest("/modulo-servico/5_consultarSubClasseServico"))) {
		const rows = page.resultado.map((r) => ({
			codigo_subclasse: r.codigoSubclasse,
			codigo_classe: r.codigoClasse,
			nome_subclasse: r.nomeSubclasse,
			status_subclasse: r.statusSubclasse,
			data_hora_atualizacao: r.dataHoraAtualizacao ?? null,
			synced_at: new Date().toISOString(),
		}))
		const written = await upsertCountingWrites(supabase, "compras_servico_subclasse", rows, { label: "upsert servico_subclasse" })
		await updateProgress(pageNumber, page.totalPaginas, counts.add(rows.length, written))
	}
	return { processed: counts.processed, written: counts.written }
}

// ─── Step 13: Item ────────────────────────────────────────────────────────────

export async function syncServicoItem(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<StepCounts> {
	const counts = createStepCounts()
	// Sem filtro de status — necessário para detectar itens desativados
	for await (const { page, pageNumber } of fetchAllPages<ComprasItemServico>(comprasRequest("/modulo-servico/6_consultarItemServico"))) {
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
		// Triggers no banco: a_skip_unchanged_sync_row descarta a linha idêntica, e o de
		// desativação cuida do first_deactivation_detected_at
		const written = await upsertCountingWrites(supabase, "compras_servico_item", rows, { label: "upsert servico_item" })
		await updateProgress(pageNumber, page.totalPaginas, counts.add(rows.length, written))
	}
	return { processed: counts.processed, written: counts.written }
}

// ─── Step 14: Unidade de Medida ───────────────────────────────────────────────

export async function syncServicoUnidadeMedida(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<StepCounts> {
	const counts = createStepCounts()
	for await (const { page, pageNumber } of fetchAllPages<ComprasUnidadeMedidaServico>(comprasRequest("/modulo-servico/7_consultarUndMedidaServico"))) {
		const rows = page.resultado.map((r) => ({
			codigo_servico: r.codigoServico,
			sigla_unidade_medida: r.siglaUnidadeMedida,
			nome_unidade_medida: r.nomeUnidadeMedida ?? null,
			status_unidade_medida: r.statusUnidadeMedida,
			synced_at: new Date().toISOString(),
		}))
		const written = await upsertCountingWrites(supabase, "compras_servico_unidade_medida", rows, {
			label: "upsert servico_unidade_medida",
			onConflict: "codigo_servico,sigla_unidade_medida",
		})
		await updateProgress(pageNumber, page.totalPaginas, counts.add(rows.length, written))
	}
	return { processed: counts.processed, written: counts.written }
}

// ─── Step 15: Natureza Despesa ────────────────────────────────────────────────

export async function syncServicoNaturezaDespesa(supabase: SupabaseClient, updateProgress: UpdateProgress): Promise<StepCounts> {
	const counts = createStepCounts()
	for await (const { page, pageNumber } of fetchAllPages<ComprasNaturezaDespesaServico>(comprasRequest("/modulo-servico/8_consultarNaturezaDespesaServico"))) {
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
			await updateProgress(pageNumber, page.totalPaginas, counts.add(0, 0))
			continue
		}
		const written = await upsertCountingWrites(supabase, "compras_servico_natureza_despesa", rows, {
			label: "upsert servico_natureza_despesa",
			onConflict: "codigo_servico,codigo_natureza_despesa",
		})
		await updateProgress(pageNumber, page.totalPaginas, counts.add(rows.length, written))
	}
	return { processed: counts.processed, written: counts.written }
}
