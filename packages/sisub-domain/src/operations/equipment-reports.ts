/**
 * Agregações de relatório do parque — condição da cozinha, matriz de manutenção e frota.
 *
 * Separadas de `equipment.ts` (o que a cozinha TEM) e de `equipment-maintenance.ts` (como ela
 * ESTÁ) porque são a terceira pergunta: quanto disso existe, e onde dói. As três leem as mesmas
 * linhas; o que muda é o recorte.
 *
 * Duas decisões que valem para os três:
 *
 * - **Condição e vencimento não são colunas.** Vêm de `utils/equipment-condition.ts` e
 *   `utils/maintenance-due.ts`, as MESMAS funções que a tela usa. Recalcular a regra aqui, em
 *   SQL, criaria um segundo dialeto de "parado" e de "vencido" — e o relatório passaria a
 *   discordar da tela sem que nada quebrasse.
 * - **`today` é parâmetro.** Vencimento que lê o relógio do processo não é testável e erra na
 *   virada de fuso. Ausente, o chamador resolve para hoje — uma linha, num lugar só.
 */

import {
	equipmentModelInKitchen,
	equipmentModelRoleInKitchen,
	equipmentRoleInKitchen,
	equipmentUnitInKitchen,
	equipmentUnitRoleInKitchen,
	kitchenInKitchen,
	type SisubDb,
} from "@iefa/database/drizzle/sisub"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { requireAnyPermission, requirePermission } from "../guards/require-permission.ts"
import type { EquipmentUnitStatus, FleetEquipmentReport, KitchenEquipmentCondition, KitchenMaintenanceMatrix } from "../schemas/equipment.ts"
import type { UserContext } from "../types/context.ts"
import { deriveEquipmentCondition, EQUIPMENT_CONDITIONS, type EquipmentCondition, unitCountsForFitness } from "../utils/equipment-condition.ts"
import { resolveUnitRoleIds } from "../utils/equipment-matching.ts"
import { runQuery } from "../utils/index.ts"
import { computeMaintenanceDue, type MaintenanceDue } from "../utils/maintenance-due.ts"
import { listKitchenEquipment } from "./equipment.ts"
import type { EquipmentIssueWire, MaintenancePlanWire } from "./equipment-maintenance.ts"
import { loadApplicablePlans, loadKitchenIssues, loadKitchenLogs } from "./equipment-maintenance.ts"

/** Hoje no servidor, em ISO `YYYY-MM-DD`. Único ponto que lê o relógio nestes relatórios. */
function resolveToday(today: string | null | undefined): string {
	return today ?? new Date().toISOString().slice(0, 10)
}

const SEVERITY_WEIGHT: Record<string, number> = { inoperative: 0, degraded: 1 }

// ── 4.1 Condição da cozinha ───────────────────────────────────────────────

export interface KitchenConditionCounts {
	operational: number
	degraded: number
	down: number
	retired: number
}

export interface OpenIssueReportRow {
	issue: EquipmentIssueWire
	unit_label: string
	/** Dias corridos desde o relato. É o que ordena a fila junto da severidade. */
	days_open: number
}

export interface KitchenConditionReport {
	kitchen_id: number
	counts: KitchenConditionCounts
	/** Total de unidades cadastradas. Zero = parque não cadastrado, não parque em ordem. */
	total_units: number
	units: { id: string; label: string; model: string | null; condition: EquipmentCondition; counts_for_production: boolean }[]
	/** Panes abertas: inoperante antes de degradada, e dentro de cada uma, a mais antiga primeiro. */
	open_issues: OpenIssueReportRow[]
	/** Panes já encerradas (resolvidas ou descartadas), da mais recente para a mais antiga. */
	history: EquipmentIssueWire[]
}

