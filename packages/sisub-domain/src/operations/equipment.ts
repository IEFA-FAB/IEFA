/**
 * Operations dos equipamentos de cozinha — camada Drizzle.
 *
 * Contrato de retorno: snake_case aninhado (via `toWire`), igual ao restante do domínio.
 * As relações são hidratadas por QUERY SEPARADA, nunca por `with` aninhado: o join de três
 * níveis (unidade → modelo → papéis do modelo) gera alias > 63 chars, que o Postgres trunca
 * (NAMEDATALEN) e o Drizzle não casa de volta — a relation voltaria vazia, em silêncio. Mesma
 * lição do fluxo de produção (`recipe-flow.ts`).
 *
 * Autorização:
 *   - catálogo global (papéis, modelos com `kitchen_id` null) — leitura por qualquer módulo de
 *     cozinha nível 1; escrita exige `global:2` (guard de ownership, dono lido da linha);
 *   - modelo de cozinha e parque instalado — escrita exige `kitchen:2` NAQUELA cozinha;
 *   - exigência da preparação — idêntica à mutação da receita (global:2 ou kitchen:2 da dona).
 */

import {
	equipmentModelInKitchen,
	equipmentModelRoleInKitchen,
	equipmentRoleInKitchen,
	equipmentUnitInKitchen,
	equipmentUnitRoleInKitchen,
	recipeEquipmentRequirementInKitchen,
	recipeStepInKitchen,
	recipesInKitchen,
	type SisubDb,
} from "@iefa/database/drizzle/sisub"
import type { EquipmentModel, EquipmentModelRole, EquipmentRole, EquipmentUnit, EquipmentUnitRole, RecipeEquipmentRequirement } from "@iefa/database/sisub"
import { and, asc, eq, ilike, inArray, isNull, or, type SQL } from "drizzle-orm"
import { authorizeAssetMutation, requireAssetWriteForScope } from "../guards/asset-ownership.ts"
import { requireAnyPermission, requireKitchen, requirePermission } from "../guards/require-permission.ts"
import type {
	CreateEquipmentModel,
	CreateEquipmentRole,
	CreateEquipmentUnit,
	DeleteEquipmentModel,
	DeleteEquipmentRole,
	DeleteEquipmentUnit,
	EvaluateRecipeEquipmentFitness,
	FetchRecipeEquipment,
	ListEquipmentModels,
	ListEquipmentRoles,
	ListKitchenEquipment,
	SaveRecipeEquipment,
	UpdateEquipmentModel,
	UpdateEquipmentRole,
	UpdateEquipmentUnit,
} from "../schemas/equipment.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError } from "../types/errors.ts"
import { type EquipmentDemandSpec, type EquipmentSlot, evaluateEquipmentFitness, expandUnitSlots, resolveUnitRoleIds } from "../utils/equipment-matching.ts"
import { insertOneOrFail, mutateOrFail, runQuery, toNumeric, toWire } from "../utils/index.ts"

// ── Contrato de retorno ───────────────────────────────────────────────────

export type EquipmentRoleWire = EquipmentRole
export type EquipmentModelRoleWire = EquipmentModelRole & { role: EquipmentRole | null }
export type EquipmentModelWire = EquipmentModel & { roles: EquipmentModelRoleWire[] }
export type EquipmentUnitWire = EquipmentUnit & {
	model: EquipmentModelWire | null
	role_overrides: EquipmentUnitRole[]
	/** Papéis do modelo ∪ adições da unidade − remoções da unidade. */
	effective_role_ids: string[]
	/** Zonas independentes efetivas: override da unidade, senão o do modelo. */
	effective_slots: number
}
export type RecipeEquipmentRequirementWire = RecipeEquipmentRequirement & {
	role: EquipmentRole | null
	model: EquipmentModel | null
}

export interface RequirementFitnessWire {
	requirement_id: string
	/** Rótulo do alvo, pronto para a UI: "Forno combinado" ou "Rational iVario Pro L". */
	target_label: string
	required: number
	satisfied: number
	missing: number
	assigned_unit_labels: string[]
}

export interface RecipeEquipmentFitnessWire {
	satisfied: boolean
	missing_total: number
	requirements: RequirementFitnessWire[]
	/** Nenhuma exigência cadastrada: a preparação não declara o que precisa. */
	unspecified: boolean
}

const MODEL_NUMERIC_KEYS = new Set(["capacity_liters", "power_kw"])
const REQUIREMENT_NUMERIC_KEYS = new Set(["min_capacity_liters"])

const numOrNull = (n: number | null | undefined): string | null => (n != null ? String(n) : null)

// ── Catálogo: papéis ──────────────────────────────────────────────────────

/** Leitura do catálogo: qualquer módulo que monta ou executa preparação. */
function requireCatalogRead(ctx: UserContext): void {
	requireAnyPermission(ctx, ["kitchen", "kitchen-production", "global"], 1)
}

