/**
 * @module arp.fn
 * Integration with Compras.gov.br ARP (Ata de Registro de Preços) API + local empenho management.
 * CLIENT: getProcurementClient (service role). External: dadosabertos.compras.gov.br via
 *   `comprasApi` (@/lib/compras.server — 30 s timeout, 3 tentativas, backoff exponencial).
 *   ARP sem anexo quantitativo (importada sem anexo ou cadastrada à mão) desde 20260926214000.
 * TABLES: procurement_arp, procurement_arp_item, empenho, empenho_item, empenho_event.
 * @domain external
 * @migration 20260926214000_acquisition_origin
 */

import type { Empenho, ProcurementArpItem } from "@iefa/database/sisub"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { type LocalCommitment, resolveSaldoOficial } from "@/lib/arp-balance"
import { loadLocalCommitments } from "@/lib/arp-commitments.server"
import { type ArpSaldo, anoFromNumeroAta, assertVigenciaWindow, formatNumeroAta, parseBrDate, parseNumeroItem, resolveArpSaldos } from "@/lib/arp-compras"
import { withSensitiveAudit } from "@/lib/audit.server"
import { requireAuth, requireUserId } from "@/lib/auth.server"
import { comprasApi, unwrapCompras } from "@/lib/compras.server"
import { todayInBrasilia } from "@/lib/expense-execution"
import { getFinanceClient, getProcurementClient } from "@/lib/supabase.server"
import { requireUnitScope } from "@/lib/unit-auth.server"
import { cancelEmpenhoSerialized, toEmpenhoEventError } from "@/server/empenho-events.server"
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
			/**
			 * Anexo quantitativo, quando há. ARP de outro órgão (carona) ou anterior ao sistema entra
			 * sem anexo; o casamento com o anexo pelo CATMAT acontece quando houver um.
			 */
			ataId: z.uuid().nullable().optional(),
			/** Contratação de origem (registro de preços) que a ARP sustenta. */
			acquisitionId: z.uuid().nullable().optional(),
			unitId: z.number().int().positive(),
			arpData: ArpDataSchema,
		})
	)
	.handler(async ({ data }): Promise<ArpWithItems & { warnings: string[] }> => {
		// Escrita em `procurement_arp`/`procurement_arp_item` da unidade alvo: exige
		// nível 2 NAQUELA unidade. `requireAuth()` sozinho deixava qualquer sessão
		// autenticada importar ARP para qualquer unidade — a service role não tem RLS
		// para segurar isso.
		await requireUnitScope(2, data.unitId)
		const supabase = getProcurementClient()
		// A ATA apontada TEM que ser da unidade alegada: sem isto, quem tem nível 2 na
		// unidade A importa ARP para dentro da ata da unidade B.
		if (data.ataId && (await resolveAtaUnit(supabase, data.ataId)) !== data.unitId)
			throw new Error("O anexo quantitativo informado não pertence a esta unidade")
		if (data.acquisitionId && (await resolveAcquisitionUnit(data.acquisitionId)) !== data.unitId) {
			throw new Error("A contratação de origem informada não pertence a esta unidade")
		}
		const { unitId, arpData } = data
		const warnings: string[] = []

		// O upsert pela chave (unidade, número, UASG) trocava o anexo da ARP em silêncio quando ela
		// era reimportada de outro anexo. Agora o vínculo existente é mantido e a tela avisa.
		const { data: existingArp, error: existingError } = await supabase
			.from("procurement_arp")
			.select("id, ata_id, acquisition_id")
			.eq("unit_id", unitId)
			.eq("numero_ata", arpData.numeroAtaRegistroPreco)
			.eq("uasg_gerenciadora", arpData.codigoUnidadeGerenciadora)
			.maybeSingle()
		if (existingError) throw new Error(`Erro ao procurar a ARP: ${existingError.message}`)
		let ataId: string | null = data.ataId ?? existingArp?.ata_id ?? null
		if (existingArp?.ata_id && data.ataId && existingArp.ata_id !== data.ataId) {
			ataId = existingArp.ata_id
			warnings.push(`A ARP ${arpData.numeroAtaRegistroPreco} já está vinculada a outro anexo quantitativo; o vínculo existente foi mantido`)
		}
		let acquisitionId: string | null = data.acquisitionId ?? existingArp?.acquisition_id ?? null
		if (existingArp?.acquisition_id && data.acquisitionId && existingArp.acquisition_id !== data.acquisitionId) {
			acquisitionId = existingArp.acquisition_id
			warnings.push(`A ARP ${arpData.numeroAtaRegistroPreco} já está vinculada a outra contratação de origem; o vínculo existente foi mantido`)
		}

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

		const { data: ataItems } = ataId
			? await supabase.from("procurement_list_item").select("id, catmat_item_codigo, measure_unit").eq("list_id", ataId)
			: { data: [] as Array<{ id: string; catmat_item_codigo: number | null; measure_unit: string | null }> }

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
					acquisition_id: acquisitionId,
					// Cadastrada à mão antes (API fora do ar): a primeira importação bem-sucedida a
					// torna sincronizada, e os itens são atualizados pelo número, sem duplicar.
					source: "compras_gov",
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
				source: "compras_gov",
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
			// Item com empenho fica (o FK é RESTRICT desde 20260926214000): o empenho aponta pelo
			// cabeçalho antigo OU por um item da NE, e os dois contam.
			const fin = getFinanceClient()
			const [{ data: headerRefs, error: headerError }, { data: itemRefs, error: itemError }] = await Promise.all([
				fin.from("empenho").select("arp_item_id").in("arp_item_id", staleIds),
				fin.from("empenho_item").select("arp_item_id").in("arp_item_id", staleIds),
			])
			if (headerError || itemError) throw new Error(`Erro ao conferir empenhos dos itens retirados: ${(headerError ?? itemError)?.message}`)
			const referenced = new Set([...(headerRefs ?? []), ...(itemRefs ?? [])].map((row) => row.arp_item_id))
			const deletableIds = staleIds.filter((id) => !referenced.has(id))
			if (deletableIds.length > 0) {
				const { error } = await supabase.from("procurement_arp_item").delete().in("id", deletableIds)
				if (error) throw new Error(`Erro ao retirar itens que saíram da ARP: ${error.message}`)
			}
			const kept = staleIds.length - deletableIds.length
			if (kept > 0) warnings.push(`${kept} item(ns) que saíram da ARP no Compras.gov.br continuam aqui porque têm empenho`)
		}

		const { data: finalItems, error: finalError } = await supabase
			.from("procurement_arp_item")
			.select("*")
			.eq("arp_id", arp.id)
			.order("numero_item", { ascending: true })

		if (finalError) throw new Error(`Erro ao carregar itens da ARP: ${finalError.message}`)

		return { ...(arp as ArpWithItems), items: finalItems ?? [], warnings }
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
 * Matches by numero_item (not catmat). An EMPTY saldo response is legitimate (no
 * empenho on the ata) and zeroes the local commitment; an HTTP failure or a failed
 * local read throws before any write, so the UI never shows "sincronizado agora"
 * over stale numbers.
 *
 * @throws {Error} if ARP not found locally, on HTTP failure (3 retries), on a failed local item read, or on any item update failure.
 */
export const syncArpBalanceFn = createServerFn({ method: "POST" })
	.validator(z.object({ arpId: z.uuid() }))
	.handler(async ({ data }) => {
		await requireAuth()
		const supabase = getProcurementClient()

		// `unit_id` é obrigatório aqui: o guard logo abaixo resolve a unidade pela LINHA
		// (#322). Sem ele, `Number(undefined)` vira NaN e o escopo é avaliado contra nada.
		const { data: arp, error: arpError } = await supabase.from("procurement_arp").select("unit_id, numero_ata, uasg_gerenciadora").eq("id", data.arpId).single()

		if (arpError || !arp) throw new Error("ARP não encontrada")
		// A unidade sai da LINHA, nunca do input: o payload só traz `arpId`, e aceitar
		// unidade do cliente permitiria sincronizar ARP de outra unidade alegando a
		// própria. Guard depois da leitura, antes de qualquer escrita.
		await requireUnitScope(2, Number(arp.unit_id))

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
/**
 * Resolve a unidade dona de uma ARP, de um item de ARP ou de uma ATA.
 *
 * Existe porque escopar pelo `unitId` do payload fecha só metade do buraco: o cliente
 * continua escolhendo a CHAVE ESTRANGEIRA. Quem tem `unit` 2 na unidade A poderia
 * apontar para a ATA ou para o item de ARP da unidade B e, com o guard satisfeito pela
 * própria unidade, escrever no acervo da outra — e a unidade B nem conseguiria desfazer,
 * porque o guard de anulação resolve a unidade pela linha, que diria "A".
 *
 * A unidade sai SEMPRE da linha apontada, nunca do que o cliente alegou.
 */
async function resolveAtaUnit(supabase: ReturnType<typeof getProcurementClient>, ataId: string): Promise<number> {
	// A tabela chama-se `procurement_list` no schema `procurement`; o nome `ata` sobreviveu
	// nos identificadores da API e nas constraints, não na tabela.
	const { data, error } = await supabase.from("procurement_list").select("unit_id").eq("id", ataId).maybeSingle()
	if (error) throw new Error(`Erro ao resolver a unidade do anexo quantitativo: ${error.message}`)
	if (!data) throw new Error("Anexo quantitativo não encontrado")
	return Number(data.unit_id)
}

async function resolveAcquisitionUnit(acquisitionId: string): Promise<number> {
	const { data, error } = await getProcurementClient().from("acquisition").select("unit_id").eq("id", acquisitionId).is("deleted_at", null).maybeSingle()
	if (error) throw new Error(`Erro ao resolver a unidade da contratação: ${error.message}`)
	if (!data) throw new Error("Contratação de origem não encontrada")
	return Number(data.unit_id)
}

async function resolveArpUnit(supabase: ReturnType<typeof getProcurementClient>, arpId: string): Promise<number> {
	const { data, error } = await supabase.from("procurement_arp").select("unit_id").eq("id", arpId).maybeSingle()
	if (error) throw new Error(`Erro ao resolver a unidade da ARP: ${error.message}`)
	if (!data) throw new Error("ARP não encontrada")
	return Number(data.unit_id)
}

async function resolveArpItemUnit(supabase: ReturnType<typeof getProcurementClient>, arpItemId: string): Promise<number> {
	const { data, error } = await supabase.from("procurement_arp_item").select("arp_id").eq("id", arpItemId).maybeSingle()
	if (error) throw new Error(`Erro ao resolver a unidade do item: ${error.message}`)
	if (!data) throw new Error("Item da ARP não encontrado")
	return resolveArpUnit(supabase, String(data.arp_id))
}

export const fetchArpForAtaFn = createServerFn({ method: "GET" })
	.validator(z.object({ ataId: z.uuid() }))
	.handler(async ({ data }): Promise<ArpWithItems | null> => {
		await requireAuth()
		const supabase = getProcurementClient()
		// Execução orçamentária e dado de fornecedor não são públicos entre unidades:
		// leitura exige nível 1 NA unidade dona da ata.
		await requireUnitScope(1, await resolveAtaUnit(supabase, data.ataId))

		const { data: arp } = await supabase.from("procurement_arp").select("*").eq("ata_id", data.ataId).maybeSingle()

		if (!arp) return null

		const { data: items } = await supabase.from("procurement_arp_item").select("*").eq("arp_id", arp.id).order("numero_item", { ascending: true })

		return { ...arp, items: items ?? [] }
	})

// ─── 4b. ARP sem anexo: cadastro à mão e lista da unidade ────────────────────

const ManualArpItemSchema = z.object({
	numeroItem: z.number().int().positive(),
	descricaoItem: z.string().trim().min(1, "Descrição do item obrigatória").max(500),
	catmatItemCodigo: z.number().int().positive().nullable().optional(),
	niFornecedor: z
		.string()
		.regex(/^(\d{11}|\d{14})$/, "CNPJ com 14 dígitos")
		.nullable()
		.optional(),
	nomeFornecedor: z.string().max(200).nullable().optional(),
	valorUnitario: z.number().nonnegative(),
	quantidadeHomologada: z.number().positive(),
	medida: z.string().max(40).nullable().optional(),
})

/**
 * Cadastra a ARP e os itens à mão — a API do Compras.gov.br fora do ar, ou a ata de outro órgão
 * que não aparece na busca. Fica `source = 'manual'` e "não sincronizada" (`last_synced_at` nulo)
 * até a primeira importação bem-sucedida, que atualiza os itens pelo número, sem duplicar.
 */
export const createManualArpFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			unitId: z.number().int().positive(),
			acquisitionId: z.uuid().nullable().optional(),
			ataId: z.uuid().nullable().optional(),
			numeroAta: z.string().trim().min(1, "Número da ata obrigatório").max(20),
			anoAta: z.string().regex(/^\d{4}$/, "Ano com 4 dígitos"),
			uasgGerenciadora: z.string().regex(/^\d{6}$/, "UASG com 6 dígitos"),
			nomeUasgGerenciadora: z.string().max(200).nullable().optional(),
			objeto: z.string().max(2000).nullable().optional(),
			vigenciaInicio: z.string().regex(ISO_DATE).nullable().optional(),
			vigenciaFim: z.string().regex(ISO_DATE).nullable().optional(),
			items: z.array(ManualArpItemSchema).min(1, "Informe ao menos um item da ata").max(500),
		})
	)
	.handler(async ({ data }): Promise<{ arpId: string; numeroAta: string }> => {
		await requireUnitScope(2, data.unitId)
		const supabase = getProcurementClient()
		if (data.ataId && (await resolveAtaUnit(supabase, data.ataId)) !== data.unitId)
			throw new Error("O anexo quantitativo informado não pertence a esta unidade")
		if (data.acquisitionId && (await resolveAcquisitionUnit(data.acquisitionId)) !== data.unitId) {
			throw new Error("A contratação de origem informada não pertence a esta unidade")
		}
		const numeros = data.items.map((item) => item.numeroItem)
		if (new Set(numeros).size !== numeros.length) throw new Error("Dois itens com o mesmo número: cada item da ata tem um número")

		const numeroAta = formatNumeroAta(data.numeroAta.split("/")[0] ?? data.numeroAta, data.anoAta)
		const { data: arp, error } = await supabase
			.from("procurement_arp")
			.insert({
				unit_id: data.unitId,
				ata_id: data.ataId ?? null,
				acquisition_id: data.acquisitionId ?? null,
				numero_ata: numeroAta,
				ano_ata: data.anoAta,
				uasg_gerenciadora: data.uasgGerenciadora,
				nome_uasg_gerenciadora: data.nomeUasgGerenciadora?.trim() || null,
				objeto: data.objeto?.trim() || null,
				data_vigencia_inicio: data.vigenciaInicio ?? null,
				data_vigencia_fim: data.vigenciaFim ?? null,
				source: "manual",
				last_synced_at: null,
			})
			.select("id")
			.single()
		if (error) {
			if (error.code === "23505") throw new Error(`A ARP ${numeroAta} da UASG ${data.uasgGerenciadora} já está cadastrada nesta unidade`)
			throw new Error(`Erro ao cadastrar a ARP: ${error.message}`)
		}

		const { error: itemsError } = await supabase.from("procurement_arp_item").insert(
			data.items.map((item) => ({
				arp_id: arp.id,
				numero_item: item.numeroItem,
				descricao_item: item.descricaoItem,
				catmat_item_codigo: item.catmatItemCodigo ?? null,
				ni_fornecedor: item.niFornecedor ?? null,
				nome_fornecedor: item.nomeFornecedor?.trim() || null,
				valor_unitario: item.valorUnitario,
				quantidade_homologada: item.quantidadeHomologada,
				quantidade_empenhada: 0,
				saldo_empenho: item.quantidadeHomologada,
				medida_catmat: item.medida?.trim() || null,
				source: "manual",
			}))
		)
		if (itemsError) {
			// Sem os itens a ARP não serve para empenhar: desfaz o cabeçalho em vez de deixar uma
			// ata vazia dizendo "cadastrada".
			const { error: undoError } = await supabase.from("procurement_arp").delete().eq("id", arp.id)
			if (undoError) throw new Error(`Erro ao cadastrar os itens (${itemsError.message}) e ao desfazer a ARP (${undoError.message})`)
			throw new Error(`Erro ao cadastrar os itens da ARP: ${itemsError.message}`)
		}
		return { arpId: arp.id as string, numeroAta }
	})

