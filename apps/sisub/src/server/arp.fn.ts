/**
 * @module arp.fn
 * Integration with Compras.gov.br ARP (Ata de Registro de Preços) API + local empenho management.
 * CLIENT: getProcurementClient (service role). External: dadosabertos.compras.gov.br via
 *   `comprasApi` (@/lib/compras.server — 30 s timeout, 3 tentativas, backoff exponencial).
 * TABLES: procurement_arp, procurement_arp_item, empenho.
 * @domain external
 * @migration n-a
 */

import type { Empenho } from "@iefa/database/sisub"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { aggregateLocalCommitments, type LocalCommitment } from "@/lib/arp-balance"
import { type ArpSaldo, anoFromNumeroAta, assertVigenciaWindow, formatNumeroAta, parseBrDate, parseNumeroItem, resolveArpSaldos } from "@/lib/arp-compras"
import { requireAuth, requireUserId } from "@/lib/auth.server"
import { comprasApi, unwrapCompras } from "@/lib/compras.server"
import { getProcurementClient } from "@/lib/supabase.server"
import type { ArpWithItems, ComprasArpItemResult, ComprasArpPage } from "@/types/domain/arp"

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Teto por página do módulo ARP; abaixo de 10 a API devolve 400. */
const PAGE_SIZE = 500
/** Guarda contra ata gigante: 10 páginas × 500 = 5.000 itens. */
const MAX_ITEM_PAGES = 10

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const VigenciaWindowSchema = z.object({
	dataVigenciaInicialMin: z.string().regex(ISO_DATE, "Data inválida (YYYY-MM-DD)"),
	dataVigenciaInicialMax: z.string().regex(ISO_DATE, "Data inválida (YYYY-MM-DD)"),
})

// ─── 1. Buscar ARPs no Compras.gov.br ────────────────────────────────────────

/**
 * Queries Compras.gov.br for ARPs whose vigência inicial falls in the given window.
 *
 * @remarks
 * `dataVigenciaInicialMin`/`Max` são OBRIGATÓRIOS no swagger e a janela é
 * limitada a 365 dias — não há como listar "todas as ARPs de uma UASG".
 * O filtro é sobre o INÍCIO DA VIGÊNCIA, não sobre o ano do número da ata:
 * uma ata 00150/2024 que só passa a vigorar em janeiro/2025 cai na janela de 2025.
 *
 * @throws {Error} on window > 365 days, or "Compras.gov.br retornou {status}" após 3 tentativas.
 */
export const searchArpFn = createServerFn({ method: "GET" })
	.validator(
		VigenciaWindowSchema.extend({
			codigoUnidadeGerenciadora: z.string().min(1),
			/** Número da ata sem zeros à esquerda; combinado com `anoAta` vira o filtro exato NNNNN/AAAA. */
			numeroAta: z.string().optional(),
			anoAta: z
				.string()
				.regex(/^\d{4}$/)
				.optional(),
			// O filtro da API é o par NNNNN/AAAA. Aceitar o número sem o ano faria
			// a busca ignorar o número em silêncio e devolver a janela inteira, que
			// o usuário leria como "estas são as atas com esse número".
		}).refine((v) => !v.numeroAta || Boolean(v.anoAta), {
			message: "Informe o ano da ata junto com o número",
			path: ["anoAta"],
		})
	)
	.handler(async ({ data }): Promise<ComprasArpPage> => {
		await requireUserId()
		assertVigenciaWindow(data.dataVigenciaInicialMin, data.dataVigenciaInicialMax)

		// Número exato só é aplicável com o ano junto — o filtro da API é NNNNN/AAAA.
		const numeroAtaRegistroPreco = data.numeroAta && data.anoAta ? formatNumeroAta(data.numeroAta, data.anoAta) : undefined

		return unwrapCompras(
			await comprasApi.GET("/modulo-arp/1_consultarARP", {
				params: {
					query: {
						pagina: 1,
						tamanhoPagina: 20,
						codigoUnidadeGerenciadora: data.codigoUnidadeGerenciadora,
						dataVigenciaInicialMin: data.dataVigenciaInicialMin,
						dataVigenciaInicialMax: data.dataVigenciaInicialMax,
						...(numeroAtaRegistroPreco ? { numeroAtaRegistroPreco } : {}),
					},
				},
			})
		)
	})

