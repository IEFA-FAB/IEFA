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
import { DEFAULT_GROUP_SET_SLUG } from "../schemas/menu-groups.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import { insertOneOrFail, mutateOrFail, runQuery } from "../utils/index.ts"

/** A mesma API do `db` dentro de uma transação — as checagens valem nos dois. */
type MenuGroupTx = Parameters<Parameters<SisubDb["transaction"]>[0]>[0]

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

	await db.transaction(async (tx) => {
		// Trava a LINHA DO CONJUNTO antes de contar quem o usa. `assertGroupSetUsable`
		// (o outro lado, em updateMealType) lê a mesma linha com `for share`: sem isso,
		// checar e arquivar são duas queries, e uma refeição apontada entre as duas
		// atravessa o guard — a FK continua válida, o conjunto fica arquivado, e o
		// editor daquela refeição abre com as colunas do padrão sem dizer por quê.
		const [locked] = await runQuery("FETCH_FAILED", () =>
			tx.select({ id: menuGroupSetInKitchen.id }).from(menuGroupSetInKitchen).where(eq(menuGroupSetInKitchen.id, input.groupSetId)).for("update").limit(1)
		)
		if (!locked) throw new DomainError("DELETE_FAILED", `menu_group_set ${input.groupSetId} not found`)

		// Inclui refeição ARQUIVADA de propósito: `restoreMealType` a traz de volta
		// apontando para um conjunto que já não existe, que é exatamente a falha que
		// este guard existe para impedir.
		const inUse = await runQuery("FETCH_FAILED", () =>
			tx
				.select({ id: mealTypeInKitchen.id, name: mealTypeInKitchen.name, deleted_at: mealTypeInKitchen.deletedAt })
				.from(mealTypeInKitchen)
				.where(eq(mealTypeInKitchen.groupSetId, input.groupSetId))
		)
		if (inUse.length > 0) {
			throw new DomainError(
				"GROUP_SET_IN_USE",
				`conjunto em uso por ${inUse.length} refeição(ões): ${inUse.map((m) => `${m.name ?? m.id}${m.deleted_at ? " (arquivada)" : ""}`).join(", ")}`
			)
		}

		await mutateOrFail("DELETE_FAILED", `menu_group_set ${input.groupSetId} not found`, () =>
			tx
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
	})
}

/**
 * Chaves de grupo que cada refeição aceita — as do conjunto dela, ou as do
 * conjunto padrão quando ela não aponta para nenhum.
 */
async function fetchGroupKeysByMealType(
	db: SisubDb | MenuGroupTx,
	mealTypeIds: readonly string[]
): Promise<Map<string, { keys: Set<string>; name: string | null }>> {
	const meals = await runQuery("FETCH_FAILED", () =>
		db
			.select({ id: mealTypeInKitchen.id, name: mealTypeInKitchen.name, groupSetId: mealTypeInKitchen.groupSetId })
			.from(mealTypeInKitchen)
			.where(inArray(mealTypeInKitchen.id, [...mealTypeIds]))
	)

	const defaultSetId = meals.some((m) => m.groupSetId == null)
		? ((
				await runQuery("FETCH_FAILED", () =>
					db
						.select({ id: menuGroupSetInKitchen.id })
						.from(menuGroupSetInKitchen)
						.where(and(eq(menuGroupSetInKitchen.slug, DEFAULT_GROUP_SET_SLUG), isNull(menuGroupSetInKitchen.deletedAt)))
						.limit(1)
				)
			)[0]?.id ?? null)
		: null

	const setIds = [...new Set(meals.map((m) => m.groupSetId ?? defaultSetId).filter((id): id is string => id != null))]
	const keysBySet = new Map<string, Set<string>>()
	if (setIds.length > 0) {
		const rows = await runQuery("FETCH_FAILED", () =>
			db
				.select({ groupSetId: menuGroupInKitchen.groupSetId, key: menuGroupInKitchen.key })
				.from(menuGroupInKitchen)
				.where(inArray(menuGroupInKitchen.groupSetId, setIds))
		)
		for (const r of rows) {
			const bucket = keysBySet.get(r.groupSetId) ?? new Set<string>()
			bucket.add(r.key)
			keysBySet.set(r.groupSetId, bucket)
		}
	}

	return new Map(meals.map((m) => [m.id, { keys: keysBySet.get(m.groupSetId ?? defaultSetId ?? "") ?? new Set<string>(), name: m.name }]))
}

/**
 * Recusa item cujo grupo não existe no conjunto da refeição.
 *
 * O CHECK de `item_group` saiu do banco junto com o vocabulário único, e quem
 * escreve não é só a tela: `add_menu_item` e `update_template` são tools de MCP,
 * e o schema que o modelo lê deixou de enumerar valores. Sem esta checagem o
 * modelo inventa uma chave plausível ("entrada", "principal") e o item nasce
 * fora do conjunto — visível numa coluna própria, mas fora do cardápio que
 * alguém pediu. A mensagem lista as chaves válidas justamente para o modelo se
 * corrigir sozinho.
 *
 * Só custa query quando há grupo sendo escrito.
 */
export async function assertItemGroupsInSet(
	db: SisubDb | MenuGroupTx,
	pairs: readonly { mealTypeId: string | null | undefined; itemGroup: string | null | undefined }[]
): Promise<void> {
	const toCheck = pairs.filter((p): p is { mealTypeId: string; itemGroup: string } => !!p.mealTypeId && !!p.itemGroup)
	if (toCheck.length === 0) return

	const byMealType = await fetchGroupKeysByMealType(db, [...new Set(toCheck.map((p) => p.mealTypeId))])

	for (const pair of toCheck) {
		const meal = byMealType.get(pair.mealTypeId)
		// Refeição inexistente é problema de outro guard (FK / escopo); aqui ela só
		// não tem conjunto conhecido, e barrar por isso esconderia o erro real.
		if (!meal || meal.keys.size === 0) continue
		if (!meal.keys.has(pair.itemGroup)) {
			throw new DomainError(
				"ITEM_GROUP_NOT_IN_SET",
				`grupo "${pair.itemGroup}" não existe no conjunto da refeição ${meal.name ?? pair.mealTypeId}. Grupos válidos: ${[...meal.keys].join(", ")}`
			)
		}
	}
}