export interface UnitArpItem {
	id: string
	numeroItem: number | null
	catmatItemCodigo: number | null
	descricaoItem: string | null
	niFornecedor: string | null
	nomeFornecedor: string | null
	valorUnitario: number | null
	quantidadeHomologada: number | null
	medida: string | null
	/** Saldo oficial (Compras.gov.br). */
	saldoOficial: number
	/** Empenhado por esta unidade em NEs ativas (soma dos itens de NE). */
	localCommitted: number
}

export interface UnitArp {
	id: string
	numeroAta: string
	uasgGerenciadora: string
	nomeUasgGerenciadora: string | null
	objeto: string | null
	vigenciaInicio: string | null
	vigenciaFim: string | null
	source: "compras_gov" | "manual"
	lastSyncedAt: string | null
	ataId: string | null
	acquisitionId: string | null
	items: UnitArpItem[]
}

/** ARPs da unidade — com e sem anexo — com os itens e o comprometimento local de cada um. */
export const listUnitArpsFn = createServerFn({ method: "GET" })
	.validator(z.object({ unitId: z.number().int().positive(), acquisitionId: z.uuid().optional() }))
	.handler(async ({ data }): Promise<UnitArp[]> => {
		await requireUnitScope(1, data.unitId)
		const proc = getProcurementClient()
		let query = proc
			.from("procurement_arp")
			.select(
				"id, numero_ata, uasg_gerenciadora, nome_uasg_gerenciadora, objeto, data_vigencia_inicio, data_vigencia_fim, source, last_synced_at, ata_id, acquisition_id"
			)
			.eq("unit_id", data.unitId)
			.order("created_at", { ascending: false })
		if (data.acquisitionId) query = query.eq("acquisition_id", data.acquisitionId)
		const { data: arps, error } = await query
		if (error) throw new Error(`Erro ao listar ARPs: ${error.message}`)
		const list = arps ?? []
		if (list.length === 0) return []

		const { data: items, error: itemsError } = await proc
			.from("procurement_arp_item")
			.select(
				"id, arp_id, numero_item, catmat_item_codigo, descricao_item, ni_fornecedor, nome_fornecedor, valor_unitario, quantidade_homologada, quantidade_empenhada, saldo_empenho, medida_catmat"
			)
			.in(
				"arp_id",
				list.map((arp) => arp.id)
			)
			.order("numero_item", { ascending: true })
		if (itemsError) throw new Error(`Erro ao listar itens das ARPs: ${itemsError.message}`)
		const itemRows = (items ?? []) as ProcurementArpItem[]
		const committed = await loadLocalCommitments(itemRows.map((item) => item.id))

		return list.map((arp) => ({
			id: arp.id,
			numeroAta: String(arp.numero_ata),
			uasgGerenciadora: String(arp.uasg_gerenciadora),
			nomeUasgGerenciadora: arp.nome_uasg_gerenciadora,
			objeto: arp.objeto,
			vigenciaInicio: arp.data_vigencia_inicio,
			vigenciaFim: arp.data_vigencia_fim,
			source: arp.source === "manual" ? "manual" : "compras_gov",
			lastSyncedAt: arp.last_synced_at,
			ataId: arp.ata_id,
			acquisitionId: arp.acquisition_id,
			items: itemRows
				.filter((item) => item.arp_id === arp.id)
				.map((item) => ({
					id: item.id,
					numeroItem: item.numero_item,
					catmatItemCodigo: item.catmat_item_codigo,
					descricaoItem: item.descricao_item,
					niFornecedor: item.ni_fornecedor,
					nomeFornecedor: item.nome_fornecedor,
					valorUnitario: item.valor_unitario == null ? null : Number(item.valor_unitario),
					quantidadeHomologada: item.quantidade_homologada == null ? null : Number(item.quantidade_homologada),
					medida: item.medida_catmat,
					saldoOficial: resolveSaldoOficial(item),
					localCommitted: committed.get(item.id)?.quantidade ?? 0,
				})),
		}))
	})

