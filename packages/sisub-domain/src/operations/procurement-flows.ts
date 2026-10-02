/**
 * Status dos fluxos guiados do planejamento da contratação (change
 * `sisub-procurement-planning-flows`, D1/D2). Cada fluxo lê, numa chamada, o estado dos dados
 * de que suas etapas dependem; o app transforma isso em etapas e pendências (`src/lib/flows`).
 * Nada aqui é marcado à mão: o status sai dos dados a cada leitura.
 *
 * - Gestão Unidade → "Planejar contratação" (`fetchProcurementPlanningStatus`, `unit:1`).
 * - Gestão Cozinha → "Prever demanda para compra" (`fetchDemandForecastStatus`, `kitchen:1` ou
 *   `unit:1` na OM dela). A cozinha vê o calendário das contratações da OM dela (só nome e mês):
 *   é o que torna a pendência visível sem notificação.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { sql } from "drizzle-orm"
import { kitchenUnitIds, requireKitchenOrItsUnit } from "../guards/kitchen-unit.ts"
import { requireUnit } from "../guards/require-permission.ts"
import type { UserContext } from "../types/context.ts"
import { getBrasiliaToday } from "../utils/civil-date.ts"
import { runQuery } from "../utils/index.ts"
import { PRICE_MATCH_ABSOLUTE, PRICE_MATCH_RELATIVE } from "./price-units.ts"
import { type CalendarCycle, computeContractingCycle } from "./procurement-calendar.ts"
import { PRICE_RESEARCH_VALIDITY_DAYS } from "./quantity-estimate.ts"
import { summarizeSegmentation } from "./segments.ts"

export interface KitchenPlanningState {
	id: number
	name: string
	weeklyWithItems: number
	events: number
	supportMenus: number
	forecast: { id: string; title: string; status: string; updatedAt: string | null; reviewedAt: string | null; imports: number } | null
}

export interface SegmentCalendarEntry {
	segmentId: string
	name: string
	plannedMonth: number | null
	cycle: CalendarCycle | null
	lastAnnex: { id: string; title: string; status: string; wizardStep: number | null; updatedAt: string | null } | null
}

export interface AnnexPricingState {
	quantityEstimateId: string
	title: string
	status: string
	segmentName: string | null
	items: number
	withoutPrice: number
	withoutResearch: number
	oldResearch: number
}

export interface ProcurementPlanningStatus {
	unitId: number
	today: string
	kitchens: KitchenPlanningState[]
	segmentation: { segmentCount: number; lineCount: number; unassignedCount: number; conflictCount: number }
	calendar: SegmentCalendarEntry[]
	drafts: Array<{ id: string; title: string; wizardStep: number | null; segmentName: string | null; updatedAt: string | null }>
	pricing: AnnexPricingState[]
}

type Row = Record<string, unknown>
const num = (value: unknown): number => (value == null ? 0 : Number(value))
const str = (value: unknown): string | null => (value == null ? null : String(value))

async function loadKitchenStates(db: SisubDb, where: ReturnType<typeof sql>): Promise<KitchenPlanningState[]> {
	const rows = (await runQuery(
		"QUERY_FAILED",
		() =>
			db.execute(sql`
				select
					k.id,
					coalesce(k.display_name, 'Cozinha ' || k.id) as name,
					(select count(*) from kitchen.menu_template t
						where t.kitchen_id = k.id and t.deleted_at is null and coalesce(t.template_type, 'weekly') = 'weekly'
							and exists (select 1 from kitchen.menu_template_items ti where ti.menu_template_id = t.id)) as weekly_with_items,
					(select count(*) from kitchen.menu_template t where t.kitchen_id = k.id and t.deleted_at is null and t.template_type = 'event') as events,
					(select count(*) from kitchen.menu_template t where t.kitchen_id = k.id and t.deleted_at is null and t.template_type = 'apoio') as support_menus,
					d.id as forecast_id, d.title as forecast_title, d.status as forecast_status,
					d.updated_at as forecast_updated_at, d.reviewed_at as forecast_reviewed_at,
					(select count(*) from procurement.kitchen_demand_forecast_import i where i.forecast_id = d.id) as forecast_imports
				from kitchen.kitchen k
				left join lateral (
					select * from procurement.kitchen_demand_forecast d
					where d.kitchen_id = k.id and d.status in ('sent', 'reviewed')
					order by d.created_at desc
					limit 1
				) d on true
				where ${where}
				order by name
			`),
		{ prefix: "Erro ao ler as cozinhas" }
	)) as unknown as Row[]
	return rows.map((r) => ({
		id: num(r.id),
		name: String(r.name),
		weeklyWithItems: num(r.weekly_with_items),
		events: num(r.events),
		supportMenus: num(r.support_menus),
		forecast: r.forecast_id
			? {
					id: String(r.forecast_id),
					title: String(r.forecast_title),
					status: String(r.forecast_status),
					updatedAt: str(r.forecast_updated_at),
					reviewedAt: str(r.forecast_reviewed_at),
					imports: num(r.forecast_imports),
				}
			: null,
	}))
}

async function loadCalendar(db: SisubDb, unitIds: readonly number[], today: string): Promise<SegmentCalendarEntry[]> {
	if (unitIds.length === 0) return []
	const rows = (await runQuery(
		"QUERY_FAILED",
		() =>
			db.execute(sql`
				select
					s.id, s.name, s.planned_month, s.lead_time_months,
					-- Conclusão = quando o snapshot foi congelado (a saída do rascunho), em data civil de
					-- Brasília. updated_at não serve: arquivar um anexo antigo o carimbaria de novo e
					-- encerraria o ciclo corrente sem anexo novo.
					(select coalesce(json_agg(to_char(
							(coalesce((select min(ss.created_at) from procurement.quantity_estimate_snapshot_selection ss where ss.quantity_estimate_id = l.id), l.updated_at)
								at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD')), '[]'::json)
						from procurement.quantity_estimate l
						where l.segment_id = s.id and l.deleted_at is null and l.status in ('completed', 'archived')) as concluded_at,
					la.id as annex_id, la.title as annex_title, la.status as annex_status, la.wizard_step as annex_step, la.updated_at as annex_updated_at
				from procurement.segment s
				left join lateral (
					select * from procurement.quantity_estimate l
					where l.segment_id = s.id and l.deleted_at is null
					order by l.updated_at desc nulls last, l.created_at desc
					limit 1
				) la on true
				where s.unit_id in (${sql.join(
					unitIds.map((id) => sql`${id}`),
					sql`, `
				)}) and s.deleted_at is null
				order by s.planned_month nulls last, s.name
			`),
		{ prefix: "Erro ao ler o calendário de contratação" }
	)) as unknown as Row[]
	return rows.map((r) => {
		const concluded = (Array.isArray(r.concluded_at) ? r.concluded_at : JSON.parse(String(r.concluded_at ?? "[]"))) as string[]
		return {
			segmentId: String(r.id),
			name: String(r.name),
			plannedMonth: r.planned_month == null ? null : num(r.planned_month),
			cycle: computeContractingCycle(r.planned_month == null ? null : num(r.planned_month), num(r.lead_time_months), today, concluded),
			lastAnnex: r.annex_id
				? {
						id: String(r.annex_id),
						title: String(r.annex_title),
						status: String(r.annex_status),
						wizardStep: r.annex_step == null ? null : num(r.annex_step),
						updatedAt: str(r.annex_updated_at),
					}
				: null,
		}
	})
}

export async function fetchProcurementPlanningStatus(db: SisubDb, ctx: UserContext, input: { unitId: number }): Promise<ProcurementPlanningStatus> {
	requireUnit(ctx, 1, input.unitId)
	const today = getBrasiliaToday()
	const unitId = input.unitId

	const [kitchens, overview, calendar, drafts, pricing] = await Promise.all([
		loadKitchenStates(db, sql`(k.unit_id = ${unitId} or k.purchase_unit_id = ${unitId})`),
		summarizeSegmentation(db, unitId),
		loadCalendar(db, [unitId], today),
		runQuery(
			"QUERY_FAILED",
			() =>
				db.execute(sql`
					select l.id, l.title, l.wizard_step, l.updated_at, s.name as segment_name
					from procurement.quantity_estimate l
					left join procurement.segment s on s.id = l.segment_id
					where l.unit_id = ${unitId} and l.deleted_at is null and l.status = 'draft'
					order by l.updated_at desc nulls last
					limit 10
				`),
			{ prefix: "Erro ao ler os anexos em andamento" }
		) as unknown as Promise<Row[]>,
		runQuery(
			"QUERY_FAILED",
			() =>
				db.execute(sql`
					select
						l.id, l.title, l.status, s.name as segment_name,
						count(i.id) as items,
						count(i.id) filter (where i.unit_price is null) as without_price,
						count(i.id) filter (
							where i.unit_price is not null and not exists (
								select 1 from procurement.price_research_item r
								where r.quantity_estimate_item_id = i.id and r.reference_price is not null
									-- Mesma tolerância de isSamePrice (price-units.ts).
									and abs(r.reference_price - i.unit_price) <= greatest(${PRICE_MATCH_ABSOLUTE}, abs(i.unit_price) * ${PRICE_MATCH_RELATIVE})
							)
						) as without_research,
						count(i.id) filter (
							where (select max(r.created_at) from procurement.price_research_item r where r.quantity_estimate_item_id = i.id)
								< now() - make_interval(days => ${PRICE_RESEARCH_VALIDITY_DAYS})
						) as old_research
					from procurement.quantity_estimate l
					left join procurement.segment s on s.id = l.segment_id
					left join procurement.quantity_estimate_item i on i.quantity_estimate_id = l.id
					where l.unit_id = ${unitId} and l.deleted_at is null and l.status in ('draft', 'completed') and l.wizard_step is null
					group by l.id, l.title, l.status, s.name, l.updated_at
					order by l.updated_at desc nulls last
					limit 6
				`),
			{ prefix: "Erro ao ler a pesquisa de preços dos anexos" }
		) as unknown as Promise<Row[]>,
	])

	return {
		unitId,
		today,
		kitchens,
		segmentation: overview,
		calendar,
		drafts: drafts.map((r) => ({
			id: String(r.id),
			title: String(r.title),
			wizardStep: r.wizard_step == null ? null : num(r.wizard_step),
			segmentName: str(r.segment_name),
			updatedAt: str(r.updated_at),
		})),
		pricing: pricing.map((r) => ({
			quantityEstimateId: String(r.id),
			title: String(r.title),
			status: String(r.status),
			segmentName: str(r.segment_name),
			items: num(r.items),
			withoutPrice: num(r.without_price),
			withoutResearch: num(r.without_research),
			oldResearch: num(r.old_research),
		})),
	}
}

export interface DemandForecastStatus {
	kitchenId: number
	kitchenName: string
	today: string
	weeklyWithItems: number
	weeklyEmpty: number
	events: number
	supportMenus: number
	supportMenusWithoutOccurrences: number
	/**
	 * Cardápios da cozinha com preparação sem efetivo (nem pax, nem efetivo da refeição): a unidade
	 * não tem por que número multiplicar, e a preparação fica fora do quantitativo.
	 */
	menusWithoutHeadcount: string[]
	/** Insumos dos cardápios da cozinha sem item de compra: a unidade não consegue comprá-los. */
	ingredientsWithoutPurchaseItem: number
	pendingForecasts: number
	forecast: {
		id: string
		title: string
		status: string
		updatedAt: string | null
		reviewedAt: string | null
		imports: Array<{ title: string; importedAt: string }>
	} | null
	/** Contratações da OM da cozinha (onde ela está e quem compra por ela): só nome, mês e ciclo. */
	unitCalendar: Array<{ name: string; plannedMonth: number | null; cycle: CalendarCycle | null }>
}