export async function listEquipmentRoles(db: SisubDb, ctx: UserContext, input: ListEquipmentRoles = {}): Promise<EquipmentRoleWire[]> {
	requireCatalogRead(ctx)

	const filters: SQL[] = [isNull(equipmentRoleInKitchen.deletedAt)]
	if (input.category != null) filters.push(eq(equipmentRoleInKitchen.category, input.category))
	if (input.search) filters.push(ilike(equipmentRoleInKitchen.name, `%${input.search}%`))

	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select()
			.from(equipmentRoleInKitchen)
			.where(and(...filters))
			.orderBy(asc(equipmentRoleInKitchen.sortOrder), asc(equipmentRoleInKitchen.name))
	)
	return rows.map((r) => toWire<EquipmentRoleWire>(r))
}

/**
 * Cria um papel. A taxonomia é do catálogo global (SDAB) — não existe papel de cozinha: se cada
 * cozinha inventasse o seu, "forno combinado" viraria N papéis diferentes e a exigência de uma
 * preparação global deixaria de casar com o parque de quem a executa.
 */
export async function createEquipmentRole(db: SisubDb, ctx: UserContext, input: CreateEquipmentRole): Promise<EquipmentRoleWire> {
	requirePermission(ctx, "global", 2)

	const row = await insertOneOrFail("INSERT_FAILED", "no row returned", () =>
		db
			.insert(equipmentRoleInKitchen)
			.values({
				code: input.code,
				name: input.name,
				description: input.description ?? null,
				category: input.category,
				sortOrder: input.sortOrder,
			})
			.returning()
	)
	return toWire<EquipmentRoleWire>(row)
}

/** `code` não entra: é chave natural de seed/import, renomear rótulo é `name`. */
export async function updateEquipmentRole(db: SisubDb, ctx: UserContext, input: UpdateEquipmentRole): Promise<EquipmentRoleWire> {
	requirePermission(ctx, "global", 2)

	const patch: Record<string, unknown> = {}
	if (input.name != null) patch.name = input.name
	if (input.description !== undefined) patch.description = input.description ?? null
	if (input.category != null) patch.category = input.category
	if (input.sortOrder != null) patch.sortOrder = input.sortOrder
	if (Object.keys(patch).length === 0) {
		const [row] = await runQuery("FETCH_FAILED", () => db.select().from(equipmentRoleInKitchen).where(eq(equipmentRoleInKitchen.id, input.roleId)))
		if (!row) throw new NotFoundError("equipment_role", input.roleId)
		return toWire<EquipmentRoleWire>(row)
	}

	const [row] = await mutateOrFail("UPDATE_FAILED", "papel não encontrado", () =>
		db
			.update(equipmentRoleInKitchen)
			.set(patch)
			.where(and(eq(equipmentRoleInKitchen.id, input.roleId), isNull(equipmentRoleInKitchen.deletedAt)))
			.returning()
	)
	return toWire<EquipmentRoleWire>(row)
}

/**
 * Soft-delete do papel. Bloqueia enquanto algum modelo o declarar ou alguma preparação o exigir:
 * apagar o papel calado transformaria a lista mínima em "sem exigência", e a preparação passaria
 * a "atendida" em cozinha nenhuma equipada.
 */
export async function deleteEquipmentRole(db: SisubDb, ctx: UserContext, input: DeleteEquipmentRole): Promise<void> {
	requirePermission(ctx, "global", 2)

	const usedByModel = await runQuery("FETCH_FAILED", () =>
		db
			.select({ id: equipmentModelRoleInKitchen.id })
			.from(equipmentModelRoleInKitchen)
			.where(and(eq(equipmentModelRoleInKitchen.roleId, input.roleId), isNull(equipmentModelRoleInKitchen.deletedAt)))
			.limit(1)
	)
	if (usedByModel.length > 0) throw new DomainError("ROLE_IN_USE", "há modelos que assumem este papel — desvincule-os antes")

	const usedByRecipe = await runQuery("FETCH_FAILED", () =>
		db
			.select({ id: recipeEquipmentRequirementInKitchen.id })
			.from(recipeEquipmentRequirementInKitchen)
			.where(and(eq(recipeEquipmentRequirementInKitchen.roleId, input.roleId), isNull(recipeEquipmentRequirementInKitchen.deletedAt)))
			.limit(1)
	)
	if (usedByRecipe.length > 0) throw new DomainError("ROLE_IN_USE", "há preparações que exigem este papel — remova a exigência antes")

	await mutateOrFail("DELETE_FAILED", "papel não encontrado", () =>
		db
			.update(equipmentRoleInKitchen)
			.set({ deletedAt: new Date().toISOString() })
			.where(and(eq(equipmentRoleInKitchen.id, input.roleId), isNull(equipmentRoleInKitchen.deletedAt)))
			.returning({ id: equipmentRoleInKitchen.id })
	)
}

// ── Catálogo: modelos ─────────────────────────────────────────────────────

/**
 * Carrega os papéis de um conjunto de modelos numa query e devolve indexado por modelo.
 * Query separada de propósito (vide cabeçalho: alias > 63 chars no `with` aninhado).
 */
