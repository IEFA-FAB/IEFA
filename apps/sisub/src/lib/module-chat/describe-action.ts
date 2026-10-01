/**
 * Descrição, para o cartão de aprovação, da entidade que uma tool de escrita do chat vai tocar.
 *
 * O argumento da tool é UUID e número de cozinha: "remover 3f2a…" não é decisão informada.
 * Aqui o UUID vira o que o usuário reconhece — receita pelo nome, cardápio por data, refeição
 * e cozinha, anexo quantitativo por título e OM. Nunca devolve UUID.
 *
 * Só leitura, e com o mesmo crivo da tool: permissão de leitura no módulo e no escopo da linha
 * resolvida, e a cozinha/unidade da linha presa ao escopo da rota. O que não passa vira
 * `unavailable` ("não foi possível descrever o item") — a descrição não pode virar canal para
 * ler o que a tela não mostraria.
 *
 * Puro: o acesso ao banco vem em `ChatActionReader`, montado no servidor
 * (`action-reader.server.ts`), para o teste não depender de `@/server/*`. Roda só no servidor
 * (`describeChatActionFn`): importa o registro das tools para saber quais são de escrita e
 * validar o argumento com o mesmo crivo delas. O cliente só importa os tipos.
 */

import { AgentApplyTemplateSchema } from "@iefa/sisub-domain/agent"
import { z } from "zod"
import type { ChatModule } from "@/types/domain/module-chat"
import { parseCreateDailyMenuArgs, parseUpdateMenuHeadcountArgs } from "./tools/kitchen"
import { APPROVAL_TOOL_NAMES_BY_MODULE } from "./tools/registry"

// ── Contrato ────────────────────────────────────────────────────────────────

export interface ChatActionDetail {
	label: string
	value: string
}

export type ChatActionDescription = { status: "described"; details: ChatActionDetail[] } | { status: "unavailable" }

export const UNAVAILABLE: ChatActionDescription = { status: "unavailable" }

export interface MealTypeView {
	name: string | null
	kitchenId: number | null
}

export interface DailyMenuView {
	serviceDate: string | null
	mealTypeName: string | null
	kitchenId: number | null
	kitchenName: string | null
	forecastedHeadcount: number | null
}

/** Leituras mínimas que a descrição precisa. `null` = não existe (ou foi apagado). */
export interface ChatActionReader {
	findRecipe(id: string): Promise<{ name: string; kitchenId: number | null } | null>
	findKitchen(id: number): Promise<{ name: string | null } | null>
	/** Em lote: só os ids que existem (e não foram apagados) entram no mapa. */
	findMealTypes(ids: readonly string[]): Promise<ReadonlyMap<string, MealTypeView>>
	findDailyMenu(id: string): Promise<DailyMenuView | null>
	findMenuItem(id: string): Promise<{ recipeName: string | null; dailyMenuId: string | null } | null>
	findTemplate(id: string): Promise<{ name: string | null; kitchenId: number | null } | null>
	findQuantityEstimate(id: string): Promise<{ title: string; status: string; unitId: number; unitName: string | null } | null>
}

type PbacModule = "global" | "kitchen" | "unit"
export type ReadScope = { type: "kitchen" | "unit"; id: number }

export interface ChatActionAccess {
	module: ChatModule
	scopeId?: number
	/** `hasPermission(permissions, module, 1, scope)` do usuário da sessão. */
	hasReadPermission(module: PbacModule, scope?: ReadScope): boolean
}

export interface DescribeChatActionInput {
	toolName: string
	args: Record<string, unknown>
}

// ── Formatação ──────────────────────────────────────────────────────────────

const MAX_VALUE_CHARS = 200

/** Texto de banco ou do modelo, curto e numa linha só. */
function formatText(value: string | null | undefined, fallback = "sem nome"): string {
	const clean = (value ?? "").replace(/\s+/g, " ").trim()
	if (!clean) return fallback
	return clean.length > MAX_VALUE_CHARS ? `${clean.slice(0, MAX_VALUE_CHARS - 1)}…` : clean
}

/** `2026-10-01` → `01/10/2026`. Data fora do formato não é exibida crua. */
function formatDate(iso: string | null | undefined): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "")
	return match ? `${match[3]}/${match[2]}/${match[1]}` : "data inválida"
}

const QUANTITY_ESTIMATE_STATUS_LABEL: Record<string, string> = {
	draft: "rascunho",
	completed: "concluído",
	archived: "arquivado",
}

function formatStatus(status: string): string {
	return QUANTITY_ESTIMATE_STATUS_LABEL[status] ?? status
}

/** Dia da semana ISO (1 = segunda … 7 = domingo), a convenção do `startDayOfWeek`. */
const WEEKDAY_LABEL = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"] as const

function formatWeekday(day: number): string {
	return WEEKDAY_LABEL[day - 1] ?? "dia inválido"
}

