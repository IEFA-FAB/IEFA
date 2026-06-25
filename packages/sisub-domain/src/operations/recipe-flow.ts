/**
 * Operations do Fluxo de Produção (DAG do modo de preparo) — camada Drizzle.
 *
 * Contrato de retorno: snake_case aninhado (via `toWire`), igual ao restante do
 * domínio. O grafo é salvo inteiro (replace transacional): `saveRecipeFlow`
 * soft-deleta o fluxo anterior e re-insere, remapeando `clientId` → uuid.
 *
 * Autorização: idêntica às mutações de receita — fluxo de receita global exige
 * `global` nível 2; de receita local, `kitchen` nível 2 naquela cozinha.
 */

import {
	recipeIngredientsInKitchen,
	recipeStepInKitchen,
	recipeStepInputInKitchen,
	recipeStepOutputInKitchen,
	recipeStepUtensilInKitchen,
	recipesInKitchen,
	type SisubDb,
	stepTemplateInKitchen,
	stepTemplateUtensilInKitchen,
	utensilInKitchen,
} from "@iefa/database/drizzle/sisub"
import type { RecipeStep, RecipeStepInput, RecipeStepOutput, RecipeStepUtensil, StepTemplate, StepTemplateUtensil, Utensil } from "@iefa/database/sisub"
import { and, eq, ilike, inArray, isNull, or, type SQL } from "drizzle-orm"
import { requireAnyPermission, requireKitchen, requirePermission } from "../guards/require-permission.ts"
import type { CreateStepTemplate, CreateUtensil, FetchRecipeFlow, ListStepTemplates, ListUtensils, SaveRecipeFlow } from "../schemas/recipe-flow.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError } from "../types/errors.ts"
import { insertOneOrFail, runQuery, toWire } from "../utils/index.ts"
import { type DeclaredIngredient, type IngredientBalance, validateFlow } from "../utils/recipe-flow-graph.ts"

// Renomeia as relations "feias" do pull para as chaves do contrato.
const FLOW_RELATIONS: Record<string, string> = {
	recipeStepOutputInKitchens: "outputs",
	recipeStepInputInKitchens: "inputs",
	recipeStepUtensilInKitchens: "utensils",
	stepTemplateUtensilInKitchens: "utensils",
	utensilInKitchen: "utensil",
	stepTemplateInKitchen: "step_template",
}

// ── Wire contract (snake_case aninhado) ──
export type UtensilWire = Utensil
export type StepTemplateWire = StepTemplate & { utensils: (StepTemplateUtensil & { utensil: Utensil | null })[] }
export type RecipeStepWire = RecipeStep & {
	outputs: RecipeStepOutput[]
	inputs: RecipeStepInput[]
	utensils: (RecipeStepUtensil & { utensil: Utensil | null })[]
	step_template: StepTemplate | null
}
export interface RecipeFlowWire {
	steps: RecipeStepWire[]
}

export interface SaveFlowResult {
	steps: RecipeStepWire[]
	warnings: string[]
	balance: IngredientBalance[]
}

const WITH_FLOW = {
	recipeStepOutputInKitchens: { where: (t: typeof recipeStepOutputInKitchen, ops: { isNull: typeof isNull }) => ops.isNull(t.deletedAt) },
	recipeStepInputInKitchens: { where: (t: typeof recipeStepInputInKitchen, ops: { isNull: typeof isNull }) => ops.isNull(t.deletedAt) },
	recipeStepUtensilInKitchens: {
		where: (t: typeof recipeStepUtensilInKitchen, ops: { isNull: typeof isNull }) => ops.isNull(t.deletedAt),
		with: { utensilInKitchen: true },
	},
	stepTemplateInKitchen: true,
} as const

/** Autoriza mutação de fluxo conforme a posse da receita (global vs cozinha). */
async function authorizeFlowMutation(db: SisubDb, ctx: UserContext, recipeId: string): Promise<void> {
	const recipe = await runQuery("FETCH_FAILED", () =>
		db.query.recipesInKitchen.findFirst({ columns: { kitchenId: true }, where: eq(recipesInKitchen.id, recipeId) })
	)
	if (!recipe) throw new NotFoundError("recipe", recipeId)
	if (recipe.kitchenId == null) requirePermission(ctx, "global", 2)
	else requireKitchen(ctx, 2, recipe.kitchenId)
}