async function loadModelRoles(db: SisubDb, modelIds: string[]): Promise<Map<string, EquipmentModelRoleWire[]>> {
	const byModel = new Map<string, EquipmentModelRoleWire[]>()
	if (modelIds.length === 0) return byModel

	const links = await runQuery("FETCH_FAILED", () =>
		db
			.select()
			.from(equipmentModelRoleInKitchen)
			.where(and(inArray(equipmentModelRoleInKitchen.modelId, modelIds), isNull(equipmentModelRoleInKitchen.deletedAt)))
	)
	const roleIds = [...new Set(links.map((l) => l.roleId))]
	const roles = roleIds.length
		? await runQuery("FETCH_FAILED", () => db.select().from(equipmentRoleInKitchen).where(inArray(equipmentRoleInKitchen.id, roleIds)))
		: []
	const roleById = new Map(roles.map((r) => [r.id, toWire<EquipmentRole>(r)]))

	for (const link of links) {
		const list = byModel.get(link.modelId) ?? []
		list.push({ ...toWire<EquipmentModelRole>(link), role: roleById.get(link.roleId) ?? null })
		byModel.set(link.modelId, list)
	}
	// Papel principal primeiro — é o rótulo do modelo na UI.
	for (const list of byModel.values()) {
		list.sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || (a.role?.sort_order ?? 0) - (b.role?.sort_order ?? 0))
	}
	return byModel
}

function toModelWire(row: typeof equipmentModelInKitchen.$inferSelect, roles: EquipmentModelRoleWire[]): EquipmentModelWire {
	return { ...toNumeric(toWire<EquipmentModel>(row), MODEL_NUMERIC_KEYS), roles }
}

export async function listEquipmentModels(db: SisubDb, ctx: UserContext, input: ListEquipmentModels = {}): Promise<EquipmentModelWire[]> {
	requireCatalogRead(ctx)

	// Catálogo global SEMPRE visível; o da cozinha entra quando ela é informada.
	const scope =
		input.kitchenId != null
			? or(isNull(equipmentModelInKitchen.kitchenId), eq(equipmentModelInKitchen.kitchenId, input.kitchenId))
			: isNull(equipmentModelInKitchen.kitchenId)
	const filters: (SQL | undefined)[] = [isNull(equipmentModelInKitchen.deletedAt), scope]
	if (input.search) filters.push(ilike(equipmentModelInKitchen.name, `%${input.search}%`))

	if (input.roleId != null) {
		const withRole = await runQuery("FETCH_FAILED", () =>
			db
				.select({ modelId: equipmentModelRoleInKitchen.modelId })
				.from(equipmentModelRoleInKitchen)
				.where(and(eq(equipmentModelRoleInKitchen.roleId, input.roleId as string), isNull(equipmentModelRoleInKitchen.deletedAt)))
		)
		const ids = [...new Set(withRole.map((r) => r.modelId))]
		if (ids.length === 0) return []
		filters.push(inArray(equipmentModelInKitchen.id, ids))
	}

	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select()
			.from(equipmentModelInKitchen)
			.where(and(...filters))
			.orderBy(asc(equipmentModelInKitchen.manufacturer), asc(equipmentModelInKitchen.name))
	)
	const rolesByModel = await loadModelRoles(
		db,
		rows.map((r) => r.id)
	)
	return rows.map((r) => toModelWire(r, rolesByModel.get(r.id) ?? []))
}

/** Valida que os papéis existem e que há no máximo um principal. */
async function assertRolesExist(db: SisubDb, roleIds: string[]): Promise<void> {
	const unique = [...new Set(roleIds)]
	if (unique.length === 0) return
	const found = await runQuery("FETCH_FAILED", () =>
		db
			.select({ id: equipmentRoleInKitchen.id })
			.from(equipmentRoleInKitchen)
			.where(and(inArray(equipmentRoleInKitchen.id, unique), isNull(equipmentRoleInKitchen.deletedAt)))
	)
	if (found.length !== unique.length) {
		const missing = unique.filter((id) => !found.some((f) => f.id === id))
		throw new NotFoundError("equipment_role", missing.join(", "))
	}
}

function assertSinglePrimary(roles: { isPrimary: boolean }[]): void {
	if (roles.filter((r) => r.isPrimary).length > 1) {
		throw new DomainError("VALIDATION_FAILED", "o modelo só pode ter um papel principal")
	}
}

export async function createEquipmentModel(db: SisubDb, ctx: UserContext, input: CreateEquipmentModel): Promise<EquipmentModelWire> {
	const kitchenId = input.kitchenId ?? null
	requireAssetWriteForScope(ctx, kitchenId)
	assertSinglePrimary(input.roles)
	await assertRolesExist(
		db,
		input.roles.map((r) => r.roleId)
	)

	const model = await db.transaction(async (tx) => {
		const row = await insertOneOrFail("INSERT_FAILED", "no row returned", () =>
			tx
				.insert(equipmentModelInKitchen)
				.values({
					manufacturer: input.manufacturer ?? null,
					name: input.name,
					capacityLiters: numOrNull(input.capacityLiters),
					capacityGn: input.capacityGn ?? null,
					capacityLabel: input.capacityLabel ?? null,
					simultaneousSlots: input.simultaneousSlots,
					powerKw: numOrNull(input.powerKw),
					isGeneric: input.isGeneric,
					kitchenId,
					notes: input.notes ?? null,
				})
				.returning()
		)
		await runQuery("INSERT_FAILED", () =>
			tx
				.insert(equipmentModelRoleInKitchen)
				.values(input.roles.map((r) => ({ modelId: row.id, roleId: r.roleId, isPrimary: r.isPrimary, notes: r.notes ?? null })))
				.then(() => undefined)
		)
		return row
	})

	const roles = await loadModelRoles(db, [model.id])
	return toModelWire(model, roles.get(model.id) ?? [])
}

