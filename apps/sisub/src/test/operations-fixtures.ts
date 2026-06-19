/**
 * Fixtures compartilhadas para os testes de regressão das domain operations
 * (`@iefa/sisub-domain`), executados ANTES da migração para Drizzle.
 *
 * Objetivo: semear o mínimo de dados via service-role client, exercitar a operation
 * e limpar tudo de forma determinística (LIFO) mesmo em caso de falha.
 *
 * Convenções:
 *   - Todo campo textual livre recebe prefixo "[TEST]" para rastreabilidade.
 *   - Nomes/datas únicos por execução via `uid()` / `futureDate()` — evita colidir com
 *     dados reais e com o índice UNIQUE que ignora deleted_at (ver memória do projeto).
 *   - Cleanup é HARD delete (não soft) na ordem inversa de criação → filhos antes de pais.
 */

import type { AppModule, UserContext, UserPermission } from "@iefa/sisub-domain"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createSisubReachabilityClient, createSisubServiceClient, getSupabaseTestEnv } from "./supabase"

// biome-ignore lint/suspicious/noExplicitAny: generic Supabase client (mesmo tipo usado nas operations)
export type AnyClient = SupabaseClient<any, any, any>

// ── Setup de integração (env + reachability + service client) ────────────────

type IntegrationSetup = { reachable: true; client: AnyClient } | { reachable: false; client: null }

/**
 * Resolve env + testa alcançabilidade do Supabase. Retorna `reachable: false` (sem lançar)
 * quando faltam credenciais ou o banco está inacessível — os testes então fazem early-return,
 * espelhando o padrão de `recipes.test.ts`.
 */
export async function setupIntegration(probeTable = "recipes"): Promise<IntegrationSetup> {
	const env = getSupabaseTestEnv()
	if (!env) return { reachable: false, client: null }
	try {
		const probe = createSisubReachabilityClient(env)
		const { error } = await probe.from(probeTable).select("id").limit(1)
		if (error) return { reachable: false, client: null }
	} catch {
		return { reachable: false, client: null }
	}
	// Timeout generoso: a suite satura o PostgREST remoto sob concorrência; 8s (default)
	// causaria abort em seeds/cleanups e vazaria fixtures.
	return { reachable: true, client: createSisubServiceClient(env, { requestTimeoutMs: 20_000 }) }
}

// ── Contexto de usuário com acesso total ─────────────────────────────────────

const ALL_MODULES: AppModule[] = ["diner", "messhall", "unit", "kitchen", "kitchen-production", "global", "analytics", "local-analytics", "storage"]

/**
 * UserContext que passa em qualquer guard de happy-path: permissão global (escopos nulos)
 * nível 3 em todos os módulos. Escopo nulo = vale para qualquer kitchen/unit/mess_hall.
 */
export function fullAccessCtx(userId = "00000000-0000-4000-8000-000000000001"): UserContext {
	const permissions: UserPermission[] = ALL_MODULES.map((module) => ({
		module,
		level: 3,
		mess_hall_id: null,
		kitchen_id: null,
		unit_id: null,
	}))
	return { userId, permissions }
}

// ── Geradores de identificadores únicos por execução ─────────────────────────

let seq = 0
// Entropia por processo: workers paralelos do vitest carregam o módulo no mesmo ms;
// só Date.now() colidiria (mesmo RUN + seq) e violaria UNIQUEs (ex.: units.code).
const RUN = `${Date.now().toString(36)}${crypto.randomUUID().slice(0, 8)}`

/** String única e estável por execução, com prefixo opcional. */
export function uid(prefix = ""): string {
	seq += 1
	return `${prefix}${RUN}-${seq}`
}

const DATE_BASE = Date.UTC(2099, 0, 1) // 2099-01-01 — bem no futuro, não colide com dados reais
const ONE_DAY = 24 * 60 * 60 * 1000

/** Data YYYY-MM-DD determinística e distante, deslocada por `offsetDays`. */
export function futureDate(offsetDays = 0): string {
	return new Date(DATE_BASE + offsetDays * ONE_DAY).toISOString().slice(0, 10)
}