export async function fetchRecipeFlow(db: SisubDb, ctx: UserContext, input: FetchRecipeFlow): Promise<RecipeFlowWire> {
	requirePermission(ctx, "kitchen", 1)

	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.recipeStepInKitchen.findMany({
			where: and(eq(recipeStepInKitchen.recipeId, input.recipeId), isNull(recipeStepInKitchen.deletedAt)),
			// biome-ignore lint/suspicious/noExplicitAny: relational `with` callbacks are typed loosely by drizzle-kit's generated relations
			with: WITH_FLOW as any,
			orderBy: (step, { asc }) => [asc(step.createdAt)],
		})
	)

	return { steps: rows.map((r) => toWire<RecipeStepWire>(r, FLOW_RELATIONS)) }
}

/** Insumos declarados ativos da receita — base do balanço de materiais. */
async function fetchDeclaredIngredients(db: SisubDb, recipeId: string): Promise<DeclaredIngredient[]> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.recipeIngredientsInKitchen.findMany({
			columns: { id: true, netQuantity: true, isOptional: true },
			where: and(eq(recipeIngredientsInKitchen.recipeId, recipeId), isNull(recipeIngredientsInKitchen.deletedAt)),
		})
	)
	return rows.map((r) => ({
		recipeIngredientId: r.id,
		netQuantity: r.netQuantity != null ? Number(r.netQuantity) : 0,
		isOptional: r.isOptional ?? false,
	}))
}

/** Soft-delete de TODO o fluxo ativo de uma receita (steps + filhos). Roda dentro da tx do save. */
async function softDeleteFlow(tx: SisubDb, recipeId: string, now: string): Promise<void> {
	const existing = await runQuery("FETCH_FAILED", () =>
		tx
			.select({ id: recipeStepInKitchen.id })
			.from(recipeStepInKitchen)
			.where(and(eq(recipeStepInKitchen.recipeId, recipeId), isNull(recipeStepInKitchen.deletedAt)))
	)
	const stepIds = existing.map((s) => s.id)

	if (stepIds.length > 0) {
		await runQuery("DELETE_FAILED", () =>
			tx
				.update(recipeStepInputInKitchen)
				.set({ deletedAt: now })
				.where(and(inArray(recipeStepInputInKitchen.recipeStepId, stepIds), isNull(recipeStepInputInKitchen.deletedAt)))
				.then(() => undefined)
		)
		await runQuery("DELETE_FAILED", () =>
			tx
				.update(recipeStepUtensilInKitchen)
				.set({ deletedAt: now })
				.where(and(inArray(recipeStepUtensilInKitchen.recipeStepId, stepIds), isNull(recipeStepUtensilInKitchen.deletedAt)))
				.then(() => undefined)
		)
	}
	await runQuery("DELETE_FAILED", () =>
		tx
			.update(recipeStepOutputInKitchen)
			.set({ deletedAt: now })
			.where(and(eq(recipeStepOutputInKitchen.recipeId, recipeId), isNull(recipeStepOutputInKitchen.deletedAt)))
			.then(() => undefined)
	)
	await runQuery("DELETE_FAILED", () =>
		tx
			.update(recipeStepInKitchen)
			.set({ deletedAt: now })
			.where(and(eq(recipeStepInKitchen.recipeId, recipeId), isNull(recipeStepInKitchen.deletedAt)))
			.then(() => undefined)
	)
}

const numOrNull = (n: number | null | undefined): string | null => (n != null ? String(n) : null)

/**
 * Replace transacional do fluxo de uma receita. Valida (ciclo, 1-final, XOR, fontes,
 * balanço com excesso bloqueante) antes de tocar o banco; falta de consumo retorna em
 * `warnings`. Remapeia `clientId` → uuid para steps e saídas.
 */
