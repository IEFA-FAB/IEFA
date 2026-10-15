/**
 * Operations do ESTADO do parque: pane relatada e rotina de manutenção.
 *
 * Separado de `equipment.ts` (catálogo, parque e exigência da preparação) porque são perguntas
 * diferentes sobre as mesmas linhas: lá é "o que a cozinha tem", aqui é "como está". A única
 * coisa que atravessa é a condição derivada, que mora em `utils/equipment-condition.ts` e é
 * consumida pelos dois lados — o filtro do parque e a tela leem a MESMA função.
 *
 * Autorização (regra R5 do change `sisub-equipment-condition-maintenance`):
 *   - relatar pane, registrar execução e cadastrar unidade → `kitchen:2` OU
 *     `kitchen-production:1` (guard `requireKitchenFloorWrite`);
 *   - resolver/descartar pane, mudar status, editar/excluir → `kitchen:2`;
 *   - plano GLOBAL (`kitchen_id` null) → `global:2`; plano de cozinha → `kitchen:2` dela.
 *
 * O dono sai sempre da LINHA PERSISTIDA (unidade → cozinha), nunca do input.
 */

import {
	equipmentIssueInKitchen,
	equipmentMaintenanceLogInKitchen,
	equipmentMaintenancePlanInKitchen,
	equipmentModelRoleInKitchen,
	equipmentUnitInKitchen,
	equipmentUnitRoleInKitchen,
	type SisubDb,
} from "@iefa/database/drizzle/sisub"
import type { EquipmentIssue, EquipmentMaintenanceLog, EquipmentMaintenancePlan } from "@iefa/database/sisub"
import { and, asc, desc, eq, inArray, isNotNull, isNull, max, or, type SQL, sql } from "drizzle-orm"
import { requireAnyPermission, requireKitchen, requireKitchenFloorWrite, requirePermission } from "../guards/require-permission.ts"
import type {
	CreateMaintenancePlan,
	DeleteMaintenancePlan,
	EquipmentIssueCategory,
	EquipmentIssueSeverity,
	EquipmentIssueStatus,
	ListApplicablePlans,
	ListEquipmentIssues,
	ListMaintenanceLogs,
	ListMaintenancePlans,
	LogMaintenance,
	MaintenanceKind,
	MaintenanceLogKind,
	MaintenanceProvider,
	ReportEquipmentIssue,
	UpdateEquipmentIssue,
	UpdateMaintenancePlan,
} from "../schemas/equipment.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError } from "../types/errors.ts"
import { CLOSED_ISSUE_STATUSES, OPEN_ISSUE_STATUSES } from "../utils/equipment-condition.ts"
import { resolveUnitRoleIds } from "../utils/equipment-matching.ts"
import { insertOneOrFail, mutateOrFail, runQuery, toNumeric, toWire } from "../utils/index.ts"

// ── Contrato de retorno ───────────────────────────────────────────────────

/**
 * As colunas de enum são `text` com CHECK no banco, então o tipo gerado é `string`. O wire
 * estreita para a união do domínio: sem isso toda tela e todo relatório receberia `string` e
 * teria de reafirmar o conjunto de valores por conta própria — que é como duas listas de
 * severidade nascem.
 */
type EquipmentIssueRow = Omit<EquipmentIssue, "severity" | "status" | "category"> & {
	severity: EquipmentIssueSeverity
	status: EquipmentIssueStatus
	category: EquipmentIssueCategory
}

export type EquipmentIssueWire = EquipmentIssueRow & {
	/** A pane não tem `kitchen_id` — ele vem da unidade por join (ver comentário da tabela). */
	kitchen_id: number
	unit_label: string
}

export type MaintenancePlanWire = Omit<EquipmentMaintenancePlan, "kind"> & { kind: MaintenanceKind }

type MaintenanceLogRow = Omit<EquipmentMaintenanceLog, "kind" | "provider"> & { kind: MaintenanceLogKind; provider: MaintenanceProvider }

export type MaintenanceLogWire = MaintenanceLogRow & { unit_label: string; kitchen_id: number }

const LOG_NUMERIC_KEYS = new Set(["cost"])

// ── Resolução de dono ─────────────────────────────────────────────────────

