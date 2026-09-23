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
	"kitchen.kitchen": "sentinela do ambiente de treino — preservada por definição",
	"kitchen.mess_halls": "sentinela do ambiente de treino — preservada por definição",
	// `units` continua em core: OM é da Força. Cozinha, refeitório e rancho saíram
	// para `kitchen` na promoção do núcleo (20260901120400) — as chaves aqui são
	// qualificadas por schema, então mover a tabela invalida a exclusão em silêncio.
	"core.units": "sentinela do ambiente de treino — preservada por definição",
	// Roster de ranchos é CADASTRO, como as sentinelas acima — criar rancho exige `admin:2`,
	// que o Conjunto Treino não concede, então o treinando não gera linha aqui. O que ele
	// preenche (kitchen.workforce_submission e, por cascade, quantitativos e observações) está
	// no reset.
	"kitchen.rancho": "roster de ranchos é cadastro, não dado operacional; criar exige admin:2, fora do Conjunto Treino",
	// NOTA: as tabelas de execução orçamentária (crédito, empenho, liquidação,
	// pagamento, conciliação, lote SIAFI) já foram excluídas aqui sob a premissa
	// de que "o treino não concede módulo financeiro". A premissa era falsa — o
	// Conjunto Treino concede `unit` nível 2 na unidade sentinela, que é o nível
	// exigido por essas telas. Hoje elas entram no reset (ver RESET_STEPS).

	// ── Estoque ──
	// O que é DADO operacional do estoque (ledger, lotes, recebimentos, NF-e, ajustes,
	// contagens, OF, designações, a ATA da sentinela) está no reset desde 20260921191000:
	// o Conjunto Treino não concede `storage`, mas instrutor e conta de teste concedem, e uma
	// única baixa por produção na cozinha de treino fazia o reset falhar no ledger imutável.
	// Fica aqui só a CONFIGURAÇÃO da cozinha sentinela — sem linha valem os defaults, então
	// apagar não "limpa" nada, só descalibra.
	"inventory.stock_policy": "parâmetro de reposição, não dado operacional de treino",
	"inventory.kitchen_stock_settings":
		"configuração da cozinha (tolerância, alçada, segregação), como stock_policy — sem linha valem os defaults, então apagar não 'limpa' nada e sim descalibra a cozinha sentinela",
	"inventory.scanner_profile":
		"calibração do leitor por usuário × cozinha — é preferência de dispositivo de quem opera, não dado gerado pelo treinamento; apagar tiraria a calibração do próprio instrutor, como em access_control.user_permissions",
	// ── Declaradas ANTES das migrations que as criam, de propósito ──────────────
	// Este contrato é DEFAULT-DENY: ele varre o banco vivo e cobra que toda
	// tabela escopada esteja declarada. Quando a migration é aplicada ao banco
	// compartilhado antes de a declaração estar na `main`, TODA branch aberta de
	// qualquer app passa a falhar no mesmo instante — aconteceu quatro vezes
	// num único dia, e o remédio foi sempre um PR minúsculo como este, depois.
	//
	// Declarar antes é barato e é verde nos dois estados: a asserção compara o
	// que EXISTE no banco contra o que está coberto, e cobertura a mais nunca
	// sobra. Por isso a ordem certa é: declara, aplica, mergeia o recurso.
	//
	// `inventory.expiry_alert_policy` — migration 20260919120000 (Fase 5).
	"inventory.expiry_alert_policy":
		"antecedência do alerta de validade por item ou classe — parâmetro de operação da cozinha, como kitchen_stock_settings: sem linha valem os defaults, e apagar no reset descalibraria o alerta da cozinha sentinela",
	"gs1_integration.gtin_alias": "catálogo compartilhado (GTIN aprendido na conferência); não é dado operacional da cozinha de treino",
	// `alpha.submission` — migration 20260918123000 (OM da submissão do Projeto α). Declarada
	// DEPOIS de aplicada, por erro de ordem; este PR é o remédio. O α é outro app: o Conjunto
	// Treino não concede nenhum módulo `alpha-*`, e o α recusa a unidade de treino como OM de
	// envio, então o treinando do sisub não gera linha aqui.
	"alpha.submission": "documento de contratação real enviado ao Projeto α (ETP/TR), não dado gerado pelo treinamento do sisub",
	// `kitchen.menu_group_set` — conjunto de grupos por refeição. Declarada DEPOIS de a migration
	// chegar ao banco compartilhado, por erro de ordem: enquanto isto faltou, `check-sisub` ficou
	// vermelho na `main` e o sisub parou de fazer deploy — em PR nenhum relacionado ao recurso.
	// O `kitchen_id` é anulável porque o conjunto pode ser global ou da cozinha, como as pastas.
	// O PR do recurso (#412) a TIRA daqui e decide o destino dela junto com o código que a usa.
	"kitchen.menu_group_set": "declarada fora de ordem, depois da migration; destino decidido no PR do recurso (#412)",
	// `inventory.opening_balance` — migration 20260922100000 (carga de abertura, tarefas 2.12–2.14
	// do change sisub-inventory-operations). Declarada antes de aplicada, pela ordem acima. O PR
	// do recurso a TIRA daqui e a põe no RESET_STEPS antes de `stock_movement` e `stock_lot`: a
	// linha da carga referencia o lote e o movimento que ela criou, então apagá-la depois deles
	// cairia por FK. `opening_balance_item` não tem coluna de escopo e sai por cascade.
	"inventory.opening_balance": "declarada antes da migration 20260922100000; entra no reset junto com o PR do recurso",
}