function formatMenu(menu: DailyMenuView): string {
	return [formatDate(menu.serviceDate), formatText(menu.mealTypeName, "refeição sem nome"), formatText(menu.kitchenName, "cozinha sem nome")].join(" · ")
}

function buildDescription(details: (ChatActionDetail | null)[]): ChatActionDescription {
	return { status: "described", details: details.filter((d): d is ChatActionDetail => d !== null) }
}

// ── Argumentos (o mesmo formato que as tools aceitam) ───────────────────────

// `create_daily_menu`, `update_menu_headcount` e `apply_template` usam o parser da própria tool
// (`parse*Args` de `tools/kitchen.ts`, `AgentApplyTemplateSchema` do contrato do agente).

const Uuid = z.uuid()
const OptionalNumber = z.coerce.number().finite().nullish()

const CreateRecipeArgs = z.object({ name: z.string().min(1), preparationTime: OptionalNumber, cookingFactor: OptionalNumber })
const UpdateRecipeArgs = z.object({ recipeId: Uuid, name: z.string().nullish(), preparationTime: OptionalNumber, cookingFactor: OptionalNumber })
const AddMenuItemArgs = z.object({ dailyMenuId: Uuid, recipeId: Uuid })
const RemoveMenuItemArgs = z.object({ itemId: Uuid })
const UpdateEstimateStatusArgs = z.object({ quantityEstimateId: Uuid, status: z.string().min(1) })

// ── Descrição ───────────────────────────────────────────────────────────────

/**
 * A cozinha resolvida da linha tem de ser a da rota (quando há rota) e legível pelo usuário.
 * Mesmo crivo do `assertRouteScope` das tools, mais o PBAC de leitura.
 */
function isKitchenVisible(access: ChatActionAccess, kitchenId: number | null): kitchenId is number {
	if (kitchenId == null) return false
	if (access.scopeId != null && kitchenId !== access.scopeId) return false
	return access.hasReadPermission("kitchen", { type: "kitchen", id: kitchenId })
}

function isUnitVisible(access: ChatActionAccess, unitId: number): boolean {
	if (access.scopeId != null && unitId !== access.scopeId) return false
	return access.hasReadPermission("unit", { type: "unit", id: unitId })
}

/** Receita global (catálogo) ou da própria cozinha — a mesma regra do `add_menu_item`. */
function isRecipeVisibleFrom(recipe: { kitchenId: number | null }, kitchenId: number): boolean {
	return recipe.kitchenId === null || recipe.kitchenId === kitchenId
}