/** Cozinha dona da unidade, lida do banco. Base de toda autorização deste arquivo. */
async function resolveUnitKitchen(db: SisubDb, unitId: string): Promise<{ kitchenId: number; label: string; modelId: string }> {
	const [unit] = await runQuery("FETCH_FAILED", () =>
		db
			.select({ kitchenId: equipmentUnitInKitchen.kitchenId, label: equipmentUnitInKitchen.label, modelId: equipmentUnitInKitchen.modelId })
			.from(equipmentUnitInKitchen)
			.where(and(eq(equipmentUnitInKitchen.id, unitId), isNull(equipmentUnitInKitchen.deletedAt)))
	)
	if (!unit) throw new NotFoundError("equipment_unit", unitId)
	return unit
}

async function resolveIssueUnit(db: SisubDb, issueId: string): Promise<{ issue: typeof equipmentIssueInKitchen.$inferSelect; kitchenId: number }> {
	const [issue] = await runQuery("FETCH_FAILED", () =>
		db
			.select()
			.from(equipmentIssueInKitchen)
			.where(and(eq(equipmentIssueInKitchen.id, issueId), isNull(equipmentIssueInKitchen.deletedAt)))
	)
	if (!issue) throw new NotFoundError("equipment_issue", issueId)
	const { kitchenId } = await resolveUnitKitchen(db, issue.unitId)
	return { issue, kitchenId }
}

// ── Pane ──────────────────────────────────────────────────────────────────

/** Hidrata a pane com o rótulo da unidade e a cozinha — o que as três telas precisam mostrar. */
function toIssueWire(issue: typeof equipmentIssueInKitchen.$inferSelect, unit: { label: string; kitchenId: number }): EquipmentIssueWire {
	return { ...toWire<EquipmentIssueRow>(issue), kitchen_id: unit.kitchenId, unit_label: unit.label }
}

export async function listEquipmentIssues(db: SisubDb, ctx: UserContext, input: ListEquipmentIssues): Promise<EquipmentIssueWire[]> {
	requireAnyPermission(ctx, ["kitchen", "kitchen-production"], 1, { type: "kitchen", id: input.kitchenId })
	return loadKitchenIssues(db, input)
}

/**
 * Panes para a tela, SEM guard (quem chama já autorizou a cozinha). As ABERTAS vêm todas: o
 * `limit` do cliente só corta as encerradas, senão a pane aberta antiga sumiria justamente de uma
 * cozinha com histórico longo. Do relato mais recente ao mais antigo.
 */
export async function loadKitchenIssues(db: SisubDb, input: ListEquipmentIssues): Promise<EquipmentIssueWire[]> {
	const scope = { kitchenIds: [input.kitchenId], unitIds: input.unitId != null ? [input.unitId] : null }
	if (input.onlyOpen) return loadIssues(db, { ...scope, status: "open" })
	const [open, closed] = await Promise.all([loadIssues(db, { ...scope, status: "open" }), loadIssues(db, { ...scope, status: "closed", limit: input.limit })])
	return [...open, ...closed].sort((a, b) => Date.parse(b.reported_at) - Date.parse(a.reported_at) || b.id.localeCompare(a.id))
}

/**
 * Panes ABERTAS (`open`/`in_repair`) das unidades vivas das cozinhas, SEM teto e sem guard. É o
 * insumo da condição derivada: uma pane aberta que ficasse de fora de um `limit` faria a unidade
 * parada aparecer operante. Uma consulta só cobre várias cozinhas (a frota inteira, no relatório);
 * `unitIds` recorta às unidades pedidas.
 */
export async function loadOpenIssues(db: SisubDb, input: { kitchenIds: readonly number[]; unitIds?: readonly string[] | null }): Promise<EquipmentIssueWire[]> {
	return loadIssues(db, { ...input, status: "open" })
}

/** Panes encerradas (resolvidas ou descartadas) da cozinha, da mais recente para a mais antiga, até `limit`. */
export async function loadClosedIssues(db: SisubDb, input: { kitchenId: number; limit: number }): Promise<EquipmentIssueWire[]> {
	return loadIssues(db, { kitchenIds: [input.kitchenId], status: "closed", limit: input.limit })
}

/**
 * A leitura única de pane: unidade viva da cozinha, pane não apagada, hidratada com rótulo e
 * cozinha. Abertas ordenadas pelo relato; encerradas pelo encerramento (ou relato, sem data de
 * encerramento). O `id` desempata, para o corte do `limit` não mudar entre requisições.
 */
