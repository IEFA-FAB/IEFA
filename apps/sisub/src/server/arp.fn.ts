/**
 * @module arp.fn
 * Integration with Compras.gov.br ARP (Ata de Registro de Preços) API + local empenho management.
 * CLIENT: getSupabaseServerClient (service role). External: dadosabertos.compras.gov.br (30 s timeout, 3 retries, exponential backoff).
 * TABLES: procurement_arp, procurement_arp_item, empenho.
 */

import type { Empenho } from "@iefa/database/sisub"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { ArpWithItems, ComprasArpItemPage, ComprasArpPage } from "@/types/domain/arp"

// ─── Constantes ───────────────────────────────────────────────────────────────

const COMPRAS_BASE = "https://dadosabertos.compras.gov.br"
const TIMEOUT_MS = 30_000
const MAX_RETRIES = 3

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchCompras(url: string): Promise<Response> {
	let lastErr: unknown
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		try {
			if (attempt > 0) {
				await new Promise((r) => setTimeout(r, (2 ** attempt - 1) * 1_000))
			}
			const res = await fetch(url, {
				signal: AbortSignal.timeout(TIMEOUT_MS),
				headers: { accept: "application/json" },
			})
			if (!res.ok) throw new Error(`HTTP ${res.status} ao consultar Compras.gov.br`)
			return res
		} catch (err) {
			lastErr = err
		}
	}
	throw lastErr
}

function parseBrDate(value: string | null | undefined): string | null {
	if (!value) return null
	const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
	if (match) return `${match[3]}-${match[2]}-${match[1]}`
	if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.substring(0, 10)
	return null
}

// ─── 1. Buscar ARPs no Compras.gov.br ────────────────────────────────────────

/**
 * Queries Compras.gov.br for ARPs matching the given UASG — read-only, no local persistence.
 *
 * @throws {Error} "HTTP {status}" after 3 failed attempts or on AbortSignal timeout (30 s per attempt).
 */
export const searchArpFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			uasgGerenciadora: z.string().min(1),
			numeroAta: z.string().optional(),
			anoAta: z.string().optional(),
		})
	)
	.handler(async ({ data }): Promise<ComprasArpPage> => {
		const params = new URLSearchParams({
			pagina: "1",
			tamanhoPagina: "20",
			uasgGerenciadora: data.uasgGerenciadora,
		})
		if (data.numeroAta) params.set("numeroAta", data.numeroAta)
		if (data.anoAta) params.set("anoAta", data.anoAta)

		const url = `${COMPRAS_BASE}/modulo-arp/1_consultarARP?${params}`
		const res = await fetchCompras(url)
		return (await res.json()) as ComprasArpPage
	})

// ─── 2. Importar ARP + seus itens (persiste no banco) ────────────────────────

/**
 * Imports an ARP and all its items from Compras.gov.br, persisting them locally and linking to internal ATA items by catmat code.
 *
 * @remarks
 * SIDE EFFECTS: upserts procurement_arp (conflict: unit_id + numero_ata + uasg_gerenciadora),
 *   DELETES all existing procurement_arp_item for the ARP before reinserting — destructive full sync.
 * BR date strings ("DD/MM/YYYY") are normalised to ISO 8601. Unmatched catmat codes get ata_item_id = null.
 *
 * @throws {Error} on HTTP failure (after 3 retries) or any Supabase write error.
 */

const ArpDataSchema = z.object({
	numeroAta: z.string(),
	anoAta: z.string(),
	uasgGerenciadora: z.string(),
	nomeUasgGerenciadora: z.string().nullable().optional(),
	objeto: z.string().nullable().optional(),
	dataVigenciaIni: z.string().nullable().optional(),
	dataVigenciaFim: z.string().nullable().optional(),
	statusAta: z.string().nullable().optional(),
})

