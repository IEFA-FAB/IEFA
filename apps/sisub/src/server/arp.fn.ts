/**
 * @module arp.fn
 * Integration with Compras.gov.br ARP (Ata de Registro de Preços) API + local empenho management.
 * CLIENT: getProcurementClient (service role). External: dadosabertos.compras.gov.br via
 *   `comprasApi` (@/lib/compras.server — 30 s timeout, 3 tentativas, backoff exponencial).
 *   ARP sem anexo quantitativo (importada sem anexo ou cadastrada à mão) desde 20260926214000.
 * TABLES: arp, arp_item, empenho, empenho_item, empenho_event.
 * @domain external
 * @migration 20260926214000_acquisition_origin
 */

import type { ArpItem } from "@iefa/database/sisub"
import { resolveItemValue } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { type LocalCommitment, resolveSaldoOficial } from "@/lib/arp-balance"
import { loadLocalCommitments } from "@/lib/arp-commitments.server"
import {
	type ArpSaldo,
	anoFromNumeroAta,
	assertVigenciaWindow,
	formatNumeroAta,
	parseBrDate,
	parseNumeroItem,
	pickArpHeader,
	resolveArpSaldos,
} from "@/lib/arp-compras"
import { withSensitiveAudit } from "@/lib/audit.server"
import { requireAuth, requireAuthWithPermission } from "@/lib/auth.server"
import { comprasApi, unwrapCompras } from "@/lib/compras.server"
import { type EmpenhoItemAmounts, summarizeArpItemShare } from "@/lib/empenho-items"
import {
	type CreatedEmpenho,
	completeEmpenhoRegistration,
	empenhoAuditTarget,
	insertPreparedEmpenho,
	prepareEmpenhoRegistration,
} from "@/lib/empenho-registration.server"
import { todayInBrasilia } from "@/lib/expense-execution"
import { getFinanceClient, getProcurementClient } from "@/lib/supabase.server"
import { requireUnitScope } from "@/lib/unit-auth.server"
import { cancelEmpenhoSerialized, toEmpenhoEventError } from "@/server/empenho-events.server"
import type { ArpWithItems, ComprasArpItemResult, ComprasArpPage, EmpenhoOfArpItem } from "@/types/domain/arp"
import { publicDbMessage } from "@/lib/db-error-message"

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
		// Proxy do Compras.gov.br: quem busca ARP é a gestão de unidade (anexo e contratações). Só
		// com sessão, qualquer conta usava o IP e o rate limit do servidor.
		await requireAuthWithPermission("unit", 1)
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

/** Cabeçalho da ata como a importação grava: só o que veio da API. */
interface ArpHeader {
	numeroAtaRegistroPreco: string
	codigoUnidadeGerenciadora: string
	nomeUnidadeGerenciadora: string | null
	numeroCompra: string | null
	objeto: string | null
	dataVigenciaInicial: string
	dataVigenciaFinal: string | null
	statusAta: string | null
}

/**
 * Relê o cabeçalho da ata em `1_consultarARP`. A janela de vigência é obrigatória na API; a do
 * payload (o início de vigência que a busca mostrou) vira uma janela de um dia, e ata que não
 * aparece nela — número, UASG ou início diferentes do que a API tem — é recusada.
 */