export async function updateEquipmentModel(db: SisubDb, ctx: UserContext, input: UpdateEquipmentModel): Promise<EquipmentModelWire> {
	await authorizeAssetMutation(db, ctx, "equipment_model", input.modelId)
	if (input.roles != null) {
		assertSinglePrimary(input.roles)
		await assertRolesExist(
			db,
			input.roles.map((r) => r.roleId)
		)
	}

	const now = new Date().toISOString()
	const model = await db.transaction(async (tx) => {
		const patch: Record<string, unknown> = {}
		if (input.manufacturer !== undefined) patch.manufacturer = input.manufacturer ?? null
		if (input.name != null) patch.name = input.name
		if (input.capacityLiters !== undefined) patch.capacityLiters = numOrNull(input.capacityLiters)
		if (input.capacityGn !== undefined) patch.capacityGn = input.capacityGn ?? null
		if (input.capacityLabel !== undefined) patch.capacityLabel = input.capacityLabel ?? null
		if (input.simultaneousSlots != null) patch.simultaneousSlots = input.simultaneousSlots
		if (input.powerKw !== undefined) patch.powerKw = numOrNull(input.powerKw)
		if (input.notes !== undefined) patch.notes = input.notes ?? null

		const [row] =
			Object.keys(patch).length > 0
				? await mutateOrFail("UPDATE_FAILED", "modelo não encontrado", () =>
						tx
							.update(equipmentModelInKitchen)
							.set(patch)
							.where(and(eq(equipmentModelInKitchen.id, input.modelId), isNull(equipmentModelInKitchen.deletedAt)))
							.returning()
					)
				: await runQuery("FETCH_FAILED", () => tx.select().from(equipmentModelInKitchen).where(eq(equipmentModelInKitchen.id, input.modelId)))
		if (!row) throw new NotFoundError("equipment_model", input.modelId)

		const nextRoles = input.roles
		if (nextRoles != null) {
			await runQuery("DELETE_FAILED", () =>
				tx
					.update(equipmentModelRoleInKitchen)
					.set({ deletedAt: now })
					.where(and(eq(equipmentModelRoleInKitchen.modelId, input.modelId), isNull(equipmentModelRoleInKitchen.deletedAt)))
					.then(() => undefined)
			)
			await runQuery("INSERT_FAILED", () =>
				tx
					.insert(equipmentModelRoleInKitchen)
					.values(nextRoles.map((r) => ({ modelId: input.modelId, roleId: r.roleId, isPrimary: r.isPrimary, notes: r.notes ?? null })))
					.then(() => undefined)
			)
		}
		return row
	})

	const roles = await loadModelRoles(db, [model.id])
	return toModelWire(model, roles.get(model.id) ?? [])
}

/**
 * Soft-delete do modelo. Bloqueia enquanto houver unidade ativa apontando para ele: apagar
 * o modelo esvaziaria o parque da cozinha sem que ninguém tivesse pedido isso.
 */
export async function deleteEquipmentModel(db: SisubDb, ctx: UserContext, input: DeleteEquipmentModel): Promise<void> {
	await authorizeAssetMutation(db, ctx, "equipment_model", input.modelId)

	const inUse = await runQuery("FETCH_FAILED", () =>
		db
			.select({ id: equipmentUnitInKitchen.id })
			.from(equipmentUnitInKitchen)
			.where(and(eq(equipmentUnitInKitchen.modelId, input.modelId), isNull(equipmentUnitInKitchen.deletedAt)))
			.limit(1)
	)
	if (inUse.length > 0) throw new DomainError("MODEL_IN_USE", "há equipamentos cadastrados com este modelo — remova-os antes")

	const now = new Date().toISOString()
	await db.transaction(async (tx) => {
		await mutateOrFail("DELETE_FAILED", "modelo não encontrado", () =>
			tx
				.update(equipmentModelInKitchen)
				.set({ deletedAt: now })
				.where(and(eq(equipmentModelInKitchen.id, input.modelId), isNull(equipmentModelInKitchen.deletedAt)))
				.returning({ id: equipmentModelInKitchen.id })
		)
		await runQuery("DELETE_FAILED", () =>
			tx
				.update(equipmentModelRoleInKitchen)
				.set({ deletedAt: now })
				.where(and(eq(equipmentModelRoleInKitchen.modelId, input.modelId), isNull(equipmentModelRoleInKitchen.deletedAt)))
				.then(() => undefined)
		)
	})
}

// ── Parque instalado ──────────────────────────────────────────────────────