async function loadIssues(
	db: SisubDb,
	input: { kitchenIds: readonly number[]; unitIds?: readonly string[] | null; status: "open" | "closed"; limit?: number }
): Promise<EquipmentIssueWire[]> {
	if (input.kitchenIds.length === 0 || input.unitIds?.length === 0) return []
	const isOpen = input.status === "open"
	const filters: SQL[] = [
		inArray(equipmentUnitInKitchen.kitchenId, [...input.kitchenIds]),
		isNull(equipmentUnitInKitchen.deletedAt),
		isNull(equipmentIssueInKitchen.deletedAt),
		inArray(equipmentIssueInKitchen.status, isOpen ? [...OPEN_ISSUE_STATUSES] : [...CLOSED_ISSUE_STATUSES]),
	]
	if (input.unitIds != null) filters.push(inArray(equipmentIssueInKitchen.unitId, [...input.unitIds]))
	const recency = isOpen
		? desc(equipmentIssueInKitchen.reportedAt)
		: desc(sql`coalesce(${equipmentIssueInKitchen.resolvedAt}, ${equipmentIssueInKitchen.reportedAt})`)
	const query = db
		.select({ issue: equipmentIssueInKitchen, label: equipmentUnitInKitchen.label, kitchenId: equipmentUnitInKitchen.kitchenId })
		.from(equipmentIssueInKitchen)
		.innerJoin(equipmentUnitInKitchen, eq(equipmentUnitInKitchen.id, equipmentIssueInKitchen.unitId))
		.where(and(...filters))
		.orderBy(recency, desc(equipmentIssueInKitchen.id))
	const rows = await runQuery("FETCH_FAILED", () => (input.limit != null ? query.limit(input.limit) : query))
	return rows.map((r) => toIssueWire(r.issue, { label: r.label, kitchenId: r.kitchenId }))
}

export async function reportEquipmentIssue(db: SisubDb, ctx: UserContext, input: ReportEquipmentIssue): Promise<EquipmentIssueWire> {
	const unit = await resolveUnitKitchen(db, input.unitId)
	requireKitchenFloorWrite(ctx, unit.kitchenId)

	const row = await insertOneOrFail("INSERT_FAILED", "no row returned", () =>
		db
			.insert(equipmentIssueInKitchen)
			.values({
				unitId: input.unitId,
				severity: input.severity,
				category: input.category,
				description: input.description,
				reportedBy: ctx.userId,
			})
			.returning()
	)
	return toIssueWire(row, unit)
}

const CLOSED_STATUSES = new Set(["resolved", "dismissed"])

/**
 * Transição de pane. Só `kitchen:2` — resolver e principalmente DESCARTAR são decisões de
 * gestão: descartar devolve ao planejamento um equipamento que a praça declarou quebrado.
 *
 * Encerrar grava autor e data (o CHECK `equipment_issue_closure_check` recusa encerramento sem
 * `resolved_at`); reabrir limpa os dois, senão a pane reaberta carregaria um desfecho que não
 * aconteceu. A linha NUNCA é apagada.
 */
export async function updateEquipmentIssue(db: SisubDb, ctx: UserContext, input: UpdateEquipmentIssue): Promise<EquipmentIssueWire> {
	const { issue, kitchenId } = await resolveIssueUnit(db, input.issueId)
	requireKitchen(ctx, 2, kitchenId)

	const nextStatus = input.status ?? issue.status
	const closing = CLOSED_STATUSES.has(nextStatus)
	if (closing && input.resolutionNote == null && issue.resolutionNote == null && nextStatus === "dismissed") {
		throw new DomainError("VALIDATION_FAILED", "descartar uma pane exige justificativa")
	}

	const now = new Date().toISOString()
	const patch: Record<string, unknown> = { updatedAt: now }
	if (input.status != null) patch.status = input.status
	if (input.severity != null) patch.severity = input.severity
	if (input.resolutionNote !== undefined) patch.resolutionNote = input.resolutionNote ?? null
	patch.resolvedAt = closing ? (issue.resolvedAt ?? now) : null
	patch.resolvedBy = closing ? (issue.resolvedBy ?? ctx.userId) : null

	const [row] = await mutateOrFail("UPDATE_FAILED", "pane não encontrada", () =>
		db
			.update(equipmentIssueInKitchen)
			.set(patch)
			.where(and(eq(equipmentIssueInKitchen.id, input.issueId), isNull(equipmentIssueInKitchen.deletedAt)))
			.returning()
	)
	const unit = await resolveUnitKitchen(db, issue.unitId)
	return toIssueWire(row as typeof equipmentIssueInKitchen.$inferSelect, unit)
}