async function fetchArpHeader(claimed: { numeroAtaRegistroPreco: string; codigoUnidadeGerenciadora: string; dataVigenciaInicial: string }): Promise<ArpHeader> {
	const vigencia = parseBrDate(claimed.dataVigenciaInicial)
	if (!vigencia) throw new Error("ARP sem data de vigência inicial — não é possível consultá-la no Compras.gov.br")
	const page = unwrapCompras(
		await comprasApi.GET("/modulo-arp/1_consultarARP", {
			params: {
				query: {
					pagina: 1,
					tamanhoPagina: 10,
					codigoUnidadeGerenciadora: claimed.codigoUnidadeGerenciadora,
					dataVigenciaInicialMin: vigencia,
					dataVigenciaInicialMax: vigencia,
					numeroAtaRegistroPreco: claimed.numeroAtaRegistroPreco,
				},
			},
		})
	)
	const header = pickArpHeader(page.resultado, claimed.numeroAtaRegistroPreco, claimed.codigoUnidadeGerenciadora)
	if (!header?.numeroAtaRegistroPreco) {
		throw new Error(
			`A ARP ${claimed.numeroAtaRegistroPreco} da UASG ${claimed.codigoUnidadeGerenciadora} não foi encontrada no Compras.gov.br com início de vigência em ${vigencia} — busque a ata de novo e importe pelo resultado da busca`
		)
	}
	return {
		numeroAtaRegistroPreco: header.numeroAtaRegistroPreco,
		// A UASG que a consulta pediu (e que casou): é a chave local da ata, no mesmo formato de sempre.
		codigoUnidadeGerenciadora: claimed.codigoUnidadeGerenciadora,
		nomeUnidadeGerenciadora: header.nomeUnidadeGerenciadora ?? null,
		numeroCompra: header.numeroCompra ?? null,
		objeto: header.objeto ?? null,
		dataVigenciaInicial: header.dataVigenciaInicial ?? vigencia,
		dataVigenciaFinal: header.dataVigenciaFinal ?? null,
		statusAta: header.statusAta ?? null,
	}
}

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
 * Importa uma ARP e todos os itens dela do Compras.gov.br, grava localmente e liga cada item
 * ao item do anexo quantitativo pelo código CATMAT.
 *
 * @remarks
 * EFEITOS: upsert em arp (conflito: unit_id + numero_ata + uasg_gerenciadora) e
 *   reconciliação de arp_item por numero_item (atualiza o que casa, insere o novo e
 *   só apaga o que saiu da API quando nenhum finance.empenho_item aponta para ele — a FK é ON
 *   DELETE RESTRICT, e apagar e reinserir às cegas falharia nos empenhos locais).
 * `numero_ata` guarda o número CANÔNICO da API ("00002/2025"), que é o formato que
 *   `4_consultarEmpenhosSaldoItem` exige de volta na sincronização de saldo.
 * Datas no formato BR ("DD/MM/YYYY") viram ISO 8601. Item cujo CATMAT não casa com o anexo fica
 * com quantity_estimate_item_id nulo.
 *
 * @throws {Error} em falha HTTP (depois de 3 tentativas), quando a ata não tem itens ou em qualquer
 *   erro de escrita no Supabase.
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
			quantityEstimateId: z.uuid().nullable().optional(),
			/** Contratação de origem (registro de preços) que a ARP sustenta. */
			acquisitionId: z.uuid().nullable().optional(),
			unitId: z.number().int().positive(),
			arpData: ArpDataSchema,
		})
	)
	.handler(async ({ data }): Promise<ArpWithItems & { warnings: string[] }> => {
		// Escrita em `arp`/`arp_item` da unidade alvo: exige
		// nível 2 NAQUELA unidade. `requireAuth()` sozinho deixava qualquer sessão
		// autenticada importar ARP para qualquer unidade — a service role não tem RLS
		// para segurar isso.
		await requireUnitScope(2, data.unitId)
		const supabase = getProcurementClient()
		// O anexo apontado TEM que ser da unidade alegada: sem isto, quem tem nível 2 na
		// unidade A importa ARP para dentro do anexo da unidade B.
		if (data.quantityEstimateId && (await resolveQuantityEstimateUnit(supabase, data.quantityEstimateId)) !== data.unitId)
			throw new Error("O anexo quantitativo informado não pertence a esta unidade")
		if (data.acquisitionId && (await resolveAcquisitionUnit(data.acquisitionId)) !== data.unitId) {
			throw new Error("A contratação de origem informada não pertence a esta unidade")
		}
		const { unitId } = data
		const warnings: string[] = []

		// O cabeçalho vai gravado como `source: "compras_gov"`: ele é RELIDO na API pelo número, pela
		// UASG e pelo início de vigência, e o payload só serve de chave da consulta. Antes objeto,
		// situação, gerenciadora e fim de vigência vinham do cliente e passavam por dado oficial.
		// O upsert pela chave (unidade, número, UASG) trocava o anexo da ARP em silêncio quando ela
		// era reimportada de outro anexo. Agora o vínculo existente é mantido e a tela avisa. A
		// chave é a mesma da consulta à API (o cabeçalho devolvido casa número e UASG), então as
		// duas leituras correm juntas.
		const [arpData, { data: existingArp, error: existingError }] = await Promise.all([
			fetchArpHeader(data.arpData),
			supabase
				.from("arp")
				.select("id, quantity_estimate_id, acquisition_id")
				.eq("unit_id", unitId)
				.eq("numero_ata", data.arpData.numeroAtaRegistroPreco)
				.eq("uasg_gerenciadora", data.arpData.codigoUnidadeGerenciadora)
				.maybeSingle(),
		])
		if (existingError) throw new Error(`Erro ao procurar a ARP: ${publicDbMessage(existingError)}`)
		let quantityEstimateId: string | null = data.quantityEstimateId ?? existingArp?.quantity_estimate_id ?? null
		if (existingArp?.quantity_estimate_id && data.quantityEstimateId && existingArp.quantity_estimate_id !== data.quantityEstimateId) {
			quantityEstimateId = existingArp.quantity_estimate_id
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

		// ── 2. Buscar os itens do anexo quantitativo para fazer o match por catmat ──

		const { data: quantityEstimateItems } = quantityEstimateId
			? await supabase.from("quantity_estimate_item").select("id, catmat_item_codigo, measure_unit").eq("quantity_estimate_id", quantityEstimateId)
			: { data: [] as Array<{ id: string; catmat_item_codigo: number | null; measure_unit: string | null }> }

		const catmatToQuantityEstimateItemId = new Map<number, string>()
		// `2_consultarARPItem` não traz unidade de fornecimento; a medida vem do
		// item do anexo quantitativo, casado pelo mesmo catmat.
		const catmatToMeasureUnit = new Map<number, string>()
		for (const item of quantityEstimateItems ?? []) {
			if (item.catmat_item_codigo != null) {
				catmatToQuantityEstimateItemId.set(item.catmat_item_codigo, item.id)
				if (item.measure_unit) catmatToMeasureUnit.set(item.catmat_item_codigo, item.measure_unit)
			}
		}

		// ── 3. Upsert arp ─────────────────────────────────────────────

		const { data: arp, error: arpError } = await supabase
			.from("arp")
			.upsert(
				{
					unit_id: unitId,
					quantity_estimate_id: quantityEstimateId,
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

		if (arpError || !arp) throw new Error(`Erro ao salvar ARP: ${publicDbMessage(arpError)}`)

		// ── 4. Reconciliar itens SEM apagar empenhos locais ──────────────────────
		// Antes: delete + reinsert, e o CASCADE de então apagava os empenhos
		// registrados. Agora: match por numero_item → update; novos → insert;
		// ausentes na API → delete só se nenhum item de NE apontar para eles.

		const now = new Date().toISOString()
		const { data: existingItems } = await supabase.from("arp_item").select("id, numero_item").eq("arp_id", arp.id)

		const byNumeroItem = new Map<number, string>()
		for (const item of existingItems ?? []) {
			if (item.numero_item != null) byNumeroItem.set(item.numero_item, item.id)
		}

		const toRow = (item: ComprasArpItemResult) => {
			const numero = parseNumeroItem(item.numeroItem)
			const saldo = numero != null ? saldos.get(numero) : undefined
			return {
				arp_id: arp.id,
				quantity_estimate_item_id: item.codigoItem != null ? (catmatToQuantityEstimateItemId.get(item.codigoItem) ?? null) : null,
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
				const { error } = await supabase.from("arp_item").update(toRow(item)).eq("id", existingId)
				if (error) throw new Error(`Erro ao atualizar item ${item.numeroItem} da ARP: ${publicDbMessage(error)}`)
			}
		}

		const newRows = apiItems
			.filter((item) => {
				const numero = parseNumeroItem(item.numeroItem)
				return numero == null || !byNumeroItem.has(numero)
			})
			.map(toRow)
		if (newRows.length > 0) {
			const { error } = await supabase.from("arp_item").insert(newRows)
			if (error) throw new Error(`Erro ao salvar itens da ARP: ${publicDbMessage(error)}`)
		}

		// Itens locais que a API não retornou: remover apenas os sem empenho local.
		const staleIds = (existingItems ?? []).map((item) => item.id).filter((id) => !matchedIds.has(id))
		if (staleIds.length > 0) {
			// Item com empenho fica (o FK é RESTRICT desde 20260926214000): a NE aponta para o item
			// da ARP pelos itens dela (`finance.empenho_item`).
			const { data: itemRefs, error: itemError } = await supabase.schema("finance").from("empenho_item").select("arp_item_id").in("arp_item_id", staleIds)
			if (itemError) throw new Error(`Erro ao conferir empenhos dos itens retirados: ${publicDbMessage(itemError)}`)
			const referenced = new Set((itemRefs ?? []).map((row) => row.arp_item_id))
			const deletableIds = staleIds.filter((id) => !referenced.has(id))
			if (deletableIds.length > 0) {
				const { error } = await supabase.from("arp_item").delete().in("id", deletableIds)
				if (error) throw new Error(`Erro ao retirar itens que saíram da ARP: ${publicDbMessage(error)}`)
			}
			const kept = staleIds.length - deletableIds.length
			if (kept > 0) warnings.push(`${kept} item(ns) que saíram da ARP no Compras.gov.br continuam aqui porque têm empenho`)
		}

		const { data: finalItems, error: finalError } = await supabase.from("arp_item").select("*").eq("arp_id", arp.id).order("numero_item", { ascending: true })

		if (finalError) throw new Error(`Erro ao carregar itens da ARP: ${publicDbMessage(finalError)}`)

		return { ...(arp as ArpWithItems), items: finalItems ?? [], warnings }
	})

// ─── 3. Sincronizar saldo de empenhos via Compras.gov.br ─────────────────────

/**
 * Refreshes quantidade_empenhada and saldo_empenho for all items of an ARP via
 * `modulo-arp/4_consultarEmpenhosSaldoItem`.
 *
 * @remarks
 * SIDE EFFECTS: updates arp_item.{quantidade_empenhada, saldo_empenho, synced_at} for all matched
 *   items in a SINGLE upsert (one PostgREST request = one transaction — no mixed snapshot),
 *   then arp.last_synced_at.
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
		const { data: arp, error: arpError } = await supabase.from("arp").select("unit_id, numero_ata, uasg_gerenciadora").eq("id", data.arpId).single()

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
		const { data: dbItems, error: dbItemsError } = await supabase.from("arp_item").select("id, numero_item, quantidade_homologada").eq("arp_id", data.arpId)

		// Sem esta guarda, uma leitura que falha vira "0 itens para atualizar" e o
		// last_synced_at abaixo carimba "sincronizado agora" sobre número velho —
		// exatamente o que esta função promete não fazer.
		if (dbItemsError) throw new Error(`Erro ao carregar itens locais da ARP: ${publicDbMessage(dbItemsError)} — snapshot anterior mantido`)

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
			const { error: upsertError } = await supabase.from("arp_item").upsert(updates, { onConflict: "id" })
			if (upsertError) {
				throw new Error(`Sincronização falhou (${publicDbMessage(upsertError)}) — snapshot anterior mantido, last_synced_at não atualizado`)
			}
		}

		// Atualizar timestamp da ARP (só chega aqui com todos os itens ok)
		const { error: tsError } = await supabase.from("arp").update({ last_synced_at: now }).eq("id", data.arpId)
		if (tsError) throw new Error(`Erro ao registrar data de sincronização: ${publicDbMessage(tsError)}`)
	})

// ─── 4. Buscar ARP vinculada a um anexo quantitativo ─────────────────────────

/**
 * ARP ligada ao anexo quantitativo, com os itens pela ordem de `numero_item`, ou null se não houver.
 */
/**
 * Resolve a unidade dona de uma ARP, de um item de ARP ou de um anexo quantitativo.
 *
 * Existe porque escopar pelo `unitId` do payload fecha só metade do buraco: o cliente
 * continua escolhendo a CHAVE ESTRANGEIRA. Quem tem `unit` 2 na unidade A poderia
 * apontar para o anexo ou para o item de ARP da unidade B e, com o guard satisfeito pela
 * própria unidade, escrever no acervo da outra — e a unidade B nem conseguiria desfazer,
 * porque o guard de anulação resolve a unidade pela linha, que diria "A".
 *
 * A unidade sai SEMPRE da linha apontada, nunca do que o cliente alegou.
 */
async function resolveQuantityEstimateUnit(supabase: ReturnType<typeof getProcurementClient>, quantityEstimateId: string): Promise<number> {
	const { data, error } = await supabase.from("quantity_estimate").select("unit_id").eq("id", quantityEstimateId).maybeSingle()
	if (error) throw new Error(`Erro ao resolver a unidade do anexo quantitativo: ${publicDbMessage(error)}`)
	if (!data) throw new Error("Anexo quantitativo não encontrado")
	return Number(data.unit_id)
}

async function resolveAcquisitionUnit(acquisitionId: string): Promise<number> {
	const { data, error } = await getProcurementClient().from("acquisition").select("unit_id").eq("id", acquisitionId).is("deleted_at", null).maybeSingle()
	if (error) throw new Error(`Erro ao resolver a unidade da contratação: ${publicDbMessage(error)}`)
	if (!data) throw new Error("Contratação de origem não encontrada")
	return Number(data.unit_id)
}

async function resolveArpUnit(supabase: ReturnType<typeof getProcurementClient>, arpId: string): Promise<number> {
	const { data, error } = await supabase.from("arp").select("unit_id").eq("id", arpId).maybeSingle()
	if (error) throw new Error(`Erro ao resolver a unidade da ARP: ${publicDbMessage(error)}`)
	if (!data) throw new Error("ARP não encontrada")
	return Number(data.unit_id)
}

async function resolveArpItemUnit(supabase: ReturnType<typeof getProcurementClient>, arpItemId: string): Promise<number> {
	const { data, error } = await supabase.from("arp_item").select("arp_id").eq("id", arpItemId).maybeSingle()
	if (error) throw new Error(`Erro ao resolver a unidade do item: ${publicDbMessage(error)}`)
	if (!data) throw new Error("Item da ARP não encontrado")
	return resolveArpUnit(supabase, String(data.arp_id))
}

export const fetchArpForQuantityEstimateFn = createServerFn({ method: "GET" })
	.validator(z.object({ quantityEstimateId: z.uuid() }))
	.handler(async ({ data }): Promise<ArpWithItems | null> => {
		await requireAuth()
		const supabase = getProcurementClient()
		// Execução orçamentária e dado de fornecedor não são públicos entre unidades:
		// leitura exige nível 1 NA unidade dona do anexo.
		await requireUnitScope(1, await resolveQuantityEstimateUnit(supabase, data.quantityEstimateId))

		const { data: arp } = await supabase.from("arp").select("*").eq("quantity_estimate_id", data.quantityEstimateId).maybeSingle()

		if (!arp) return null

		const { data: items } = await supabase.from("arp_item").select("*").eq("arp_id", arp.id).order("numero_item", { ascending: true })

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
			quantityEstimateId: z.uuid().nullable().optional(),
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
		if (data.quantityEstimateId && (await resolveQuantityEstimateUnit(supabase, data.quantityEstimateId)) !== data.unitId)
			throw new Error("O anexo quantitativo informado não pertence a esta unidade")
		if (data.acquisitionId && (await resolveAcquisitionUnit(data.acquisitionId)) !== data.unitId) {
			throw new Error("A contratação de origem informada não pertence a esta unidade")
		}
		const numeros = data.items.map((item) => item.numeroItem)
		if (new Set(numeros).size !== numeros.length) throw new Error("Dois itens com o mesmo número: cada item da ata tem um número")

		const numeroAta = formatNumeroAta(data.numeroAta.split("/")[0] ?? data.numeroAta, data.anoAta)
		const { data: arp, error } = await supabase
			.from("arp")
			.insert({
				unit_id: data.unitId,
				quantity_estimate_id: data.quantityEstimateId ?? null,
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
			throw new Error(`Erro ao cadastrar a ARP: ${publicDbMessage(error)}`)
		}

		const { error: itemsError } = await supabase.from("arp_item").insert(
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
			const { error: undoError } = await supabase.from("arp").delete().eq("id", arp.id)
			if (undoError) throw new Error(`Erro ao cadastrar os itens (${publicDbMessage(itemsError)}) e ao desfazer a ARP (${publicDbMessage(undoError)})`)
			throw new Error(`Erro ao cadastrar os itens da ARP: ${publicDbMessage(itemsError)}`)
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
	quantityEstimateId: string | null
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
			.from("arp")
			.select(
				"id, numero_ata, uasg_gerenciadora, nome_uasg_gerenciadora, objeto, data_vigencia_inicio, data_vigencia_fim, source, last_synced_at, quantity_estimate_id, acquisition_id"
			)
			.eq("unit_id", data.unitId)
			.order("created_at", { ascending: false })
		if (data.acquisitionId) query = query.eq("acquisition_id", data.acquisitionId)
		const { data: arps, error } = await query
		if (error) throw new Error(`Erro ao listar ARPs: ${publicDbMessage(error)}`)
		const list = arps ?? []
		if (list.length === 0) return []

		const { data: items, error: itemsError } = await proc
			.from("arp_item")
			.select(
				"id, arp_id, numero_item, catmat_item_codigo, descricao_item, ni_fornecedor, nome_fornecedor, valor_unitario, quantidade_homologada, quantidade_empenhada, saldo_empenho, medida_catmat"
			)
			.in(
				"arp_id",
				list.map((arp) => arp.id)
			)
			.order("numero_item", { ascending: true })
		if (itemsError) throw new Error(`Erro ao listar itens das ARPs: ${publicDbMessage(itemsError)}`)
		const itemRows = (items ?? []) as ArpItem[]
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
			quantityEstimateId: arp.quantity_estimate_id,
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
 * com a quantidade, o preço e o valor dos itens da NE que apontam para ESTE item da ARP.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchEmpenhosFn = createServerFn({ method: "GET" })
	.validator(z.object({ arpItemId: z.uuid() }))
	.handler(async ({ data }): Promise<EmpenhoOfArpItem[]> => {
		await requireAuth()
		await requireUnitScope(1, await resolveArpItemUnit(getProcurementClient(), data.arpItemId))
		const fin = getFinanceClient()
		const { data: items, error: itemsError } = await fin
			.from("empenho_item")
			.select("empenho_id, quantity, unit_price, value")
			.eq("arp_item_id", data.arpItemId)
		if (itemsError) throw new Error(`Erro ao buscar itens de empenho: ${publicDbMessage(itemsError)}`)
		const byEmpenho = new Map<string, EmpenhoItemAmounts[]>()
		for (const item of items ?? []) byEmpenho.set(item.empenho_id, [...(byEmpenho.get(item.empenho_id) ?? []), item])
		if (byEmpenho.size === 0) return []

		const { data: empenhos, error } = await fin
			.from("empenho")
			.select("id, unit_id, numero_empenho, data_empenho, valor_total, status, nd, nota_lancamento")
			.in("id", [...byEmpenho.keys()])
			.order("data_empenho", { ascending: false })

		if (error) throw new Error(`Erro ao buscar empenhos: ${publicDbMessage(error)}`)
		return (empenhos ?? []).map((empenho) => ({
			...empenho,
			valor_total: Number(empenho.valor_total),
			...summarizeArpItemShare(byEmpenho.get(empenho.id) ?? [], Number(empenho.valor_total)),
		}))
	})

// ─── 6. Registrar empenho ─────────────────────────────────────────────────────

/**
 * Registra a NE de UM item da ARP (o formulário do painel da ARP), pelo mesmo núcleo de
 * `createEmpenhoWithItemsFn` (`empenho-registration.server`): cabeçalho e item numa transação,
 * valor = quantidade × preço ao centavo, contratação e favorecido herdados da ARP, conferência
 * NE × ARP (avisos) e religação das NS/OB estacionadas.
 *
 * @throws {Error} "já está no sistema" on unique violation (PG code 23505); the trigger message on 23514.
 */
export const createEmpenhoFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			unitId: z.number().int().positive(),
			arpItemId: z.uuid(),
			numeroEmpenho: z.string().trim().min(1, "Número do empenho obrigatório").max(30),
			dataEmpenho: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)"),
			quantity: z.number().positive("Quantidade deve ser positiva"),
			unitPrice: z.number().positive("Valor deve ser positivo"),
			notaLancamento: z.string().optional(),
			// Classificação gravada NA MESMA transação: antes ia por um segundo POST depois do
			// registro, que podia falhar com a NE já gravada (e zerava o favorecido herdado).
			nd: z.string().trim().max(20).nullable().optional(),
			ptres: z.string().trim().max(20).nullable().optional(),
			fonte: z.string().trim().max(20).nullable().optional(),
		})
	)
	.handler(async ({ data }): Promise<CreatedEmpenho> => {
		// Empenho é dinheiro público: exige nível 2 NA unidade empenhada. Antes daqui
		// bastava estar autenticado — qualquer comensal podia registrar empenho em
		// qualquer unidade, com `unitId` vindo do próprio payload. A unidade do item da ARP
		// é conferida pelo núcleo, na mesma leitura que traz preço, descrição e unidade.
		const ctx = await requireUnitScope(2, data.unitId)
		const prepared = await prepareEmpenhoRegistration({
			unitId: data.unitId,
			numeroEmpenho: data.numeroEmpenho,
			dataEmpenho: data.dataEmpenho,
			notaLancamento: data.notaLancamento ?? null,
			nd: data.nd || null,
			ptres: data.ptres || null,
			fonte: data.fonte || null,
			items: [
				{
					arpItemId: data.arpItemId,
					quantity: data.quantity,
					unitPrice: data.unitPrice,
					value: resolveItemValue({ quantity: data.quantity, unitPrice: data.unitPrice, value: 0 }),
				},
			],
		})
		const empenhoId = await withSensitiveAudit(
			"createEmpenhoFn",
			ctx,
			() => insertPreparedEmpenho("createEmpenhoFn", ctx, prepared),
			(id) => empenhoAuditTarget(prepared, id)
		)
		return completeEmpenhoRegistration(ctx, prepared, empenhoId)
	})

// ─── 6b. Comprometimento local por item da ARP ───────────────────────────────

/**
 * Aggregates ACTIVE finance.empenho per ARP item — the "comprometimento local",
 * computed in real time. This is a different quantity from the official snapshot
 * (arp_item.quantidade_empenhada/saldo_empenho), which includes
 * consumption by other UASGs (caronas) and only changes on sync. The UI must
 * show both, never sum them.
 */
export const fetchArpLocalCommitmentsFn = createServerFn({ method: "GET" })
	.validator(z.object({ arpId: z.uuid() }))
	.handler(async ({ data }): Promise<Record<string, LocalCommitment>> => {
		await requireAuth()
		const supabase = getProcurementClient()
		await requireUnitScope(1, await resolveArpUnit(supabase, data.arpId))

		const { data: items, error: itemsError } = await supabase.from("arp_item").select("id").eq("arp_id", data.arpId)
		if (itemsError) throw new Error(`Erro ao buscar itens da ARP: ${publicDbMessage(itemsError)}`)
		const itemIds = (items ?? []).map((item) => item.id)
		if (itemIds.length === 0) return {}

		// Pelos itens da NE (`finance.empenho_item`): a NE com vários itens conta em cada item da ARP.
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

		const { data: items } = await supabase.from("arp_item").select("id").eq("arp_id", data.arpId)
		const itemIds = (items ?? []).map((item) => item.id)
		if (itemIds.length === 0) return {}

		// Pelos itens da NE. A liquidação é da NE inteira; numa NE com vários itens ela se reparte
		// entre eles na proporção do valor de cada item — é leitura de acompanhamento, não lançamento.
		const financeClient = supabase.schema("finance")
		const { data: arpNeItems, error: arpNeError } = await financeClient.from("empenho_item").select("empenho_id, arp_item_id, value").in("arp_item_id", itemIds)
		if (arpNeError) throw new Error(`Erro ao buscar itens de empenho: ${publicDbMessage(arpNeError)}`)
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
 * @throws {Error} on lookup failure, with liquidacao, or when the floor refuses.
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
		if (lookupError) throw new Error(`Erro ao buscar empenho: ${publicDbMessage(lookupError)}`)
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