export async function saveRecipeFlow(db: SisubDb, ctx: UserContext, input: SaveRecipeFlow): Promise<SaveFlowResult> {
	await authorizeFlowMutation(db, ctx, input.recipeId)

	const declared = await fetchDeclaredIngredients(db, input.recipeId)
	const { errors, warnings, balance } = validateFlow(input.steps, declared)
	if (errors.length > 0) throw new DomainError("FLOW_INVALID", errors.join("; "), { errors })

	const now = new Date().toISOString()
	// Mapas clientId → uuid persistido.
	const stepIdMap = new Map<string, string>()
	const outputIdMap = new Map<string, string>()
	for (const s of input.steps) {
		stepIdMap.set(s.clientId, crypto.randomUUID())
		for (const o of s.outputs) outputIdMap.set(o.clientId, crypto.randomUUID())
	}

	await db.transaction(async (tx) => {
		await softDeleteFlow(tx as unknown as SisubDb, input.recipeId, now)

		if (input.steps.length === 0) return

		const stepRows = input.steps.map((s) => ({
			id: stepIdMap.get(s.clientId) as string,
			recipeId: input.recipeId,
			stepTemplateId: s.stepTemplateId ?? null,
			label: s.label ?? null,
			description: s.description ?? null,
			durationMinutes: s.durationMinutes ?? null,
			canvasX: s.canvasX,
			canvasY: s.canvasY,
		}))
		await runQuery("INSERT_FAILED", () =>
			tx
				.insert(recipeStepInKitchen)
				.values(stepRows)
				.then(() => undefined)
		)

		const outputRows = input.steps.flatMap((s) =>
			s.outputs.map((o) => ({
				id: outputIdMap.get(o.clientId) as string,
				recipeStepId: stepIdMap.get(s.clientId) as string,
				recipeId: input.recipeId,
				label: o.label ?? null,
				quantity: numOrNull(o.quantity),
				measureUnit: o.measureUnit ?? null,
				isFinal: o.isFinal,
			}))
		)
		if (outputRows.length > 0) {
			await runQuery("INSERT_FAILED", () =>
				tx
					.insert(recipeStepOutputInKitchen)
					.values(outputRows)
					.then(() => undefined)
			)
		}

		const inputRows = input.steps.flatMap((s) =>
			s.inputs.map((inp) => ({
				recipeStepId: stepIdMap.get(s.clientId) as string,
				recipeIngredientId: inp.recipeIngredientId ?? null,
				sourceOutputId: inp.sourceOutputClientId != null ? (outputIdMap.get(inp.sourceOutputClientId) ?? null) : null,
				quantity: numOrNull(inp.quantity),
				measureUnit: inp.measureUnit ?? null,
			}))
		)
		if (inputRows.length > 0) {
			await runQuery("INSERT_FAILED", () =>
				tx
					.insert(recipeStepInputInKitchen)
					.values(inputRows)
					.then(() => undefined)
			)
		}

		const utensilRows = input.steps.flatMap((s) => s.utensilIds.map((utensilId) => ({ recipeStepId: stepIdMap.get(s.clientId) as string, utensilId })))
		if (utensilRows.length > 0) {
			await runQuery("INSERT_FAILED", () =>
				tx
					.insert(recipeStepUtensilInKitchen)
					.values(utensilRows)
					.then(() => undefined)
			)
		}
	})

	const flow = await fetchRecipeFlow(db, ctx, { recipeId: input.recipeId })
	return { steps: flow.steps, warnings, balance }
}

/**
 * Copia o fluxo ativo de `srcRecipeId` para `dstRecipeId` (nova versão da receita).
 * `riIdMap` remapeia recipe_ingredient_id antigo → novo (cada versão tem suas próprias
 * linhas de recipe_ingredients). Inputs cujo insumo sumiu na nova versão são descartados.
 * No-op silencioso quando a receita de origem não tem fluxo.
 */