// ─── 2. Importar ARP + seus itens (persiste no banco) ────────────────────────

/**
 * Lê todos os itens de UMA ata.
 *
 * `2_consultarARPItem` não aceita `numeroAtaRegistroPreco`: os filtros mais
 * estreitos são `codigoUnidadeGerenciadora` + `numeroCompra` + a janela de
 * vigência, e uma mesma compra costuma gerar dezenas de atas (a compra 90015 da
 * UASG 120001 gera 14). Por isso a seleção final da ata é feita aqui, sobre a
 * resposta.
 */
async function fetchArpItems(params: {
	codigoUnidadeGerenciadora: string
	numeroAtaRegistroPreco: string
	numeroCompra?: string | null
	dataVigenciaInicial: string
}): Promise<ComprasArpItemResult[]> {
	const items: ComprasArpItemResult[] = []

	for (let pagina = 1; pagina <= MAX_ITEM_PAGES; pagina++) {
		const page = unwrapCompras(
			await comprasApi.GET("/modulo-arp/2_consultarARPItem", {
				params: {
					query: {
						pagina,
						tamanhoPagina: PAGE_SIZE,
						// O swagger tipa este campo como integer aqui e como string em
						// `1_consultarARP` — inconsistência da API, não do app.
						codigoUnidadeGerenciadora: Number(params.codigoUnidadeGerenciadora),
						// Janela de um dia: a vigência inicial da própria ata.
						dataVigenciaInicialMin: params.dataVigenciaInicial,
						dataVigenciaInicialMax: params.dataVigenciaInicial,
						...(params.numeroCompra ? { numeroCompra: params.numeroCompra } : {}),
					},
				},
			})
		)

		const batch = page.resultado ?? []
		items.push(...batch.filter((item) => item.numeroAtaRegistroPreco === params.numeroAtaRegistroPreco))
		if (batch.length < PAGE_SIZE) return items
	}

	// Parar aqui e devolver o que veio produziria importação parcial — e a
	// reconciliação apagaria como "sumiu da API" todo item que ficou de fora.
	throw new Error(
		`A consulta de itens da ARP ${params.numeroAtaRegistroPreco} passou de ${MAX_ITEM_PAGES * PAGE_SIZE} registros — importação abortada para não gravar ata parcial`
	)
}

/**
 * Lê o saldo de empenho por item da ata.
 *
 * @remarks
 * `saldoEmpenho` NÃO existe em `2_consultarARPItem`; só `4_consultarEmpenhosSaldoItem`
 * tem. O endpoint devolve APENAS itens que já têm empenho registrado — item sem
 * empenho fica de fora da resposta, e por isso o chamador trata ausência como
 * "empenhado = 0", nunca como "sem informação". Map VAZIO é resposta legítima
 * (ata sem nenhum empenho), não falha: falha de HTTP já vira exceção em
 * `unwrapCompras` antes de qualquer escrita.
 *
 * @throws {Error} se a ata tiver mais itens com empenho do que o teto de páginas
 *   — melhor recusar do que zerar em silêncio o saldo do que sobrou de fora.
 */
async function fetchArpSaldos(params: { numeroAtaRegistroPreco: string; codigoUnidadeGerenciadora: string }): Promise<Map<number, ArpSaldo>> {
	const byItem = new Map<number, ArpSaldo>()

	for (let pagina = 1; pagina <= MAX_ITEM_PAGES; pagina++) {
		const page = unwrapCompras(
			await comprasApi.GET("/modulo-arp/4_consultarEmpenhosSaldoItem", {
				params: {
					query: {
						pagina,
						tamanhoPagina: PAGE_SIZE,
						numeroAta: params.numeroAtaRegistroPreco,
						unidadeGerenciadora: params.codigoUnidadeGerenciadora,
					},
				},
			})
		)

		const batch = page.resultado ?? []
		for (const [numero, saldo] of resolveArpSaldos(batch)) {
			// Página posterior não sobrescreve: `resolveArpSaldos` já escolheu a
			// linha certa dentro da página, e o endpoint não repete item entre elas.
			if (!byItem.has(numero)) byItem.set(numero, saldo)
		}

		if (batch.length < PAGE_SIZE) return byItem
	}

	throw new Error(
		`A ARP ${params.numeroAtaRegistroPreco} tem mais de ${MAX_ITEM_PAGES * PAGE_SIZE} itens com empenho — sincronização abortada para não zerar saldos`
	)
}

