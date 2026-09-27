/**
 * Leituras do anexo quantitativo do TR prontas para agentes (chat da Gestão Unidade e do
 * analytics local).
 *
 * O anexo quantitativo é a estimativa das quantidades (Lei 14.133/2021, art. 18, § 1º, IV). Não
 * é ata: a Ata de Registro de Preços (art. 6º, XLVI) só existe depois da licitação e é vinculada
 * ao anexo. Antes do lote 2 do glossário as tools se chamavam `list_atas`/`get_atas`/
 * `get_ata_details` e consultavam `procurement_list` por PostgREST montado à mão; aqui a leitura
 * passa pelas operations e o envelope traz `total`.
 */

import { quantityEstimateInProcurement, type SisubDb } from "@iefa/database/drizzle/sisub"
import { and, desc, eq, isNull } from "drizzle-orm"
import { requireAnyPermission } from "../guards/require-permission.ts"
import { fetchQuantityEstimateDetails } from "../operations/quantity-estimate.ts"
import { COMPLETED_STATUS_VALUES, normalizeQuantityEstimateStatus } from "../schemas/procurement.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import { runQuery } from "../utils/index.ts"
import { clampLimit } from "./budget.ts"
import type { AgentList } from "./reads.ts"
import type { AgentGetQuantityEstimate, AgentListQuantityEstimates } from "./schemas.ts"

/** O anexo na listagem: o que o modelo precisa para escolher qual abrir. */
export interface AgentQuantityEstimateSummary {
	id: string
	title: string
	status: string
	wizard_step: number | null
	segment_id: string | null
	created_at: string
	updated_at: string | null
}

/**
 * Anexos quantitativos da unidade, dos mais recentes. Quem lê a unidade pela Gestão Unidade
 * (`unit:1`) ou pelo analytics local (`local-analytics:1`) — os dois módulos que expõem a tool.
 * O status sai no vocabulário atual (`published` antigo → `completed`).
 */
export async function agentListQuantityEstimates(
	db: SisubDb,
	ctx: UserContext,
	input: AgentListQuantityEstimates & { unitId: number }
): Promise<AgentList<AgentQuantityEstimateSummary>> {
	requireAnyPermission(ctx, ["unit", "local-analytics"], 1, { type: "unit", id: input.unitId })
	const limit = clampLimit(input.limit)
	const rows = await runQuery(
		"QUERY_FAILED",
		() =>
			db
				.select({
					id: quantityEstimateInProcurement.id,
					title: quantityEstimateInProcurement.title,
					status: quantityEstimateInProcurement.status,
					wizardStep: quantityEstimateInProcurement.wizardStep,
					segmentId: quantityEstimateInProcurement.segmentId,
					createdAt: quantityEstimateInProcurement.createdAt,
					updatedAt: quantityEstimateInProcurement.updatedAt,
				})
				.from(quantityEstimateInProcurement)
				// Sem `deleted_at is null` o anexo na lixeira aparece vivo e o modelo o oferece para empenhar.
				.where(and(eq(quantityEstimateInProcurement.unitId, input.unitId), isNull(quantityEstimateInProcurement.deletedAt)))
				.orderBy(desc(quantityEstimateInProcurement.createdAt)),
		{ prefix: "Erro ao listar os anexos quantitativos" }
	)
	const wanted = input.status ?? null
	const matched = rows
		.map((r) => ({
			id: r.id,
			title: r.title,
			status: normalizeQuantityEstimateStatus(r.status),
			wizard_step: r.wizardStep,
			segment_id: r.segmentId,
			created_at: r.createdAt,
			updated_at: r.updatedAt,
		}))
		.filter((r) => wanted == null || r.status === wanted || (wanted === "completed" && COMPLETED_STATUS_VALUES.includes(r.status)))
	return { items: matched.slice(0, limit), returned: Math.min(matched.length, limit), total: matched.length, limit }
}