/** Monta o wire da unidade: modelo hidratado, exceções de papel e papéis/slots efetivos. */
function toUnitWire(unit: typeof equipmentUnitInKitchen.$inferSelect, model: EquipmentModelWire | null, overrides: EquipmentUnitRole[]): EquipmentUnitWire {
	const modelRoleIds = (model?.roles ?? []).map((r) => r.role_id)
	return {
		...toWire<EquipmentUnit>(unit),
		model,
		role_overrides: overrides,
		effective_role_ids: resolveUnitRoleIds(
			modelRoleIds,
			overrides.map((o) => ({ roleId: o.role_id, available: o.available }))
		),
		effective_slots: unit.simultaneousSlots ?? model?.simultaneous_slots ?? 1,
	}
}

export async function listKitchenEquipment(db: SisubDb, ctx: UserContext, input: ListKitchenEquipment): Promise<EquipmentUnitWire[]> {
	requireAnyPermission(ctx, ["kitchen", "kitchen-production"], 1, { type: "kitchen", id: input.kitchenId })

	const filters: SQL[] = [eq(equipmentUnitInKitchen.kitchenId, input.kitchenId), isNull(equipmentUnitInKitchen.deletedAt)]
	if (!input.includeInactive) filters.push(eq(equipmentUnitInKitchen.status, "active"))

	const units = await runQuery("FETCH_FAILED", () =>
		db
			.select()
			.from(equipmentUnitInKitchen)
			.where(and(...filters))
			.orderBy(asc(equipmentUnitInKitchen.label))
	)
	if (units.length === 0) return []

	const modelIds = [...new Set(units.map((u) => u.modelId))]
	const models = await runQuery("FETCH_FAILED", () => db.select().from(equipmentModelInKitchen).where(inArray(equipmentModelInKitchen.id, modelIds)))
	const rolesByModel = await loadModelRoles(db, modelIds)
	const modelById = new Map(models.map((m) => [m.id, toModelWire(m, rolesByModel.get(m.id) ?? [])]))

	const overrideRows = await runQuery("FETCH_FAILED", () =>
		db
			.select()
			.from(equipmentUnitRoleInKitchen)
			.where(
				and(
					inArray(
						equipmentUnitRoleInKitchen.unitId,
						units.map((u) => u.id)
					),
					isNull(equipmentUnitRoleInKitchen.deletedAt)
				)
			)
	)
	const overridesByUnit = new Map<string, EquipmentUnitRole[]>()
	for (const row of overrideRows) {
		const list = overridesByUnit.get(row.unitId) ?? []
		list.push(toWire<EquipmentUnitRole>(row))
		overridesByUnit.set(row.unitId, list)
	}

	return units.map((u) => toUnitWire(u, modelById.get(u.modelId) ?? null, overridesByUnit.get(u.id) ?? []))
}

/** O modelo precisa ser visível para a cozinha: global ou dela. Impede vazamento entre cozinhas. */
async function assertModelVisible(db: SisubDb, modelId: string, kitchenId: number): Promise<void> {
	const [model] = await runQuery("FETCH_FAILED", () =>
		db
			.select({ kitchenId: equipmentModelInKitchen.kitchenId })
			.from(equipmentModelInKitchen)
			.where(and(eq(equipmentModelInKitchen.id, modelId), isNull(equipmentModelInKitchen.deletedAt)))
	)
	if (!model) throw new NotFoundError("equipment_model", modelId)
	if (model.kitchenId != null && model.kitchenId !== kitchenId) throw new NotFoundError("equipment_model", modelId)
}

export async function createEquipmentUnit(db: SisubDb, ctx: UserContext, input: CreateEquipmentUnit): Promise<EquipmentUnitWire> {
	requireKitchen(ctx, 2, input.kitchenId)
	await assertModelVisible(db, input.modelId, input.kitchenId)
	await assertRolesExist(
		db,
		input.roleOverrides.map((o) => o.roleId)
	)

	const unit = await db.transaction(async (tx) => {
		const row = await insertOneOrFail("INSERT_FAILED", "no row returned", () =>
			tx
				.insert(equipmentUnitInKitchen)
				.values({
					kitchenId: input.kitchenId,
					modelId: input.modelId,
					label: input.label,
					assetTag: input.assetTag ?? null,
					serialNumber: input.serialNumber ?? null,
					status: input.status,
					simultaneousSlots: input.simultaneousSlots ?? null,
					acquiredOn: input.acquiredOn ?? null,
					notes: input.notes ?? null,
				})
				.returning()
		)
		if (input.roleOverrides.length > 0) {
			await runQuery("INSERT_FAILED", () =>
				tx
					.insert(equipmentUnitRoleInKitchen)
					.values(input.roleOverrides.map((o) => ({ unitId: row.id, roleId: o.roleId, available: o.available, notes: o.notes ?? null })))
					.then(() => undefined)
			)
		}
		return row
	})

	return hydrateUnit(db, unit)
}

/** Relê modelo + exceções de UMA unidade recém-mutada, para devolver o wire completo. */
async function hydrateUnit(db: SisubDb, unit: typeof equipmentUnitInKitchen.$inferSelect): Promise<EquipmentUnitWire> {
	const [model] = await runQuery("FETCH_FAILED", () => db.select().from(equipmentModelInKitchen).where(eq(equipmentModelInKitchen.id, unit.modelId)))
	const roles = await loadModelRoles(db, [unit.modelId])
	const overrides = await runQuery("FETCH_FAILED", () =>
		db
			.select()
			.from(equipmentUnitRoleInKitchen)
			.where(and(eq(equipmentUnitRoleInKitchen.unitId, unit.id), isNull(equipmentUnitRoleInKitchen.deletedAt)))
	)
	return toUnitWire(
		unit,
		model ? toModelWire(model, roles.get(unit.modelId) ?? []) : null,
		overrides.map((o) => toWire<EquipmentUnitRole>(o))
	)
}