/**
 * Imports an ARP and all its items from Compras.gov.br, persisting them locally and linking to internal ATA items by catmat code.
 *
 * @remarks
 * SIDE EFFECTS: upserts procurement_arp (conflict: unit_id + numero_ata + uasg_gerenciadora),
 *   reconciles procurement_arp_item by numero_item (update matched, insert new, delete stale
 *   ONLY when no finance.empenho references them — empenho.arp_item_id is ON DELETE CASCADE,
 *   so a blind delete+reinsert would silently wipe local empenhos).
 * `numero_ata` guarda o número CANÔNICO da API ("00002/2025"), que é o formato que
 *   `4_consultarEmpenhosSaldoItem` exige de volta na sincronização de saldo.
 * BR date strings ("DD/MM/YYYY") are normalised to ISO 8601. Unmatched catmat codes get ata_item_id = null.
 *
 * @throws {Error} on HTTP failure (after 3 retries), when the ata has no items, or any Supabase write error.
 */

const ArpDataSchema = z.object({
	/** Número canônico da API, no formato NNNNN/AAAA. */
	numeroAtaRegistroPreco: z.string().min(1),
	codigoUnidadeGerenciadora: z.string().min(1),
	nomeUnidadeGerenciadora: z.string().nullable().optional(),
	numeroCompra: z.string().nullable().optional(),
	objeto: z.string().nullable().optional(),
	dataVigenciaInicial: z.string().min(1),
	dataVigenciaFinal: z.string().nullable().optional(),
	statusAta: z.string().nullable().optional(),
})