// ── Seeder com cleanup LIFO ──────────────────────────────────────────────────

type CleanupFn = () => Promise<void>

export interface Seeder {
	readonly client: AnyClient
	/** Registra remoção de uma linha por id (executada em LIFO no cleanup). */
	track(table: string, id: string | number): void
	/** Registra remoção por coluna arbitrária (ex.: filhos por <pai>_id). */
	trackWhere(table: string, column: string, value: string | number): void
	/** Registra um thunk de limpeza arbitrário. */
	trackFn(fn: CleanupFn): void

	seedUnit(): Promise<number>
	seedKitchen(opts?: { unitId?: number }): Promise<{ id: number; unitId: number }>
	seedFolder(opts?: { parentId?: string | null }): Promise<string>
	seedIngredient(opts?: { folderId?: string | null; measureUnit?: string; correctionFactor?: number }): Promise<string>
	seedIngredientItem(opts: { ingredientId: string; purchaseItemId?: string | null }): Promise<string>
	seedNutrient(opts?: { displayOrder?: number }): Promise<string>
	seedCeafa(opts?: { description?: string }): Promise<string>
	seedRecipe(opts?: {
		kitchenId?: number | null
		baseRecipeId?: string | null
		version?: number
		portionYield?: number
		name?: string
		ingredients?: { ingredientId: string; netQuantity: number }[]
	}): Promise<string>
	seedMealType(opts?: { kitchenId?: number | null; sortOrder?: number }): Promise<string>
	seedDailyMenu(opts: { kitchenId: number; mealTypeId: string; serviceDate?: string }): Promise<{ id: string; serviceDate: string }>
	seedMenuItem(opts: { dailyMenuId: string; recipeId: string; plannedPortionQuantity?: number; excludedFromProcurement?: 0 | 1 }): Promise<string>
	seedTemplate(opts?: { kitchenId?: number | null; templateType?: "weekly" | "event"; deleted?: boolean }): Promise<string>
	seedTemplateItem(opts: { templateId: string; mealTypeId: string; recipeId: string; dayOfWeek: number; headcountOverride?: number }): Promise<string>

	// ── Identidade (auth.users) e tabelas user-scoped ──────────────────────────
	/** Cria um usuário auth descartável (service-role). Cleanup via auth.admin.deleteUser. */
	seedAuthUser(opts?: { email?: string }): Promise<string>
	seedMessHall(opts?: { unitId?: number; kitchenId?: number | null; code?: string }): Promise<{ id: number; unitId: number; code: string }>
	seedUserData(opts: { id: string; email?: string; nrOrdem?: string; defaultMessHallId?: number | null }): Promise<string>
	seedUserMilitaryData(opts?: { nrOrdem?: string; nrCpf?: string; nmGuerra?: string; sgPosto?: string }): Promise<string>
	seedMealForecast(opts: { userId: string; messHallId: number; date?: string; meal?: string; willEat?: boolean }): Promise<void>
	seedMealPresence(opts: { userId: string; messHallId: number; date?: string; meal?: string }): Promise<string>
	seedOtherPresence(opts: { adminId: string; messHallId: number; date?: string; meal?: string }): Promise<void>
	seedUserPermission(opts: {
		userId: string
		module?: string
		level?: number
		messHallId?: number | null
		kitchenId?: number | null
		unitId?: number | null
	}): Promise<string>

	// ── Compras (purchase_item) ────────────────────────────────────────────────
	seedPurchaseItem(opts?: { description?: string; deleted?: boolean }): Promise<string>
	seedPurchaseItemIngredient(opts: { purchaseItemId: string; ingredientId: string; isDefault?: boolean; conversionFactor?: number }): Promise<string>

	/** Remove todos os daily_menu (e seus menu_items) de uma cozinha — usado após applyTemplate. */
	purgeKitchenMenus(kitchenId: number): Promise<void>

	/** Executa todas as limpezas registradas em ordem LIFO (engole erros para não mascarar a falha real). */
	cleanup(): Promise<void>
}