/** Módulo de estoque — a premissa que sustenta o bloco de exclusões de `inventory`. */
const STORAGE_MODULE = "storage"
/** Política gerenciada do ambiente de treino (`apps/sisub/src/hooks/data/usePolicies.ts`). */
const TRAINING_POLICY_NAME = "Conjunto Treino"

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
	 * A premissa do bloco de estoque, verificada.
	 *
	 * Todas as exclusões de `inventory` se apoiam num fato do banco: o Conjunto Treino não
	 * concede `storage`, logo o treinando não gera linha lá. Enquanto isso era só comentário,
	 * conceder o módulo à política deixaria o teste de completude VERDE com o estoque
	 * acumulando resíduo entre turmas — exatamente o modo de falha silencioso que este arquivo
	 * existe para impedir. Aqui a premissa falha alto quando deixar de ser verdade.
	 */
	test("as exclusões de estoque dependem de o Conjunto Treino não conceder storage", async () => {
		if (!db) return

		const rows = (await db.execute(sql`
			select s.module
			from access_control.policy_statement s
			join access_control.policy p on p.id = s.policy_id
			where p.name = ${TRAINING_POLICY_NAME} and p.deleted_at is null
		`)) as unknown as Array<{ module: string }>

		// Guarda contra query vazia passar como verde: a política existe e tem statements.
		expect(rows.length).toBeGreaterThan(0)

		const inventoryExclusions = Object.keys(RESET_EXCLUSIONS).filter((t) => t.startsWith("inventory."))
		expect(
			rows.some((r) => r.module === STORAGE_MODULE),
			`o Conjunto Treino passou a conceder \`${STORAGE_MODULE}\`: as ${inventoryExclusions.length} exclusões de inventory perderam o fundamento e precisam virar passos de reset`
		).toBe(false)
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

			// AMOSTRA de ids, não contagem.
			//
			// A versão anterior comparava a contagem GLOBAL de produção antes e depois
			// do reset. O filtro `[TEST]%` cobria o que os outros arquivos de teste criam
			// em paralelo, mas não cobre USUÁRIO REAL: a suíte roda contra o banco de
			// produção e leva ~16 minutos. Em 2026-09-01 ela falhou com 2499 contra 2498
			// porque alguém cadastrou receitas globais de verdade durante o run.
			//
			// O que a asserção quer provar é que o reset não APAGOU dado de produção.
			// Contagem igual é uma aproximação ruim disso: falha com inserção
			// concorrente, que é irrelevante, e passaria se o reset apagasse 5 linhas
			// enquanto usuários criam 6. Identidade não tem esse problema.
			//
			// `order by created_at, id limit 50`: as linhas mais ANTIGAS. Inserção
			// concorrente é sempre mais nova, então não entra na janela; apagar qualquer
			// linha da amostra muda o conjunto, porque a vaga é preenchida pela próxima.
			// O desempate por `id` não é enfeite — sem ele, empate de timestamp na 50ª
			// posição faz as duas amostras escolherem linhas diferentes e o teste falha
			// sem nada ter sido apagado.
			const handle = db
			const sampleProduction = async () => {
				const recipes = (await handle.execute(
					sql`select id::text as id from kitchen.recipes where kitchen_id is null and name not like '[TEST]%' order by created_at, id limit 50`
				)) as unknown as Array<{ id: string }>
				const ingredients = (await handle.execute(
					sql`select id::text as id from kitchen.ingredient where description not like '[TEST]%' order by created_at, id limit 50`
				)) as unknown as Array<{ id: string }>
				const templates = (await handle.execute(
					sql`select id::text as id from kitchen.menu_template
					    where kitchen_id is not null and kitchen_id <> ${scopeBefore.kitchen_id} and name not like '[TEST]%'
					    order by created_at, id limit 50`
				)) as unknown as Array<{ id: string }>
				return [...recipes, ...ingredients, ...templates].map((row) => row.id).sort()
			}

			const productionIds = await sampleProduction()
			// Guarda contra amostra vazia passar como verde — a suíte já rodou vacuosa neste repo.
			expect(productionIds.length).toBeGreaterThan(10)
			const result = await resetTrainingScope(db, ctx)

			expect(result.duration_ms).toBeGreaterThanOrEqual(0)
			// Fila e trabalho medidos em separado: a espera pelo lock não pode voltar a ser
			// creditada à limpeza (o registro nasce antes do lock).
			expect(result.queued_ms).toBeGreaterThanOrEqual(0)
			expect(Object.keys(result.deleted_counts).length).toBe(RESET_TARGET_TABLES.length)

			// Sentinelas intactas, com os MESMOS ids.
			expect(await resolveTrainingScope(db)).toEqual(scopeBefore)

			// Nada de produção foi APAGADO — a mesma amostra continua lá.
			//
			// Reamostrar em vez de consultar os ids: `order by created_at, id limit 50` pega
			// as linhas MAIS ANTIGAS, então inserção concorrente (que é sempre mais nova)
			// não entra na janela e não muda o resultado. Apagar qualquer linha da amostra
			// muda — a vaga é preenchida pela próxima mais antiga e a lista diverge.
			expect(await sampleProduction()).toEqual(productionIds)

			// Baseline presente: sem ele o treinando abre um ambiente vazio.
			const info = await fetchTrainingScope(db, ctx)
			expect(info.pending_counts["kitchen.menu_template"]).toBeGreaterThan(0)

			// A execução deixou rastro — o DESTA execução, achado pelo id que ela devolveu.
			//
			// Ler `history[0]` presumia que o registro mais recente é o nosso, e o banco de
			// integração é compartilhado: um segundo reset que chega enquanto este trabalha já
			// inseriu a linha dele (o INSERT do log acontece antes do advisory lock), com
			// `started_at` posterior e status `running`. Era o `expected 'running' to be
			// 'succeeded'` que derrubava o CI/CD da main sem nada de errado no código.
			const history = await listTrainingResets(db, ctx, { limit: 20 })
			const ours = history.find((row) => row.id === result.reset_id)
			// Explícito: sem isto, um `ours` indefinido faria as asserções de `?.` abaixo
			// falharem por "undefined não é 'succeeded'", escondendo que o problema é a
			// LINHA não ter sido achada.
			expect(ours).toBeDefined()
			expect(ours?.status).toBe("succeeded")
			expect(ours?.actor_id).toBe(ctx.userId)
			expect(ours?.duration_ms).not.toBeNull()
			expect(ours?.queued_ms).not.toBeNull()
		},
		RESET_TIMEOUT_MS
	)

	/**
	 * Órfãs do log — execuções que morreram entre o INSERT do registro e o UPDATE do
	 * desfecho (container derrubado, run de CI cancelado). Ficavam `running` para sempre e
	 * o painel da SDAB as mostrava como "Em andamento" meses depois; eram 6 quando isto foi
	 * escrito. O reset seguinte fecha as antigas — segurar o advisory lock é a prova de que
	 * nenhuma outra execução está na transação de dados.
	 *
	 * O corte de idade é o que protege a única `running` legítima que não é a nossa: a que
	 * já foi inserida e ainda espera o lock. Por isso o teste planta as DUAS.
	 */
	test(
		"reset fecha as execuções abandonadas e não toca nas recentes",
		async () => {
			if (!db) return
			const handle = db

			const [stale] = (await handle.execute(sql`
				insert into kitchen.training_reset_log (actor_id, started_at, status)
				values (${ACTOR_ID}, now() - interval '2 hours', 'running')
				returning id
			`)) as unknown as Array<{ id: string }>
			const [fresh] = (await handle.execute(sql`
				insert into kitchen.training_reset_log (actor_id, started_at, status)
				values (${ACTOR_ID}, now(), 'running')
				returning id
			`)) as unknown as Array<{ id: string }>
			const staleId = stale?.id as string
			const freshId = fresh?.id as string

			try {
				await resetTrainingScope(db, ctx)

				const rows = (await handle.execute(sql`
					select id, status, error_message, finished_at
					from kitchen.training_reset_log
					where id in (${staleId}, ${freshId})
				`)) as unknown as Array<{ id: string; status: string; error_message: string | null; finished_at: string | null }>

				const staleRow = rows.find((r) => r.id === staleId)
				const freshRow = rows.find((r) => r.id === freshId)

				expect(staleRow?.status).toBe("abandoned")
				expect(staleRow?.error_message).toContain("sem desfecho")
				// `finished_at` continua nulo: ninguém sabe quando o processo parou, e inventar
				// um horário seria pior do que admitir a lacuna.
				expect(staleRow?.finished_at).toBeNull()

				// A recente é uma execução possivelmente VIVA esperando o lock — reclassificá-la
				// seria mentir sobre um processo que ainda vai gravar o próprio desfecho.
				expect(freshRow?.status).toBe("running")
			} finally {
				await handle.execute(sql`delete from kitchen.training_reset_log where id in (${staleId}, ${freshId})`)
			}
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

	test("reset exige admin nível 2", async () => {
		if (!db) return
		const readOnly = {
			userId: ACTOR_ID,
			permissions: [{ module: "admin" as const, level: 1, kitchen_id: null, unit_id: null, mess_hall_id: null }],
			aal: 1 as const,
			lastFactorAt: null,
			origin: "session" as const,
		}

		await expect(resetTrainingScope(db, readOnly)).rejects.toThrow(/PERMISSION|Requires admin/i)
	})

	afterAll(async () => {
		await closeDb?.()
	})
})
