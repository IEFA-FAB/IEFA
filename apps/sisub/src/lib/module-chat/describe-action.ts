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
 * (`action-reader.server.ts`), para o teste não depender de `@/server/*`.
 */

import { z } from "zod"
import type { ChatModule } from "@/types/domain/module-chat"

// ── Contrato ────────────────────────────────────────────────────────────────

export interface ChatActionDetail {
	label: string
	value: string
}

export type ChatActionDescription = { status: "described"; details: ChatActionDetail[] } | { status: "unavailable" }

export const UNAVAILABLE: ChatActionDescription = { status: "unavailable" }

export interface DailyMenuView {
	serviceDate: string | null
	mealTypeName: string | null
	kitchenId: number | null
	kitchenName: string | null
	forecastedHeadcount: number | null
}

/** Leituras mínimas que a descrição precisa. `null` = não existe (ou foi apagado). */
export interface ChatActionReader {
	recipe(id: string): Promise<{ name: string; kitchenId: number | null } | null>
	kitchen(id: number): Promise<{ name: string | null } | null>
	mealType(id: string): Promise<{ name: string | null; kitchenId: number | null } | null>
	dailyMenu(id: string): Promise<DailyMenuView | null>
	menuItem(id: string): Promise<{ recipeName: string | null; dailyMenuId: string | null } | null>
	template(id: string): Promise<{ name: string | null; kitchenId: number | null } | null>
	quantityEstimate(id: string): Promise<{ title: string; status: string; unitId: number; unitName: string | null } | null>
}

type PbacModule = "global" | "kitchen" | "unit"
export type ReadScope = { type: "kitchen" | "unit"; id: number }

export interface ChatActionAccess {
	module: ChatModule
	scopeId?: number
	/** `hasPermission(permissions, module, 1, scope)` do usuário da sessão. */
	canRead(module: PbacModule, scope?: ReadScope): boolean
}

export interface DescribeChatActionInput {
	toolName: string
	args: Record<string, unknown>
}

// ── Tools de escrita por módulo ─────────────────────────────────────────────

/** As 8 tools de escrita do chat, no módulo em que existem. */
export const WRITE_TOOLS_BY_MODULE: Record<ChatModule, readonly string[]> = {
	global: ["create_recipe", "update_recipe"],
	kitchen: ["create_daily_menu", "add_menu_item", "remove_menu_item", "update_menu_headcount", "apply_template"],
	unit: ["update_quantity_estimate_status"],
	"local-analytics": [],
}

// ── Formatação ──────────────────────────────────────────────────────────────

const MAX_VALUE_CHARS = 200