export async function fetchDemandForecastStatus(db: SisubDb, ctx: UserContext, input: { kitchenId: number }): Promise<DemandForecastStatus> {
	await requireKitchenOrItsUnit(db, ctx, 1, input.kitchenId)
	const today = getBrasiliaToday()
	const kitchenId = input.kitchenId

	const [summaryRows, forecastRows] = await Promise.all([
		runQuery(
			"QUERY_FAILED",
			() =>
				db.execute(sql`
					select
						coalesce(k.display_name, 'Cozinha ' || k.id) as name, k.unit_id, k.purchase_unit_id,
						(select count(*) from kitchen.menu_template t
							where t.kitchen_id = k.id and t.deleted_at is null and coalesce(t.template_type, 'weekly') = 'weekly'
								and exists (select 1 from kitchen.menu_template_items ti where ti.menu_template_id = t.id)) as weekly_with_items,
						(select count(*) from kitchen.menu_template t
							where t.kitchen_id = k.id and t.deleted_at is null and coalesce(t.template_type, 'weekly') = 'weekly'
								and not exists (select 1 from kitchen.menu_template_items ti where ti.menu_template_id = t.id)) as weekly_empty,
						(select count(*) from kitchen.menu_template t where t.kitchen_id = k.id and t.deleted_at is null and t.template_type = 'event') as events,
						(select count(*) from kitchen.menu_template t where t.kitchen_id = k.id and t.deleted_at is null and t.template_type = 'apoio') as support_menus,
						(select count(*) from kitchen.menu_template t
							where t.kitchen_id = k.id and t.deleted_at is null and t.template_type = 'apoio'
								and coalesce(t.expected_monthly_occurrences, 0) = 0) as support_menus_without_occurrences,
						(select coalesce(json_agg(t.name order by t.name), '[]'::json)
							from kitchen.menu_template t
							-- Padrão de lanche fica de fora: os kits vêm do pedido, não do cardápio.
							where t.kitchen_id = k.id and t.deleted_at is null and t.snack_family is null
								and exists (
									select 1 from kitchen.menu_template_items ti
									left join kitchen.menu_template_event_meal em on em.id = ti.event_meal_id
									where ti.menu_template_id = t.id and ti.recipe_id is not null and ti.headcount_override is null
										and case
											when ti.event_meal_id is not null then em.base_headcount is null
											else not exists (
												select 1 from kitchen.menu_template_meal m
												where m.menu_template_id = t.id and m.day_of_week = ti.day_of_week
													and m.meal_type_id = ti.meal_type_id and m.base_headcount is not null
											)
										end
								)) as menus_without_headcount,
						(select count(distinct ri.ingredient_id)
							from kitchen.menu_template t
							join kitchen.menu_template_items ti on ti.menu_template_id = t.id
							join kitchen.recipe_ingredients ri on ri.recipe_id = ti.recipe_id and ri.deleted_at is null
							where t.kitchen_id = k.id and t.deleted_at is null
								and not exists (
									select 1 from procurement.purchase_item_ingredient pii
									join procurement.purchase_item pi on pi.id = pii.purchase_item_id and pi.deleted_at is null
									where pii.ingredient_id = ri.ingredient_id and pii.is_default
								)) as ingredients_without_purchase_item,
						(select count(*) from procurement.kitchen_demand_forecast d where d.kitchen_id = k.id and d.status = 'pending') as pending_forecasts
					from kitchen.kitchen k
					where k.id = ${kitchenId}
				`),
			{ prefix: "Erro ao ler a cozinha" }
		) as unknown as Promise<Row[]>,
		runQuery(
			"QUERY_FAILED",
			() =>
				db.execute(sql`
					select d.id, d.title, d.status, d.updated_at, d.reviewed_at,
						(select coalesce(json_agg(json_build_object('title', l.title, 'importedAt', i.imported_at) order by i.imported_at), '[]'::json)
							from procurement.kitchen_demand_forecast_import i
							join procurement.quantity_estimate l on l.id = i.quantity_estimate_id
							where i.forecast_id = d.id) as imports
					from procurement.kitchen_demand_forecast d
					where d.kitchen_id = ${kitchenId} and d.status in ('sent', 'reviewed')
					order by d.created_at desc
					limit 1
				`),
			{ prefix: "Erro ao ler a previsão de demanda" }
		) as unknown as Promise<Row[]>,
	])

	const summary = summaryRows[0] ?? {}
	const unitIds = kitchenUnitIds({
		id: kitchenId,
		unitId: summary.unit_id == null ? null : Number(summary.unit_id),
		purchaseUnitId: summary.purchase_unit_id == null ? null : Number(summary.purchase_unit_id),
	})
	const calendar = await loadCalendar(db, unitIds, today)
	const forecast = forecastRows[0]

	return {
		kitchenId,
		kitchenName: String(summary.name ?? `Cozinha ${kitchenId}`),
		today,
		weeklyWithItems: num(summary.weekly_with_items),
		weeklyEmpty: num(summary.weekly_empty),
		events: num(summary.events),
		supportMenus: num(summary.support_menus),
		supportMenusWithoutOccurrences: num(summary.support_menus_without_occurrences),
		menusWithoutHeadcount: Array.isArray(summary.menus_without_headcount) ? summary.menus_without_headcount.map(String) : [],
		ingredientsWithoutPurchaseItem: num(summary.ingredients_without_purchase_item),
		pendingForecasts: num(summary.pending_forecasts),
		forecast: forecast
			? {
					id: String(forecast.id),
					title: String(forecast.title),
					status: String(forecast.status),
					updatedAt: str(forecast.updated_at),
					reviewedAt: str(forecast.reviewed_at),
					imports: (Array.isArray(forecast.imports) ? forecast.imports : JSON.parse(String(forecast.imports ?? "[]"))) as Array<{
						title: string
						importedAt: string
					}>,
				}
			: null,
		unitCalendar: calendar.map((c) => ({ name: c.name, plannedMonth: c.plannedMonth, cycle: c.cycle })),
	}
}