// ── Plano de manutenção ───────────────────────────────────────────────────

/** Leitura do catálogo de rotinas: qualquer módulo que monta ou executa preparação. */
const PLAN_READ_MODULES = ["kitchen", "kitchen-production", "global"] as const

function requirePlanRead(ctx: UserContext): void {
	requireAnyPermission(ctx, PLAN_READ_MODULES, 1)
}

/** Escrita do plano: `global:2` quando é global, `kitchen:2` quando é da cozinha. */
function requirePlanWrite(ctx: UserContext, kitchenId: number | null): void {
	if (kitchenId == null) requirePermission(ctx, "global", 2)
	else requireKitchen(ctx, 2, kitchenId)
}

export async function listMaintenancePlans(db: SisubDb, ctx: UserContext, input: ListMaintenancePlans): Promise<MaintenancePlanWire[]> {
	requirePlanRead(ctx)
	// O plano global é de todos; o plano que uma cozinha cadastrou é dela. Sem este gate,
	// `kitchenId` no input enumerava as rotinas de qualquer cozinha (mesmo critério de
	// `listEquipmentModels`).
	if (input.kitchenId != null) requireAnyPermission(ctx, PLAN_READ_MODULES, 1, { type: "kitchen", id: input.kitchenId })
	const scope =
		input.kitchenId != null
			? or(isNull(equipmentMaintenancePlanInKitchen.kitchenId), eq(equipmentMaintenancePlanInKitchen.kitchenId, input.kitchenId))
			: isNull(equipmentMaintenancePlanInKitchen.kitchenId)

	const filters: SQL[] = [isNull(equipmentMaintenancePlanInKitchen.deletedAt)]
	if (scope) filters.push(scope)
	if (input.roleId != null) filters.push(eq(equipmentMaintenancePlanInKitchen.roleId, input.roleId))
	if (input.modelId != null) filters.push(eq(equipmentMaintenancePlanInKitchen.modelId, input.modelId))

	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select()
			.from(equipmentMaintenancePlanInKitchen)
			.where(and(...filters))
			.orderBy(asc(equipmentMaintenancePlanInKitchen.sortOrder), asc(equipmentMaintenancePlanInKitchen.title))
			.limit(input.limit)
	)
	return rows.map((r) => toWire<MaintenancePlanWire>(r))
}

/**
 * Planos aplicáveis a UMA unidade.
 *
 * Resolvidos pelos papéis EFETIVOS (modelo ∪ adições da unidade − remoções), não pelos papéis
 * que o catálogo do fabricante declara: a unidade que teve a fritadeira desabilitada em
 * `equipment_unit_role` não deve herdar a rotina de troca de óleo, senão o relatório cobra da
 * cozinha uma manutenção de um recurso que ela não tem.
 */
export async function listApplicablePlans(db: SisubDb, ctx: UserContext, input: ListApplicablePlans): Promise<MaintenancePlanWire[]> {
	const unit = await resolveUnitKitchen(db, input.unitId)
	requireAnyPermission(ctx, ["kitchen", "kitchen-production"], 1, { type: "kitchen", id: unit.kitchenId })
	return loadApplicablePlans(db, input.unitId, unit.kitchenId, unit.modelId)
}

/** Sem guard — para o chamador que já autorizou a cozinha (matriz de manutenção, relatórios). */
export async function loadApplicablePlans(db: SisubDb, unitId: string, kitchenId: number, modelId: string): Promise<MaintenancePlanWire[]> {
	const modelRoles = await runQuery("FETCH_FAILED", () =>
		db
			.select({ roleId: equipmentModelRoleInKitchen.roleId })
			.from(equipmentModelRoleInKitchen)
			.where(and(eq(equipmentModelRoleInKitchen.modelId, modelId), isNull(equipmentModelRoleInKitchen.deletedAt)))
	)
	const overrides = await runQuery("FETCH_FAILED", () =>
		db
			.select({ roleId: equipmentUnitRoleInKitchen.roleId, available: equipmentUnitRoleInKitchen.available })
			.from(equipmentUnitRoleInKitchen)
			.where(and(eq(equipmentUnitRoleInKitchen.unitId, unitId), isNull(equipmentUnitRoleInKitchen.deletedAt)))
	)
	const roleIds = resolveUnitRoleIds(
		modelRoles.map((r) => r.roleId),
		overrides
	)

	const targets: SQL[] = [eq(equipmentMaintenancePlanInKitchen.modelId, modelId)]
	if (roleIds.length > 0) targets.push(inArray(equipmentMaintenancePlanInKitchen.roleId, roleIds))
	const target = or(...targets)

	const filters: SQL[] = [isNull(equipmentMaintenancePlanInKitchen.deletedAt)]
	const scope = or(isNull(equipmentMaintenancePlanInKitchen.kitchenId), eq(equipmentMaintenancePlanInKitchen.kitchenId, kitchenId))
	if (scope) filters.push(scope)
	if (target) filters.push(target)

	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select()
			.from(equipmentMaintenancePlanInKitchen)
			.where(and(...filters))
			.orderBy(asc(equipmentMaintenancePlanInKitchen.sortOrder), asc(equipmentMaintenancePlanInKitchen.title))
	)
	return rows.map((r) => toWire<MaintenancePlanWire>(r))
}

