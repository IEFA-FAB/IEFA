/**
 * Regressão happy-path — operations de RECEITAS (@iefa/sisub-domain).
 * Congela o contrato de comportamento ANTES da migração para Drizzle.
 * Foco: dedup de família (maior versão), filtro deleted_at, ordenação pt-BR,
 * shape de select aninhado, versionamento e round-trip write→read.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import {
	createRecipe,
	createRecipeFolder,
	deleteRecipe,
	deleteRecipeFolder,
	fetchRecipe,
	listRecipeFolders,
	listRecipeMenuUsage,
	listRecipes,
	listRecipeVersions,
	renameRecipe,
	restoreRecipe,
	saveRecipeEdit,
	setRecipeFolder,
} from "@iefa/sisub-domain"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("recipes operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	// Ops já migradas para Drizzle recebem `db` (pooler); o seeder/cleanup seguem no client Supabase.
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration()
		reachable = s.reachable
		if (s.client) client = s.client
		const url = getSisubDatabaseUrl()
		if (reachable && url) {
			const t = createSisubTestDb(url)
			db = t.db
			closeDb = t.close
		}
	}, 30_000)

	beforeEach(() => {
		seeder = reachable ? makeSeeder(client) : null
	})

	afterEach(async () => {
		await seeder?.cleanup()
	}, 60_000)

	afterAll(async () => {
		await closeDb?.()
	})

	test("createRecipe insere receita global + ingredientes e retorna a linha", async () => {
		if (!reachable || !seeder || !db) return
		const ingredientId = await seeder.seedIngredient()

		const recipe = await createRecipe(db, ctx, {
			name: uid("[TEST] Receita "),
			portionYield: 100,
			kitchenId: null,
			ingredients: [{ ingredientId, netQuantity: 150, isOptional: false, priorityOrder: 0 }],
		})
		seeder.track("recipes", recipe.id)
		seeder.trackWhere("recipe_ingredients", "recipe_id", recipe.id)

		expect(recipe.id).toBeTruthy()
		expect(recipe.version).toBe(1)
		expect(recipe.kitchen_id).toBeNull()
		expect(Number(recipe.portion_yield)).toBe(100)
	})

	test("fetchRecipe retorna receita com ingredientes aninhados (shape)", async () => {
		if (!reachable || !seeder || !db) return
		const ingredientId = await seeder.seedIngredient()
		const recipeId = await seeder.seedRecipe({ ingredients: [{ ingredientId, netQuantity: 200 }] })

		const recipe = await fetchRecipe(db, ctx, { recipeId })

		expect(recipe.id).toBe(recipeId)
		expect(Array.isArray(recipe.ingredients)).toBe(true)
		expect(recipe.ingredients).toHaveLength(1)
		expect(recipe.ingredients[0].ingredient?.id).toBe(ingredientId)
	})

	/**
	 * Substituição por LINHA da ficha (`kitchen.recipe_ingredient_alternatives`), retomada
	 * em 2026-08-18 no lugar do par global aposentado. Os dois pontos que a suíte protege:
	 * a substituta guarda a QUANTIDADE dela (não um fator), e ela sobrevive ao
	 * versionamento — `saveRecipeEdit` insere linhas de ingrediente novas, então uma
	 * gravação separada prenderia os substitutos à versão anterior.
	 */
	test("createRecipe grava os substitutos da linha e fetchRecipe os devolve com o insumo resolvido", async () => {
		if (!reachable || !seeder || !db) return
		const ingredientId = await seeder.seedIngredient()
		const substituteId = await seeder.seedIngredient()

		const recipe = await createRecipe(db, ctx, {
			name: uid("[TEST] Com substituto "),
			portionYield: 100,
			kitchenId: null,
			ingredients: [
				{
					ingredientId,
					netQuantity: 2,
					isOptional: false,
					priorityOrder: 0,
					// Gramatura própria da substituta: é isto que o par global não expressava.
					alternatives: [{ ingredientId: substituteId, netQuantity: 1.6, priorityOrder: 0 }],
				},
			],
		})
		seeder.track("recipes", recipe.id)
		seeder.trackWhere("recipe_ingredients", "recipe_id", recipe.id)

		const fetched = await fetchRecipe(db, ctx, { recipeId: recipe.id })
		expect(fetched.ingredients).toHaveLength(1)
		const alternatives = fetched.ingredients[0].alternatives ?? []
		expect(alternatives).toHaveLength(1)
		expect(alternatives[0].ingredient_id).toBe(substituteId)
		expect(alternatives[0].ingredient?.id).toBe(substituteId)
		// `numeric` volta como string do driver; o contrato declara number.
		expect(alternatives[0].net_quantity).toBe(1.6)
	})

	test("saveRecipeEdit leva os substitutos para a versão nova", async () => {
		if (!reachable || !seeder || !db) return
		const ingredientId = await seeder.seedIngredient()
		const substituteId = await seeder.seedIngredient()

		const v1 = await createRecipe(db, ctx, {
			name: uid("[TEST] Substituto v1 "),
			portionYield: 100,
			kitchenId: null,
			ingredients: [
				{
					ingredientId,
					netQuantity: 2,
					isOptional: false,
					priorityOrder: 0,
					alternatives: [{ ingredientId: substituteId, netQuantity: 1.6, priorityOrder: 0 }],
				},
			],
		})
		seeder.track("recipes", v1.id)
		seeder.trackWhere("recipe_ingredients", "recipe_id", v1.id)

		// O formulário reenvia os substitutos junto com a ficha — é o que a versão nova grava.
		const { recipe: v2 } = await saveRecipeEdit(db, ctx, {
			name: v1.name,
			portionYield: 100,
			baseRecipeId: v1.id,
			context: { scope: "global" },
			ingredients: [
				{
					ingredientId,
					netQuantity: 2,
					isOptional: false,
					priorityOrder: 0,
					alternatives: [{ ingredientId: substituteId, netQuantity: 1.8, priorityOrder: 0 }],
				},
			],
		})
		seeder.track("recipes", v2.id)
		seeder.trackWhere("recipe_ingredients", "recipe_id", v2.id)

		const fetched = await fetchRecipe(db, ctx, { recipeId: v2.id })
		const alternatives = fetched.ingredients[0].alternatives ?? []
		expect(alternatives).toHaveLength(1)
		expect(alternatives[0].net_quantity).toBe(1.8)

		// A versão anterior fica intacta — versionar não reescreve o que já foi salvo.
		const antiga = await fetchRecipe(db, ctx, { recipeId: v1.id })
		expect((antiga.ingredients[0].alternatives ?? [])[0]?.net_quantity).toBe(1.6)
	})

	test("substituto igual ao insumo da linha, ou repetido nela, não é gravado", async () => {
		if (!reachable || !seeder || !db) return
		const ingredientId = await seeder.seedIngredient()
		const substituteId = await seeder.seedIngredient()

		const recipe = await createRecipe(db, ctx, {
			name: uid("[TEST] Substituto duplicado "),
			portionYield: 100,
			kitchenId: null,
			ingredients: [
				{
					ingredientId,
					netQuantity: 2,
					isOptional: false,
					priorityOrder: 0,
					alternatives: [
						// "arroz substitui arroz" não diz nada, e o índice único não pegaria — é uma linha só.
						{ ingredientId, netQuantity: 2, priorityOrder: 0 },
						{ ingredientId: substituteId, netQuantity: 1.6, priorityOrder: 1 },
						// Duplicata: barrada aqui, senão o clique repetido na tela viraria 23505 sem mensagem.
						{ ingredientId: substituteId, netQuantity: 1.7, priorityOrder: 2 },
					],
				},
			],
		})
		seeder.track("recipes", recipe.id)
		seeder.trackWhere("recipe_ingredients", "recipe_id", recipe.id)

		const fetched = await fetchRecipe(db, ctx, { recipeId: recipe.id })
		const alternatives = fetched.ingredients[0].alternatives ?? []
		expect(alternatives).toHaveLength(1)
		expect(alternatives[0].ingredient_id).toBe(substituteId)
		expect(alternatives[0].net_quantity).toBe(1.6)
	})

	test("listRecipes faz dedup por família mantendo a maior versão", async () => {
		if (!reachable || !seeder || !db) return
		const v1 = await createRecipe(db, ctx, { name: uid("[TEST] Família "), portionYield: 100, kitchenId: null })
		seeder.track("recipes", v1.id)
		const { recipe: v2 } = await saveRecipeEdit(db, ctx, {
			name: v1.name,
			portionYield: 120,
			baseRecipeId: v1.id,
			context: { scope: "global" },
		})
		seeder.track("recipes", v2.id)

		const recipes = await listRecipes(db, ctx, { kitchenId: null })
		const ids = recipes.map((r) => r.id)

		expect(ids).toContain(v2.id) // versão mais nova representa a família
		expect(ids).not.toContain(v1.id) // versão antiga é suprimida
	})

	test("listRecipes ordena por nome em pt-BR", async () => {
		if (!reachable || !seeder || !db) return
		const za = await seeder.seedRecipe({ name: uid("[TEST] ZZZ ") })
		const ab = await seeder.seedRecipe({ name: uid("[TEST] AAA ") })

		const recipes = await listRecipes(db, ctx, { kitchenId: null })
		const idxA = recipes.findIndex((r) => r.id === ab)
		const idxZ = recipes.findIndex((r) => r.id === za)

		expect(idxA).toBeGreaterThanOrEqual(0)
		expect(idxZ).toBeGreaterThan(idxA)
	})

	test("deleteRecipe (soft) some da listagem default e reaparece com includeDeleted; restoreRecipe reverte", async () => {
		if (!reachable || !seeder || !db) return
		const recipeId = await seeder.seedRecipe({ name: uid("[TEST] SoftDel ") })

		await deleteRecipe(db, ctx, { id: recipeId })
		const visivel = await listRecipes(db, ctx, { kitchenId: null })
		expect(visivel.map((r) => r.id)).not.toContain(recipeId)

		const comLixeira = await listRecipes(db, ctx, { kitchenId: null, includeDeleted: true })
		expect(comLixeira.map((r) => r.id)).toContain(recipeId)

		await restoreRecipe(db, ctx, { id: recipeId })
		const restaurada = await listRecipes(db, ctx, { kitchenId: null })
		expect(restaurada.map((r) => r.id)).toContain(recipeId)
	})

	test("saveRecipeEdit no contexto global cria nova versão com base_recipe_id na raiz", async () => {
		if (!reachable || !seeder || !db) return
		const v1 = await seeder.seedRecipe({ name: uid("[TEST] Versionada ") })

		const { recipe: v2, forked } = await saveRecipeEdit(db, ctx, {
			// Nome sempre via `uid()`: é o token de execução que prova para o
			// `scripts/purge-test-fixtures.ts` que a linha é fixture, e não uma receita real
			// que alguém batizou de "[TEST] ...". Literal aqui vira lixo que a faxina não ousa apagar.
			name: uid("[TEST] Versionada v2 "),
			portionYield: 130,
			baseRecipeId: v1,
			context: { scope: "global" },
		})
		seeder.track("recipes", v2.id)

		expect(forked).toBe(false)
		expect(v2.version).toBe(2)
		expect(v2.base_recipe_id).toBe(v1)
		expect(v2.kitchen_id).toBeNull()

		// A terceira versão continua apontando para a RAIZ, não para o pai imediato —
		// senão a família se parte e duas versões aparecem juntas na listagem.
		const { recipe: v3 } = await saveRecipeEdit(db, ctx, {
			name: uid("[TEST] Versionada v3 "),
			portionYield: 140,
			baseRecipeId: v2.id,
			context: { scope: "global" },
		})
		seeder.track("recipes", v3.id)

		expect(v3.version).toBe(3)
		expect(v3.base_recipe_id).toBe(v1)

		const listadas = await listRecipes(db, ctx, { kitchenId: null })
		const ids = listadas.map((r) => r.id)
		expect(ids).toContain(v3.id)
		expect(ids).not.toContain(v2.id)
		expect(ids).not.toContain(v1)
	})

	test("listRecipeVersions retorna a família ordenada por version asc", async () => {
		if (!reachable || !seeder || !db) return
		const v1 = await seeder.seedRecipe({ name: uid("[TEST] Hist ") })
		const v2 = await seeder.seedRecipe({ name: uid("[TEST] Hist "), baseRecipeId: v1, version: 2 })

		const versions = await listRecipeVersions(db, ctx, { recipeId: v1 })
		const ids = versions.map((r) => r.id)

		expect(ids).toContain(v1)
		expect(ids).toContain(v2)
		const nums = versions.map((r) => r.version)
		expect(nums).toEqual([...nums].sort((a, b) => a - b))
	})

	test("renameRecipe altera o nome in-place (write→read)", async () => {
		if (!reachable || !seeder || !db) return
		const recipeId = await seeder.seedRecipe({ name: uid("[TEST] Antigo ") })
		const novoNome = uid("[TEST] Renomeado ")

		await renameRecipe(db, ctx, { id: recipeId, name: novoNome })
		const recipe = await fetchRecipe(db, ctx, { recipeId })

		expect(recipe.name).toBe(novoNome)
	})

	test("listRecipeMenuUsage retorna IDs de receitas usadas em template semanal", async () => {
		if (!reachable || !seeder || !db) return
		const recipeId = await seeder.seedRecipe({ name: uid("[TEST] Usada ") })
		const mealTypeId = await seeder.seedMealType()
		const templateId = await seeder.seedTemplate({ templateType: "weekly" })
		await seeder.seedTemplateItem({ templateId, mealTypeId, recipeId, dayOfWeek: 1 })

		const usage = await listRecipeMenuUsage(db, ctx)
		expect(usage).toContain(recipeId)
	})

	// ── Pastas de preparação (agrupamento plano) ─────────────────────────────

	test("createRecipeFolder → listRecipeFolders (round-trip) e nome duplicado é recusado", async () => {
		if (!reachable || !seeder || !db) return
		const name = uid("[TEST] Pasta ")

		const folder = await createRecipeFolder(db, ctx, { name })
		seeder.track("recipe_folder", folder.id)

		const folders = await listRecipeFolders(db, ctx, {})
		expect(folders.map((f) => f.id)).toContain(folder.id)

		// Unicidade entre ATIVAS é case/space-insensitive (índice parcial em lower(btrim(name))).
		await expect(createRecipeFolder(db, ctx, { name: `  ${name.toUpperCase()}  ` })).rejects.toThrow()
	})

	test("setRecipeFolder arquiva e desarquiva a preparação", async () => {
		if (!reachable || !seeder || !db) return
		const folder = await createRecipeFolder(db, ctx, { name: uid("[TEST] Pasta ") })
		seeder.track("recipe_folder", folder.id)
		const recipeId = await seeder.seedRecipe({ name: uid("[TEST] Arquivada ") })

		await setRecipeFolder(db, ctx, { recipeIds: [recipeId], folderId: folder.id })
		expect((await fetchRecipe(db, ctx, { recipeId })).folder_id).toBe(folder.id)

		await setRecipeFolder(db, ctx, { recipeIds: [recipeId], folderId: null })
		expect((await fetchRecipe(db, ctx, { recipeId })).folder_id).toBeNull()
	})

	test("setRecipeFolder recusa pasta excluída (não arquiva em agrupamento invisível)", async () => {
		if (!reachable || !seeder || !db) return
		const folder = await createRecipeFolder(db, ctx, { name: uid("[TEST] Pasta ") })
		seeder.track("recipe_folder", folder.id)
		const recipeId = await seeder.seedRecipe({ name: uid("[TEST] Solta ") })

		await deleteRecipeFolder(db, ctx, { id: folder.id })

		await expect(setRecipeFolder(db, ctx, { recipeIds: [recipeId], folderId: folder.id })).rejects.toThrow()
		expect((await fetchRecipe(db, ctx, { recipeId })).folder_id).toBeNull()
	})

	test("deleteRecipeFolder desarquiva as preparações da pasta (nenhuma é excluída)", async () => {
		if (!reachable || !seeder || !db) return
		const folder = await createRecipeFolder(db, ctx, { name: uid("[TEST] Pasta ") })
		seeder.track("recipe_folder", folder.id)
		const recipeId = await seeder.seedRecipe({ name: uid("[TEST] Na pasta ") })
		await setRecipeFolder(db, ctx, { recipeIds: [recipeId], folderId: folder.id })

		const { unfiled } = await deleteRecipeFolder(db, ctx, { id: folder.id })

		expect(unfiled).toBe(1)
		const recipe = await fetchRecipe(db, ctx, { recipeId })
		expect(recipe.folder_id).toBeNull()
		expect(recipe.deleted_at).toBeNull()

		const ativas = await listRecipeFolders(db, ctx, {})
		expect(ativas.map((f) => f.id)).not.toContain(folder.id)
	})

	test("saveRecipeEdit carrega a pasta para a nova versão quando o input a omite", async () => {
		if (!reachable || !seeder || !db) return
		const folder = await createRecipeFolder(db, ctx, { name: uid("[TEST] Pasta ") })
		seeder.track("recipe_folder", folder.id)
		const v1 = await seeder.seedRecipe({ name: uid("[TEST] Herda pasta ") })
		await setRecipeFolder(db, ctx, { recipeIds: [v1], folderId: folder.id })

		// Sem `folderId` no input: editar a ficha não pode desarquivar a preparação.
		const { recipe: v2 } = await saveRecipeEdit(db, ctx, {
			name: uid("[TEST] Herda pasta v2 "),
			portionYield: 120,
			baseRecipeId: v1,
			context: { scope: "global" },
		})
		seeder.track("recipes", v2.id)
		expect(v2.folder_id).toBe(folder.id)

		// `null` explícito é intenção do usuário: tira da pasta.
		const { recipe: v3 } = await saveRecipeEdit(db, ctx, {
			name: uid("[TEST] Herda pasta v3 "),
			portionYield: 120,
			baseRecipeId: v2.id,
			folderId: null,
			context: { scope: "global" },
		})
		seeder.track("recipes", v3.id)
		expect(v3.folder_id).toBeNull()
	})
})