export const importArpItemsFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			ataId: z.string().uuid(),
			unitId: z.number().int().positive(),
			arpData: ArpDataSchema,
		})
	)
	.handler(async ({ data }): Promise<ArpWithItems> => {
		const supabase = getSupabaseServerClient()
		const { ataId, unitId, arpData } = data

		// ── 1. Buscar itens da ARP na API do Compras.gov.br ──────────────────────

		const params = new URLSearchParams({
			pagina: "1",
			tamanhoPagina: "500",
			uasgGerenciadora: arpData.uasgGerenciadora,
			numeroAta: arpData.numeroAta,
			anoAta: arpData.anoAta,
		})

		const res = await fetchCompras(`${COMPRAS_BASE}/modulo-arp/2_consultarARPItem?${params}`)
		const page = (await res.json()) as ComprasArpItemPage
		const apiItems = page.resultado ?? []

		// ── 2. Buscar os itens da ATA interna para fazer o match por catmat ──────

		const { data: ataItems } = await supabase.from("procurement_ata_item").select("id, catmat_item_codigo").eq("ata_id", ataId)

		const catmatToAtaItemId = new Map<number, string>()
		for (const item of ataItems ?? []) {
			if (item.catmat_item_codigo != null) {
				catmatToAtaItemId.set(item.catmat_item_codigo, item.id)
			}
		}

		// ── 3. Upsert procurement_arp ─────────────────────────────────────────────

		const { data: arp, error: arpError } = await supabase
			.from("procurement_arp")
			.upsert(
				{
					unit_id: unitId,
					ata_id: ataId,
					numero_ata: arpData.numeroAta,
					ano_ata: arpData.anoAta,
					uasg_gerenciadora: arpData.uasgGerenciadora,
					nome_uasg_gerenciadora: arpData.nomeUasgGerenciadora ?? null,
					objeto: arpData.objeto ?? null,
					data_vigencia_inicio: parseBrDate(arpData.dataVigenciaIni),
					data_vigencia_fim: parseBrDate(arpData.dataVigenciaFim),
					status_ata: arpData.statusAta ?? null,
					last_synced_at: new Date().toISOString(),
				},
				{ onConflict: "unit_id,numero_ata,uasg_gerenciadora" }
			)
			.select()
			.single()

		if (arpError || !arp) throw new Error(`Erro ao salvar ARP: ${arpError?.message}`)

		// ── 4. Deletar itens antigos e reinserir ─────────────────────────────────

		await supabase.from("procurement_arp_item").delete().eq("arp_id", arp.id)

		const itemRows = apiItems.map((item) => ({
			arp_id: arp.id,
			ata_item_id: item.codigoMaterial != null ? (catmatToAtaItemId.get(item.codigoMaterial) ?? null) : null,
			numero_item: item.numeroItem ?? null,
			catmat_item_codigo: item.codigoMaterial ?? null,
			descricao_item: item.descricaoMaterial ?? null,
			ni_fornecedor: item.niiFornecedor ?? null,
			nome_fornecedor: item.nomeFornecedor ?? null,
			valor_unitario: item.valorUnitario ?? null,
			quantidade_homologada: item.qtdeRegistrada ?? null,
			medida_catmat: item.unidadeFornecimento ?? null,
			quantidade_empenhada: item.qtdeEmpenhada ?? 0,
			saldo_empenho: item.saldoEmpenho ?? null,
			synced_at: new Date().toISOString(),
		}))

		const { data: insertedItems, error: itemsError } = await supabase.from("procurement_arp_item").insert(itemRows).select()

		if (itemsError) throw new Error(`Erro ao salvar itens da ARP: ${itemsError.message}`)

		return { ...arp, items: insertedItems ?? [] }
	})

// ─── 3. Sincronizar saldo de empenhos via Compras.gov.br ─────────────────────

/**
 * Refreshes qtdeEmpenhada and saldoEmpenho for all items of an ARP by re-querying Compras.gov.br.
 *
 * @remarks
 * SIDE EFFECTS: updates procurement_arp_item.{quantidade_empenhada, saldo_empenho, synced_at} for each matched item,
 *   updates procurement_arp.last_synced_at.
 * Matches by numero_item (not catmat). Fires one UPDATE per item in parallel (Promise.all) — no transaction.
 *
 * @throws {Error} if ARP not found locally, on HTTP failure (3 retries), or on any individual item update failure.
 */
