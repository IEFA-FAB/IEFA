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
 * O argumento é validado e normalizado pela MESMA função que o `wrapTool` roda antes do handler
 * (`parseApprovalToolArgs` do registro → `parseToolArgs` → `parseArgs` da tool), sem schema
 * próprio: o valor mostrado é o que seria gravado. Argumento que a tool recusa vira `invalid`
 * com a mensagem da recusa; o cartão mostra "Argumentos inválidos: …" e ainda deixa decidir —
 * confirmar só roda a tool, que recusa com esse mesmo erro e não grava nada.
 *
 * Puro: o acesso ao banco vem em `ChatActionReader`, montado no servidor
 * (`action-reader.server.ts`), para o teste não depender de `@/server/*`. Roda só no servidor
 * (`describeChatActionFn`): importa o registro das tools para saber quais são de escrita e
 * validar o argumento com o crivo delas. O cliente só importa os tipos.
 */

import type { AgentApplyTemplate, AgentUpdateQuantityEstimateStatus } from "@iefa/sisub-domain/agent"
import type { UpsertDailyMenu } from "@iefa/sisub-domain/schemas"
import { ZodError } from "zod"
import { getWeekdayLabel } from "@/lib/weekdays"
import type { ChatModule } from "@/types/domain/module-chat"
import type { CreateRecipeArgs, UpdateRecipeArgs } from "./tools/global"
import type { AddMenuItemArgs, RemoveMenuItemArgs, UpdateMenuHeadcountArgs } from "./tools/kitchen"
import { parseApprovalToolArgs } from "./tools/registry"
import { ToolValidationError } from "./tools/shared"

// ── Contrato ────────────────────────────────────────────────────────────────

export interface ChatActionDetail {
	label: string
	value: string
}

export type ChatActionDescription =
	| { status: "described"; details: ChatActionDetail[] }
	/** A tool recusaria o argumento; `message` é a recusa dela. Confirmar não grava nada. */
	| { status: "invalid"; message: string }
	| { status: "unavailable" }

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
	/** O item com o cardápio dele, numa leitura só; `menu` nulo = cardápio ausente ou apagado. */
	findMenuItem(id: string): Promise<{ recipeName: string | null; menu: DailyMenuView | null } | null>
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
function formatWeekday(day: number): string {
	return getWeekdayLabel(day) ?? "dia inválido"
}

function formatMenu(menu: DailyMenuView): string {
	return [formatDate(menu.serviceDate), formatText(menu.mealTypeName, "refeição sem nome"), formatText(menu.kitchenName, "cozinha sem nome")].join(" · ")
}

function buildDescription(details: (ChatActionDetail | null)[]): ChatActionDescription {
	return { status: "described", details: details.filter((d): d is ChatActionDetail => d !== null) }
}

// ── Argumentos ──────────────────────────────────────────────────────────────

/**
 * Mensagem da recusa do argumento, como a tool a daria; `null` quando o erro não é de validação
 * (aí a descrição vira `unavailable`). O `ZodError` sai resumido por campo: a `message` dele é o
 * JSON das issues.
 */
export function describeArgsError(error: unknown): string | null {
	if (error instanceof ToolValidationError) return error.message
	if (error instanceof ZodError) {
		return error.issues.map((issue) => (issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message)).join("; ")
	}
	return null
}

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

/**
 * `parsed` é a saída do `parseArgs` da própria tool (via registro); o tipo de cada `case` é o
 * que aquele `parseArgs` devolve.
 */