/** Item do anexo na resposta da tool: as colunas que a conversa usa, sem o `select *`. */
export interface AgentQuantityEstimateItem {
	id: string
	ingredient_id: string | null
	ingredient_name: string
	measure_unit: string | null
	estimated_quantity: number
	purchase_quantity: number | null
	purchase_measure_unit: string | null
	unit_price: number | null
	catmat_item_codigo: number | null
	max_increase_percent: number | null
	delivery_cycle: string | null
}

export interface AgentQuantityEstimateDetail {
	id: string
	unit_id: number
	title: string
	notes: string | null
	status: string
	validity_months: number | null
	max_increase_percent: number
	max_quantity_justification: string | null
	min_quote_percent: number
	is_budget_confidential: boolean
	segment_id: string | null
	created_at: string
	updated_at: string | null
	kitchens: Array<{
		kitchen_id: number
		kitchen: string | null
		delivery_notes: string | null
		selections: Array<{ template_id: string; template: string | null; template_type: string | null; repetitions: number }>
	}>
	items: AgentQuantityEstimateItem[]
	items_returned: number
	items_matched: number
	items_total: number
	items_limit: number
}

/**
 * Um anexo com cozinhas, cardápios considerados e uma página de itens. O anexo inteiro passa de
 * 50 KB com ~70 itens — mais do que cabe num turno —, então os itens vão filtrados por
 * `itemSearch`, paginados e só com as colunas que a conversa usa. A unidade é conferida pela
 * LINHA (`fetchQuantityEstimateDetails` exige `unit:1` na OM dona), nunca pelo pedido.
 */
export async function agentGetQuantityEstimate(db: SisubDb, ctx: UserContext, input: AgentGetQuantityEstimate): Promise<AgentQuantityEstimateDetail> {
	const detail = await fetchQuantityEstimateDetails(db, ctx, { quantityEstimateId: input.quantityEstimateId })
	if (!detail) throw new DomainError("NOT_FOUND", "Anexo quantitativo não encontrado")
	const limit = clampLimit(input.limit)
	const search = input.itemSearch?.trim().toLowerCase() || null
	const matched = search ? detail.items.filter((i) => i.ingredient_name.toLowerCase().includes(search)) : detail.items
	return {
		id: detail.id,
		unit_id: detail.unit_id,
		title: detail.title,
		notes: detail.notes,
		status: normalizeQuantityEstimateStatus(detail.status),
		validity_months: detail.validity_months,
		max_increase_percent: detail.max_increase_percent,
		max_quantity_justification: detail.max_quantity_justification,
		min_quote_percent: detail.min_quote_percent,
		is_budget_confidential: detail.is_budget_confidential,
		segment_id: detail.segment_id,
		created_at: detail.created_at,
		updated_at: detail.updated_at,
		kitchens: detail.kitchens.map((k) => ({
			kitchen_id: k.kitchen_id,
			kitchen: k.kitchen?.display_name ?? null,
			delivery_notes: k.delivery_notes,
			selections: k.selections.map((s) => ({
				template_id: s.template_id,
				template: s.template?.name ?? null,
				template_type: s.template?.template_type ?? null,
				repetitions: s.repetitions,
			})),
		})),
		items: matched.slice(0, limit).map((i) => ({
			id: i.id,
			ingredient_id: i.ingredient_id,
			ingredient_name: i.ingredient_name,
			measure_unit: i.measure_unit,
			estimated_quantity: i.estimated_quantity,
			purchase_quantity: i.purchase_quantity,
			purchase_measure_unit: i.purchase_measure_unit,
			unit_price: i.unit_price,
			catmat_item_codigo: i.catmat_item_codigo,
			max_increase_percent: i.max_increase_percent,
			delivery_cycle: i.delivery_cycle,
		})),
		items_returned: Math.min(matched.length, limit),
		items_matched: matched.length,
		items_total: detail.items.length,
		items_limit: limit,
	}
}
