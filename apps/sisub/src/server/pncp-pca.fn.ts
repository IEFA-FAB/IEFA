/**
 * @module pncp-pca.fn
 * Leitura do Plano de Contratações Anual (PCA) do PNCP já ingerido.
 * CLIENT: getComprasGovIntegrationClient (service role). Sem chamada externa: a UI lê o acervo
 * local e NUNCA espera o PNCP — a origem tem latência entre 2 s e 35 s para o mesmo arquivo.
 * TABLES: pncp_pca_item, pncp_pca_snapshot (compras_gov_integration); purchase_item (procurement).
 * AUTH: requireAuth() — mesmo guard do módulo de análise onde a tela vive.
 * @domain external
 * @migration n-a
 */

import { PCA_FOOD_CLASS_CODES } from "@iefa/sisub-domain/pncp-pca"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuth } from "@/lib/auth.server"
import { getComprasGovIntegrationClient, getProcurementClient } from "@/lib/supabase.server"

/** CNPJ raiz do Comando da Aeronáutica: um plano cobre todas as UASGs do órgão. */
const COMAER_CNPJ = "00394429000100"

const MAX_LIMIT = 500

/** Páginas de varredura: o PostgREST corta em 1000 linhas por padrão. */
const SCAN_PAGE = 1000
const CATALOG_CHUNK = 500

const FetchPcaSchema = z.object({
	ano: z.number().int().min(2020).max(2100),
	/** `true` restringe às 6 classes CATMAT de gênero alimentício. */
	apenasAlimentos: z.boolean().nullish(),
	uasg: z.string().nullish(),
	limit: z.number().int().min(1).max(MAX_LIMIT).nullish(),
})

export interface PcaItemRow {
	idItemPca: string
	uasg: string
	nomeUnidade: string | null
	codigoClasse: string | null
	nomeClasse: string | null
	codigoItem: string | null
	descricaoItem: string | null
	unidadeFornecimento: string | null
	quantidadeEstimada: number | null
	valorUnitarioEstimado: number | null
	/** Derivado na leitura, nunca gravado: o catálogo muda e uma flag persistida envelheceria. */
	cobertoPeloCatalogo: boolean
	insumo: string | null
}

export interface PcaCoverage {
	/** Itens vivos no recorte. */
	total: number
	comCatmat: number
	semCatmat: number
	comQuantidade: number
	semQuantidade: number
	catmatsDistintos: number
	catmatsNoCatalogo: number
	/** Quantidade somada apenas dos itens que TÊM quantidade — o resto é declarado. */
	quantidadeSomada: number
	itensForaDaSoma: number
}

export interface PcaSnapshotInfo {
	ano: number
	appliedAt: string | null
	rowCount: number | null
}

/**
 * Itens do plano, com a cobertura de catálogo resolvida por CATMAT.
 * Itens marcados como removidos do plano NUNCA entram — nem na lista, nem nas somas.
 */