async function describeByTool(
	toolName: string,
	parsed: Record<string, unknown>,
	access: ChatActionAccess,
	reader: ChatActionReader
): Promise<ChatActionDescription> {
	switch (toolName) {
		case "create_recipe": {
			const args = parsed as CreateRecipeArgs
			if (!access.hasReadPermission("global")) return UNAVAILABLE
			return buildDescription([
				{ label: "Receita nova (catálogo global)", value: formatText(args.name) },
				args.preparationTime != null ? { label: "Tempo de preparo", value: `${args.preparationTime} min` } : null,
				args.cookingFactor != null ? { label: "Fator de cocção", value: String(args.cookingFactor) } : null,
			])
		}

		case "update_recipe": {
			const args = parsed as UpdateRecipeArgs
			if (!access.hasReadPermission("global")) return UNAVAILABLE
			const recipe = await reader.findRecipe(args.recipeId)
			// A tool só altera receita global; descrever a de uma cozinha seria mostrar o que ela não toca.
			if (!recipe || recipe.kitchenId !== null) return UNAVAILABLE
			return buildDescription([
				{ label: "Receita", value: formatText(recipe.name) },
				// Nome só com espaços passa na tool e vira texto vazio; o cartão diz isso, não "sem nome".
				args.name !== undefined ? { label: "Novo nome", value: formatText(args.name, "(vazio)") } : null,
				args.preparationTime != null ? { label: "Tempo de preparo", value: `${args.preparationTime} min` } : null,
				args.cookingFactor != null ? { label: "Fator de cocção", value: String(args.cookingFactor) } : null,
			])
		}

		case "create_daily_menu": {
			const args = parsed as UpsertDailyMenu
			if (!isKitchenVisible(access, args.kitchenId)) return UNAVAILABLE
			const [kitchen, mealTypes] = await Promise.all([reader.findKitchen(args.kitchenId), reader.findMealTypes([args.mealTypeId])])
			const mealType = mealTypes.get(args.mealTypeId)
			if (!kitchen || !mealType) return UNAVAILABLE
			if (mealType.kitchenId !== null && mealType.kitchenId !== args.kitchenId) return UNAVAILABLE
			return buildDescription([
				{
					label: "Cardápio novo",
					value: [formatDate(args.serviceDate), formatText(mealType.name, "refeição sem nome"), formatText(kitchen.name, "cozinha sem nome")].join(" · "),
				},
				args.forecastedHeadcount != null ? { label: "Comensais previstos", value: String(args.forecastedHeadcount) } : null,
			])
		}

		case "add_menu_item": {
			const args = parsed as AddMenuItemArgs
			// As duas leituras juntas; o nome da receita só sai depois de o cardápio passar no crivo.
			const [menu, recipe] = await Promise.all([reader.findDailyMenu(args.dailyMenuId), reader.findRecipe(args.recipeId)])
			if (!menu || !isKitchenVisible(access, menu.kitchenId)) return UNAVAILABLE
			if (!recipe || !isRecipeVisibleFrom(recipe, menu.kitchenId)) return UNAVAILABLE
			return buildDescription([
				{ label: "Receita", value: formatText(recipe.name) },
				{ label: "Cardápio", value: formatMenu(menu) },
			])
		}

		case "remove_menu_item": {
			const args = parsed as RemoveMenuItemArgs
			const item = await reader.findMenuItem(args.itemId)
			if (!item?.menu || !isKitchenVisible(access, item.menu.kitchenId)) return UNAVAILABLE
			return buildDescription([
				{ label: "Item", value: formatText(item.recipeName, "item sem nome") },
				{ label: "Cardápio", value: formatMenu(item.menu) },
			])
		}

		case "update_menu_headcount": {
			const args = parsed as UpdateMenuHeadcountArgs
			const menu = await reader.findDailyMenu(args.menuId)
			if (!menu || !isKitchenVisible(access, menu.kitchenId)) return UNAVAILABLE
			const current = menu.forecastedHeadcount == null ? "a definir" : String(menu.forecastedHeadcount)
			return buildDescription([
				{ label: "Cardápio", value: formatMenu(menu) },
				{ label: "Comensais previstos", value: `${current} → ${args.forecastedHeadcount}` },
			])
		}

		case "apply_template": {
			const args = parsed as AgentApplyTemplate
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
				// Mesmo rótulo e mesmo valor do campo do `ApplyTemplateDialog`: o dia da semana em que cai
				// o dia 1 do template — as datas nesse dia recebem o dia 1, e os demais seguem a ordem
				// dele (`applyTemplate`). Não é "o dia do template da primeira data".
				{ label: "Dia inicial do template", value: formatWeekday(args.startDayOfWeek) },
				headcountLines.length > 0 ? { label: "Efetivo por refeição", value: headcountLines.join("; ") } : null,
			])
		}

		case "update_quantity_estimate_status": {
			const args = parsed as AgentUpdateQuantityEstimateStatus
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
 * Descreve a ação. Argumento que a tool recusaria vira `invalid`, com a recusa dela. Qualquer
 * outra falha — tool que não é de escrita do módulo, linha inexistente, fora do escopo ou da
 * permissão, erro de leitura — devolve `unavailable`, e o cartão mostra a ação sem a descrição.
 */
export async function describeChatAction(input: DescribeChatActionInput, access: ChatActionAccess, reader: ChatActionReader): Promise<ChatActionDescription> {
	let parsed: Record<string, unknown> | undefined
	try {
		parsed = parseApprovalToolArgs(access.module, input.toolName, input.args)
	} catch (error) {
		const message = describeArgsError(error)
		return message === null ? UNAVAILABLE : { status: "invalid", message: formatText(message, "argumento recusado pela ferramenta") }
	}
	if (parsed === undefined) return UNAVAILABLE
	try {
		return await describeByTool(input.toolName, parsed, access, reader)
	} catch {
		return UNAVAILABLE
	}
}