export function makeSeeder(client: AnyClient): Seeder {
	const cleanups: CleanupFn[] = []

	// IMPORTANTE: supabase-js NÃO lança em erro — retorna { error }. Se o delete falhar
	// (FK ainda pendente, timeout sob carga), precisamos LANÇAR para o retry do cleanup
	// reprocessar; senão a linha vaza silenciosamente (pending=0, sem erro aparente).
	const track: Seeder["track"] = (table, id) => {
		cleanups.push(async () => {
			const { error } = await client.from(table).delete().eq("id", id)
			if (error) throw new Error(`delete ${table}#${id}: ${error.message}`)
		})
	}
	const trackWhere: Seeder["trackWhere"] = (table, column, value) => {
		cleanups.push(async () => {
			const { error } = await client.from(table).delete().eq(column, value)
			if (error) throw new Error(`delete ${table}.${column}=${value}: ${error.message}`)
		})
	}
	const trackFn: Seeder["trackFn"] = (fn) => {
		cleanups.push(fn)
	}

	async function insertReturningId(table: string, row: Record<string, unknown>): Promise<string | number> {
		const { data, error } = await client.from(table).insert(row).select("id").single()
		if (error || !data) throw new Error(`seed ${table} failed: ${error?.message ?? "no row"}`)
		track(table, data.id)
		return data.id as string | number
	}

	const seeder: Seeder = {
		client,
		track,
		trackWhere,
		trackFn,

		async seedUnit() {
			return (await insertReturningId("units", { code: uid("[TEST]U") })) as number
		},

		async seedKitchen(opts) {
			const unitId = opts?.unitId ?? (await seeder.seedUnit())
			const id = (await insertReturningId("kitchen", {
				display_name: uid("[TEST] Cozinha "),
				unit_id: unitId,
			})) as number
			return { id, unitId }
		},

		async seedFolder(opts) {
			return (await insertReturningId("folder", {
				description: uid("[TEST] Pasta "),
				parent_id: opts?.parentId ?? null,
			})) as string
		},

		async seedIngredient(opts) {
			return (await insertReturningId("ingredient", {
				description: uid("[TEST] Insumo "),
				folder_id: opts?.folderId ?? null,
				measure_unit: opts?.measureUnit ?? "KG",
				correction_factor: opts?.correctionFactor ?? null,
			})) as string
		},

		async seedIngredientItem(opts) {
			return (await insertReturningId("ingredient_item", {
				ingredient_id: opts.ingredientId,
				description: uid("[TEST] Item "),
				purchase_measure_unit: "UN",
				unit_content_quantity: 1,
				purchase_item_id: opts.purchaseItemId ?? null,
			})) as string
		},

		async seedNutrient(opts) {
			return (await insertReturningId("nutrient", {
				name: uid("[TEST] Nutriente "),
				display_order: opts?.displayOrder ?? 0,
			})) as string
		},

		async seedCeafa(opts) {
			return (await insertReturningId("ceafa", {
				description: opts?.description ?? uid("[TEST] CEAFA "),
				quantity: 100,
			})) as string
		},

		async seedRecipe(opts) {
			const recipeId = (await insertReturningId("recipes", {
				name: opts?.name ?? uid("[TEST] Receita "),
				portion_yield: opts?.portionYield ?? 100,
				kitchen_id: opts?.kitchenId ?? null,
				base_recipe_id: opts?.baseRecipeId ?? null,
				version: opts?.version ?? 1,
			})) as string
			if (opts?.ingredients?.length) {
				const rows = opts.ingredients.map((ing, i) => ({
					recipe_id: recipeId,
					ingredient_id: ing.ingredientId,
					net_quantity: ing.netQuantity,
					is_optional: false,
					priority_order: i,
				}))
				const { error } = await client.from("recipe_ingredients").insert(rows)
				if (error) throw new Error(`seed recipe_ingredients failed: ${error.message}`)
				trackWhere("recipe_ingredients", "recipe_id", recipeId)
			}
			return recipeId
		},

		async seedMealType(opts) {
			return (await insertReturningId("meal_type", {
				name: uid("[TEST] Refeição "),
				kitchen_id: opts?.kitchenId ?? null,
				sort_order: opts?.sortOrder ?? 0,
			})) as string
		},

		async seedDailyMenu(opts) {
			const serviceDate = opts.serviceDate ?? futureDate(seq)
			const id = (await insertReturningId("daily_menu", {
				kitchen_id: opts.kitchenId,
				meal_type_id: opts.mealTypeId,
				service_date: serviceDate,
				status: "PLANNED",
			})) as string
			return { id, serviceDate }
		},

		async seedMenuItem(opts) {
			return (await insertReturningId("menu_items", {
				daily_menu_id: opts.dailyMenuId,
				recipe_origin_id: opts.recipeId,
				recipe: {},
				planned_portion_quantity: opts.plannedPortionQuantity ?? 100,
				excluded_from_procurement: opts.excludedFromProcurement ?? 0,
			})) as string
		},

		async seedTemplate(opts) {
			const id = (await insertReturningId("menu_template", {
				name: uid("[TEST] Template "),
				kitchen_id: opts?.kitchenId ?? null,
				template_type: opts?.templateType ?? "weekly",
				...(opts?.deleted ? { deleted_at: new Date().toISOString() } : {}),
			})) as string
			return id
		},

		async seedTemplateItem(opts) {
			return (await insertReturningId("menu_template_items", {
				menu_template_id: opts.templateId,
				day_of_week: opts.dayOfWeek,
				meal_type_id: opts.mealTypeId,
				recipe_id: opts.recipeId,
				...(opts.headcountOverride != null && { headcount_override: opts.headcountOverride }),
			})) as string
		},

		async seedAuthUser(opts) {
			const email = opts?.email ?? `${uid("test-")}@example.invalid`.toLowerCase()
			const { data, error } = await client.auth.admin.createUser({ email, email_confirm: true })
			if (error || !data.user) throw new Error(`seed auth user failed: ${error?.message ?? "no user"}`)
			const id = data.user.id
			// auth.users é deletado por último (LIFO): as linhas user-scoped o referenciam.
			cleanups.push(async () => {
				const { error: delErr } = await client.auth.admin.deleteUser(id)
				if (delErr) throw new Error(`delete auth user ${id}: ${delErr.message}`)
			})
			return id
		},

		async seedMessHall(opts) {
			const unitId = opts?.unitId ?? (await seeder.seedUnit())
			const code = opts?.code ?? uid("[TEST]MH")
			const id = (await insertReturningId("mess_halls", {
				unit_id: unitId,
				code,
				display_name: uid("[TEST] Rancho "),
				kitchen_id: opts?.kitchenId ?? null,
			})) as number
			return { id, unitId, code }
		},

		async seedUserData(opts) {
			const { error } = await client
				.schema("sisub")
				.from("user_data")
				.insert({
					id: opts.id,
					email: opts.email ?? `${uid("ud-")}@example.invalid`.toLowerCase(),
					...(opts.nrOrdem !== undefined && { nrOrdem: opts.nrOrdem }),
					...(opts.defaultMessHallId !== undefined && { default_mess_hall_id: opts.defaultMessHallId }),
				})
			if (error) throw new Error(`seed user_data failed: ${error.message}`)
			track("user_data", opts.id)
			return opts.id
		},

		async seedUserMilitaryData(opts) {
			const nrOrdem = opts?.nrOrdem ?? uid("NO")
			const { error } = await client.from("user_military_data").insert({
				nrOrdem,
				nrCpf: opts?.nrCpf ?? uid("CPF"),
				nmGuerra: opts?.nmGuerra ?? uid("[TEST] Guerra "),
				sgPosto: opts?.sgPosto ?? "SO",
			})
			if (error) throw new Error(`seed user_military_data failed: ${error.message}`)
			trackWhere("user_military_data", "nrOrdem", nrOrdem)
			return nrOrdem
		},

		async seedMealForecast(opts) {
			const { error } = await client
				.schema("sisub")
				.from("meal_forecasts")
				.insert({
					user_id: opts.userId,
					mess_hall_id: opts.messHallId,
					date: opts.date ?? futureDate(seq),
					meal: opts.meal ?? "almoco",
					will_eat: opts.willEat ?? true,
				})
			if (error) throw new Error(`seed meal_forecasts failed: ${error.message}`)
			trackWhere("meal_forecasts", "user_id", opts.userId)
		},

		async seedMealPresence(opts) {
			const id = (await insertReturningId("meal_presences", {
				user_id: opts.userId,
				mess_hall_id: opts.messHallId,
				date: opts.date ?? futureDate(seq),
				meal: opts.meal ?? "almoco",
			})) as string
			return id
		},

		async seedOtherPresence(opts) {
			const { error } = await client
				.schema("sisub")
				.from("other_presences")
				.insert({
					admin_id: opts.adminId,
					mess_hall_id: opts.messHallId,
					date: opts.date ?? futureDate(seq),
					meal: opts.meal ?? "almoco",
				})
			if (error) throw new Error(`seed other_presences failed: ${error.message}`)
			trackWhere("other_presences", "admin_id", opts.adminId)
		},

		async seedUserPermission(opts) {
			return (await insertReturningId("user_permissions", {
				user_id: opts.userId,
				module: opts.module ?? "kitchen",
				level: opts.level ?? 2,
				mess_hall_id: opts.messHallId ?? null,
				kitchen_id: opts.kitchenId ?? null,
				unit_id: opts.unitId ?? null,
			})) as string
		},

		async seedPurchaseItem(opts) {
			return (await insertReturningId("purchase_item", {
				description: opts?.description ?? uid("[TEST] Compra "),
				...(opts?.deleted ? { deleted_at: new Date().toISOString() } : {}),
			})) as string
		},

		async seedPurchaseItemIngredient(opts) {
			return (await insertReturningId("purchase_item_ingredient", {
				purchase_item_id: opts.purchaseItemId,
				ingredient_id: opts.ingredientId,
				is_default: opts.isDefault ?? false,
				conversion_factor: opts.conversionFactor ?? 1,
			})) as string
		},

		async purgeKitchenMenus(kitchenId) {
			const { data: menus, error: selErr } = await client.from("daily_menu").select("id").eq("kitchen_id", kitchenId)
			if (selErr) throw new Error(`purge select: ${selErr.message}`)
			const ids = (menus ?? []).map((m: { id: string }) => m.id)
			if (ids.length > 0) {
				const { error: miErr } = await client.from("menu_items").delete().in("daily_menu_id", ids)
				if (miErr) throw new Error(`purge menu_items: ${miErr.message}`)
				const { error: dmErr } = await client.from("daily_menu").delete().in("id", ids)
				if (dmErr) throw new Error(`purge daily_menu: ${dmErr.message}`)
			}
		},

		async cleanup() {
			// Multi-pass com retry: a maioria dos FKs em sisub é NO ACTION e algumas linhas
			// filhas são criadas pelas operations com UUID aleatório (não rastreadas, ex.:
			// menu_items do applyTemplate, limpos pelo purge). Um único passe LIFO falharia
			// quando o pai é tentado antes do purge remover os filhos. Repetimos até não
			// haver progresso → a ordem de dependência deixa de importar.
			let pending = cleanups.splice(0).reverse() // LIFO como ponto de partida
			let lastErr: unknown = null
			for (let pass = 0; pass < 8 && pending.length > 0; pass++) {
				const stillFailing: CleanupFn[] = []
				for (const fn of pending) {
					try {
						await fn()
					} catch (e) {
						lastErr = e
						stillFailing.push(fn)
					}
				}
				if (stillFailing.length === pending.length) break // sem progresso → desiste
				pending = stillFailing
			}
			if (pending.length > 0 && process.env.DEBUG_CLEANUP) {
				const fs = await import("node:fs")
				fs.appendFileSync("/tmp/cleanup-fail.log", `[cleanup] ${pending.length} falharam; erro: ${(lastErr as Error)?.message}\n`)
			}
		},
	}

	return seeder
}