export async function getKitchenEquipmentCondition(db: SisubDb, ctx: UserContext, input: KitchenEquipmentCondition): Promise<KitchenConditionReport> {
	requireAnyPermission(ctx, ["kitchen", "kitchen-production"], 1, { type: "kitchen", id: input.kitchenId })

	// `includeInactive` LIGADO: o relatório de condição existe para mostrar o que está parado.
	// Com o default, a unidade em manutenção sumiria justamente da tela que fala dela.
	const units = await listKitchenEquipment(db, ctx, { kitchenId: input.kitchenId, includeInactive: true })
	const issues = await loadKitchenIssues(db, { kitchenId: input.kitchenId, unitId: null, onlyOpen: false, limit: 500 })

	const counts: KitchenConditionCounts = { operational: 0, degraded: 0, down: 0, retired: 0 }
	for (const unit of units) counts[unit.condition] += 1

	const labelByUnit = new Map(units.map((u) => [u.id, u.label]))
	const today = Date.now()
	const open = issues.filter((i) => i.status === "open" || i.status === "in_repair")
	const openRows: OpenIssueReportRow[] = open
		.map((issue) => ({
			issue,
			unit_label: labelByUnit.get(issue.unit_id) ?? issue.unit_label,
			days_open: Math.max(0, Math.floor((today - Date.parse(issue.reported_at)) / 86_400_000)),
		}))
		// Severidade primeiro, tempo em aberto depois: uma pane inoperante de ontem importa mais
		// que uma degradada de duas semanas, e entre iguais quem está parado há mais tempo vem antes.
		.sort((a, b) => (SEVERITY_WEIGHT[a.issue.severity] ?? 9) - (SEVERITY_WEIGHT[b.issue.severity] ?? 9) || b.days_open - a.days_open)

	const history = issues
		.filter((i) => i.status === "resolved" || i.status === "dismissed")
		.sort((a, b) => Date.parse(b.resolved_at ?? b.reported_at) - Date.parse(a.resolved_at ?? a.reported_at))
		.slice(0, input.historyLimit ?? 20)

	return {
		kitchen_id: input.kitchenId,
		counts,
		total_units: units.length,
		units: units.map((u) => ({
			id: u.id,
			label: u.label,
			model: u.model != null ? [u.model.manufacturer, u.model.name].filter(Boolean).join(" ") : null,
			condition: u.condition,
			counts_for_production: unitCountsForFitness(u.condition),
		})),
		open_issues: openRows,
		history,
	}
}

// ── 4.2 Matriz de manutenção ──────────────────────────────────────────────

export interface MaintenanceMatrixCell {
	plan: MaintenancePlanWire
	due: MaintenanceDue
	/** Execução mais recente deste plano nesta unidade. */
	last_performed_on: string | null
}

export interface MaintenanceMatrixRow {
	unit_id: string
	unit_label: string
	model: string | null
	condition: EquipmentCondition
	cells: MaintenanceMatrixCell[]
}

export interface MaintenanceMatrixReport {
	kitchen_id: number
	today: string
	rows: MaintenanceMatrixRow[]
	/** Resumo da matriz inteira — é o número que vai no cabeçalho da aba. */
	totals: { ok: number; overdue: number; unknown: number }
}

