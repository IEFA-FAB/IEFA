/**
 * Conjuntos de grupos do cardápio — leitura e CRUD de `kitchen.menu_group_set`
 * e `kitchen.menu_group`.
 *
 * O conjunto é ativo global/local como receita, template e tipo de refeição:
 * `kitchen_id IS NULL` é da SDAB (exige `global:2`), preenchido é da cozinha
 * (`kitchen:2` escopado). O dono é sempre lido da linha, nunca do input —
 * `authorizeAssetMutation` faz isso.
 *
 * Os grupos são filhos com substituição destrutiva: `groups` ausente não mexe,
 * `groups` presente apaga e reinsere. Trocar a CHAVE de um grupo não reclassifica
 * o cardápio — o item continua com a chave antiga, que passa a cair na coluna
 * "Fora do conjunto". É o comportamento desejado: reclassificar 500 linhas por
 * causa de um rename silencioso é pior do que mostrar que elas ficaram órfãs.
 */

import { mealTypeInKitchen, menuGroupInKitchen, menuGroupSetInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import { and, asc, eq, inArray, isNull, or, type SQL } from "drizzle-orm"
import { authorizeAssetMutation, requireAssetWriteForScope } from "../guards/asset-ownership.ts"
import { requireKitchen, requirePermission } from "../guards/require-permission.ts"
import type { CreateMenuGroupSet, DeleteMenuGroupSet, FetchMenuGroupSets, UpdateMenuGroupSet } from "../schemas/menu-groups.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import { insertOneOrFail, mutateOrFail, runQuery } from "../utils/index.ts"

export type MenuGroupRow = {
	id: string
	key: string
	label: string
	sort_order: number
}

export type MenuGroupSetRow = {
	id: string
	name: string
	description: string | null
	kitchen_id: number | null
	slug: string | null
	sort_order: number
	groups: MenuGroupRow[]
}

const SET_COLS = {
	id: menuGroupSetInKitchen.id,
	name: menuGroupSetInKitchen.name,
	description: menuGroupSetInKitchen.description,
	kitchen_id: menuGroupSetInKitchen.kitchenId,
	slug: menuGroupSetInKitchen.slug,
	sort_order: menuGroupSetInKitchen.sortOrder,
} as const

/** Chave repetida dentro do conjunto quebraria o índice único e, antes dele, a coluna duplicada na tela. */
function assertDistinctKeys(groups: readonly { key: string }[]): void {
	const seen = new Set<string>()
	for (const g of groups) {
		if (seen.has(g.key)) throw new DomainError("DUPLICATE_GROUP_KEY", `chave de grupo repetida no conjunto: ${g.key}`)
		seen.add(g.key)
	}
}

/**
 * Conjuntos visíveis para a cozinha: os globais MAIS os dela. Mesmo recorte de
 * `fetchMealTypes` — a refeição personalizada de uma cozinha escolhe entre eles.
 */
export async function fetchMenuGroupSets(db: SisubDb, ctx: UserContext, input: FetchMenuGroupSets): Promise<MenuGroupSetRow[]> {
	if (input.kitchenId != null) {
		requireKitchen(ctx, 1, input.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 1)
	}

	const conditions: (SQL | undefined)[] = [isNull(menuGroupSetInKitchen.deletedAt)]
	if (input.kitchenId != null) {
		conditions.push(or(isNull(menuGroupSetInKitchen.kitchenId), eq(menuGroupSetInKitchen.kitchenId, input.kitchenId)))
	} else {
		conditions.push(isNull(menuGroupSetInKitchen.kitchenId))
	}

	const sets = await runQuery("FETCH_FAILED", () =>
		db
			.select(SET_COLS)
			.from(menuGroupSetInKitchen)
			.where(and(...conditions))
			.orderBy(asc(menuGroupSetInKitchen.sortOrder), asc(menuGroupSetInKitchen.name))
	)
	if (sets.length === 0) return []

	const groups = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				id: menuGroupInKitchen.id,
				group_set_id: menuGroupInKitchen.groupSetId,
				key: menuGroupInKitchen.key,
				label: menuGroupInKitchen.label,
				sort_order: menuGroupInKitchen.sortOrder,
			})
			.from(menuGroupInKitchen)
			.where(
				inArray(
					menuGroupInKitchen.groupSetId,
					sets.map((s) => s.id)
				)
			)
			.orderBy(asc(menuGroupInKitchen.sortOrder), asc(menuGroupInKitchen.key))
	)

	const bySet = new Map<string, MenuGroupRow[]>()
	for (const g of groups) {
		const bucket = bySet.get(g.group_set_id) ?? []
		bucket.push({ id: g.id, key: g.key, label: g.label, sort_order: g.sort_order })
		bySet.set(g.group_set_id, bucket)
	}

	return sets.map((s) => ({ ...s, groups: bySet.get(s.id) ?? [] }))
}