export async function copyRecipeFlow(db: SisubDb, srcRecipeId: string, dstRecipeId: string, riIdMap: Map<string, string>): Promise<void> {
	const srcSteps = await runQuery("FETCH_FAILED", () =>
		db.query.recipeStepInKitchen.findMany({
			where: and(eq(recipeStepInKitchen.recipeId, srcRecipeId), isNull(recipeStepInKitchen.deletedAt)),
			// biome-ignore lint/suspicious/noExplicitAny: relational `with` callbacks typed loosely
			with: WITH_FLOW as any,
		})
	)
	if (srcSteps.length === 0) return

	// O resultado relacional do Drizzle traz as relations sob as chaves CRUAS do pull
	// (recipeStepOutputInKitchens, …) — `toWire` (que as renomearia p/ outputs/inputs/
	// utensils) NÃO é aplicado aqui, então acessamos as chaves cruas direto. O `with`
	// é passado como `any` na query (callbacks tipados frouxamente), então tipamos o
	// shape relacional manualmente.
	type RawSrcStep = {
		id: string
		stepTemplateId: string | null
		label: string | null
		description: string | null
		durationMinutes: number | null
		canvasX: number
		canvasY: number
		recipeStepOutputInKitchens: { id: string; label: string | null; quantity: string | null; measureUnit: string | null; isFinal: boolean }[]
		recipeStepInputInKitchens: { recipeIngredientId: string | null; sourceOutputId: string | null; quantity: string | null; measureUnit: string | null }[]
		recipeStepUtensilInKitchens: { utensilId: string }[]
	}
	const steps = srcSteps as unknown as RawSrcStep[]

	const stepIdMap = new Map<string, string>()
	const outputIdMap = new Map<string, string>()
	for (const s of steps) {
		stepIdMap.set(s.id, crypto.randomUUID())
		for (const o of s.recipeStepOutputInKitchens) outputIdMap.set(o.id, crypto.randomUUID())
	}

	await db.transaction(async (tx) => {
		const stepRows = steps.map((s) => ({
			id: stepIdMap.get(s.id) as string,
			recipeId: dstRecipeId,
			stepTemplateId: s.stepTemplateId ?? null,
			label: s.label ?? null,
			description: s.description ?? null,
			durationMinutes: s.durationMinutes ?? null,
			canvasX: s.canvasX,
			canvasY: s.canvasY,
		}))
		await runQuery("INSERT_FAILED", () =>
			tx
				.insert(recipeStepInKitchen)
				.values(stepRows)
				.then(() => undefined)
		)

		const outputRows = steps.flatMap((s) =>
			s.recipeStepOutputInKitchens.map((o) => ({
				id: outputIdMap.get(o.id) as string,
				recipeStepId: stepIdMap.get(s.id) as string,
				recipeId: dstRecipeId,
				label: o.label,
				quantity: o.quantity,
				measureUnit: o.measureUnit,
				isFinal: o.isFinal,
			}))
		)
		if (outputRows.length > 0) {
			await runQuery("INSERT_FAILED", () =>
				tx
					.insert(recipeStepOutputInKitchen)
					.values(outputRows)
					.then(() => undefined)
			)
		}

		const inputRows = steps.flatMap((s) =>
			s.recipeStepInputInKitchens
				.map((inp) => {
					// insumo cru → remapeia pro recipe_ingredient da nova versão; descarta se sumiu.
					const recipeIngredientId = inp.recipeIngredientId != null ? (riIdMap.get(inp.recipeIngredientId) ?? null) : null
					const sourceOutputId = inp.sourceOutputId != null ? (outputIdMap.get(inp.sourceOutputId) ?? null) : null
					if (recipeIngredientId == null && sourceOutputId == null) return null
					return {
						recipeStepId: stepIdMap.get(s.id) as string,
						recipeIngredientId,
						sourceOutputId,
						quantity: inp.quantity,
						measureUnit: inp.measureUnit,
					}
				})
				.filter((r): r is NonNullable<typeof r> => r != null)
		)
		if (inputRows.length > 0) {
			await runQuery("INSERT_FAILED", () =>
				tx
					.insert(recipeStepInputInKitchen)
					.values(inputRows)
					.then(() => undefined)
			)
		}

		const utensilRows = steps.flatMap((s) =>
			s.recipeStepUtensilInKitchens.map((u) => ({ recipeStepId: stepIdMap.get(s.id) as string, utensilId: u.utensilId }))
		)
		if (utensilRows.length > 0) {
			await runQuery("INSERT_FAILED", () =>
				tx
					.insert(recipeStepUtensilInKitchen)
					.values(utensilRows)
					.then(() => undefined)
			)
		}
	})
}

