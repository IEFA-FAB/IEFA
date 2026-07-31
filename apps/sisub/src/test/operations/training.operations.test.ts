/**
 * Ambiente de treino — reset e isolamento. Integração contra o banco REAL.
 *
 * O teste mais importante daqui é o de COMPLETUDE: ele consulta o catálogo do Postgres por
 * tabelas escopadas e falha quando uma delas não está coberta pelo reset. Sem isso, uma
 * tabela escopada nova nasce fora da lista e o ambiente de treino nunca fica realmente
 * limpo — resíduo silencioso, que é o pior modo de falha desta feature.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { fetchTrainingScope, listTrainingResets, RESET_TARGET_TABLES, resetTrainingScope, resolveTrainingScope } from "@iefa/sisub-domain"
import { sql } from "drizzle-orm"
import { afterAll, beforeAll, expect, test } from "vitest"
import { fullAccessCtx } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const ctx = fullAccessCtx()
const ACTOR_ID = "00000000-0000-4000-8000-000000000001"

/**
 * Tabelas escopadas que o reset NÃO deve tocar, com o motivo. Toda exclusão precisa estar
 * aqui — o teste de completude falha em qualquer tabela escopada fora desta lista e fora do
 * reset, forçando uma decisão consciente.
 */
const RESET_EXCLUSIONS: Record<string, string> = {
	"access_control.user_permissions": "grants de acesso não são dado operacional; apagar tiraria a permissão do próprio treinando",
	"access_control.policy_statement": "escopos das políticas apontam para as sentinelas; o reset preserva a política Conjunto Treino",
	"core.kitchen": "sentinela do ambiente de treino — preservada por definição",
	"core.mess_halls": "sentinela do ambiente de treino — preservada por definição",
	"core.units": "sentinela do ambiente de treino — preservada por definição",
	"finance.empenho": "escopado por unidade, mas é dado financeiro real; a unidade de treino não empenha",
	"procurement.procurement_arp": "ARP é registro de preços real, escopado por unidade compradora",
	"procurement.procurement_list": "ATA da unidade; a unidade de treino não publica ATA",
	"procurement.procurement_list_snapshot_selection": "snapshot imutável de ATA publicada",

	// ── Estoque ──
	// O Conjunto Treino NÃO concede o módulo `storage`, então um treinando não consegue
	// movimentar estoque na cozinha de treino e não há resíduo a limpar. Se algum dia o
	// treino passar a cobrir estoque, estas entradas saem daqui e entram no reset — este
	// teste é justamente o que vai forçar a decisão.
	"inventory.goods_receipt": "estoque fora do escopo de treino — Conjunto Treino não concede o módulo storage",
	"inventory.inventory_count": "estoque fora do escopo de treino",
	"inventory.monthly_closing": "estoque fora do escopo de treino; fechamento contábil é imutável",
	"inventory.nfe_document": "documento fiscal real, nunca sintético",
	"inventory.stock_cost": "estoque fora do escopo de treino",
	"inventory.stock_lot": "estoque fora do escopo de treino",
	"inventory.stock_movement": "ledger append-only — não se apaga movimento de estoque",
	"inventory.stock_policy": "parâmetro de reposição, não dado operacional de treino",
	"procurement.supply_order": "ordem de fornecimento é documento real de aquisição",
}