export async function getKitchenMaintenanceMatrix(db: SisubDb, ctx: UserContext, input: KitchenMaintenanceMatrix): Promise<MaintenanceMatrixReport> {
	requireAnyPermission(ctx, ["kitchen", "kitchen-production"], 1, { type: "kitchen", id: input.kitchenId })
	const today = resolveToday(input.today)

	const units = await listKitchenEquipment(db, ctx, { kitchenId: input.kitchenId, includeInactive: true })
	const logs = await loadKitchenLogs(db, { kitchenId: input.kitchenId, unitId: null, planId: null, limit: 500 })

	// Execução mais recente por (unidade, plano). Log sem plano (manutenção avulsa) não ancora
	// rotina nenhuma: ancorar a rotina numa troca de lâmpada diria "em dia" sem que a rotina
	// tenha sido feita.
	const lastByUnitPlan = new Map<string, string>()
	for (const log of logs) {
		if (log.plan_id == null) continue
		const key = `${log.unit_id}|${log.plan_id}`
		const current = lastByUnitPlan.get(key)
		if (current == null || log.performed_on > current) lastByUnitPlan.set(key, log.performed_on)
	}

	const totals = { ok: 0, overdue: 0, unknown: 0 }
	const rows: MaintenanceMatrixRow[] = []
	for (const unit of units) {
		const plans = await loadApplicablePlans(db, unit.id, input.kitchenId, unit.model_id)
		const cells = plans.map((plan) => {
			const lastPerformedOn = lastByUnitPlan.get(`${unit.id}|${plan.id}`) ?? null
			const due = computeMaintenanceDue({
				intervalDays: plan.interval_days,
				toleranceDays: plan.tolerance_days ?? 0,
				lastPerformedOn,
				installedOn: unit.installed_on,
				acquiredOn: unit.acquired_on,
				today,
			})
			totals[due.state] += 1
			return { plan, due, last_performed_on: lastPerformedOn }
		})
		rows.push({
			unit_id: unit.id,
			unit_label: unit.label,
			model: unit.model != null ? [unit.model.manufacturer, unit.model.name].filter(Boolean).join(" ") : null,
			condition: unit.condition,
			cells,
		})
	}

	return { kitchen_id: input.kitchenId, today, rows, totals }
}

// ── 4.3 Frota ─────────────────────────────────────────────────────────────

export interface FleetRoleCoverage {
	role_id: string
	role_name: string
	category: string
	/** Cozinhas com ao menos uma unidade OPERANTE do papel. Pane inoperante não conta. */
	kitchens_covered: number
	/** Cozinhas que têm unidade do papel, mas nenhuma operante — o caso que dói. */
	kitchens_down: number
	/** Cozinhas com parque cadastrado e sem nenhuma unidade do papel. */
	kitchens_without: number
	units_total: number
	units_operational: number
}

export interface FleetIssueRow {
	issue_id: string
	kitchen_id: number
	kitchen_name: string
	unit_label: string
	model: string | null
	severity: string
	days_open: number
	description: string | null
}

export interface FleetModelRow {
	model_id: string
	model: string
	units: number
	kitchens: number
	down: number
}

export interface FleetEquipmentReportResult {
	today: string
	/** Cozinhas com ao menos uma unidade cadastrada — o denominador honesto da cobertura. */
	kitchens_with_park: number
	kitchens_total: number
	units_total: number
	coverage: FleetRoleCoverage[]
	/** Panes inoperantes abertas, da mais antiga para a mais nova. */
	inoperative_issues: FleetIssueRow[]
	distribution: FleetModelRow[]
}