// ── Catálogo ──────────────────────────────────────────────────────────────

const WITH_TEMPLATE_UTENSILS = {
	stepTemplateUtensilInKitchens: {
		where: (t: typeof stepTemplateUtensilInKitchen, ops: { isNull: typeof isNull }) => ops.isNull(t.deletedAt),
		with: { utensilInKitchen: true },
	},
} as const

export async function listStepTemplates(db: SisubDb, ctx: UserContext, input: ListStepTemplates): Promise<StepTemplateWire[]> {
	requirePermission(ctx, "kitchen", 1)

	const conditions: (SQL | undefined)[] = [isNull(stepTemplateInKitchen.deletedAt)]
	if (input.kitchenId != null) {
		conditions.push(or(isNull(stepTemplateInKitchen.kitchenId), eq(stepTemplateInKitchen.kitchenId, input.kitchenId)))
	} else {
		conditions.push(isNull(stepTemplateInKitchen.kitchenId))
	}
	if (input.search) conditions.push(ilike(stepTemplateInKitchen.name, `%${input.search}%`))

	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.stepTemplateInKitchen.findMany({
			where: and(...conditions),
			// biome-ignore lint/suspicious/noExplicitAny: relational `with` callbacks typed loosely
			with: WITH_TEMPLATE_UTENSILS as any,
			orderBy: (t, { asc }) => [asc(t.name)],
		})
	)
	return rows.map((r) => toWire<StepTemplateWire>(r, FLOW_RELATIONS))
}

export async function createStepTemplate(db: SisubDb, ctx: UserContext, input: CreateStepTemplate): Promise<StepTemplate> {
	if (input.kitchenId != null) requireKitchen(ctx, 2, input.kitchenId)
	else requireAnyPermission(ctx, ["kitchen", "global"], 2)

	const template = await insertOneOrFail("INSERT_FAILED", "no row returned", () =>
		db
			.insert(stepTemplateInKitchen)
			.values({
				name: input.name,
				description: input.description ?? null,
				defaultDurationMinutes: input.defaultDurationMinutes ?? null,
				kitchenId: input.kitchenId ?? null,
			})
			.returning()
	)

	if (input.utensilIds.length > 0) {
		await runQuery("INSERT_FAILED", () =>
			db
				.insert(stepTemplateUtensilInKitchen)
				.values(input.utensilIds.map((utensilId) => ({ stepTemplateId: template.id, utensilId })))
				.then(() => undefined)
		)
	}
	return toWire<StepTemplate>(template, FLOW_RELATIONS)
}

export async function listUtensils(db: SisubDb, ctx: UserContext, input: ListUtensils): Promise<UtensilWire[]> {
	requirePermission(ctx, "kitchen", 1)

	const conditions: (SQL | undefined)[] = [isNull(utensilInKitchen.deletedAt)]
	if (input.kitchenId != null) {
		conditions.push(or(isNull(utensilInKitchen.kitchenId), eq(utensilInKitchen.kitchenId, input.kitchenId)))
	} else {
		conditions.push(isNull(utensilInKitchen.kitchenId))
	}
	if (input.search) conditions.push(ilike(utensilInKitchen.name, `%${input.search}%`))

	const rows = await runQuery("FETCH_FAILED", () => db.query.utensilInKitchen.findMany({ where: and(...conditions), orderBy: (t, { asc }) => [asc(t.name)] }))
	return rows.map((r) => toWire<UtensilWire>(r, FLOW_RELATIONS))
}

export async function createUtensil(db: SisubDb, ctx: UserContext, input: CreateUtensil): Promise<Utensil> {
	if (input.kitchenId != null) requireKitchen(ctx, 2, input.kitchenId)
	else requireAnyPermission(ctx, ["kitchen", "global"], 2)

	const utensil = await insertOneOrFail("INSERT_FAILED", "no row returned", () =>
		db
			.insert(utensilInKitchen)
			.values({ name: input.name, kitchenId: input.kitchenId ?? null })
			.returning()
	)
	return toWire<Utensil>(utensil, FLOW_RELATIONS)
}
