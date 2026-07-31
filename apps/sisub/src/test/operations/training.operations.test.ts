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
	// ── Execução financeira e SIAFI ──
	// Escopadas por unidade, mas são documento de execução orçamentária REAL. O Conjunto
	// Treino não concede módulo financeiro, então a unidade de treino não gera nenhum deles
	// e não há resíduo a limpar.
	"finance.empenho": "escopado por unidade, mas é dado financeiro real; a unidade de treino não empenha",
	"finance.budget_credit": "crédito orçamentário real — a unidade de treino não recebe crédito",
	"finance.liquidacao": "liquidação de despesa real, documento contábil",
	"finance.pagamento": "pagamento real, documento contábil",
	"siafi_integration.import_batch": "lote de importação do SIAFI — dado de origem externa, não sintético",
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

	/**
	 * Timeout generoso e um único reset compartilhado.
	 *
	 * Cada reset é uma transação com ~24 DELETEs, o seed e um advisory lock, contra um
	 * Postgres remoto. Seis resets independentes estouravam o `testTimeout` de 15s no CI
	 * (localmente passavam) e saturavam o pooler — o pipeline da main ficou vermelho e
	 * nenhum deploy rodou. Um reset, várias asserções sobre ele.
	 */
	const RESET_TIMEOUT_MS = 60_000

	test(
		"reset limpa o escopo, preserva sentinelas, catálogo global e cozinhas reais, e audita",
		async () => {
			if (!db) return
			const scopeBefore = await resolveTrainingScope(db)

			// Contagens filtradas por `[TEST]`: baratas e estáveis. Os arquivos de teste rodam em
			// PARALELO e outro deles cria e apaga receitas globais durante este — a afirmação real
			// é sobre o dado de PRODUÇÃO, e o seeder prefixa tudo que é dele.
			const handle = db
			const countProduction = async () => {
				const [recipes] = (await handle.execute(
					sql`select count(*)::int as n from kitchen.recipes where kitchen_id is null and name not like '[TEST]%'`
				)) as unknown as Array<{ n: number }>
				const [ingredients] = (await handle.execute(
					sql`select count(*)::int as n from kitchen.ingredient where description not like '[TEST]%'`
				)) as unknown as Array<{ n: number }>
				const [otherKitchens] = (await handle.execute(
					sql`select count(*)::int as n from kitchen.menu_template
					    where kitchen_id is not null and kitchen_id <> ${scopeBefore.kitchen_id} and name not like '[TEST]%'`
				)) as unknown as Array<{ n: number }>
				return { recipes: recipes?.n, ingredients: ingredients?.n, otherKitchens: otherKitchens?.n }
			}

			const before = await countProduction()
			const result = await resetTrainingScope(db, ctx)

			expect(result.duration_ms).toBeGreaterThanOrEqual(0)
			expect(Object.keys(result.deleted_counts).length).toBe(RESET_TARGET_TABLES.length)

			// Sentinelas intactas, com os MESMOS ids.
			expect(await resolveTrainingScope(db)).toEqual(scopeBefore)

			// Nada de produção foi tocado.
			expect(await countProduction()).toEqual(before)

			// Baseline presente: sem ele o treinando abre um ambiente vazio.
			const info = await fetchTrainingScope(db, ctx)
			expect(info.pending_counts["kitchen.menu_template"]).toBeGreaterThan(0)

			// A execução deixou rastro.
			const history = await listTrainingResets(db, ctx, { limit: 5 })
			expect(history[0]?.status).toBe("succeeded")
			expect(history[0]?.actor_id).toBe(ctx.userId)
			expect(history[0]?.duration_ms).not.toBeNull()
		},
		RESET_TIMEOUT_MS
	)

	test(
		"reset é idempotente em duas execuções seguidas",
		async () => {
			if (!db) return

			await resetTrainingScope(db, ctx)
			const info1 = await fetchTrainingScope(db, ctx)

			await resetTrainingScope(db, ctx)
			const info2 = await fetchTrainingScope(db, ctx)

			// Estado equivalente: o seed não acumula entre execuções.
			expect(info2.pending_counts).toEqual(info1.pending_counts)
		},
		RESET_TIMEOUT_MS
	)

	test("reset exige global nível 2", async () => {
		if (!db) return
		const readOnly = { userId: ACTOR_ID, permissions: [{ module: "global" as const, level: 1, kitchen_id: null, unit_id: null, mess_hall_id: null }] }

		await expect(resetTrainingScope(db, readOnly)).rejects.toThrow(/PERMISSION|Requires global/i)
	})

	afterAll(async () => {
		await closeDb?.()
	})
})