export const importArpItemsFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			ataId: z.uuid(),
			unitId: z.number().int().positive(),
			arpData: ArpDataSchema,
		})
	)
	.handler(async ({ data }): Promise<ArpWithItems> => {
		await requireAuth()
		const supabase = getProcurementClient()
		const { ataId, unitId, arpData } = data

		// ── 1. Buscar itens e saldos da ARP na API do Compras.gov.br ─────────────

		const dataVigenciaInicial = parseBrDate(arpData.dataVigenciaInicial)
		if (!dataVigenciaInicial) throw new Error("ARP sem data de vigência inicial — não é possível consultar os itens")

		const [apiItems, saldos] = await Promise.all([
			fetchArpItems({
				codigoUnidadeGerenciadora: arpData.codigoUnidadeGerenciadora,
				numeroAtaRegistroPreco: arpData.numeroAtaRegistroPreco,
				numeroCompra: arpData.numeroCompra,
				dataVigenciaInicial,
			}),
			fetchArpSaldos({
				numeroAtaRegistroPreco: arpData.numeroAtaRegistroPreco,
				codigoUnidadeGerenciadora: arpData.codigoUnidadeGerenciadora,
			}),
		])

		// Ata sem item é resposta suspeita (despublicada, janela errada): importar
		// um cabeçalho vazio deixaria a tela dizendo "vinculada" sem nada dentro.
		if (apiItems.length === 0) {
			throw new Error(`O Compras.gov.br não retornou itens para a ARP ${arpData.numeroAtaRegistroPreco}`)
		}

		// ── 2. Buscar os itens da ATA interna para fazer o match por catmat ──────

		const { data: ataItems } = await supabase.from("procurement_list_item").select("id, catmat_item_codigo, measure_unit").eq("list_id", ataId)

		const catmatToAtaItemId = new Map<number, string>()
		// `2_consultarARPItem` não traz unidade de fornecimento; a medida vem do
		// item da ATA interna, casado pelo mesmo catmat.
		const catmatToMeasureUnit = new Map<number, string>()
		for (const item of ataItems ?? []) {
			if (item.catmat_item_codigo != null) {
				catmatToAtaItemId.set(item.catmat_item_codigo, item.id)
				if (item.measure_unit) catmatToMeasureUnit.set(item.catmat_item_codigo, item.measure_unit)
			}
		}

		// ── 3. Upsert procurement_arp ─────────────────────────────────────────────

		const { data: arp, error: arpError } = await supabase
			.from("procurement_arp")
			.upsert(
				{
					unit_id: unitId,
					ata_id: ataId,
					numero_ata: arpData.numeroAtaRegistroPreco,
					ano_ata: anoFromNumeroAta(arpData.numeroAtaRegistroPreco),
					uasg_gerenciadora: arpData.codigoUnidadeGerenciadora,
					nome_uasg_gerenciadora: arpData.nomeUnidadeGerenciadora ?? null,
					objeto: arpData.objeto ?? null,
					data_vigencia_inicio: dataVigenciaInicial,
					data_vigencia_fim: parseBrDate(arpData.dataVigenciaFinal),
					status_ata: arpData.statusAta ?? null,
					last_synced_at: new Date().toISOString(),
				},
				{ onConflict: "unit_id,numero_ata,uasg_gerenciadora" }
			)
			.select()
			.single()

		if (arpError || !arp) throw new Error(`Erro ao salvar ARP: ${arpError?.message}`)

		// ── 4. Reconciliar itens SEM apagar empenhos locais ──────────────────────
		// Antes: delete + reinsert. Como finance.empenho referencia arp_item_id
		// com ON DELETE CASCADE, reimportar a ARP apagava silenciosamente todos
		// os empenhos registrados. Agora: match por numero_item → update;
		// novos → insert; ausentes na API → delete só se não tiverem empenho.

		const now = new Date().toISOString()
		const { data: existingItems } = await supabase.from("procurement_arp_item").select("id, numero_item").eq("arp_id", arp.id)

		const byNumeroItem = new Map<number, string>()
		for (const item of existingItems ?? []) {
			if (item.numero_item != null) byNumeroItem.set(item.numero_item, item.id)
		}

		const toRow = (item: ComprasArpItemResult) => {
			const numero = parseNumeroItem(item.numeroItem)
			const saldo = numero != null ? saldos.get(numero) : undefined
			return {
				arp_id: arp.id,
				ata_item_id: item.codigoItem != null ? (catmatToAtaItemId.get(item.codigoItem) ?? null) : null,
				numero_item: numero,
				catmat_item_codigo: item.codigoItem ?? null,
				descricao_item: item.descricaoItem ?? null,
				ni_fornecedor: item.niFornecedor ?? null,
				nome_fornecedor: item.nomeRazaoSocialFornecedor ?? null,
				valor_unitario: item.valorUnitario ?? null,
				quantidade_homologada: item.quantidadeHomologadaItem ?? null,
				medida_catmat: item.codigoItem != null ? (catmatToMeasureUnit.get(item.codigoItem) ?? null) : null,
				// Linha AUSENTE em `4_consultarEmpenhosSaldoItem` = item sem empenho:
				// saldo cheio, e não null (que apareceria na tela como "—"). Linha
				// PRESENTE manda no valor, inclusive quando o saldo dela é zero — o
				// `??` sobre o saldo resolvido conflataria os dois casos.
				quantidade_empenhada: saldo ? saldo.quantidadeEmpenhada : 0,
				saldo_empenho: saldo ? saldo.saldoEmpenho : (item.quantidadeHomologadaItem ?? null),
				synced_at: now,
			}
		}

		const matchedIds = new Set<string>()
		for (const item of apiItems) {
			const numero = parseNumeroItem(item.numeroItem)
			const existingId = numero != null ? byNumeroItem.get(numero) : undefined
			if (existingId) {
				matchedIds.add(existingId)
				const { error } = await supabase.from("procurement_arp_item").update(toRow(item)).eq("id", existingId)
				if (error) throw new Error(`Erro ao atualizar item ${item.numeroItem} da ARP: ${error.message}`)
			}
		}

		const newRows = apiItems
			.filter((item) => {
				const numero = parseNumeroItem(item.numeroItem)
				return numero == null || !byNumeroItem.has(numero)
			})
			.map(toRow)
		if (newRows.length > 0) {
			const { error } = await supabase.from("procurement_arp_item").insert(newRows)
			if (error) throw new Error(`Erro ao salvar itens da ARP: ${error.message}`)
		}

		// Itens locais que a API não retornou: remover apenas os sem empenho local.
		const staleIds = (existingItems ?? []).map((item) => item.id).filter((id) => !matchedIds.has(id))
		if (staleIds.length > 0) {
			const { data: referencedRows } = await supabase.schema("finance").from("empenho").select("arp_item_id").in("arp_item_id", staleIds)
			const referenced = new Set((referencedRows ?? []).map((row) => row.arp_item_id))
			const deletableIds = staleIds.filter((id) => !referenced.has(id))
			if (deletableIds.length > 0) {
				await supabase.from("procurement_arp_item").delete().in("id", deletableIds)
			}
		}

		const { data: finalItems, error: finalError } = await supabase
			.from("procurement_arp_item")
			.select("*")
			.eq("arp_id", arp.id)
			.order("numero_item", { ascending: true })

		if (finalError) throw new Error(`Erro ao carregar itens da ARP: ${finalError.message}`)

		return { ...arp, items: finalItems ?? [] }
	})