/** Lê a cozinha dona da unidade do BANCO — nunca do input (ver guards/asset-ownership.ts). */
async function authorizeUnitMutation(db: SisubDb, ctx: UserContext, unitId: string): Promise<number> {
	const [unit] = await runQuery("FETCH_FAILED", () =>
		db.select({ kitchenId: equipmentUnitInKitchen.kitchenId }).from(equipmentUnitInKitchen).where(eq(equipmentUnitInKitchen.id, unitId))
	)
	if (!unit) throw new NotFoundError("equipment_unit", unitId)
	requireKitchen(ctx, 2, unit.kitchenId)
	return unit.kitchenId
}

export async function updateEquipmentUnit(db: SisubDb, ctx: UserContext, input: UpdateEquipmentUnit): Promise<EquipmentUnitWire> {
	const kitchenId = await authorizeUnitMutation(db, ctx, input.unitId)
	if (input.modelId != null) await assertModelVisible(db, input.modelId, kitchenId)
	if (input.roleOverrides != null)
		await assertRolesExist(
			db,
			input.roleOverrides.map((o) => o.roleId)
		)

	const now = new Date().toISOString()
	const unit = await db.transaction(async (tx) => {
		const patch: Record<string, unknown> = { updatedAt: now }
		if (input.label != null) patch.label = input.label
		if (input.modelId != null) patch.modelId = input.modelId
		if (input.assetTag !== undefined) patch.assetTag = input.assetTag ?? null
		if (input.serialNumber !== undefined) patch.serialNumber = input.serialNumber ?? null
		if (input.status != null) patch.status = input.status
		if (input.simultaneousSlots !== undefined) patch.simultaneousSlots = input.simultaneousSlots ?? null
		if (input.acquiredOn !== undefined) patch.acquiredOn = input.acquiredOn ?? null
		if (input.notes !== undefined) patch.notes = input.notes ?? null

		const [row] = await mutateOrFail("UPDATE_FAILED", "equipamento não encontrado", () =>
			tx
				.update(equipmentUnitInKitchen)
				.set(patch)
				.where(and(eq(equipmentUnitInKitchen.id, input.unitId), isNull(equipmentUnitInKitchen.deletedAt)))
				.returning()
		)

		const nextOverrides = input.roleOverrides
		if (nextOverrides != null) {
			await runQuery("DELETE_FAILED", () =>
				tx
					.update(equipmentUnitRoleInKitchen)
					.set({ deletedAt: now })
					.where(and(eq(equipmentUnitRoleInKitchen.unitId, input.unitId), isNull(equipmentUnitRoleInKitchen.deletedAt)))
					.then(() => undefined)
			)
			if (nextOverrides.length > 0) {
				await runQuery("INSERT_FAILED", () =>
					tx
						.insert(equipmentUnitRoleInKitchen)
						.values(nextOverrides.map((o) => ({ unitId: input.unitId, roleId: o.roleId, available: o.available, notes: o.notes ?? null })))
						.then(() => undefined)
				)
			}
		}
		return row as typeof equipmentUnitInKitchen.$inferSelect
	})

	return hydrateUnit(db, unit)
}

export async function deleteEquipmentUnit(db: SisubDb, ctx: UserContext, input: DeleteEquipmentUnit): Promise<void> {
	await authorizeUnitMutation(db, ctx, input.unitId)

	const now = new Date().toISOString()
	await db.transaction(async (tx) => {
		await mutateOrFail("DELETE_FAILED", "equipamento não encontrado", () =>
			tx
				.update(equipmentUnitInKitchen)
				.set({ deletedAt: now, updatedAt: now })
				.where(and(eq(equipmentUnitInKitchen.id, input.unitId), isNull(equipmentUnitInKitchen.deletedAt)))
				.returning({ id: equipmentUnitInKitchen.id })
		)
		await runQuery("DELETE_FAILED", () =>
			tx
				.update(equipmentUnitRoleInKitchen)
				.set({ deletedAt: now })
				.where(and(eq(equipmentUnitRoleInKitchen.unitId, input.unitId), isNull(equipmentUnitRoleInKitchen.deletedAt)))
				.then(() => undefined)
		)
	})
}

// ── Exigência da preparação ───────────────────────────────────────────────

/** Leitura da receita: mesma regra do fluxo — inclui o chão de fábrica (kitchen-production). */
async function requireRecipeRead(db: SisubDb, ctx: UserContext, recipeId: string): Promise<number | null> {
	const [recipe] = await runQuery("FETCH_FAILED", () =>
		db.select({ kitchenId: recipesInKitchen.kitchenId }).from(recipesInKitchen).where(eq(recipesInKitchen.id, recipeId))
	)
	if (!recipe) throw new NotFoundError("recipe", recipeId)
	if (recipe.kitchenId == null) requireAnyPermission(ctx, ["kitchen", "kitchen-production"], 1)
	else requireAnyPermission(ctx, ["kitchen", "kitchen-production"], 1, { type: "kitchen", id: recipe.kitchenId })
	return recipe.kitchenId
}