describeSupabaseIntegration("training operations (integração)", () => {
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const url = getSisubDatabaseUrl()
		if (url) {
			const t = createSisubTestDb(url)
			db = t.db
			closeDb = t.close
		}
	}, 30_000)

	test("resolveTrainingScope encontra as três sentinelas", async () => {
		if (!db) return
		const scope = await resolveTrainingScope(db)

		expect(scope.unit_id).toBeGreaterThan(0)
		expect(scope.kitchen_id).toBeGreaterThan(0)
		expect(scope.mess_hall_id).toBeGreaterThan(0)
	})

	test("a lista de reset cobre toda tabela escopada, ou a exclusão é explícita", async () => {
		if (!db) return

		// Catálogo: tabelas com coluna de escopo, fora dos schemas de sistema.
		const rows = (await db.execute(sql`
			select distinct c.table_schema || '.' || c.table_name as qualified
			from information_schema.columns c
			join information_schema.tables t
				on t.table_schema = c.table_schema and t.table_name = c.table_name
			where c.column_name in ('kitchen_id', 'unit_id', 'mess_hall_id')
				and t.table_type = 'BASE TABLE'
				and c.table_schema not in ('pg_catalog', 'information_schema', 'auth', 'storage', 'realtime', 'extensions', 'vault')
			order by qualified
		`)) as unknown as Array<{ qualified: string }>

		const scoped = rows.map((r) => r.qualified)
		// Guarda contra query vazia passar como verde — a suíte já rodou vacuosa neste repo.
		expect(scoped.length).toBeGreaterThan(10)

		const covered = new Set([...RESET_TARGET_TABLES, ...Object.keys(RESET_EXCLUSIONS)])
		const uncovered = scoped.filter((t) => !covered.has(t))

		expect(uncovered, `tabelas escopadas fora do reset e sem exclusão justificada: ${uncovered.join(", ")}`).toEqual([])
	})

	test("reset limpa o escopo de treino, preserva as sentinelas e re-semeia o baseline", async () => {
		if (!db) return
		const scopeBefore = await resolveTrainingScope(db)

		const result = await resetTrainingScope(db, ctx)

		expect(result.duration_ms).toBeGreaterThanOrEqual(0)
		expect(Object.keys(result.deleted_counts).length).toBe(RESET_TARGET_TABLES.length)

		// Sentinelas intactas, com os MESMOS ids.
		const scopeAfter = await resolveTrainingScope(db)
		expect(scopeAfter).toEqual(scopeBefore)

		// Baseline presente: sem ele o treinando abre um ambiente vazio.
		const info = await fetchTrainingScope(db, ctx)
		expect(info.pending_counts["kitchen.menu_template"]).toBeGreaterThan(0)
	})

	test("reset é idempotente em duas execuções seguidas", async () => {
		if (!db) return

		await resetTrainingScope(db, ctx)
		const info1 = await fetchTrainingScope(db, ctx)

		await resetTrainingScope(db, ctx)
		const info2 = await fetchTrainingScope(db, ctx)

		// Estado equivalente: o seed não acumula entre execuções.
		expect(info2.pending_counts).toEqual(info1.pending_counts)
	})

	test("reset preserva o catálogo global", async () => {
		if (!db) return

		// Ignora as fixtures das outras suítes. Os arquivos de teste rodam em PARALELO: outro
		// deles cria e apaga receitas globais durante este, então nem contagem nem identidade
		// sobre a tabela inteira são estáveis. A afirmação real do teste é sobre o dado de
		// PRODUÇÃO, e o seeder marca tudo que é dele com o prefixo `[TEST]`.
		const before = (await db.execute(sql`select id from kitchen.recipes where kitchen_id is null and name not like '[TEST]%'`)) as unknown as Array<{
			id: string
		}>
		const ingredientsBefore = (await db.execute(sql`select id from kitchen.ingredient where description not like '[TEST]%'`)) as unknown as Array<{
			id: string
		}>

		await resetTrainingScope(db, ctx)

		const after = (await db.execute(sql`select id from kitchen.recipes where kitchen_id is null and name not like '[TEST]%'`)) as unknown as Array<{
			id: string
		}>
		const ingredientsAfter = (await db.execute(sql`select id from kitchen.ingredient where description not like '[TEST]%'`)) as unknown as Array<{
			id: string
		}>

		const survivingRecipes = new Set(after.map((r) => r.id))
		const survivingIngredients = new Set(ingredientsAfter.map((r) => r.id))

		expect(before.filter((r) => !survivingRecipes.has(r.id))).toEqual([])
		expect(ingredientsBefore.filter((r) => !survivingIngredients.has(r.id))).toEqual([])
	})

	test("reset preserva dado de cozinhas reais", async () => {
		if (!db) return
		const scope = await resolveTrainingScope(db)

		// Idem: só o dado de produção, ignorando as fixtures paralelas.
		const before = (await db.execute(
			sql`select id from kitchen.menu_template where kitchen_id is not null and kitchen_id <> ${scope.kitchen_id} and name not like '[TEST]%'`
		)) as unknown as Array<{ id: string }>

		await resetTrainingScope(db, ctx)

		const after = (await db.execute(
			sql`select id from kitchen.menu_template where kitchen_id is not null and kitchen_id <> ${scope.kitchen_id} and name not like '[TEST]%'`
		)) as unknown as Array<{ id: string }>

		const surviving = new Set(after.map((r) => r.id))
		expect(before.filter((r) => !surviving.has(r.id))).toEqual([])
	})

	test("cada execução é auditada", async () => {
		if (!db) return

		await resetTrainingScope(db, ctx)
		const history = await listTrainingResets(db, ctx, { limit: 5 })

		expect(history.length).toBeGreaterThan(0)
		expect(history[0]?.status).toBe("succeeded")
		expect(history[0]?.actor_id).toBe(ctx.userId)
		expect(history[0]?.duration_ms).not.toBeNull()
	})

	test("reset exige global nível 2", async () => {
		if (!db) return
		const readOnly = { userId: ACTOR_ID, permissions: [{ module: "global" as const, level: 1, kitchen_id: null, unit_id: null, mess_hall_id: null }] }

		await expect(resetTrainingScope(db, readOnly)).rejects.toThrow(/PERMISSION|Requires global/i)
	})

	afterAll(async () => {
		await closeDb?.()
	})
})