// ─── 3. Sincronizar saldo de empenhos via Compras.gov.br ─────────────────────

/**
 * Refreshes quantidade_empenhada and saldo_empenho for all items of an ARP via
 * `modulo-arp/4_consultarEmpenhosSaldoItem`.
 *
 * @remarks
 * SIDE EFFECTS: updates procurement_arp_item.{quantidade_empenhada, saldo_empenho, synced_at} for all matched
 *   items in a SINGLE upsert (one PostgREST request = one transaction — no mixed snapshot),
 *   then procurement_arp.last_synced_at.
 * Matches by numero_item (not catmat). Empty API response is treated as failure:
 * the previous snapshot (and last_synced_at) is preserved so the UI never shows
 * "sincronizado agora" over stale numbers.
 *
 * @throws {Error} if ARP not found locally, on HTTP failure (3 retries), on empty API response, or on any item update failure.
 */
export const syncArpBalanceFn = createServerFn({ method: "POST" })
	.validator(z.object({ arpId: z.uuid() }))
	.handler(async ({ data }) => {
		await requireAuth()
		const supabase = getProcurementClient()

		const { data: arp, error: arpError } = await supabase.from("procurement_arp").select("numero_ata, uasg_gerenciadora").eq("id", data.arpId).single()

		if (arpError || !arp) throw new Error("ARP não encontrada")

		const saldos = await fetchArpSaldos({
			numeroAtaRegistroPreco: arp.numero_ata,
			codigoUnidadeGerenciadora: arp.uasg_gerenciadora,
		})

		// Map vazio é resposta LEGÍTIMA: ata sem nenhum empenho, ou com todos
		// anulados. Falha real da API já virou exceção em `unwrapCompras`, antes
		// de qualquer escrita. Tratar vazio como falha (como fazia a versão que
		// consultava o endpoint de itens) impediria sincronizar ARP recém-importada.
		const { data: dbItems, error: dbItemsError } = await supabase
			.from("procurement_arp_item")
			.select("id, numero_item, quantidade_homologada")
			.eq("arp_id", data.arpId)

		// Sem esta guarda, uma leitura que falha vira "0 itens para atualizar" e o
		// last_synced_at abaixo carimba "sincronizado agora" sobre número velho —
		// exatamente o que esta função promete não fazer.
		if (dbItemsError) throw new Error(`Erro ao carregar itens locais da ARP: ${dbItemsError.message} — snapshot anterior mantido`)

		// Atualizar TODOS os itens em um único upsert (uma request PostgREST =
		// uma transação): ou o snapshot inteiro entra, ou nada entra. Os ids vêm
		// do banco, então o caminho de INSERT do upsert nunca é atingido.
		const now = new Date().toISOString()
		const updates = (dbItems ?? [])
			.filter((item) => item.numero_item != null)
			.map((item) => {
				// Item que sumiu da resposta não tem empenho: zera em vez de manter
				// o valor antigo, senão um empenho cancelado ficaria para sempre no
				// snapshot local.
				// biome-ignore lint/style/noNonNullAssertion: filtrado acima
				const saldo = saldos.get(item.numero_item!)
				return {
					id: item.id,
					arp_id: data.arpId,
					quantidade_empenhada: saldo?.quantidadeEmpenhada ?? 0,
					saldo_empenho: saldo?.saldoEmpenho ?? item.quantidade_homologada ?? null,
					synced_at: now,
				}
			})
		if (updates.length > 0) {
			const { error: upsertError } = await supabase.from("procurement_arp_item").upsert(updates, { onConflict: "id" })
			if (upsertError) {
				throw new Error(`Sincronização falhou (${upsertError.message}) — snapshot anterior mantido, last_synced_at não atualizado`)
			}
		}

		// Atualizar timestamp da ARP (só chega aqui com todos os itens ok)
		const { error: tsError } = await supabase.from("procurement_arp").update({ last_synced_at: now }).eq("id", data.arpId)
		if (tsError) throw new Error(`Erro ao registrar data de sincronização: ${tsError.message}`)
	})