export async function getFleetEquipmentReport(db: SisubDb, ctx: UserContext, input: FleetEquipmentReport): Promise<FleetEquipmentReportResult> {
	// Leitura de frota é análise global, não gestão de cozinha: quem enxerga o parque da FAB
	// inteira é `analytics`, e a correção do dado continua sendo de cada cozinha.
	requirePermission(ctx, "analytics", 2)
	const today = resolveToday(input.today)

	const kitchens = await runQuery("FETCH_FAILED", () =>
		db.select({ id: kitchenInKitchen.id, displayName: kitchenInKitchen.displayName }).from(kitchenInKitchen)
	)
	const kitchenName = new Map(kitchens.map((k) => [k.id, k.displayName ?? `Cozinha ${k.id}`]))

	// Denominador do parque vem de TODAS as unidades, antes do filtro: filtrar por um modelo que
	// ninguém tem zeraria `kitchens_with_park` e a tela diria "nenhuma cozinha cadastrou parque"
	// para a frota inteira, quando o que não existe é aquele modelo.
	const allUnits = await runQuery("FETCH_FAILED", () =>
		db
			.select({ id: equipmentUnitInKitchen.id, kitchenId: equipmentUnitInKitchen.kitchenId })
			.from(equipmentUnitInKitchen)
			.where(isNull(equipmentUnitInKitchen.deletedAt))
	)
	const kitchensWithPark = [...new Set(allUnits.map((u) => u.kitchenId))]

	const unitFilters = [isNull(equipmentUnitInKitchen.deletedAt)]
	if (input.kitchenId != null) unitFilters.push(eq(equipmentUnitInKitchen.kitchenId, input.kitchenId))
	if (input.modelId != null) unitFilters.push(eq(equipmentUnitInKitchen.modelId, input.modelId))
	const units = await runQuery("FETCH_FAILED", () =>
		db
			.select()
			.from(equipmentUnitInKitchen)
			.where(and(...unitFilters))
	)

	const roles = await runQuery("FETCH_FAILED", () =>
		db
			.select()
			.from(equipmentRoleInKitchen)
			.where(isNull(equipmentRoleInKitchen.deletedAt))
			.orderBy(equipmentRoleInKitchen.sortOrder, equipmentRoleInKitchen.name)
	)
	const models = await runQuery("FETCH_FAILED", () => db.select().from(equipmentModelInKitchen).where(isNull(equipmentModelInKitchen.deletedAt)))
	const modelById = new Map(models.map((m) => [m.id, m]))
	const modelRoles = await runQuery("FETCH_FAILED", () => db.select().from(equipmentModelRoleInKitchen).where(isNull(equipmentModelRoleInKitchen.deletedAt)))
	const rolesByModel = new Map<string, string[]>()
	for (const link of modelRoles) {
		const list = rolesByModel.get(link.modelId) ?? []
		list.push(link.roleId)
		rolesByModel.set(link.modelId, list)
	}

	// Panes de TODAS as cozinhas com parque — uma consulta por cozinha seria N+1 sobre a frota.
	const kitchenIdsWithPark = [...new Set(units.map((u) => u.kitchenId))]
	const issuesByKitchen = new Map<number, EquipmentIssueWire[]>()
	for (const kitchenId of kitchenIdsWithPark) {
		issuesByKitchen.set(kitchenId, await loadKitchenIssues(db, { kitchenId, unitId: null, onlyOpen: true, limit: 500 }))
	}
	const openByUnit = new Map<string, EquipmentIssueWire[]>()
	for (const list of issuesByKitchen.values()) {
		for (const issue of list) {
			if (issue.status !== "open" && issue.status !== "in_repair") continue
			const bucket = openByUnit.get(issue.unit_id) ?? []
			bucket.push(issue)
			openByUnit.set(issue.unit_id, bucket)
		}
	}

	// Papéis EFETIVOS por unidade: o catálogo do modelo mais/menos as exceções da unidade. Usar o
	// papel do modelo faria a cozinha que desabilitou a fritadeira continuar contando como coberta.
	const unitIds = units.map((u) => u.id)
	const overrides = unitIds.length
		? await runQuery("FETCH_FAILED", () =>
				db
					.select()
					.from(equipmentUnitRoleInKitchen)
					.where(and(inArray(equipmentUnitRoleInKitchen.unitId, unitIds), isNull(equipmentUnitRoleInKitchen.deletedAt)))
			)
		: []
	const overridesByUnit = new Map<string, { roleId: string; available: boolean }[]>()
	for (const row of overrides) {
		const list = overridesByUnit.get(row.unitId) ?? []
		list.push({ roleId: row.roleId, available: row.available })
		overridesByUnit.set(row.unitId, list)
	}
	const effectiveRolesByUnit = new Map<string, string[]>()
	for (const unit of units) {
		effectiveRolesByUnit.set(unit.id, resolveUnitRoleIds(rolesByModel.get(unit.modelId) ?? [], overridesByUnit.get(unit.id) ?? []))
	}

	// Condição por unidade, pela MESMA função da tela.
	const conditionByUnit = new Map<string, EquipmentCondition>()
	for (const unit of units) {
		const open = (openByUnit.get(unit.id) ?? []).map((i) => ({ severity: i.severity, status: i.status, deletedAt: i.deleted_at }))
		conditionByUnit.set(unit.id, deriveEquipmentCondition(unit.status as EquipmentUnitStatus, open))
	}

	const roleFilter = input.roleId
	const coverage: FleetRoleCoverage[] = roles
		.filter((role) => roleFilter == null || role.id === roleFilter)
		.map((role) => {
			const withRole = units.filter((u) => (effectiveRolesByUnit.get(u.id) ?? []).includes(role.id))
			const kitchensWithRole = new Set(withRole.map((u) => u.kitchenId))
			const kitchensOperational = new Set(withRole.filter((u) => unitCountsForFitness(conditionByUnit.get(u.id) ?? "operational")).map((u) => u.kitchenId))
			return {
				role_id: role.id,
				role_name: role.name,
				category: role.category,
				kitchens_covered: kitchensOperational.size,
				// Tem o equipamento e ele não serve: é a linha que o gestor precisa ver primeiro.
				kitchens_down: [...kitchensWithRole].filter((id) => !kitchensOperational.has(id)).length,
				kitchens_without: kitchensWithPark.filter((id) => !kitchensWithRole.has(id)).length,
				units_total: withRole.length,
				units_operational: withRole.filter((u) => unitCountsForFitness(conditionByUnit.get(u.id) ?? "operational")).length,
			}
		})

	const nowMs = Date.now()
	const unitById = new Map(units.map((u) => [u.id, u]))
	const inoperative: FleetIssueRow[] = []
	for (const [unitId, list] of openByUnit) {
		const unit = unitById.get(unitId)
		if (!unit) continue
		for (const issue of list) {
			if (issue.severity !== "inoperative") continue
			const model = modelById.get(unit.modelId)
			inoperative.push({
				issue_id: issue.id,
				kitchen_id: unit.kitchenId,
				kitchen_name: kitchenName.get(unit.kitchenId) ?? `Cozinha ${unit.kitchenId}`,
				unit_label: unit.label,
				model: model != null ? [model.manufacturer, model.name].filter(Boolean).join(" ") : null,
				severity: issue.severity,
				days_open: Math.max(0, Math.floor((nowMs - Date.parse(issue.reported_at)) / 86_400_000)),
				description: issue.description,
			})
		}
	}
	inoperative.sort((a, b) => b.days_open - a.days_open)

	const distribution: FleetModelRow[] = [...new Map(units.map((u) => [u.modelId, u.modelId])).keys()]
		.map((modelId) => {
			const rows = units.filter((u) => u.modelId === modelId)
			const model = modelById.get(modelId)
			return {
				model_id: modelId,
				model: model != null ? [model.manufacturer, model.name].filter(Boolean).join(" ") : "Modelo desconhecido",
				units: rows.length,
				kitchens: new Set(rows.map((u) => u.kitchenId)).size,
				down: rows.filter((u) => !unitCountsForFitness(conditionByUnit.get(u.id) ?? "operational")).length,
			}
		})
		.sort((a, b) => b.units - a.units)

	return {
		today,
		kitchens_with_park: kitchensWithPark.length,
		kitchens_total: kitchens.length,
		units_total: units.length,
		coverage,
		inoperative_issues: inoperative,
		distribution,
	}
}

/** Contagem por condição a partir de uma lista já carregada — usada pela tela e pelos testes. */
export function countByCondition(conditions: readonly EquipmentCondition[]): KitchenConditionCounts {
	const counts: KitchenConditionCounts = { operational: 0, degraded: 0, down: 0, retired: 0 }
	for (const condition of conditions) {
		if (EQUIPMENT_CONDITIONS.includes(condition)) counts[condition] += 1
	}
	return counts
}
