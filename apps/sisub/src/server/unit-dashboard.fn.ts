/**
 * @module unit-dashboard.fn
 * Painel de contratação da unidade: anexos quantitativos concluídos e itens de ARP com consumo ≥ 80%, marcando os que entram em cardápio próximo.
 * Thin wrapper delegating to @iefa/sisub-domain operations (operations/procurement).
 * Auth enforced via requireAuth() — endpoint now requires authentication.
 * @domain core
 * @migration done
 */

import { FetchUnitDashboardSchema, fetchUnitDashboard } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import type { QuantityEstimate } from "@/types/domain/quantity-estimate"

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
	// anexo quantitativo vinculado
	quantity_estimate_id: string
	quantity_estimate_title: string
	// Ingrediente interno (via quantity_estimate_item)
	ingredient_id: string | null
	ingredient_name: string | null
	// Indica se o produto aparece em algum menu planejado nos próximos 30 dias
	in_upcoming_menu: boolean
}

export interface UnitDashboardData {
	/** Anexos quantitativos concluídos da unidade */
	completed_quantity_estimates: QuantityEstimate[]
	/** Itens de ARP com consumo ≥ 80% ou saldo zerado, de anexos quantitativos concluídos */
	low_balance_items: DashboardArpItem[]
}

// ─── Server Function ──────────────────────────────────────────────────────────

export const fetchUnitDashboardFn = createServerFn({ method: "GET" })
	.validator(FetchUnitDashboardSchema)
	.handler(async ({ data }): Promise<UnitDashboardData> => {
		const ctx = await requireAuth()
		return (await fetchUnitDashboard(getDb(), ctx, data).catch(handleDomainError)) as unknown as UnitDashboardData
	})