// ─── 4. Buscar ARP vinculada a uma ATA ───────────────────────────────────────

/**
 * Returns the ARP linked to an ATA with all its items ordered by numero_item, or null if none exists.
 */
export const fetchArpForAtaFn = createServerFn({ method: "GET" })
	.validator(z.object({ ataId: z.uuid() }))
	.handler(async ({ data }): Promise<ArpWithItems | null> => {
		await requireUserId()
		const supabase = getProcurementClient()

		const { data: arp } = await supabase.from("procurement_arp").select("*").eq("ata_id", data.ataId).maybeSingle()

		if (!arp) return null

		const { data: items } = await supabase.from("procurement_arp_item").select("*").eq("arp_id", arp.id).order("numero_item", { ascending: true })

		return { ...arp, items: items ?? [] }
	})

// ─── 5. Buscar empenhos de um item da ARP ────────────────────────────────────

/**
 * Lists all empenhos for an ARP item ordered by data_empenho descending.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchEmpenhosFn = createServerFn({ method: "GET" })
	.validator(z.object({ arpItemId: z.uuid() }))
	.handler(async ({ data }): Promise<Empenho[]> => {
		await requireUserId()
		const { data: empenhos, error } = await getProcurementClient()
			.schema("finance")
			.from("empenho")
			.select("*")
			.eq("arp_item_id", data.arpItemId)
			.order("data_empenho", { ascending: false })

		if (error) throw new Error(`Erro ao buscar empenhos: ${error.message}`)
		return empenhos ?? []
	})

// ─── 6. Registrar empenho ─────────────────────────────────────────────────────

/**
 * Records a new empenho, computing valor_total = quantidadeEmpenhada × valorUnitario.
 *
 * @remarks
 * SIDE EFFECTS: inserts empenho with status "ativo". Normalises numero_empenho (trim + toUpperCase before insert).
 *
 * @throws {Error} "já cadastrado" on unique violation (PG code 23505); generic Supabase message otherwise.
 */
export const createEmpenhoFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			unitId: z.number().int().positive(),
			arpItemId: z.uuid(),
			numeroEmpenho: z.string().min(1, "Número do empenho obrigatório"),
			dataEmpenho: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)"),
			quantidadeEmpenhada: z.number().positive("Quantidade deve ser positiva"),
			valorUnitario: z.number().positive("Valor deve ser positivo"),
			notaLancamento: z.string().optional(),
		})
	)
	.handler(async ({ data }): Promise<Empenho> => {
		const { userId } = await requireAuth()
		const supabase = getProcurementClient()
		const valorTotal = Number((data.quantidadeEmpenhada * data.valorUnitario).toFixed(4))

		const { data: empenho, error } = await supabase
			.schema("finance")
			.from("empenho")
			.insert({
				unit_id: data.unitId,
				arp_item_id: data.arpItemId,
				numero_empenho: data.numeroEmpenho.trim().toUpperCase(),
				data_empenho: data.dataEmpenho,
				quantidade_empenhada: data.quantidadeEmpenhada,
				valor_unitario: data.valorUnitario,
				valor_total: valorTotal,
				nota_lancamento: data.notaLancamento?.trim() || null,
				status: "ativo",
				created_by: userId,
			})
			.select()
			.single()

		if (error) {
			if (error.code === "23505") {
				throw new Error(`Empenho "${data.numeroEmpenho}" já cadastrado para esta unidade`)
			}
			throw new Error(`Erro ao registrar empenho: ${error.message}`)
		}
		if (!empenho) throw new Error("Empenho não retornado após inserção")

		return empenho
	})

// ─── 6b. Comprometimento local por item da ARP ───────────────────────────────

/**
 * Aggregates ACTIVE finance.empenho per ARP item — the "comprometimento local",
 * computed in real time. This is a different quantity from the official snapshot
 * (procurement_arp_item.quantidade_empenhada/saldo_empenho), which includes
 * consumption by other UASGs (caronas) and only changes on sync. The UI must
 * show both, never sum them.
 */