export async function createMaintenancePlan(db: SisubDb, ctx: UserContext, input: CreateMaintenancePlan): Promise<MaintenancePlanWire> {
	const kitchenId = input.kitchenId ?? null
	requirePlanWrite(ctx, kitchenId)

	const row = await insertOneOrFail("INSERT_FAILED", "no row returned", () =>
		db
			.insert(equipmentMaintenancePlanInKitchen)
			.values({
				roleId: input.roleId ?? null,
				modelId: input.modelId ?? null,
				kitchenId,
				title: input.title,
				kind: input.kind,
				intervalDays: input.intervalDays,
				toleranceDays: input.toleranceDays,
				instructions: input.instructions ?? null,
				estimatedMinutes: input.estimatedMinutes ?? null,
				isRequired: input.isRequired,
				sortOrder: input.sortOrder,
			})
			.returning()
	)
	return toWire<MaintenancePlanWire>(row)
}

/** Dono do plano lido da LINHA — nunca do input. Mesma lição de `guards/asset-ownership.ts`. */
/** @returns a linha do plano — quem edita precisa dos valores atuais para validar contra eles. */
async function authorizePlanMutation(
	db: SisubDb,
	ctx: UserContext,
	planId: string
): Promise<{ kitchenId: number | null; intervalDays: number; toleranceDays: number | null }> {
	const [plan] = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				kitchenId: equipmentMaintenancePlanInKitchen.kitchenId,
				intervalDays: equipmentMaintenancePlanInKitchen.intervalDays,
				toleranceDays: equipmentMaintenancePlanInKitchen.toleranceDays,
			})
			.from(equipmentMaintenancePlanInKitchen)
			.where(and(eq(equipmentMaintenancePlanInKitchen.id, planId), isNull(equipmentMaintenancePlanInKitchen.deletedAt)))
	)
	if (!plan) throw new NotFoundError("equipment_maintenance_plan", planId)
	requirePlanWrite(ctx, plan.kitchenId)
	return plan
}

export async function updateMaintenancePlan(db: SisubDb, ctx: UserContext, input: UpdateMaintenancePlan): Promise<MaintenancePlanWire> {
	const plan = await authorizePlanMutation(db, ctx, input.planId)

	// Folga < período, contra o valor EFETIVO — o `refine` do Create não alcança a edição, que
	// muda um campo de cada vez. Sem isto, mexer só na folga deixa a comparação chegar ao banco
	// como 23514 crua; e folga >= período é uma rotina que nunca vence.
	const nextInterval = input.intervalDays ?? plan.intervalDays
	const nextTolerance = input.toleranceDays ?? plan.toleranceDays ?? 0
	if (nextTolerance >= nextInterval) {
		throw new DomainError("VALIDATION_FAILED", "a folga precisa ser menor que o período — senão a rotina nunca vence")
	}

	const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
	if (input.title != null) patch.title = input.title
	if (input.kind != null) patch.kind = input.kind
	if (input.intervalDays != null) patch.intervalDays = input.intervalDays
	if (input.toleranceDays != null) patch.toleranceDays = input.toleranceDays
	if (input.instructions !== undefined) patch.instructions = input.instructions ?? null
	if (input.estimatedMinutes !== undefined) patch.estimatedMinutes = input.estimatedMinutes ?? null
	if (input.isRequired != null) patch.isRequired = input.isRequired
	if (input.sortOrder != null) patch.sortOrder = input.sortOrder

	const [row] = await mutateOrFail("UPDATE_FAILED", "rotina não encontrada", () =>
		db
			.update(equipmentMaintenancePlanInKitchen)
			.set(patch)
			.where(and(eq(equipmentMaintenancePlanInKitchen.id, input.planId), isNull(equipmentMaintenancePlanInKitchen.deletedAt)))
			.returning()
	)
	return toWire<MaintenancePlanWire>(row)
}