/** Texto de banco ou do modelo, curto e numa linha só. */
function text(value: string | null | undefined, fallback = "sem nome"): string {
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

function statusLabel(status: string): string {
	return QUANTITY_ESTIMATE_STATUS_LABEL[status] ?? status
}

function describeMenu(menu: DailyMenuView): string {
	return [formatDate(menu.serviceDate), text(menu.mealTypeName, "refeição sem nome"), text(menu.kitchenName, "cozinha sem nome")].join(" · ")
}

function described(details: (ChatActionDetail | null)[]): ChatActionDescription {
	return { status: "described", details: details.filter((d): d is ChatActionDetail => d !== null) }
}

// ── Argumentos (o mesmo formato que as tools aceitam) ───────────────────────

const Uuid = z.uuid()
const KitchenId = z.coerce.number().int().positive()
const OptionalNumber = z.coerce.number().finite().nullish()
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const CreateRecipeArgs = z.object({ name: z.string().min(1), preparationTime: OptionalNumber, cookingFactor: OptionalNumber })
const UpdateRecipeArgs = z.object({ recipeId: Uuid, name: z.string().nullish(), preparationTime: OptionalNumber, cookingFactor: OptionalNumber })
const CreateDailyMenuArgs = z.object({ kitchenId: KitchenId, date: IsoDate, mealTypeId: z.string().trim().pipe(Uuid), forecastedHeadcount: OptionalNumber })
const AddMenuItemArgs = z.object({ dailyMenuId: Uuid, recipeId: Uuid })
const RemoveMenuItemArgs = z.object({ itemId: Uuid })
const UpdateHeadcountArgs = z.object({ menuId: Uuid, forecastedHeadcount: z.coerce.number().int() })
const ApplyTemplateArgs = z.object({
	templateId: Uuid,
	kitchenId: KitchenId,
	targetDates: z.array(IsoDate).min(1).max(31),
	headcounts: z
		.array(z.object({ mealTypeId: Uuid, headcount: z.number().int().nullish() }))
		.max(50)
		.nullish(),
})
const UpdateEstimateStatusArgs = z.object({ quantityEstimateId: Uuid, status: z.string().min(1) })

// ── Descrição ───────────────────────────────────────────────────────────────

/**
 * A cozinha resolvida da linha tem de ser a da rota (quando há rota) e legível pelo usuário.
 * Mesmo crivo do `assertRouteScope` das tools, mais o PBAC de leitura.
 */
function canSeeKitchen(access: ChatActionAccess, kitchenId: number | null): kitchenId is number {
	if (kitchenId == null) return false
	if (access.scopeId != null && kitchenId !== access.scopeId) return false
	return access.canRead("kitchen", { type: "kitchen", id: kitchenId })
}

function canSeeUnit(access: ChatActionAccess, unitId: number): boolean {
	if (access.scopeId != null && unitId !== access.scopeId) return false
	return access.canRead("unit", { type: "unit", id: unitId })
}

/** Receita global (catálogo) ou da própria cozinha — a mesma regra do `add_menu_item`. */
function isRecipeVisibleFrom(recipe: { kitchenId: number | null }, kitchenId: number): boolean {
	return recipe.kitchenId === null || recipe.kitchenId === kitchenId
}

async function describeByTool(input: DescribeChatActionInput, access: ChatActionAccess, reader: ChatActionReader): Promise<ChatActionDescription> {
	switch (input.toolName) {
		case "create_recipe": {
			const args = CreateRecipeArgs.parse(input.args)
			if (!access.canRead("global")) return UNAVAILABLE
			return described([
				{ label: "Receita nova (catálogo global)", value: text(args.name) },
				args.preparationTime != null ? { label: "Tempo de preparo", value: `${args.preparationTime} min` } : null,
				args.cookingFactor != null ? { label: "Fator de cocção", value: String(args.cookingFactor) } : null,
			])
		}

		case "update_recipe": {
			const args = UpdateRecipeArgs.parse(input.args)
			if (!access.canRead("global")) return UNAVAILABLE
			const recipe = await reader.recipe(args.recipeId)
			// A tool só altera receita global; descrever a de uma cozinha seria mostrar o que ela não toca.
			if (!recipe || recipe.kitchenId !== null) return UNAVAILABLE
			return described([
				{ label: "Receita", value: text(recipe.name) },
				args.name != null ? { label: "Novo nome", value: text(args.name) } : null,
				args.preparationTime != null ? { label: "Tempo de preparo", value: `${args.preparationTime} min` } : null,
				args.cookingFactor != null ? { label: "Fator de cocção", value: String(args.cookingFactor) } : null,
			])
		}

		case "create_daily_menu": {
			const args = CreateDailyMenuArgs.parse(input.args)
			if (!canSeeKitchen(access, args.kitchenId)) return UNAVAILABLE
			const [kitchen, mealType] = await Promise.all([reader.kitchen(args.kitchenId), reader.mealType(args.mealTypeId)])
			if (!kitchen || !mealType) return UNAVAILABLE
			if (mealType.kitchenId !== null && mealType.kitchenId !== args.kitchenId) return UNAVAILABLE
			return described([
				{
					label: "Cardápio novo",
					value: [formatDate(args.date), text(mealType.name, "refeição sem nome"), text(kitchen.name, "cozinha sem nome")].join(" · "),
				},
				args.forecastedHeadcount != null ? { label: "Comensais previstos", value: String(args.forecastedHeadcount) } : null,
			])
		}

		case "add_menu_item": {
			const args = AddMenuItemArgs.parse(input.args)
			const menu = await reader.dailyMenu(args.dailyMenuId)
			if (!menu || !canSeeKitchen(access, menu.kitchenId)) return UNAVAILABLE
			const recipe = await reader.recipe(args.recipeId)
			if (!recipe || !isRecipeVisibleFrom(recipe, menu.kitchenId)) return UNAVAILABLE
			return described([
				{ label: "Receita", value: text(recipe.name) },
				{ label: "Cardápio", value: describeMenu(menu) },
			])
		}

		case "remove_menu_item": {
			const args = RemoveMenuItemArgs.parse(input.args)
			const item = await reader.menuItem(args.itemId)
			if (!item?.dailyMenuId) return UNAVAILABLE
			const menu = await reader.dailyMenu(item.dailyMenuId)
			if (!menu || !canSeeKitchen(access, menu.kitchenId)) return UNAVAILABLE
			return described([
				{ label: "Item", value: text(item.recipeName, "item sem nome") },
				{ label: "Cardápio", value: describeMenu(menu) },
			])
		}

		case "update_menu_headcount": {
			const args = UpdateHeadcountArgs.parse(input.args)
			const menu = await reader.dailyMenu(args.menuId)
			if (!menu || !canSeeKitchen(access, menu.kitchenId)) return UNAVAILABLE
			const current = menu.forecastedHeadcount == null ? "a definir" : String(menu.forecastedHeadcount)
			return described([
				{ label: "Cardápio", value: describeMenu(menu) },
				{ label: "Comensais previstos", value: `${current} → ${args.forecastedHeadcount}` },
			])
		}

		case "apply_template": {
			const args = ApplyTemplateArgs.parse(input.args)
			if (!canSeeKitchen(access, args.kitchenId)) return UNAVAILABLE
			const [template, kitchen] = await Promise.all([reader.template(args.templateId), reader.kitchen(args.kitchenId)])
			if (!template || !kitchen) return UNAVAILABLE
			if (template.kitchenId !== null && template.kitchenId !== args.kitchenId) return UNAVAILABLE

			const dates = [...new Set(args.targetDates)].toSorted()
			const headcountLines: string[] = []
			for (const entry of args.headcounts ?? []) {
				const mealType = await reader.mealType(entry.mealTypeId)
				if (!mealType || (mealType.kitchenId !== null && mealType.kitchenId !== args.kitchenId)) return UNAVAILABLE
				headcountLines.push(`${text(mealType.name, "refeição sem nome")}: ${entry.headcount ?? "a definir"}`)
			}
			return described([
				{ label: "Template", value: text(template.name) },
				{ label: "Cozinha", value: text(kitchen.name, "cozinha sem nome") },
				{ label: dates.length === 1 ? "Data (só dias vazios)" : `${dates.length} datas (só dias vazios)`, value: dates.map(formatDate).join(", ") },
				headcountLines.length > 0 ? { label: "Efetivo por refeição", value: headcountLines.join("; ") } : null,
			])
		}

		case "update_quantity_estimate_status": {
			const args = UpdateEstimateStatusArgs.parse(input.args)
			const estimate = await reader.quantityEstimate(args.quantityEstimateId)
			if (!estimate || !canSeeUnit(access, estimate.unitId)) return UNAVAILABLE
			return described([
				{ label: "Anexo quantitativo", value: text(estimate.title, "sem título") },
				{ label: "OM", value: text(estimate.unitName, "OM sem nome") },
				{ label: "Status", value: `${statusLabel(estimate.status)} → ${statusLabel(args.status)}` },
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
	if (!WRITE_TOOLS_BY_MODULE[access.module]?.includes(input.toolName)) return UNAVAILABLE
	try {
		return await describeByTool(input, access, reader)
	} catch {
		return UNAVAILABLE
	}
}