export const fetchArpLocalCommitmentsFn = createServerFn({ method: "GET" })
	.validator(z.object({ arpId: z.uuid() }))
	.handler(async ({ data }): Promise<Record<string, LocalCommitment>> => {
		await requireUserId()
		const supabase = getProcurementClient()

		const { data: items, error: itemsError } = await supabase.from("procurement_arp_item").select("id").eq("arp_id", data.arpId)
		if (itemsError) throw new Error(`Erro ao buscar itens da ARP: ${itemsError.message}`)
		const itemIds = (items ?? []).map((item) => item.id)
		if (itemIds.length === 0) return {}

		const { data: empenhos, error } = await supabase
			.schema("finance")
			.from("empenho")
			.select("arp_item_id, status, quantidade_empenhada, valor_total")
			.in("arp_item_id", itemIds)
		if (error) throw new Error(`Erro ao buscar empenhos: ${error.message}`)

		return Object.fromEntries(aggregateLocalCommitments(empenhos ?? []))
	})

/**
 * Execução orçamentária por item de ARP: vigente/liquidado/pago/a liquidar dos
 * empenhos locais, lidos da view única finance.v_empenho_saldo (a mesma que a
 * tela de Empenhos usa). Grandeza LOCAL — não se confunde com o snapshot
 * oficial da ARP.
 */
export const fetchArpExecutionFn = createServerFn({ method: "GET" })
	.validator(z.object({ arpId: z.uuid() }))
	.handler(async ({ data }): Promise<Record<string, { liquidado: number; pago: number; aLiquidar: number }>> => {
		await requireUserId()
		const supabase = getProcurementClient()

		const { data: items } = await supabase.from("procurement_arp_item").select("id").eq("arp_id", data.arpId)
		const itemIds = (items ?? []).map((item) => item.id)
		if (itemIds.length === 0) return {}

		const { data: empenhos } = await supabase.schema("finance").from("empenho").select("id, arp_item_id").in("arp_item_id", itemIds).eq("status", "ativo")
		const empenhoRows = empenhos ?? []
		if (empenhoRows.length === 0) return {}

		// biome-ignore lint/suspicious/noExplicitAny: view nova fora dos tipos gerados
		const financeClient = supabase.schema("finance") as any
		const { data: saldos } = await financeClient
			.from("v_empenho_saldo")
			.select("empenho_id, valor_liquidado, valor_pago, saldo_a_liquidar")
			.in(
				"empenho_id",
				empenhoRows.map((e) => e.id)
			)
		const saldoByEmpenho = new Map<string, { valor_liquidado: number; valor_pago: number; saldo_a_liquidar: number }>()
		for (const saldo of saldos ?? []) saldoByEmpenho.set(saldo.empenho_id, saldo)

		const byItem: Record<string, { liquidado: number; pago: number; aLiquidar: number }> = {}
		for (const empenho of empenhoRows) {
			if (!empenho.arp_item_id) continue
			const saldo = saldoByEmpenho.get(empenho.id)
			if (!saldo) continue
			const acc = byItem[empenho.arp_item_id] ?? { liquidado: 0, pago: 0, aLiquidar: 0 }
			acc.liquidado += Number(saldo.valor_liquidado ?? 0)
			acc.pago += Number(saldo.valor_pago ?? 0)
			acc.aLiquidar += Number(saldo.saldo_a_liquidar ?? 0)
			byItem[empenho.arp_item_id] = acc
		}
		return byItem
	})

// ─── 7. Anular empenho ────────────────────────────────────────────────────────

/**
 * Cancels an empenho by setting status to "anulado" — no hard delete, saldo on ARP item is NOT auto-restored.
 *
 * @throws {Error} on Supabase update failure.
 */
export const anularEmpenhoFn = createServerFn({ method: "POST" })
	.validator(z.object({ empenhoId: z.uuid() }))
	.handler(async ({ data }) => {
		await requireAuth()
		const { error } = await getProcurementClient().schema("finance").from("empenho").update({ status: "anulado" }).eq("id", data.empenhoId)

		if (error) throw new Error(`Erro ao anular empenho: ${error.message}`)
	})