async function describeByTool(input: DescribeChatActionInput, access: ChatActionAccess, reader: ChatActionReader): Promise<ChatActionDescription> {
	switch (input.toolName) {
		case "create_recipe": {
			const args = CreateRecipeArgs.parse(input.args)
			if (!access.hasReadPermission("global")) return UNAVAILABLE
			return buildDescription([
				{ label: "Receita nova (catálogo global)", value: formatText(args.name) },
				args.preparationTime != null ? { label: "Tempo de preparo", value: `${args.preparationTime} min` } : null,
				args.cookingFactor != null ? { label: "Fator de cocção", value: String(args.cookingFactor) } : null,
			])
		}

		case "update_recipe": {
			const args = UpdateRecipeArgs.parse(input.args)
			if (!access.hasReadPermission("global")) return UNAVAILABLE
			const recipe = await reader.findRecipe(args.recipeId)
			// A tool só altera receita global; descrever a de uma cozinha seria mostrar o que ela não toca.
			if (!recipe || recipe.kitchenId !== null) return UNAVAILABLE
			return buildDescription([
				{ label: "Receita", value: formatText(recipe.name) },
				args.name != null ? { label: "Novo nome", value: formatText(args.name) } : null,
				args.preparationTime != null ? { label: "Tempo de preparo", value: `${args.preparationTime} min` } : null,
				args.cookingFactor != null ? { label: "Fator de cocção", value: String(args.cookingFactor) } : null,
			])
		}

		case "create_daily_menu": {
			const args = parseCreateDailyMenuArgs(input.args)
			if (!isKitchenVisible(access, args.kitchenId)) return UNAVAILABLE
			const [kitchen, mealTypes] = await Promise.all([reader.findKitchen(args.kitchenId), reader.findMealTypes([args.mealTypeId])])
			const mealType = mealTypes.get(args.mealTypeId)
			if (!kitchen || !mealType) return UNAVAILABLE
			if (mealType.kitchenId !== null && mealType.kitchenId !== args.kitchenId) return UNAVAILABLE
			return buildDescription([
				{
					label: "Cardápio novo",
					value: [formatDate(args.date), formatText(mealType.name, "refeição sem nome"), formatText(kitchen.name, "cozinha sem nome")].join(" · "),
				},
				args.forecastedHeadcount != null ? { label: "Comensais previstos", value: String(args.forecastedHeadcount) } : null,
			])
		}

		case "add_menu_item": {
			const args = AddMenuItemArgs.parse(input.args)
			const menu = await reader.findDailyMenu(args.dailyMenuId)
			if (!menu || !isKitchenVisible(access, menu.kitchenId)) return UNAVAILABLE
			const recipe = await reader.findRecipe(args.recipeId)
			if (!recipe || !isRecipeVisibleFrom(recipe, menu.kitchenId)) return UNAVAILABLE
			return buildDescription([
				{ label: "Receita", value: formatText(recipe.name) },
				{ label: "Cardápio", value: formatMenu(menu) },
			])
		}

		case "remove_menu_item": {
			const args = RemoveMenuItemArgs.parse(input.args)
			const item = await reader.findMenuItem(args.itemId)
			if (!item?.dailyMenuId) return UNAVAILABLE
			const menu = await reader.findDailyMenu(item.dailyMenuId)
			if (!menu || !isKitchenVisible(access, menu.kitchenId)) return UNAVAILABLE
			return buildDescription([
				{ label: "Item", value: formatText(item.recipeName, "item sem nome") },
				{ label: "Cardápio", value: formatMenu(menu) },
			])
		}

		case "update_menu_headcount": {
			const args = parseUpdateMenuHeadcountArgs(input.args)
			const menu = await reader.findDailyMenu(args.menuId)
			if (!menu || !isKitchenVisible(access, menu.kitchenId)) return UNAVAILABLE
			const current = menu.forecastedHeadcount == null ? "a definir" : String(menu.forecastedHeadcount)
			return buildDescription([
				{ label: "Cardápio", value: formatMenu(menu) },
				{ label: "Comensais previstos", value: `${current} → ${args.forecastedHeadcount}` },
			])
		}

		case "apply_template": {
			const args = AgentApplyTemplateSchema.parse(input.args)
			if (!isKitchenVisible(access, args.kitchenId)) return UNAVAILABLE
			const headcounts = args.headcounts ?? []
			const [template, kitchen, mealTypes] = await Promise.all([
				reader.findTemplate(args.templateId),
				reader.findKitchen(args.kitchenId),
				reader.findMealTypes([...new Set(headcounts.map((entry) => entry.mealTypeId))]),
			])
			if (!template || !kitchen) return UNAVAILABLE
			if (template.kitchenId !== null && template.kitchenId !== args.kitchenId) return UNAVAILABLE

			const dates = [...new Set(args.targetDates)].toSorted()
			const headcountLines: string[] = []
			for (const entry of headcounts) {
				const mealType = mealTypes.get(entry.mealTypeId)
				if (!mealType || (mealType.kitchenId !== null && mealType.kitchenId !== args.kitchenId)) return UNAVAILABLE
				headcountLines.push(`${formatText(mealType.name, "refeição sem nome")}: ${entry.headcount ?? "a definir"}`)
			}
			return buildDescription([
				{ label: "Template", value: formatText(template.name) },
				{ label: "Cozinha", value: formatText(kitchen.name, "cozinha sem nome") },
				{ label: dates.length === 1 ? "Data (só dias vazios)" : `${dates.length} datas (só dias vazios)`, value: dates.map(formatDate).join(", ") },
				// O que `applyTemplate` faz com o `startDayOfWeek`: o dia 1 do template vai para as datas
				// que caem nesse dia da semana, e os demais seguem a ordem dele (o mesmo texto da tela,
				// "Dia inicial do template"). Não é "o dia do template da primeira data".
				{ label: "Dia 1 do template cai em", value: formatWeekday(args.startDayOfWeek) },
				headcountLines.length > 0 ? { label: "Efetivo por refeição", value: headcountLines.join("; ") } : null,
			])
		}

		case "update_quantity_estimate_status": {
			const args = UpdateEstimateStatusArgs.parse(input.args)
			const estimate = await reader.findQuantityEstimate(args.quantityEstimateId)
			if (!estimate || !isUnitVisible(access, estimate.unitId)) return UNAVAILABLE
			return buildDescription([
				{ label: "Anexo quantitativo", value: formatText(estimate.title, "sem título") },
				{ label: "OM", value: formatText(estimate.unitName, "OM sem nome") },
				{ label: "Status", value: `${formatStatus(estimate.status)} → ${formatStatus(args.status)}` },
			])
		}

		default:
			return UNAVAILABLE
	}
}

/**
 * Descreve a ação. Qualquer falha — tool que não é de escrita do módulo, argumento que a tool
 * recusaria, linha inexistente, fora do escopo ou da permissão, erro de leitura — devolve
 * `unavailable`, e o cartão mostra a ação sem a descrição.
 */
export async function describeChatAction(input: DescribeChatActionInput, access: ChatActionAccess, reader: ChatActionReader): Promise<ChatActionDescription> {
	if (!APPROVAL_TOOL_NAMES_BY_MODULE[access.module]?.has(input.toolName)) return UNAVAILABLE
	try {
		return await describeByTool(input, access, reader)
	} catch {
		return UNAVAILABLE
	}
}