// ─── 5. Buscar empenhos de um item da ARP ────────────────────────────────────

/**
 * Empenhos que cobrem um item da ARP — pelo item da NE (NE com vários itens aparece em cada um),
 * com a quantidade e o preço DESTE item no lugar das colunas antigas do cabeçalho.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchEmpenhosFn = createServerFn({ method: "GET" })
	.validator(z.object({ arpItemId: z.uuid() }))
	.handler(async ({ data }): Promise<Array<Empenho & { item_value: number }>> => {
		await requireAuth()
		await requireUnitScope(1, await resolveArpItemUnit(getProcurementClient(), data.arpItemId))
		const fin = getFinanceClient()
		const { data: items, error: itemsError } = await fin
			.from("empenho_item")
			.select("empenho_id, quantity, unit_price, value")
			.eq("arp_item_id", data.arpItemId)
		if (itemsError) throw new Error(`Erro ao buscar itens de empenho: ${itemsError.message}`)
		const byEmpenho = new Map<string, { quantity: number; unitPrice: number | null; value: number }>()
		for (const item of items ?? []) {
			const acc = byEmpenho.get(item.empenho_id) ?? { quantity: 0, unitPrice: null, value: 0 }
			acc.quantity += Number(item.quantity ?? 0)
			acc.unitPrice = acc.unitPrice ?? (item.unit_price == null ? null : Number(item.unit_price))
			acc.value += Number(item.value)
			byEmpenho.set(item.empenho_id, acc)
		}
		if (byEmpenho.size === 0) return []

		const { data: empenhos, error } = await fin
			.from("empenho")
			.select("*")
			.in("id", [...byEmpenho.keys()])
			.order("data_empenho", { ascending: false })

		if (error) throw new Error(`Erro ao buscar empenhos: ${error.message}`)
		return ((empenhos ?? []) as Empenho[]).map((empenho) => {
			const item = byEmpenho.get(empenho.id)
			return {
				...empenho,
				quantidade_empenhada: item?.quantity ?? empenho.quantidade_empenhada,
				valor_unitario: item?.unitPrice ?? empenho.valor_unitario,
				item_value: item?.value ?? Number(empenho.valor_total),
			}
		})
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
		// Empenho é dinheiro público: exige nível 2 NA unidade empenhada. Antes daqui
		// bastava estar autenticado — qualquer comensal podia registrar empenho em
		// qualquer unidade, com `unitId` vindo do próprio payload.
		const ctx = await requireUnitScope(2, data.unitId)
		const { userId } = ctx
		const supabase = getProcurementClient()
		// Mesmo motivo do import: o item de ARP tem que ser da unidade empenhada. Sem isto,
		// a unidade A empenha contra o saldo da unidade B — e B não consegue anular, porque
		// a anulação resolve a unidade pela linha do empenho, que diria "A".
		if ((await resolveArpItemUnit(supabase, data.arpItemId)) !== data.unitId) throw new Error("O item da ARP informado não pertence a esta unidade")
		const valorTotal = Number((data.quantidadeEmpenhada * data.valorUnitario).toFixed(4))

		return withSensitiveAudit(
			"createEmpenhoFn",
			ctx,
			async (): Promise<Empenho> => {
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
			},
			(empenho) => ({
				empenhoId: empenho.id,
				unitId: data.unitId,
				arpItemId: data.arpItemId,
				numeroEmpenho: data.numeroEmpenho.trim().toUpperCase(),
				valorTotal,
			})
		)
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
		await requireAuth()
		const supabase = getProcurementClient()
		await requireUnitScope(1, await resolveArpUnit(supabase, data.arpId))

		const { data: items, error: itemsError } = await supabase.from("procurement_arp_item").select("id").eq("arp_id", data.arpId)
		if (itemsError) throw new Error(`Erro ao buscar itens da ARP: ${itemsError.message}`)
		const itemIds = (items ?? []).map((item) => item.id)
		if (itemIds.length === 0) return {}

		// Pelos itens da NE: agrupar por `empenho.arp_item_id` deixava de fora a NE com vários itens.
		return Object.fromEntries(await loadLocalCommitments(itemIds))
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
		await requireAuth()
		const supabase = getProcurementClient()
		await requireUnitScope(1, await resolveArpUnit(supabase, data.arpId))

		const { data: items } = await supabase.from("procurement_arp_item").select("id").eq("arp_id", data.arpId)
		const itemIds = (items ?? []).map((item) => item.id)
		if (itemIds.length === 0) return {}

		// Pelos itens da NE. A liquidação é da NE inteira; numa NE com vários itens ela se reparte
		// entre eles na proporção do valor de cada item — é leitura de acompanhamento, não lançamento.
		const financeClient = getFinanceClient()
		const { data: arpNeItems, error: arpNeError } = await financeClient.from("empenho_item").select("empenho_id, arp_item_id, value").in("arp_item_id", itemIds)
		if (arpNeError) throw new Error(`Erro ao buscar itens de empenho: ${arpNeError.message}`)
		const empenhoIds = [...new Set((arpNeItems ?? []).map((row) => row.empenho_id))]
		if (empenhoIds.length === 0) return {}

		const [{ data: active, error: activeError }, { data: allItems, error: allItemsError }, { data: saldos, error: saldoError }] = await Promise.all([
			financeClient.from("empenho").select("id").in("id", empenhoIds).eq("status", "ativo"),
			financeClient.from("empenho_item").select("empenho_id, value").in("empenho_id", empenhoIds),
			financeClient.from("v_empenho_saldo").select("empenho_id, valor_liquidado, valor_pago, saldo_a_liquidar").in("empenho_id", empenhoIds),
		])
		if (activeError || allItemsError || saldoError)
			throw new Error(`Erro ao ler a execução dos empenhos: ${(activeError ?? allItemsError ?? saldoError)?.message}`)
		const activeIds = new Set((active ?? []).map((row) => row.id))
		const totalByEmpenho = new Map<string, number>()
		for (const row of allItems ?? []) {
			totalByEmpenho.set(row.empenho_id, (totalByEmpenho.get(row.empenho_id) ?? 0) + Number(row.value))
		}
		const saldoByEmpenho = new Map((saldos ?? []).map((saldo) => [saldo.empenho_id, saldo]))

		const byItem: Record<string, { liquidado: number; pago: number; aLiquidar: number }> = {}
		for (const row of arpNeItems ?? []) {
			// `arp_item_id` nunca vem nulo: a consulta filtra por ele.
			if (row.arp_item_id == null || !activeIds.has(row.empenho_id)) continue
			const saldo = saldoByEmpenho.get(row.empenho_id)
			if (!saldo) continue
			const total = totalByEmpenho.get(row.empenho_id) ?? 0
			const share = total > 0 ? Number(row.value) / total : 1
			const acc = byItem[row.arp_item_id] ?? { liquidado: 0, pago: 0, aLiquidar: 0 }
			acc.liquidado += Number(saldo.valor_liquidado ?? 0) * share
			acc.pago += Number(saldo.valor_pago ?? 0) * share
			acc.aLiquidar += Number(saldo.saldo_a_liquidar ?? 0) * share
			byItem[row.arp_item_id] = acc
		}
		return byItem
	})

// ─── 7. Anular empenho ────────────────────────────────────────────────────────

/**
 * Anula a NE inteira pelo EVENTO de cancelamento do valor vigente — o mesmo caminho de
 * `registerEmpenhoEventFn`, com o piso e os locks dela — e marca o status na mesma transação.
 * Antes o status mudava sozinho: a NE "anulada" continuava com o valor vigente cheio na view, e
 * nada impedia anular o que já tinha sido liquidado.
 *
 * Com liquidação, a NE não se anula inteira (o que foi liquidado não se desfaz por anulação): a
 * recusa diz para anular só o saldo a liquidar.
 *
 * @throws {Error} on lookup failure, with liquidation, or when the floor refuses.
 */
