/**
 * @module unit-dashboard.fn
 * Unit procurement health dashboard: published ATAs + ARP items at ≥80% consumption with upcoming-menu annotation.
 * Thin wrapper delegating to @iefa/sisub-domain operations (operations/procurement).
 * Auth enforced via requireAuth() — endpoint now requires authentication.
 * @domain core
 * @migration done
 */

import { FetchUnitDashboardSchema, fetchUnitDashboard } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { handleDomainError } from "@/lib/domain-errors"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { ProcurementList } from "@/types/domain/ata"

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
	// Ingrediente interno (via ata_item)
	ingredient_id: string | null
	ingredient_name: string | null
	// Indica se o produto aparece em algum menu planejado nos próximos 30 dias
	in_upcoming_menu: boolean
}

export interface UnitDashboardData {
	/** ATAs com status "published" da unidade */
	published_atas: ProcurementList[]
	/** Itens de ARP com consumo ≥ 80% ou saldo zerado, de ATAs publicadas */
	low_balance_items: DashboardArpItem[]
}

// ─── Server Function ──────────────────────────────────────────────────────────

export const fetchUnitDashboardFn = createServerFn({ method: "GET" })
	.inputValidator(FetchUnitDashboardSchema)
	.handler(async ({ data }): Promise<UnitDashboardData> => {
		const ctx = await requireAuth()
		return (await fetchUnitDashboard(getSupabaseServerClient(), ctx, data).catch(handleDomainError)) as unknown as UnitDashboardData
	})