export async function createMenuGroupSet(db: SisubDb, ctx: UserContext, input: CreateMenuGroupSet): Promise<MenuGroupSetRow> {
	// kitchenId ausente = conjunto GLOBAL (da SDAB) → global:2, não kitchen:2.
	requireAssetWriteForScope(ctx, input.kitchenId ?? null)
	assertDistinctKeys(input.groups)

	return db.transaction(async (tx) => {
		const set = await insertOneOrFail("INSERT_FAILED", "no row returned", () =>
			tx
				.insert(menuGroupSetInKitchen)
				.values({
					name: input.name,
					description: input.description ?? null,
					kitchenId: input.kitchenId ?? null,
					sortOrder: input.sortOrder ?? 0,
					// `slug` é o nome estável dos conjuntos semeados; conjunto criado
					// pela tela nasce sem ele, inclusive o global.
					slug: null,
				})
				.returning(SET_COLS)
		)

		const groups = await runQuery("INSERT_GROUPS_FAILED", () =>
			tx
				.insert(menuGroupInKitchen)
				.values(input.groups.map((g, index) => ({ groupSetId: set.id, key: g.key, label: g.label, sortOrder: index })))
				.returning({ id: menuGroupInKitchen.id, key: menuGroupInKitchen.key, label: menuGroupInKitchen.label, sort_order: menuGroupInKitchen.sortOrder })
		)

		return { ...set, groups }
	})
}

export async function updateMenuGroupSet(db: SisubDb, ctx: UserContext, input: UpdateMenuGroupSet): Promise<MenuGroupSetRow> {
	const ownerKitchenId = await authorizeAssetMutation(db, ctx, "menu_group_set", input.groupSetId)
	const nextGroups = input.groups
	if (nextGroups) assertDistinctKeys(nextGroups)

	const updates: Partial<typeof menuGroupSetInKitchen.$inferInsert> = {}
	if (input.name != null) updates.name = input.name
	// `description` é o único campo em que null significa alguma coisa no ERP:
	// limpa a coluna. Por isso a ramificação em `!== undefined`.
	if (input.description !== undefined) updates.description = input.description
	if (input.sortOrder != null) updates.sortOrder = input.sortOrder

	if (Object.keys(updates).length === 0 && !nextGroups) throw new DomainError("NO_UPDATES", "No fields to update")

	return db.transaction(async (tx) => {
		// Predicado amarrado ao dono JÁ autorizado: entre a checagem e a escrita a
		// linha pode mudar de escopo, e um `where id = ?` cru escreveria no conjunto
		// de outra cozinha.
		const owned = and(
			eq(menuGroupSetInKitchen.id, input.groupSetId),
			ownerKitchenId == null ? isNull(menuGroupSetInKitchen.kitchenId) : eq(menuGroupSetInKitchen.kitchenId, ownerKitchenId)
		)

		const set =
			Object.keys(updates).length > 0
				? await insertOneOrFail("UPDATE_FAILED", `menu_group_set ${input.groupSetId} not found`, () =>
						tx.update(menuGroupSetInKitchen).set(updates).where(owned).returning(SET_COLS)
					)
				: await insertOneOrFail("FETCH_FAILED", `menu_group_set ${input.groupSetId} not found`, () =>
						tx.select(SET_COLS).from(menuGroupSetInKitchen).where(owned)
					)

		if (nextGroups) {
			await runQuery("DELETE_GROUPS_FAILED", () =>
				tx
					.delete(menuGroupInKitchen)
					.where(eq(menuGroupInKitchen.groupSetId, set.id))
					.then(() => undefined)
			)
			await runQuery("INSERT_GROUPS_FAILED", () =>
				tx
					.insert(menuGroupInKitchen)
					.values(nextGroups.map((g, index) => ({ groupSetId: set.id, key: g.key, label: g.label, sortOrder: index })))
					.then(() => undefined)
			)
		}

		const groups = await runQuery("FETCH_FAILED", () =>
			tx
				.select({ id: menuGroupInKitchen.id, key: menuGroupInKitchen.key, label: menuGroupInKitchen.label, sort_order: menuGroupInKitchen.sortOrder })
				.from(menuGroupInKitchen)
				.where(eq(menuGroupInKitchen.groupSetId, set.id))
				.orderBy(asc(menuGroupInKitchen.sortOrder), asc(menuGroupInKitchen.key))
		)

		return { ...set, groups }
	})
}

/**
 * Arquiva o conjunto. Refeição apontando para ele BARRA a remoção: o soft-delete
 * deixaria a FK de pé e a refeição cairia no conjunto padrão sem avisar ninguém —
 * o editor abriria com outras colunas e o cardápio inteiro pareceria desgrupado.
 */
export async function deleteMenuGroupSet(db: SisubDb, ctx: UserContext, input: DeleteMenuGroupSet): Promise<void> {
	const ownerKitchenId = await authorizeAssetMutation(db, ctx, "menu_group_set", input.groupSetId)

	const inUse = await runQuery("FETCH_FAILED", () =>
		db
			.select({ id: mealTypeInKitchen.id, name: mealTypeInKitchen.name })
			.from(mealTypeInKitchen)
			.where(and(eq(mealTypeInKitchen.groupSetId, input.groupSetId), isNull(mealTypeInKitchen.deletedAt)))
	)
	if (inUse.length > 0) {
		throw new DomainError("GROUP_SET_IN_USE", `conjunto em uso por ${inUse.length} refeição(ões): ${inUse.map((m) => m.name ?? m.id).join(", ")}`)
	}

	await mutateOrFail("DELETE_FAILED", `menu_group_set ${input.groupSetId} not found`, () =>
		db
			.update(menuGroupSetInKitchen)
			.set({ deletedAt: new Date().toISOString() })
			.where(
				and(
					eq(menuGroupSetInKitchen.id, input.groupSetId),
					ownerKitchenId == null ? isNull(menuGroupSetInKitchen.kitchenId) : eq(menuGroupSetInKitchen.kitchenId, ownerKitchenId)
				)
			)
			.returning({ id: menuGroupSetInKitchen.id })
	)
}
