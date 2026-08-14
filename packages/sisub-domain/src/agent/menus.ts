/**
 * Cardápio e template prontos para agentes — projeção enxuta, a mesma para o chat dos
 * módulos e para o servidor MCP.
 *
 * Por que não reusar `fetchDailyMenus`/`getTemplateItems` direto: cada `menu_items` carrega
 * `recipe`, um snapshot json da ficha técnica inteira (receita + ingredientes + a linha
 * completa de cada insumo), e as leituras de calendário ainda embutiam `recipe_origin` — a
 * receita atual, completa, ao lado do snapshot. São ~8 KB por item de cardápio: um dia com
 * três refeições já rompia os 60 mil caracteres de `MAX_TOOL_RESULT_CHARS` e `get_day_details`
 * respondia erro de payload; uma semana ficava uma ordem de grandeza acima. E nada disso o
 * modelo usa para responder "o que tem no almoço de quinta": ele quer o nome do prato.
 *
 * As operations continuam intactas — a tela de planejamento precisa do snapshot para calcular
 * necessidade de suprimento. Quem muda de forma é a superfície do agente.
 */

import {
	dailyMenuInKitchen,
	mealTypeInKitchen,
	menuItemsInKitchen,
	menuTemplateInKitchen,
	menuTemplateItemsInKitchen,
	recipesInKitchen,
	type SisubDb,
} from "@iefa/database/drizzle/sisub"
import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm"
import { requireKitchen, requirePermission } from "../guards/require-permission.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError } from "../types/errors.ts"
import { runQuery } from "../utils/index.ts"

/** Item de cardápio como o modelo precisa dele: o prato, o grupo e quanto foi planejado. */
export interface AgentMenuItem {
	/** Necessário para `remove_menu_item`/`update_menu_item` — não é para aparecer na resposta. */
	id: string
	recipe: string | null
	group: string | null
	planned_portions: number | null
}

export interface AgentDailyMenu {
	/** Necessário para `add_menu_item`/`update_menu_headcount`. */
	id: string
	service_date: string | null
	meal_type: string | null
	forecasted_headcount: number | null
	status: string | null
	items: AgentMenuItem[]
}

async function menuItemsFor(db: SisubDb, menuIds: string[]): Promise<Map<string, AgentMenuItem[]>> {
	const byMenu = new Map<string, AgentMenuItem[]>()
	if (menuIds.length === 0) return byMenu

	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				id: menuItemsInKitchen.id,
				dailyMenuId: menuItemsInKitchen.dailyMenuId,
				group: menuItemsInKitchen.itemGroup,
				plannedPortions: menuItemsInKitchen.plannedPortionQuantity,
				recipe: recipesInKitchen.name,
			})
			.from(menuItemsInKitchen)
			.leftJoin(recipesInKitchen, eq(menuItemsInKitchen.recipeOriginId, recipesInKitchen.id))
			.where(and(inArray(menuItemsInKitchen.dailyMenuId, menuIds), isNull(menuItemsInKitchen.deletedAt)))
			.orderBy(asc(menuItemsInKitchen.sortOrder))
	)

	for (const row of rows) {
		if (row.dailyMenuId == null) continue
		const list = byMenu.get(row.dailyMenuId) ?? []
		list.push({
			id: row.id,
			recipe: row.recipe,
			group: row.group,
			planned_portions: row.plannedPortions == null ? null : Number(row.plannedPortions),
		})
		byMenu.set(row.dailyMenuId, list)
	}
	return byMenu
}

/**
 * Menus da cozinha entre duas datas (inclusive), com os itens ativos de cada um.
 *
 * Duas queries chapadas em vez de uma relacional aninhada: a projeção fica explícita — é o
 * que impede o snapshot de voltar por descuido — e não há alias aninhado para estourar o
 * limite de 63 caracteres do Postgres.
 */
