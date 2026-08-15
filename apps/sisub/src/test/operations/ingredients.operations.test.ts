/**
 * Regressão happy-path — operations de INSUMOS (@iefa/sisub-domain).
 * Cobre folders, insumos, itens de produto, nutrientes, CEAFA e CATMAT.
 * Foco: filtro deleted_at, filtro por folder, normalização de join (purchase_item),
 * upsert de nutrientes e busca (ilike) em CEAFA/CATMAT.
 */

import { ingredientInKitchen, preparationGroupInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import {
	createFolder,
	createIngredient,
	createIngredientItem,
	deleteFolder,
	deleteIngredient,
	deleteIngredientItem,
	fetchIngredient,
	listCatmatItems,
	listCeafa,
	listFolders,
	listIngredientItems,
	listIngredientNutrients,
	listIngredients,
	listNutrients,
	listPreparationGroups,
	restoreFolder,
	restoreIngredient,
	setIngredientNutrients,
	updateFolder,
	updateIngredient,
	updateIngredientItem,
} from "@iefa/sisub-domain"
import { eq } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("ingredients operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	// Ops já migradas para Drizzle recebem `db` (pooler); o seeder/cleanup seguem no client Supabase.
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("ingredient")
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

	// ── Folders ────────────────────────────────────────────────────────────────

	test("createFolder/listFolders/updateFolder e soft-delete + restore", async () => {
		if (!reachable || !seeder || !db) return
		const descr = uid("[TEST] Pasta ")
		const folder = await createFolder(db, ctx, { description: descr, parentId: null })
		seeder.track("folder", folder.id)
		expect(folder.description).toBe(descr)

		const list = await listFolders(db, ctx, {})
		expect(list.map((f) => f.id)).toContain(folder.id)

		const novoDescr = uid("[TEST] Pasta Renomeada ")
		const updated = await updateFolder(db, ctx, { id: folder.id, description: novoDescr, parentId: null })
		expect(updated.description).toBe(novoDescr)

		await deleteFolder(db, ctx, { id: folder.id })
		expect((await listFolders(db, ctx, {})).map((f) => f.id)).not.toContain(folder.id)
		expect((await listFolders(db, ctx, { includeDeleted: true })).map((f) => f.id)).toContain(folder.id)

		await restoreFolder(db, ctx, { id: folder.id })
		expect((await listFolders(db, ctx, {})).map((f) => f.id)).toContain(folder.id)
	})

	// ── Ingredients ──────────────────────────────────────────────────────────────

	test("createIngredient/fetchIngredient round-trip + mapeamento de campos", async () => {
		if (!reachable || !seeder || !db) return
		const folderId = await seeder.seedFolder()
		const descr = uid("[TEST] Insumo ")

		const created = await createIngredient(db, ctx, {
			description: descr,
			folderId,
			measureUnit: "KG",
			correctionFactor: 1.2,
		})
		seeder.track("ingredient", created.id)

		const fetched = await fetchIngredient(db, ctx, { id: created.id })
		expect(fetched.id).toBe(created.id)
		expect(fetched.description).toBe(descr)
		expect(fetched.folder_id).toBe(folderId)
		expect(fetched.measure_unit).toBe("KG")
	})

	test("listIngredients filtra por folder e respeita deleted_at; update + restore", async () => {
		if (!reachable || !seeder || !db) return
		const folderId = await seeder.seedFolder()
		const id = await seeder.seedIngredient({ folderId })

		const naPasta = await listIngredients(db, ctx, { folderId })
		expect(naPasta.map((i) => i.id)).toContain(id)

		const novoDescr = uid("[TEST] Insumo Atualizado ")
		const updated = await updateIngredient(db, ctx, { id, description: novoDescr, folderId, measureUnit: "L" })
		expect(updated.description).toBe(novoDescr)
		expect(updated.measure_unit).toBe("L")

		await deleteIngredient(db, ctx, { id })
		expect((await listIngredients(db, ctx, { folderId })).map((i) => i.id)).not.toContain(id)
		expect((await listIngredients(db, ctx, { folderId, includeDeleted: true })).map((i) => i.id)).toContain(id)

		await restoreIngredient(db, ctx, { id })
		expect((await listIngredients(db, ctx, { folderId })).map((i) => i.id)).toContain(id)
	})

	/**
	 * `kitchen.preparation_group` não tem CRUD no domínio — o conjunto veio da migration e
	 * é catálogo fechado. Os helpers escrevem direto pelo Drizzle. A limpeza zera a FK
	 * antes de apagar o grupo, então não depende da ordem LIFO do seeder.
	 */
	async function seedPreparationGroup(name: string, explicitId?: string): Promise<string> {
		if (!db || !seeder) throw new Error("db/seeder indisponível")
		const [row] = await db
			.insert(preparationGroupInKitchen)
			.values(explicitId ? { id: explicitId, name } : { name })
			.returning({ id: preparationGroupInKitchen.id })
		const id = row.id
		seeder.trackFn(async () => {
			if (!db) return
			await db.update(ingredientInKitchen).set({ preparationGroupId: null }).where(eq(ingredientInKitchen.preparationGroupId, id))
			await db.delete(preparationGroupInKitchen).where(eq(preparationGroupInKitchen.id, id))
		})
		return id
	}

	async function linkPreparation(ingredientId: string, groupId: string): Promise<void> {
		if (!db) throw new Error("db indisponível")
		await db.update(ingredientInKitchen).set({ preparationGroupId: groupId }).where(eq(ingredientInKitchen.id, ingredientId))
	}

	async function renameIngredient(ingredientId: string, description: string): Promise<void> {
		if (!db) throw new Error("db indisponível")
		await db.update(ingredientInKitchen).set({ description }).where(eq(ingredientInKitchen.id, ingredientId))
	}

	test("escopo Preparações: excluído por padrão, isolado em 'only', tudo em 'include'", async () => {
		if (!reachable || !seeder || !db) return

		// A preparação é marcada por COLUNA (`preparation_group_id`), não por estar numa
		// pasta com certo nome. Um grupo com nome de insumo continua sendo preparação, e
		// uma pasta chamada "Preparações" continua sendo pasta de insumo — as duas metades
		// dessa afirmação estão cobertas abaixo, e é o ponto de trocar regex por FK.
		const grupo = await seedPreparationGroup(uid("Nome Que Não Diz Nada "))
		const preparacao = await seeder.seedIngredient({})
		await linkPreparation(preparacao, grupo)

		// Controles: insumo em pasta comum, insumo sem pasta, e uma armadilha —
		// pasta de insumo cuja descrição casaria o regex antigo.
		const pastaComum = await seeder.seedFolder()
		const insumo = await seeder.seedIngredient({ folderId: pastaComum })
		const solto = await seeder.seedIngredient({ folderId: null })
		const pastaArmadilha = await createFolder(db, ctx, { description: uid("Preparações [TEST] ") })
		seeder.track("folder", pastaArmadilha.id)
		const insumoNaArmadilha = await seeder.seedIngredient({ folderId: pastaArmadilha.id })

		const padrao = (await listIngredients(db, ctx, {})).map((i) => i.id)
		expect(padrao).not.toContain(preparacao)
		expect(padrao).toContain(insumo)
		expect(padrao).toContain(solto)
		// O nome da pasta não classifica mais nada.
		expect(padrao).toContain(insumoNaArmadilha)

		const apenasPreparacoes = (await listIngredients(db, ctx, { preparations: "only" })).map((i) => i.id)
		expect(apenasPreparacoes).toContain(preparacao)
		expect(apenasPreparacoes).not.toContain(insumo)
		expect(apenasPreparacoes).not.toContain(solto)
		expect(apenasPreparacoes).not.toContain(insumoNaArmadilha)

		const tudo = (await listIngredients(db, ctx, { preparations: "include" })).map((i) => i.id)
		expect(tudo).toEqual(expect.arrayContaining([preparacao, insumo, solto, insumoNaArmadilha]))

		// Grupo de preparação NÃO é pasta de insumo: vive em outra tabela e não vaza
		// para `listFolders`. A pasta-armadilha, essa sim, continua sendo pasta.
		const pastas = (await listFolders(db, ctx, {})).map((f) => f.id)
		expect(pastas).not.toContain(grupo)
		expect(pastas).toContain(pastaComum)
		expect(pastas).toContain(pastaArmadilha.id)

		const grupos = (await listPreparationGroups(db, ctx, {})).map((g) => g.id)
		expect(grupos).toContain(grupo)
		expect(grupos).not.toContain(pastaComum)
		expect(grupos).not.toContain(pastaArmadilha.id)
	})

	test("pasta que também é grupo de preparação não aparece como pasta de insumo", async () => {
		if (!reachable || !seeder || !db) return

		// Reproduz a janela entre as migrations EXPAND e CONTRACT: a linha existe nas DUAS
		// tabelas, com o mesmo id. Sem o predicado, a árvore de insumos mostraria a pasta
		// "Preparações" de volta durante o deploy — e também depois, se um reimport do
		// SISUBWEB recriasse a pasta.
		const pastaCompartilhada = await seeder.seedFolder()
		await seedPreparationGroup(uid("[TEST] Grupo Espelho "), pastaCompartilhada)

		const pastas = (await listFolders(db, ctx, {})).map((f) => f.id)
		expect(pastas).not.toContain(pastaCompartilhada)
		// Nem com includeDeleted: o recorte é por identidade, não por soft-delete.
		expect((await listFolders(db, ctx, { includeDeleted: true })).map((f) => f.id)).not.toContain(pastaCompartilhada)
	})

	test("busca por descrição respeita o escopo e escapa curinga", async () => {
		if (!reachable || !seeder || !db) return
		const marcador = uid("Zsearch")
		const insumo = await seeder.seedIngredient({})
		await renameIngredient(insumo, `[TEST] ${marcador} Insumo`)

		const grupo = await seedPreparationGroup(uid("[TEST] Grupo "))
		const preparacao = await seeder.seedIngredient({})
		await renameIngredient(preparacao, `[TEST] ${marcador} Preparação`)
		await linkPreparation(preparacao, grupo)

		const achados = (await listIngredients(db, ctx, { search: marcador })).map((i) => i.id)
		expect(achados).toEqual([insumo])

		const achadosPrep = (await listIngredients(db, ctx, { search: marcador, preparations: "only" })).map((i) => i.id)
		expect(achadosPrep).toEqual([preparacao])

		// `_` é literal, não curinga: não pode casar o marcador real.
		const comUnderscore = await listIngredients(db, ctx, { search: marcador.replace(/.$/, "_") })
		expect(comUnderscore.map((i) => i.id)).not.toContain(insumo)
	})

	// ── Ingredient items ─────────────────────────────────────────────────────────

	test("createIngredientItem/listIngredientItems normaliza purchase_item e soft-delete", async () => {
		if (!reachable || !seeder || !db) return
		const ingredientId = await seeder.seedIngredient()

		const item = await createIngredientItem(db, ctx, {
			ingredientId,
			description: uid("[TEST] Item "),
			purchaseMeasureUnit: "UN",
			unitContentQuantity: 1,
		})
		seeder.track("ingredient_item", item.id)

		const list = await listIngredientItems(db, ctx, { ingredientId })
		const found = list.find((i) => i.id === item.id)
		expect(found).toBeDefined()
		expect(found).toHaveProperty("purchase_item") // normalizado (null quando sem vínculo)
		expect(found?.purchase_item).toBeNull()

		const novoDescr = uid("[TEST] Item Atualizado ")
		const updated = await updateIngredientItem(db, ctx, { id: item.id, ingredientId, description: novoDescr })
		expect(updated.description).toBe(novoDescr)

		await deleteIngredientItem(db, ctx, { id: item.id })
		expect((await listIngredientItems(db, ctx, { ingredientId })).map((i) => i.id)).not.toContain(item.id)
	})

	// ── Nutrientes ─────────────────────────────────────────────────────────────

	test("listNutrients lista o catálogo e setIngredientNutrients faz upsert (read-back)", async () => {
		if (!reachable || !seeder || !db) return
		const nutrientId = await seeder.seedNutrient()
		const ingredientId = await seeder.seedIngredient()

		const catalogo = await listNutrients(db, ctx)
		expect(catalogo.map((n) => n.id)).toContain(nutrientId)

		await setIngredientNutrients(db, ctx, { ingredientId, nutrients: [{ nutrientId, nutrientValue: 42 }] })
		seeder.trackWhere("ingredient_nutrient", "ingredient_id", ingredientId)

		const linked = await listIngredientNutrients(db, ctx, { ingredientId })
		const row = linked.find((r) => r.nutrient_id === nutrientId)
		expect(row).toBeDefined()
		expect(Number(row?.nutrient_value)).toBe(42)
		expect(row?.nutrient?.id).toBe(nutrientId) // join aninhado preservado
	})

	// ── Buscas (CEAFA / CATMAT) ──────────────────────────────────────────────────

	test("listCeafa encontra por ilike na descrição", async () => {
		if (!reachable || !seeder || !db) return
		const descr = uid("[TEST]CEAFA")
		await seeder.seedCeafa({ description: descr })

		const result = await listCeafa(db, ctx, { search: descr })
		expect(result.some((c) => c.description === descr)).toBe(true)
	})

	test("listCatmatItems encontra item ativo por descrição (ilike)", async () => {
		if (!reachable || !seeder || !db) return
		const descricao = uid("[TEST]CATMAT")
		const codigo = 999_000_000 + (Number.parseInt(descricao.split("-")[1] ?? "1", 10) || 1)
		// compras_material_item foi movida para o schema compras_gov_integration
		// (split de schemas por domínio); seed/cleanup apontam para lá. A leitura
		// de produção (listCatmatItems) cruza os schemas via Drizzle.
		const comprasGov = client.schema("compras_gov_integration")
		const { error } = await comprasGov.from("compras_material_item").insert({ codigo_item: codigo, descricao_item: descricao, status_item: true })
		if (error) throw new Error(`seed compras_material_item failed: ${error.message}`)
		seeder.trackFn(async () => {
			await comprasGov.from("compras_material_item").delete().eq("codigo_item", codigo)
		})

		const result = await listCatmatItems(db, ctx, { search: descricao })
		expect(result.some((c) => c.codigo_item === codigo)).toBe(true)
	})

	test("listCatmatItems retorna vazio para termo curto (< 2 chars)", async () => {
		if (!reachable || !seeder || !db) return
		const result = await listCatmatItems(db, ctx, { search: "a" })
		expect(result).toEqual([])
	})
})