async function loadRequirements(db: SisubDb, recipeId: string): Promise<RecipeEquipmentRequirementWire[]> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select()
			.from(recipeEquipmentRequirementInKitchen)
			.where(and(eq(recipeEquipmentRequirementInKitchen.recipeId, recipeId), isNull(recipeEquipmentRequirementInKitchen.deletedAt)))
			.orderBy(asc(recipeEquipmentRequirementInKitchen.createdAt))
	)
	if (rows.length === 0) return []

	const roleIds = [...new Set(rows.map((r) => r.roleId).filter((id): id is string => id != null))]
	const modelIds = [...new Set(rows.map((r) => r.modelId).filter((id): id is string => id != null))]
	const roles = roleIds.length
		? await runQuery("FETCH_FAILED", () => db.select().from(equipmentRoleInKitchen).where(inArray(equipmentRoleInKitchen.id, roleIds)))
		: []
	const models = modelIds.length
		? await runQuery("FETCH_FAILED", () => db.select().from(equipmentModelInKitchen).where(inArray(equipmentModelInKitchen.id, modelIds)))
		: []
	const roleById = new Map(roles.map((r) => [r.id, toWire<EquipmentRole>(r)]))
	const modelById = new Map(models.map((m) => [m.id, toNumeric(toWire<EquipmentModel>(m), MODEL_NUMERIC_KEYS)]))

	return rows.map((row) => ({
		...toNumeric(toWire<RecipeEquipmentRequirement>(row), REQUIREMENT_NUMERIC_KEYS),
		role: row.roleId != null ? (roleById.get(row.roleId) ?? null) : null,
		model: row.modelId != null ? (modelById.get(row.modelId) ?? null) : null,
	}))
}

export async function fetchRecipeEquipment(db: SisubDb, ctx: UserContext, input: FetchRecipeEquipment): Promise<RecipeEquipmentRequirementWire[]> {
	await requireRecipeRead(db, ctx, input.recipeId)
	return loadRequirements(db, input.recipeId)
}

/**
 * Replace transacional da lista mínima — mesmo contrato do fluxo de produção.
 *
 * Valida ANTES de tocar o banco: alvo existente e visível, etapa da própria receita, e alvo
 * repetido dentro do mesmo escopo (a repetição é `quantity`, não duas linhas — o índice único
 * do banco recusaria com uma mensagem que ninguém entende).
 */
export async function saveRecipeEquipment(db: SisubDb, ctx: UserContext, input: SaveRecipeEquipment): Promise<RecipeEquipmentRequirementWire[]> {
	const recipeKitchenId = await authorizeAssetMutation(db, ctx, "recipe", input.recipeId)

	const roleIds = input.requirements.map((r) => r.roleId).filter((id): id is string => id != null)
	await assertRolesExist(db, roleIds)

	const modelIds = [...new Set(input.requirements.map((r) => r.modelId).filter((id): id is string => id != null))]
	for (const modelId of modelIds) {
		// Receita global só pode exigir modelo global; receita de cozinha aceita os dois.
		if (recipeKitchenId == null) {
			const [model] = await runQuery("FETCH_FAILED", () =>
				db
					.select({ kitchenId: equipmentModelInKitchen.kitchenId })
					.from(equipmentModelInKitchen)
					.where(and(eq(equipmentModelInKitchen.id, modelId), isNull(equipmentModelInKitchen.deletedAt)))
			)
			if (!model) throw new NotFoundError("equipment_model", modelId)
			if (model.kitchenId != null) {
				throw new DomainError("VALIDATION_FAILED", "preparação global não pode exigir um modelo de equipamento de uma cozinha específica")
			}
		} else {
			await assertModelVisible(db, modelId, recipeKitchenId)
		}
	}

	const stepIds = [...new Set(input.requirements.map((r) => r.recipeStepId).filter((id): id is string => id != null))]
	if (stepIds.length > 0) {
		const steps = await runQuery("FETCH_FAILED", () =>
			db
				.select({ id: recipeStepInKitchen.id })
				.from(recipeStepInKitchen)
				.where(and(inArray(recipeStepInKitchen.id, stepIds), eq(recipeStepInKitchen.recipeId, input.recipeId), isNull(recipeStepInKitchen.deletedAt)))
		)
		if (steps.length !== stepIds.length) {
			throw new DomainError("VALIDATION_FAILED", "exigência amarrada a uma etapa que não é desta preparação")
		}
	}

	const seen = new Set<string>()
	for (const req of input.requirements) {
		const key = `${req.recipeStepId ?? ""}|${req.roleId ?? req.modelId}`
		if (seen.has(key)) throw new DomainError("VALIDATION_FAILED", "o mesmo equipamento aparece duas vezes — use a quantidade")
		seen.add(key)
	}

	const now = new Date().toISOString()
	await db.transaction(async (tx) => {
		await runQuery("DELETE_FAILED", () =>
			tx
				.update(recipeEquipmentRequirementInKitchen)
				.set({ deletedAt: now })
				.where(and(eq(recipeEquipmentRequirementInKitchen.recipeId, input.recipeId), isNull(recipeEquipmentRequirementInKitchen.deletedAt)))
				.then(() => undefined)
		)
		if (input.requirements.length === 0) return
		await runQuery("INSERT_FAILED", () =>
			tx
				.insert(recipeEquipmentRequirementInKitchen)
				.values(
					input.requirements.map((r) => ({
						recipeId: input.recipeId,
						recipeStepId: r.recipeStepId ?? null,
						roleId: r.roleId ?? null,
						modelId: r.modelId ?? null,
						quantity: r.quantity,
						minCapacityLiters: numOrNull(r.minCapacityLiters),
						minCapacityGn: r.minCapacityGn ?? null,
						notes: r.notes ?? null,
					}))
				)
				.then(() => undefined)
		)
	})

	return loadRequirements(db, input.recipeId)
}