export async function deleteMaintenancePlan(db: SisubDb, ctx: UserContext, input: DeleteMaintenancePlan): Promise<void> {
	await authorizePlanMutation(db, ctx, input.planId)
	const now = new Date().toISOString()
	await mutateOrFail("DELETE_FAILED", "rotina não encontrada", () =>
		db
			.update(equipmentMaintenancePlanInKitchen)
			.set({ deletedAt: now, updatedAt: now })
			.where(and(eq(equipmentMaintenancePlanInKitchen.id, input.planId), isNull(equipmentMaintenancePlanInKitchen.deletedAt)))
			.returning({ id: equipmentMaintenancePlanInKitchen.id })
	)
}

// ── Execução ──────────────────────────────────────────────────────────────

/**
 * Registra uma execução de manutenção.
 *
 * `planId` nulo é o caso normal, não a exceção: a maioria da manutenção real é corretiva e não
 * corresponde a plano nenhum. Exigir um plano faria a praça inventar rotina para conseguir
 * registrar um conserto, e o catálogo viraria lixo.
 *
 * `resolveIssue` fecha a pane no mesmo movimento — mas só para quem tem `kitchen:2`, porque
 * encerrar pane é decisão de gestão. Quem só tem `kitchen-production:1` registra o conserto e a
 * pane continua aberta até alguém confirmar; é o comportamento certo, e a UI diz isso.
 */
export async function logMaintenance(db: SisubDb, ctx: UserContext, input: LogMaintenance): Promise<MaintenanceLogWire> {
	const unit = await resolveUnitKitchen(db, input.unitId)
	requireKitchenFloorWrite(ctx, unit.kitchenId)
	if (input.resolveIssue) {
		if (input.issueId == null) throw new DomainError("VALIDATION_FAILED", "resolveIssue exige issueId")
		requireKitchen(ctx, 2, unit.kitchenId)
	}
	if (input.issueId != null) {
		// A pane tem de ser DESTA unidade. Conferir só a cozinha deixaria o registro de conserto
		// de um forno encerrar a pane da fritadeira ao lado — mesma cozinha, equipamento errado.
		const { issue, kitchenId } = await resolveIssueUnit(db, input.issueId)
		if (kitchenId !== unit.kitchenId || issue.unitId !== input.unitId) throw new NotFoundError("equipment_issue", input.issueId)
	}
	if (input.planId != null) await assertPlanApplies(db, input.planId, unit.kitchenId)

	const now = new Date().toISOString()
	const row = await db.transaction(async (tx) => {
		const inserted = await insertOneOrFail("INSERT_FAILED", "no row returned", () =>
			tx
				.insert(equipmentMaintenanceLogInKitchen)
				.values({
					unitId: input.unitId,
					planId: input.planId ?? null,
					issueId: input.issueId ?? null,
					kind: input.kind,
					performedOn: input.performedOn,
					performedBy: ctx.userId,
					provider: input.provider,
					cost: input.cost ?? null,
					notes: input.notes ?? null,
				})
				.returning()
		)
		if (input.resolveIssue && input.issueId != null) {
			await runQuery("UPDATE_FAILED", () =>
				tx
					.update(equipmentIssueInKitchen)
					.set({ status: "resolved", resolvedAt: now, resolvedBy: ctx.userId, updatedAt: now })
					.where(and(eq(equipmentIssueInKitchen.id, input.issueId as string), isNull(equipmentIssueInKitchen.deletedAt)))
					.then(() => undefined)
			)
		}
		return inserted
	})
	return { ...toNumeric(toWire<MaintenanceLogRow>(row), LOG_NUMERIC_KEYS), kitchen_id: unit.kitchenId, unit_label: unit.label }
}