export const fetchPcaItemsFn = createServerFn({ method: "GET" })
	.validator(FetchPcaSchema)
	.handler(async ({ data }): Promise<{ items: PcaItemRow[]; total: number; coverage: PcaCoverage; snapshot: PcaSnapshotInfo }> => {
		await requireAuth()

		const limit = Math.min(data.limit ?? 100, MAX_LIMIT)
		const supabase = getComprasGovIntegrationClient()

		let query = supabase
			.from("pncp_pca_item")
			.select(
				"id_item_pca, uasg, nome_unidade, codigo_classe, nome_classe, codigo_item, descricao_item, unidade_fornecimento, quantidade_estimada, valor_unitario_estimado",
				{ count: "exact" }
			)
			.eq("cnpj_orgao", COMAER_CNPJ)
			.eq("ano_pca", data.ano)
			.is("removed_at", null)

		if (data.apenasAlimentos) query = query.in("codigo_classe", [...PCA_FOOD_CLASS_CODES])
		if (data.uasg) query = query.eq("uasg", data.uasg)

		const { data: rows, count, error } = await query.order("uasg").order("id_item_pca").limit(limit)
		if (error) throw new Error(`Falha ao ler o plano de contratações: ${error.message}`)

		const items = rows ?? []

		// A cobertura descreve o RECORTE INTEIRO, não a página. Uma tela que soma 200 itens ao
		// lado de um total de 1.300 mente sobre o exercício — e é exatamente o tipo de número
		// silenciosamente errado que este change existe para não produzir. Paginado porque o
		// PostgREST corta em 1000.
		const scope: Array<{ codigo_item: string | null; quantidade_estimada: string | number | null }> = []
		for (let from = 0; ; from += SCAN_PAGE) {
			let scan = supabase
				.from("pncp_pca_item")
				.select("codigo_item, quantidade_estimada")
				.eq("cnpj_orgao", COMAER_CNPJ)
				.eq("ano_pca", data.ano)
				.is("removed_at", null)
			if (data.apenasAlimentos) scan = scan.in("codigo_classe", [...PCA_FOOD_CLASS_CODES])
			if (data.uasg) scan = scan.eq("uasg", data.uasg)

			const { data: page, error: scanErr } = await scan.order("id_item_pca").range(from, from + SCAN_PAGE - 1)
			if (scanErr) throw new Error(`Falha ao apurar a cobertura do plano: ${scanErr.message}`)
			if (!page?.length) break
			scope.push(...page)
			if (page.length < SCAN_PAGE) break
		}

		const scopeCodes = [...new Set(scope.map((r) => r.codigo_item).filter((c): c is string => !!c))]
		const codes = [...new Set(items.map((r) => r.codigo_item).filter((c): c is string => !!c))]

		// Cobertura derivada: um insumo cadastrado depois muda a resposta sem nova ingestão.
		const catalog = new Map<string, string>()
		const lookup = [...new Set([...codes, ...scopeCodes])]
		for (let i = 0; i < lookup.length; i += CATALOG_CHUNK) {
			const { data: matches } = await getProcurementClient()
				.from("purchase_item")
				.select("catmat_item_codigo, description")
				.is("deleted_at", null)
				.in(
					"catmat_item_codigo",
					lookup
						.slice(i, i + CATALOG_CHUNK)
						.map(Number)
						.filter(Number.isFinite)
				)
			for (const m of matches ?? []) {
				if (m.catmat_item_codigo != null) catalog.set(String(m.catmat_item_codigo), m.description ?? "")
			}
		}

		const mapped: PcaItemRow[] = items.map((r) => ({
			idItemPca: r.id_item_pca,
			uasg: r.uasg,
			nomeUnidade: r.nome_unidade,
			codigoClasse: r.codigo_classe,
			nomeClasse: r.nome_classe,
			codigoItem: r.codigo_item,
			descricaoItem: r.descricao_item,
			unidadeFornecimento: r.unidade_fornecimento,
			quantidadeEstimada: r.quantidade_estimada === null ? null : Number(r.quantidade_estimada),
			valorUnitarioEstimado: r.valor_unitario_estimado === null ? null : Number(r.valor_unitario_estimado),
			cobertoPeloCatalogo: r.codigo_item ? catalog.has(r.codigo_item) : false,
			insumo: r.codigo_item ? (catalog.get(r.codigo_item) ?? null) : null,
		}))

		const comQuantidade = scope.filter((r) => r.quantidade_estimada !== null)

		const coverage: PcaCoverage = {
			total: scope.length,
			comCatmat: scope.filter((r) => r.codigo_item).length,
			semCatmat: scope.filter((r) => !r.codigo_item).length,
			comQuantidade: comQuantidade.length,
			semQuantidade: scope.length - comQuantidade.length,
			catmatsDistintos: scopeCodes.length,
			catmatsNoCatalogo: scopeCodes.filter((c) => catalog.has(c)).length,
			quantidadeSomada: comQuantidade.reduce((acc, r) => acc + Number(r.quantidade_estimada ?? 0), 0),
			itensForaDaSoma: scope.length - comQuantidade.length,
		}

		const { data: snap } = await supabase
			.from("pncp_pca_snapshot")
			.select("applied_at, row_count")
			.eq("cnpj_orgao", COMAER_CNPJ)
			.eq("ano_pca", data.ano)
			.maybeSingle()

		return {
			items: mapped,
			total: count ?? mapped.length,
			coverage,
			snapshot: { ano: data.ano, appliedAt: snap?.applied_at ?? null, rowCount: snap?.row_count ?? null },
		}
	})

export interface PcaUasgRow {
	uasg: string
	nomeUnidade: string | null
	itens: number
	/** `true` quando a UASG já está vinculada a uma unidade do sisub. */
	jaCadastrada: boolean
}

/**
 * UASGs que planejam gênero alimentício, com o nome oficial — insumo para a curadoria manual de
 * `core.units.uasg`, que é o que destrava a cobertura de 3 para 28 unidades.
 */
export const fetchPcaUasgsFn = createServerFn({ method: "GET" })
	.validator(z.object({ ano: z.number().int().min(2020).max(2100) }))
	.handler(async ({ data }): Promise<{ uasgs: PcaUasgRow[]; total: number }> => {
		await requireAuth()

		// Paginado: são ~1.300 itens de gênero e o PostgREST corta em 1000. Sem isso, as UASGs
		// além da primeira página sumiriam justamente da tabela que existe para orientar a
		// curadoria de `core.units.uasg`.
		const rows: Array<{ uasg: string; nome_unidade: string | null }> = []
		for (let from = 0; ; from += SCAN_PAGE) {
			const { data: page, error } = await getComprasGovIntegrationClient()
				.from("pncp_pca_item")
				.select("uasg, nome_unidade")
				.eq("cnpj_orgao", COMAER_CNPJ)
				.eq("ano_pca", data.ano)
				.is("removed_at", null)
				.in("codigo_classe", [...PCA_FOOD_CLASS_CODES])
				.order("uasg")
				.range(from, from + SCAN_PAGE - 1)

			if (error) throw new Error(`Falha ao ler as UASGs do plano: ${error.message}`)
			if (!page?.length) break
			rows.push(...page)
			if (page.length < SCAN_PAGE) break
		}

		const byUasg = new Map<string, { nome: string | null; itens: number }>()
		for (const r of rows) {
			const cur = byUasg.get(r.uasg) ?? { nome: r.nome_unidade, itens: 0 }
			cur.itens++
			if (!cur.nome && r.nome_unidade) cur.nome = r.nome_unidade
			byUasg.set(r.uasg, cur)
		}

		const { data: units } = await getProcurementClient().schema("core").from("units").select("uasg").not("uasg", "is", null)
		const cadastradas = new Set((units ?? []).map((u: { uasg: string }) => u.uasg))

		const uasgs = [...byUasg.entries()]
			.map(([uasg, v]) => ({ uasg, nomeUnidade: v.nome, itens: v.itens, jaCadastrada: cadastradas.has(uasg) }))
			.sort((a, b) => b.itens - a.itens)

		return { uasgs, total: uasgs.length }
	})