export const syncArpBalanceFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ arpId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const supabase = getSupabaseServerClient()

		const { data: arp, error: arpError } = await supabase.from("procurement_arp").select("numero_ata, ano_ata, uasg_gerenciadora").eq("id", data.arpId).single()

		if (arpError || !arp) throw new Error("ARP não encontrada")

		// Re-consultar itens na API (retorna saldo atualizado)
		const params = new URLSearchParams({
			pagina: "1",
			tamanhoPagina: "500",
			uasgGerenciadora: arp.uasg_gerenciadora,
			numeroAta: arp.numero_ata,
		})
		if (arp.ano_ata) params.set("anoAta", arp.ano_ata)

		const res = await fetchCompras(`${COMPRAS_BASE}/modulo-arp/2_consultarARPItem?${params}`)
		const page = (await res.json()) as ComprasArpItemPage
		const apiItems = page.resultado ?? []

		// Buscar itens locais para mapear por numero_item
		const { data: dbItems } = await supabase.from("procurement_arp_item").select("id, numero_item").eq("arp_id", data.arpId)

		const numeroItemToDbId = new Map<number, string>()
		for (const dbItem of dbItems ?? []) {
			if (dbItem.numero_item != null) numeroItemToDbId.set(dbItem.numero_item, dbItem.id)
		}

		// Atualizar cada item com os saldos frescos
		const now = new Date().toISOString()
		await Promise.all(
			apiItems
				.filter((item) => item.numeroItem != null && numeroItemToDbId.has(item.numeroItem))
				.map((item) =>
					supabase
						.from("procurement_arp_item")
						.update({
							quantidade_empenhada: item.qtdeEmpenhada ?? 0,
							saldo_empenho: item.saldoEmpenho ?? null,
							synced_at: now,
						})
						// biome-ignore lint/style/noNonNullAssertion: filtrado acima
						.eq("id", numeroItemToDbId.get(item.numeroItem!)!)
				)
		)

		// Atualizar timestamp da ARP
		await supabase.from("procurement_arp").update({ last_synced_at: now }).eq("id", data.arpId)
	})

// ─── 4. Buscar ARP vinculada a uma ATA ───────────────────────────────────────

/**
 * Returns the ARP linked to an ATA with all its items ordered by numero_item, or null if none exists.
 */
export const fetchArpForAtaFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ ataId: z.string().uuid() }))
	.handler(async ({ data }): Promise<ArpWithItems | null> => {
		const supabase = getSupabaseServerClient()

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
	.inputValidator(z.object({ arpItemId: z.string().uuid() }))
	.handler(async ({ data }): Promise<Empenho[]> => {
		const { data: empenhos, error } = await getSupabaseServerClient()
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
	.inputValidator(
		z.object({
			unitId: z.number().int().positive(),
			arpItemId: z.string().uuid(),
			numeroEmpenho: z.string().min(1, "Número do empenho obrigatório"),
			dataEmpenho: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)"),
			quantidadeEmpenhada: z.number().positive("Quantidade deve ser positiva"),
			valorUnitario: z.number().positive("Valor deve ser positivo"),
			notaLancamento: z.string().optional(),
		})
	)
	.handler(async ({ data }): Promise<Empenho> => {
		const supabase = getSupabaseServerClient()
		const valorTotal = Number((data.quantidadeEmpenhada * data.valorUnitario).toFixed(4))

		const { data: empenho, error } = await supabase
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

// ─── 7. Anular empenho ────────────────────────────────────────────────────────

/**
 * Cancels an empenho by setting status to "anulado" — no hard delete, saldo on ARP item is NOT auto-restored.
 *
 * @throws {Error} on Supabase update failure.
 */
export const anularEmpenhoFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ empenhoId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient().from("empenho").update({ status: "anulado" }).eq("id", data.empenhoId)

		if (error) throw new Error(`Erro ao anular empenho: ${error.message}`)
	})