export async function agentFetchMenus(
	db: SisubDb,
	ctx: UserContext,
	input: { kitchenId: number; startDate: string; endDate: string }
): Promise<AgentDailyMenu[]> {
	requireKitchen(ctx, 1, input.kitchenId)

	const menus = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				id: dailyMenuInKitchen.id,
				serviceDate: dailyMenuInKitchen.serviceDate,
				mealType: mealTypeInKitchen.name,
				mealSortOrder: mealTypeInKitchen.sortOrder,
				forecastedHeadcount: dailyMenuInKitchen.forecastedHeadcount,
				status: dailyMenuInKitchen.status,
			})
			.from(dailyMenuInKitchen)
			.leftJoin(mealTypeInKitchen, eq(dailyMenuInKitchen.mealTypeId, mealTypeInKitchen.id))
			.where(
				and(
					eq(dailyMenuInKitchen.kitchenId, input.kitchenId),
					gte(dailyMenuInKitchen.serviceDate, input.startDate),
					lte(dailyMenuInKitchen.serviceDate, input.endDate),
					isNull(dailyMenuInKitchen.deletedAt)
				)
			)
			.orderBy(asc(dailyMenuInKitchen.serviceDate), asc(mealTypeInKitchen.sortOrder))
	)

	const items = await menuItemsFor(
		db,
		menus.map((m) => m.id)
	)

	return menus.map(({ mealSortOrder: _mealSortOrder, ...menu }) => ({
		id: menu.id,
		service_date: menu.serviceDate,
		meal_type: menu.mealType,
		forecasted_headcount: menu.forecastedHeadcount,
		status: menu.status,
		items: items.get(menu.id) ?? [],
	}))
}

/** Um único dia — mesma projeção do calendário. */
export function agentFetchDayMenus(db: SisubDb, ctx: UserContext, input: { kitchenId: number; date: string }): Promise<AgentDailyMenu[]> {
	return agentFetchMenus(db, ctx, { kitchenId: input.kitchenId, startDate: input.date, endDate: input.date })
}

/** Item de template: dia da semana, refeição e receita — pelo nome. */
export interface AgentTemplateItem {
	id: string
	day_of_week: number | null
	meal_type: string | null
	recipe: string | null
	group: string | null
	headcount_override: number | null
}

/**
 * Itens de um template semanal.
 *
 * Mesma razão da projeção do cardápio: `getTemplateItems` traz a linha completa da receita
 * em cada item, e um template semanal cheio tem ~100 itens.
 */
export async function agentGetTemplateItems(db: SisubDb, ctx: UserContext, input: { templateId: string }): Promise<AgentTemplateItem[]> {
	const template = await runQuery("FETCH_FAILED", () =>
		db.query.menuTemplateInKitchen.findFirst({
			columns: { id: true, kitchenId: true, deletedAt: true },
			where: eq(menuTemplateInKitchen.id, input.templateId),
		})
	)

	if (!template) throw new NotFoundError("menu_template", input.templateId)
	if (template.deletedAt !== null) throw new DomainError("TEMPLATE_DELETED", `Template ${input.templateId} is deleted`)

	// Mesmo critério de `getTemplateItems`: template de cozinha exige a cozinha; global basta
	// ler cardápio em alguma.
	if (template.kitchenId !== null) {
		requireKitchen(ctx, 1, template.kitchenId)
	} else {
		requirePermission(ctx, "kitchen", 1)
	}

	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				id: menuTemplateItemsInKitchen.id,
				dayOfWeek: menuTemplateItemsInKitchen.dayOfWeek,
				group: menuTemplateItemsInKitchen.itemGroup,
				headcountOverride: menuTemplateItemsInKitchen.headcountOverride,
				sortOrder: menuTemplateItemsInKitchen.sortOrder,
				mealType: mealTypeInKitchen.name,
				mealSortOrder: mealTypeInKitchen.sortOrder,
				recipe: recipesInKitchen.name,
			})
			.from(menuTemplateItemsInKitchen)
			.leftJoin(mealTypeInKitchen, eq(menuTemplateItemsInKitchen.mealTypeId, mealTypeInKitchen.id))
			.leftJoin(recipesInKitchen, eq(menuTemplateItemsInKitchen.recipeId, recipesInKitchen.id))
			.where(eq(menuTemplateItemsInKitchen.menuTemplateId, input.templateId))
			.orderBy(asc(menuTemplateItemsInKitchen.dayOfWeek), asc(mealTypeInKitchen.sortOrder), asc(menuTemplateItemsInKitchen.sortOrder))
	)

	return rows.map((row) => ({
		id: row.id,
		day_of_week: row.dayOfWeek,
		meal_type: row.mealType,
		recipe: row.recipe,
		group: row.group,
		headcount_override: row.headcountOverride,
	}))
}
