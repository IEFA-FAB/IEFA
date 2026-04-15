/**
 * @module unit-dashboard.fn
 * Unit procurement health dashboard: published ATAs + ARP items at ≥80% consumption with upcoming-menu annotation.
 * CLIENT: getSupabaseServerClient (service role).
 * TABLES: procurement_ata, procurement_arp, procurement_arp_item, procurement_ata_item, kitchen, daily_menu, menu_items (all reads).
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { ProcurementAta } from "@/types/domain/ata"

// ─── Tipos de saída ───────────────────────────────────────────────────────────

export interface DashboardArpItem {
	// Identificação do item na ARP
	id: string
	arp_id: string
	numero_item: number | null
	catmat_item_codigo: number | null
	descricao_item: string | null
	nome_fornecedor: string | null
	medida_catmat: string | null
	// Quantidades e saldo
	quantidade_homologada: number | null
	quantidade_empenhada: number | null
	saldo_empenho: number | null
	valor_unitario: number | null
	// Percentual de consumo calculado (0–100)
	consumption_pct: number
	// ARP de origem
	arp_numero_ata: string
	arp_ano_ata: string | null
	arp_vigencia_fim: string | null
	// ATA interna vinculada
	ata_id: string
	ata_title: string
	// Produto interno (via ata_item)
	product_id: string | null
	product_name: string | null
	// Indica se o produto aparece em algum menu planejado nos próximos 30 dias
	in_upcoming_menu: boolean
}

export interface UnitDashboardData {
	/** ATAs com status "published" da unidade */
	published_atas: ProcurementAta[]
	/** Itens de ARP com consumo ≥ 80% ou saldo zerado, de ATAs publicadas */
	low_balance_items: DashboardArpItem[]
}

// ─── Server Function ──────────────────────────────────────────────────────────

/**
 * Returns published ATAs and low-balance ARP items (≥80% consumed) for a unit, annotated with in_upcoming_menu flag.
 *
 * @remarks
 * 7-step pipeline:
 *   (1) Fetch all non-deleted ATAs → filter published.
 *   (2) Fetch ARPs linked to published ATAs.
 *   (3) Fetch ARP items with ata_item join (for product_id).
 *   (4) Filter: qtdeEmpenhada / qtdeHomologada ≥ 0.8.
 *   (5) Collect product_ids from relevant items.
 *   (6) Check upcoming menus (today + 30 days) across unit kitchens to compute in_upcoming_menu.
 *   (7) Sort: in_upcoming_menu=true first, then consumption_pct descending.
 * Returns early with empty low_balance_items at steps (1), (2) and (4) if no qualifying data found.
 *
 * @throws {Error} on ATAs, ARPs or ARP items query failure.
 */