/**
 * Copia a lista mínima de `srcRecipeId` para `dstRecipeId` (nova versão da preparação).
 * `stepIdMap` remapeia a etapa antiga → nova; exigência amarrada a etapa que não veio junto
 * perde o vínculo (vira exigência da preparação) em vez de sumir.
 */
export async function copyRecipeEquipmentRequirements(
	db: SisubDb,
	srcRecipeId: string,
	dstRecipeId: string,
	stepIdMap: Map<string, string> = new Map()
): Promise<void> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select()
			.from(recipeEquipmentRequirementInKitchen)
			.where(and(eq(recipeEquipmentRequirementInKitchen.recipeId, srcRecipeId), isNull(recipeEquipmentRequirementInKitchen.deletedAt)))
	)
	if (rows.length === 0) return

	await runQuery("INSERT_FAILED", () =>
		db
			.insert(recipeEquipmentRequirementInKitchen)
			.values(
				rows.map((r) => ({
					recipeId: dstRecipeId,
					recipeStepId: r.recipeStepId != null ? (stepIdMap.get(r.recipeStepId) ?? null) : null,
					roleId: r.roleId,
					modelId: r.modelId,
					quantity: r.quantity,
					minCapacityLiters: r.minCapacityLiters,
					minCapacityGn: r.minCapacityGn,
					notes: r.notes,
				}))
			)
			.then(() => undefined)
	)
}

// ── Atendimento (a cozinha consegue produzir?) ────────────────────────────

function requirementLabel(req: RecipeEquipmentRequirementWire): string {
	if (req.model != null) return [req.model.manufacturer, req.model.name].filter(Boolean).join(" ")
	return req.role?.name ?? "Equipamento"
}

/**
 * Confronta a lista mínima da preparação com o parque ATIVO da cozinha.
 *
 * Sem exigência cadastrada devolve `satisfied: true` com `unspecified: true` — a preparação não
 * declara o que precisa, e afirmar "não atende" seria transformar cadastro incompleto em
 * impedimento. Quem consome decide como mostrar isso.
 */
export async function evaluateRecipeEquipmentFitness(
	db: SisubDb,
	ctx: UserContext,
	input: EvaluateRecipeEquipmentFitness
): Promise<RecipeEquipmentFitnessWire> {
	await requireRecipeRead(db, ctx, input.recipeId)
	requireAnyPermission(ctx, ["kitchen", "kitchen-production"], 1, { type: "kitchen", id: input.kitchenId })

	const requirements = await loadRequirements(db, input.recipeId)
	if (requirements.length === 0) return { satisfied: true, missing_total: 0, requirements: [], unspecified: true }

	const units = await listKitchenEquipment(db, ctx, { kitchenId: input.kitchenId, includeInactive: false })
	const slots: EquipmentSlot[] = units.flatMap((u) =>
		expandUnitSlots({
			unitId: u.id,
			unitLabel: u.label,
			modelId: u.model_id,
			slots: u.effective_slots,
			roleIds: u.effective_role_ids,
			capacityLiters: u.model?.capacity_liters ?? null,
			capacityGn: u.model?.capacity_gn ?? null,
		})
	)
	const labelByUnitId = new Map(units.map((u) => [u.id, u.label]))

	const demands: EquipmentDemandSpec[] = requirements.map((r) => ({
		requirementId: r.id,
		roleId: r.role_id,
		modelId: r.model_id,
		quantity: r.quantity,
		minCapacityLiters: r.min_capacity_liters,
		minCapacityGn: r.min_capacity_gn,
	}))
	const fitness = evaluateEquipmentFitness(demands, slots)
	const byId = new Map(requirements.map((r) => [r.id, r]))

	return {
		satisfied: fitness.satisfied,
		missing_total: fitness.missingTotal,
		unspecified: false,
		requirements: fitness.requirements.map((r) => {
			const req = byId.get(r.requirementId)
			return {
				requirement_id: r.requirementId,
				target_label: req ? requirementLabel(req) : "Equipamento",
				required: r.required,
				satisfied: r.satisfied,
				missing: r.missing,
				assigned_unit_labels: r.assignedUnitIds.map((id) => labelByUnitId.get(id) ?? id),
			}
		}),
	}
}