/** O plano tem de ser global ou DESTA cozinha — senão uma cozinha registraria execução de rotina alheia. */
async function assertPlanApplies(db: SisubDb, planId: string, kitchenId: number): Promise<void> {
	const [plan] = await runQuery("FETCH_FAILED", () =>
		db
			.select({ kitchenId: equipmentMaintenancePlanInKitchen.kitchenId })
			.from(equipmentMaintenancePlanInKitchen)
			.where(and(eq(equipmentMaintenancePlanInKitchen.id, planId), isNull(equipmentMaintenancePlanInKitchen.deletedAt)))
	)
	if (!plan) throw new NotFoundError("equipment_maintenance_plan", planId)
	if (plan.kitchenId != null && plan.kitchenId !== kitchenId) throw new NotFoundError("equipment_maintenance_plan", planId)
}

export async function listMaintenanceLogs(db: SisubDb, ctx: UserContext, input: ListMaintenanceLogs): Promise<MaintenanceLogWire[]> {
	requireAnyPermission(ctx, ["kitchen", "kitchen-production"], 1, { type: "kitchen", id: input.kitchenId })
	return loadKitchenLogs(db, input)
}

/**
 * Execução mais recente de cada (unidade, plano) das unidades vivas da cozinha, agregada no banco.
 * Sem guard. Log sem plano (manutenção avulsa) não entra: ancorar a rotina numa troca de lâmpada
 * diria "em dia" sem que a rotina tenha sido feita. Chave do mapa: `${unitId}|${planId}`.
 *
 * É agregação, não lista: os N logs mais recentes da cozinha deixariam de fora o plano anual cuja
 * última execução é mais velha que eles, e o plano em dia sairia "vencido".
 */
export async function loadLastPerformedByUnitPlan(db: SisubDb, kitchenId: number): Promise<Map<string, string>> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				unitId: equipmentMaintenanceLogInKitchen.unitId,
				planId: equipmentMaintenanceLogInKitchen.planId,
				lastPerformedOn: max(equipmentMaintenanceLogInKitchen.performedOn),
			})
			.from(equipmentMaintenanceLogInKitchen)
			.innerJoin(equipmentUnitInKitchen, eq(equipmentUnitInKitchen.id, equipmentMaintenanceLogInKitchen.unitId))
			.where(
				and(
					eq(equipmentUnitInKitchen.kitchenId, kitchenId),
					isNull(equipmentUnitInKitchen.deletedAt),
					isNull(equipmentMaintenanceLogInKitchen.deletedAt),
					isNotNull(equipmentMaintenanceLogInKitchen.planId)
				)
			)
			.groupBy(equipmentMaintenanceLogInKitchen.unitId, equipmentMaintenanceLogInKitchen.planId)
	)
	const last = new Map<string, string>()
	for (const row of rows) {
		if (row.planId == null || row.lastPerformedOn == null) continue
		last.set(`${row.unitId}|${row.planId}`, row.lastPerformedOn)
	}
	return last
}

/** Sem guard — para o chamador que já autorizou a cozinha. */
export async function loadKitchenLogs(db: SisubDb, input: ListMaintenanceLogs): Promise<MaintenanceLogWire[]> {
	const units = await runQuery("FETCH_FAILED", () =>
		db
			.select({ id: equipmentUnitInKitchen.id, label: equipmentUnitInKitchen.label })
			.from(equipmentUnitInKitchen)
			.where(and(eq(equipmentUnitInKitchen.kitchenId, input.kitchenId), isNull(equipmentUnitInKitchen.deletedAt)))
	)
	const unitById = new Map(units.map((u) => [u.id, u]))
	const targetIds = input.unitId != null ? units.filter((u) => u.id === input.unitId).map((u) => u.id) : units.map((u) => u.id)
	if (targetIds.length === 0) return []

	const filters: SQL[] = [inArray(equipmentMaintenanceLogInKitchen.unitId, targetIds), isNull(equipmentMaintenanceLogInKitchen.deletedAt)]
	if (input.planId != null) filters.push(eq(equipmentMaintenanceLogInKitchen.planId, input.planId))

	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select()
			.from(equipmentMaintenanceLogInKitchen)
			.where(and(...filters))
			.orderBy(desc(equipmentMaintenanceLogInKitchen.performedOn))
			.limit(input.limit)
	)
	return rows.flatMap((r) => {
		const unit = unitById.get(r.unitId)
		return unit ? [{ ...toNumeric(toWire<MaintenanceLogRow>(r), LOG_NUMERIC_KEYS), kitchen_id: input.kitchenId, unit_label: unit.label }] : []
	})
}