export const fetchUnitDashboardFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ unitId: z.number() }))
	.handler(async ({ data }): Promise<UnitDashboardData> => {
		const supabase = getSupabaseServerClient()

		// ── 1. Todas as ATAs não deletadas da unidade ─────────────────────────────
		const { data: allAtas, error: atasError } = await supabase
			.from("procurement_ata")
			.select("*")
			.eq("unit_id", data.unitId)
			.is("deleted_at", null)
			.order("created_at", { ascending: false })

		if (atasError) throw new Error(`Erro ao buscar ATAs: ${atasError.message}`)

		const publishedAtas = (allAtas ?? []).filter((a) => a.status === "published") as ProcurementAta[]
		const publishedAtaIds = publishedAtas.map((a) => a.id)

		if (publishedAtaIds.length === 0) {
			return { published_atas: publishedAtas, low_balance_items: [] }
		}

		// ── 2. ARPs vinculadas às ATAs publicadas ─────────────────────────────────
		const { data: arps, error: arpsError } = await supabase
			.from("procurement_arp")
			.select("id, ata_id, numero_ata, ano_ata, data_vigencia_fim")
			.in("ata_id", publishedAtaIds)

		if (arpsError) throw new Error(`Erro ao buscar ARPs: ${arpsError.message}`)

		const arpsData = arps ?? []
		if (arpsData.length === 0) {
			return { published_atas: publishedAtas, low_balance_items: [] }
		}

		const arpIds = arpsData.map((a) => a.id)
		const ataIdToTitle = new Map(publishedAtas.map((a) => [a.id, a.title]))
		const arpById = new Map(arpsData.map((a) => [a.id, a]))

		// ── 3. Itens das ARPs com join no item da ATA (para product_id) ───────────
		const { data: arpItems, error: itemsError } = await supabase
			.from("procurement_arp_item")
			.select(
				`
        id, arp_id, ata_item_id, numero_item,
        catmat_item_codigo, descricao_item, nome_fornecedor,
        valor_unitario, quantidade_homologada, quantidade_empenhada,
        saldo_empenho, medida_catmat,
        ata_item:ata_item_id ( id, product_id, product_name )
      `
			)
			.in("arp_id", arpIds)

		if (itemsError) throw new Error(`Erro ao buscar itens das ARPs: ${itemsError.message}`)

		// ── 4. Filtrar itens com consumo ≥ 80% ───────────────────────────────────
		const relevantItems = (arpItems ?? []).filter((item) => {
			const qtdHom = Number(item.quantidade_homologada ?? 0)
			const qtdEmp = Number(item.quantidade_empenhada ?? 0)
			if (qtdHom <= 0) return false
			return qtdEmp / qtdHom >= 0.8
		})

		if (relevantItems.length === 0) {
			return { published_atas: publishedAtas, low_balance_items: [] }
		}

		// ── 5. Coletar product_ids dos itens relevantes ───────────────────────────
		const productIds = relevantItems
			.map((item) => {
				const ataItem = Array.isArray(item.ata_item) ? item.ata_item[0] : item.ata_item
				return ataItem?.product_id ?? null
			})
			.filter((id): id is string => Boolean(id))

		// ── 6. Verificar quais produtos aparecem em menus dos próximos 30 dias ────
		const upcomingProductIds = new Set<string>()

		if (productIds.length > 0) {
			const { data: kitchens } = await supabase.from("kitchen").select("id").eq("unit_id", data.unitId)
			const kitchenIds = (kitchens ?? []).map((k) => k.id)

			if (kitchenIds.length > 0) {
				const today = new Date().toISOString().substring(0, 10)
				const future = new Date(Date.now() + 30 * 86_400_000).toISOString().substring(0, 10)

				const { data: menus } = await supabase
					.from("daily_menu")
					.select(
						`
              id,
              menu_items (
                id, deleted_at,
                recipe_origin:recipe_origin_id (
                  recipe_ingredients ( product_id )
                )
              )
            `
					)
					.in("kitchen_id", kitchenIds)
					.gte("service_date", today)
					.lte("service_date", future)
					.is("deleted_at", null)

				for (const menu of menus ?? []) {
					for (const menuItem of menu.menu_items ?? []) {
						if (menuItem.deleted_at) continue
						const recipeOrigin = Array.isArray(menuItem.recipe_origin) ? menuItem.recipe_origin[0] : menuItem.recipe_origin
						if (!recipeOrigin) continue
						for (const ing of recipeOrigin.recipe_ingredients ?? []) {
							if (ing.product_id) upcomingProductIds.add(ing.product_id)
						}
					}
				}
			}
		}

		// ── 7. Montar lista final ─────────────────────────────────────────────────
		const lowBalanceItems: DashboardArpItem[] = []

		for (const item of relevantItems) {
			const arp = arpById.get(item.arp_id)
			if (!arp) continue

			const ataItem = Array.isArray(item.ata_item) ? item.ata_item[0] : item.ata_item
			const productId = ataItem?.product_id ?? null

			const qtdHom = Number(item.quantidade_homologada ?? 0)
			const qtdEmp = Number(item.quantidade_empenhada ?? 0)
			const consumptionPct = qtdHom > 0 ? Math.round((qtdEmp / qtdHom) * 100) : 0

			lowBalanceItems.push({
				id: item.id,
				arp_id: item.arp_id,
				numero_item: item.numero_item,
				catmat_item_codigo: item.catmat_item_codigo,
				descricao_item: item.descricao_item,
				nome_fornecedor: item.nome_fornecedor,
				medida_catmat: item.medida_catmat,
				quantidade_homologada: item.quantidade_homologada,
				quantidade_empenhada: item.quantidade_empenhada,
				saldo_empenho: item.saldo_empenho,
				valor_unitario: item.valor_unitario,
				consumption_pct: consumptionPct,
				arp_numero_ata: arp.numero_ata,
				arp_ano_ata: arp.ano_ata,
				arp_vigencia_fim: arp.data_vigencia_fim,
				ata_id: arp.ata_id,
				ata_title: ataIdToTitle.get(arp.ata_id) ?? "—",
				product_id: productId,
				product_name: ataItem?.product_name ?? item.descricao_item,
				in_upcoming_menu: productId ? upcomingProductIds.has(productId) : false,
			})
		}

		// Críticos no cardápio primeiro, depois por % de consumo decrescente
		lowBalanceItems.sort((a, b) => {
			if (a.in_upcoming_menu !== b.in_upcoming_menu) return a.in_upcoming_menu ? -1 : 1
			return b.consumption_pct - a.consumption_pct
		})

		return { published_atas: publishedAtas, low_balance_items: lowBalanceItems }
	})