export const anularEmpenhoFn = createServerFn({ method: "POST" })
	.validator(z.object({ empenhoId: z.uuid(), justificativa: z.string().trim().min(5).max(1000).optional() }))
	.handler(async ({ data }) => {
		// Autenticação primeiro (o contrato `server-fn-auth` exige guard antes de
		// qualquer client de DB); o escopo de unidade só é conhecido depois de ler a
		// linha, e vem DELA — o payload só traz o id.
		await requireAuth()
		const fin = getFinanceClient()
		// Sem o guard de unidade abaixo, qualquer sessão autenticada anulava qualquer
		// empenho do sistema.
		const { data: empenho, error: lookupError } = await fin.from("empenho").select("unit_id, status, numero_empenho").eq("id", data.empenhoId).maybeSingle()
		// Falha de consulta NÃO pode virar "não encontrado": o diagnóstico errado manda o
		// usuário procurar um empenho que existe.
		if (lookupError) throw new Error(`Erro ao buscar empenho: ${lookupError.message}`)
		if (!empenho) throw new Error("Empenho não encontrado")
		const ctx = await requireUnitScope(2, Number(empenho.unit_id))

		// Vigente, liquidado e status são lidos DENTRO da transação do evento, sob os locks dele
		// (`cancelEmpenhoSerialized`): um reforço concorrente não sobra numa NE "anulada". O piso do
		// banco confere de novo o liquidado e o já pedido em Ordens de Fornecimento.
		return withSensitiveAudit(
			"anularEmpenhoFn",
			ctx,
			async () => {
				try {
					return await cancelEmpenhoSerialized({
						empenhoId: data.empenhoId,
						data: todayInBrasilia(),
						justificativa: data.justificativa ?? "Anulação total da nota de empenho",
						userId: ctx.userId,
					})
				} catch (error) {
					throw toEmpenhoEventError(error, "anularEmpenhoFn")
				}
			},
			(result) => ({ empenhoId: data.empenhoId, unitId: Number(empenho.unit_id), numeroEmpenho: empenho.numero_empenho, valorAnulado: result.valor })
		)
	})
