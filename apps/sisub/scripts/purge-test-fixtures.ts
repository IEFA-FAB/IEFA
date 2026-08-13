/**
 * Faxineiro das fixtures de integração.
 *
 * Os testes de integração rodam contra o BANCO REAL (ver `.github/workflows/integration.yml`)
 * e limpam o que semearam num `afterEach`. Isso cobre falha de asserção, mas NÃO cobre morte
 * abrupta do processo: quando o job `full suite` é cancelado no meio, o vitest leva SIGKILL,
 * nenhum hook roda e as linhas ficam em produção — foi assim que duas receitas `[TEST]`
 * apareceram em `/global/recipes` (run 31526235954, cancelado em 2026-08-11T19:16:37Z).
 *
 * Como decide o que é lixo (nesta ordem, e é o ponto delicado — isto roda contra PRODUÇÃO):
 *   1. RAÍZES: linha com marcador `[TEST]` numa coluna de identidade E com o token de execução
 *      do `uid()` (`<base36><hex8>-<seq>`) no mesmo valor. O token não é digitável por acidente,
 *      então casar com ele é prova de que a linha saiu de uma fixture.
 *   2. FECHO: descendentes por FK das raízes. Linha-filha não tem marcador próprio
 *      (`recipe_ingredients`, `menu_items`, `purchase_item_ingredient`…) e sem isto o delete
 *      do pai bate em FK NO ACTION.
 *   3. SUSPEITAS: linha com marcador mas SEM token — nome literal escrito à mão num teste. Só some
 *      se cair no fecho de uma raiz; sobrando, é apenas RELATADA. Uma receita real que alguém
 *      batizou de "[TEST] ..." não pode sumir junto com o cardápio dela. `--force` inclui as
 *      suspeitas — para uso manual, nunca no CI. Por isso as fixtures passam TODO nome pelo
 *      `uid()`: literal em fixture vira lixo que a faxina não tem como distinguir de dado real.
 *
 * Uso:
 *   bun run scripts/purge-test-fixtures.ts            # dry-run: só relata
 *   bun run scripts/purge-test-fixtures.ts --apply    # apaga raízes + fecho
 *   bun run scripts/purge-test-fixtures.ts --apply --force --max-rows 500 --min-age-minutes 30
 *
 * Requer `SISUB_DATABASE_URL` (pooler). Dois freios: `--max-rows` (padrão que passou a casar com
 * dado real) e `--min-age-minutes` (suíte de integração rodando neste instante). Nos dois casos o
 * script aborta sem apagar nada.
 */

import postgres from "postgres"

// Marcadores usados pelas fixtures (`src/test/operations-fixtures.ts`) e pelos testes legados
// de `src/server/*.test.ts`.
const MARKERS = ["[TEST]", "[TEST-RECIPE]", "[TEST-PI]"]

/**
 * Token de execução do `uid()`: `Date.now().toString(36)` + 8 hex do `randomUUID()` + `-<seq>`.
 * Faixas largas de propósito — o comprimento do base36 muda com o tempo.
 */
const RUN_TOKEN_RE = "[0-9a-z]{6,10}[0-9a-f]{8}-[0-9]+"

/**
 * Domínio reservado pela RFC 2606 — o `seedAuthUser`/`seedUserData` emitem
 * `test-<token>@example.invalid`. Nenhum usuário real pode ter esse endereço, então email neste
 * domínio é raiz por si só (é o único jeito de alcançar `auth.users`, que não tem coluna marcável).
 */
const FIXTURE_EMAIL_DOMAIN = "@example.invalid"

// Schemas do split por domínio (ver `project_sisub_schema_split`) + `auth` (identidades das
// fixtures). `public` fica de fora: nada de fixture mora lá e é onde vivem objetos do Supabase.
const SCHEMAS = ["core", "kitchen", "procurement", "access_control", "inventory", "production", "analytics", "budget", "sisub", "auth"]

// Só colunas de IDENTIDADE, nunca texto livre do usuário: as fixtures escrevem os marcadores
// em nome/descrição/código, e varrer `preparation_method` ou o título de uma conversa arrastaria
// dado real de quem digitou "[TEST]" numa observação.
const MARKED_COLUMNS = ["name", "description", "display_name", "code", "title", "nmGuerra", "nm_guerra", "note", "change_summary"]

const EMAIL_COLUMNS = ["email"]

const DEFAULT_MAX_ROWS = 500

/**
 * Idade mínima de uma raiz. A concurrency do workflow serializa os runs de CI, mas nada impede um
 * `bun run test:integration` local rodando junto — e as fixtures dele estão VIVAS. Sem esta janela
 * a faxina apagaria as linhas de uma suíte em andamento no meio do teste. Lixo de verdade é sempre
 * mais velho que isto; o que escapar por ser novo demais sai no passe seguinte.
 */
const DEFAULT_MIN_AGE_MINUTES = 30

type Args = { apply: boolean; force: boolean; maxRows: number; minAgeMinutes: number }

function parseArgs(argv: string[]): Args {
	const apply = argv.includes("--apply")
	const force = argv.includes("--force")
	const numeric = (flag: string, fallback: number) => {
		const i = argv.indexOf(flag)
		if (i < 0) return fallback
		const value = Number(argv[i + 1])
		if (!Number.isFinite(value) || value < 0) throw new Error(`${flag} precisa ser um número >= 0`)
		return value
	}
	const maxRows = numeric("--max-rows", DEFAULT_MAX_ROWS)
	if (maxRows <= 0) throw new Error("--max-rows precisa ser um inteiro positivo")
	return { apply, force, maxRows, minAgeMinutes: numeric("--min-age-minutes", DEFAULT_MIN_AGE_MINUTES) }
}

/** Uma linha marcada para remoção. `ctid` só é estável dentro da transação — por isso tudo roda em uma só. */
type Row = { schema: string; table: string; ctid: string }

type Fk = {
	childSchema: string
	childTable: string
	childCols: string[]
	parentSchema: string
	parentTable: string
	parentCols: string[]
}

const qualified = (schema: string, table: string) => `"${schema}"."${table}"`
const key = (r: Row) => `${r.schema}.${r.table}#${r.ctid}`

async function main() {
	const { apply, force, maxRows, minAgeMinutes } = parseArgs(process.argv.slice(2))
	const url = process.env.SISUB_DATABASE_URL
	if (!url) throw new Error("SISUB_DATABASE_URL ausente")

	const sql = postgres(url, { max: 1, prepare: false })
	try {
		// Uma transação só: os `ctid` coletados na varredura precisam continuar válidos no delete.
		// Sem `--apply` termina em ROLLBACK, então o dry-run também exercita os deletes de verdade
		// (pega FK que o fecho não cobriu antes de alguém rodar com --apply).
		const rows = await sql.begin(async (tx) => {
			const fks = await loadForeignKeys(tx)
			const { roots, suspects, deferred, timestamped } = await findCandidates(tx, minAgeMinutes, force)

			const collected = new Map<string, Row>()
			for (const r of force ? [...roots, ...suspects] : roots) collected.set(key(r), r)
			await expandDescendants(tx, fks, [...collected.values()], collected)

			const all = [...collected.values()]
			report(all)
			reportUnclaimedSuspects(suspects, collected, force)
			reportDeferred(deferred)

			if (all.length === 0) return []
			await assertNothingFresh(tx, all, timestamped, minAgeMinutes)
			if (all.length > maxRows) {
				throw new Error(`${all.length} linhas casariam com os padrões de fixture (teto --max-rows=${maxRows}). Abortado sem apagar nada — confira se algum padrão passou a casar com dado real.`)
			}

			await deleteAll(tx, all)

			if (!apply) throw new DryRun(all)
			return all
		})
		console.log(`\n✅ ${rows.length} linha(s) removida(s).`)
	} catch (e) {
		if (e instanceof DryRun) {
			console.log(`\n🔎 dry-run: ${e.rows.length} linha(s) seriam removidas. Rode com --apply para efetivar.`)
			return
		}
		if (e instanceof FreshData) {
			// Não é erro: outra suíte está usando essas linhas. Sair 0 evita passo vermelho no CI
			// por uma condição normal — o próximo passe da faxina recolhe o lixo.
			console.log(`\n⏭️  ${e.message} O próximo passe recolhe.`)
			return
		}
		throw e
	} finally {
		await sql.end({ timeout: 5 })
	}
}

/** Sinaliza o rollback proposital do dry-run (postgres.js só desfaz a transação se o callback lançar). */
class DryRun extends Error {
	constructor(readonly rows: Row[]) {
		super("dry-run")
	}
}

/** Fecho alcançou linha viva: aborta o passe sem apagar nada e sem marcar falha. */
class FreshData extends Error {}

async function loadForeignKeys(tx: postgres.TransactionSql): Promise<Fk[]> {
	const rows = await tx<
		{
			child_schema: string
			child_table: string
			child_cols: string[]
			parent_schema: string
			parent_table: string
			parent_cols: string[]
		}[]
	>`
		select
			cn.connamespace::regnamespace::text as child_schema,
			cc.relname                          as child_table,
			array(select a.attname from unnest(cn.conkey) k join pg_attribute a on a.attrelid = cn.conrelid and a.attnum = k) as child_cols,
			pc.relnamespace::regnamespace::text as parent_schema,
			pc.relname                          as parent_table,
			array(select a.attname from unnest(cn.confkey) k join pg_attribute a on a.attrelid = cn.confrelid and a.attnum = k) as parent_cols
		from pg_constraint cn
		join pg_class cc on cc.oid = cn.conrelid
		join pg_class pc on pc.oid = cn.confrelid
		where cn.contype = 'f'
			and pc.relnamespace::regnamespace::text = any(${SCHEMAS})
	`
	return rows.map((r) => ({
		childSchema: r.child_schema,
		childTable: r.child_table,
		childCols: r.child_cols,
		parentSchema: r.parent_schema,
		parentTable: r.parent_table,
		parentCols: r.parent_cols,
	}))
}

/**
 * Varre as colunas de identidade atrás dos padrões de fixture e separa em:
 *   `roots`    — prova de origem em fixture (token de execução, ou email `.invalid`);
 *   `suspects` — marcador `[TEST]` sem token, que só some se o fecho por FK alcançar.
 */
async function findCandidates(
	tx: postgres.TransactionSql,
	minAgeMinutes: number,
	force: boolean
): Promise<{ roots: Row[]; suspects: Row[]; deferred: Row[]; timestamped: Set<string> }> {
	const columns = await tx<{ table_schema: string; table_name: string; column_name: string }[]>`
		select c.table_schema, c.table_name, c.column_name
		from information_schema.columns c
		join information_schema.tables t
			on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
		where c.table_schema = any(${SCHEMAS})
			and (
				(c.data_type in ('text', 'character varying') and c.column_name = any(${[...MARKED_COLUMNS, ...EMAIL_COLUMNS]}))
				or c.column_name = 'created_at'
			)
	`

	const byTable = new Map<string, { schema: string; table: string; marked: string[]; emails: string[]; hasCreatedAt: boolean }>()
	for (const c of columns) {
		const k = `${c.table_schema}.${c.table_name}`
		const entry = byTable.get(k) ?? { schema: c.table_schema, table: c.table_name, marked: [], emails: [], hasCreatedAt: false }
		if (c.column_name === "created_at") entry.hasCreatedAt = true
		else if (EMAIL_COLUMNS.includes(c.column_name)) entry.emails.push(c.column_name)
		else entry.marked.push(c.column_name)
		byTable.set(k, entry)
	}

	const roots: Row[] = []
	const suspects: Row[] = []
	// Tabela sem `created_at` (`core.units`, `core.mess_halls`) não tem como provar que não pertence
	// a uma suíte rodando agora — e ela é PAI de tudo, então apagá-la derruba a execução viva inteira.
	// Fica de fora do passe automático; `--force`, com a suíte parada, recolhe.
	const deferred: Row[] = []
	const deferrable = (hasCreatedAt: boolean) => !hasCreatedAt && minAgeMinutes > 0 && !force
	for (const { schema, table, marked, emails, hasCreatedAt } of byTable.values()) {
		// `like` não trata `[` como metacaractere — o marcador entra literal.
		const markedPredicates = marked.map((col) => `(${MARKERS.map((m) => `"${col}" like '%${m}%'`).join(" or ")})`)
		const emailPredicates = emails.map((col) => `"${col}" like '%${FIXTURE_EMAIL_DOMAIN}'`)
		const marker = [...markedPredicates, ...emailPredicates].join(" or ")
		if (!marker) continue
		// Janela de segurança contra suíte em andamento. Tabela sem `created_at` (ex.: `core.units`)
		// escapa deste filtro — quem cobre esse caso é o `assertNothingFresh` sobre o fecho.
		const fresh = hasCreatedAt && minAgeMinutes > 0 ? ` and "created_at" < now() - interval '${minAgeMinutes} minutes'` : ""
		const candidate = `(${marker})${fresh}`
		// Prova de origem: marcador + token de execução na MESMA coluna, ou email de domínio reservado.
		const proven = [...marked.map((col) => `("${col}" ~ '${RUN_TOKEN_RE}' and (${MARKERS.map((m) => `"${col}" like '%${m}%'`).join(" or ")}))`), ...emailPredicates].join(" or ")

		const rows = await tx.unsafe<{ ctid: string; proven: boolean }[]>(`select ctid::text as ctid, (${proven}) as proven from ${qualified(schema, table)} where ${candidate}`)
		for (const r of rows) {
			const row: Row = { schema, table, ctid: r.ctid }
			if (r.proven) (deferrable(hasCreatedAt) ? deferred : roots).push(row)
			else suspects.push(row)
		}
	}
	return { roots, suspects, deferred, timestamped: new Set([...byTable.values()].filter((t) => t.hasCreatedAt).map((t) => `${t.schema}.${t.table}`)) }
}

/**
 * Fecho transitivo de filhos por FK. Linhas-filhas (`recipe_ingredients`, `menu_items`,
 * `purchase_item_ingredient`…) não carregam marcador; sem isto o delete do pai bate em FK
 * NO ACTION e a faxina não sai do lugar.
 */
async function expandDescendants(tx: postgres.TransactionSql, fks: Fk[], frontier: Row[], collected: Map<string, Row>) {
	let current = frontier
	let depth = 0
	// Teto de profundidade: FK auto-referente (recipes.base_recipe_id) já é coberta em poucos
	// níveis; o limite evita loop infinito num ciclo de FK inesperado.
	while (current.length > 0 && depth < 20) {
		depth += 1
		const next: Row[] = []

		const byTable = new Map<string, Row[]>()
		for (const r of current) {
			const k = `${r.schema}.${r.table}`
			byTable.set(k, [...(byTable.get(k) ?? []), r])
		}

		for (const [k, parents] of byTable) {
			const [parentSchema, parentTable] = k.split(".") as [string, string]
			const ctids = parents.map((p) => p.ctid)
			for (const fk of fks) {
				if (fk.parentSchema !== parentSchema || fk.parentTable !== parentTable) continue
				const on = fk.childCols.map((c, i) => `c."${c}" = p."${fk.parentCols[i]}"`).join(" and ")
				const rows = await tx.unsafe<{ ctid: string }[]>(
					`select distinct c.ctid::text as ctid
					 from ${qualified(fk.childSchema, fk.childTable)} c
					 join ${qualified(parentSchema, parentTable)} p on ${on}
					 where p.ctid = any($1::tid[])`,
					[ctids]
				)
				for (const r of rows) {
					const row: Row = { schema: fk.childSchema, table: fk.childTable, ctid: r.ctid }
					if (collected.has(key(row))) continue
					collected.set(key(row), row)
					next.push(row)
				}
			}
		}
		current = next
	}
}

/**
 * Aborta se o fecho alcançou linha recém-criada: é sinal de suíte rodando AGORA (o filtro de idade
 * das raízes não pega tabela sem `created_at`, como `core.units` — e apagar a unidade leva junto a
 * cozinha, o cardápio e tudo mais de uma execução viva). Não apagar agora não custa nada: o passe
 * seguinte pega o lixo.
 */
async function assertNothingFresh(tx: postgres.TransactionSql, rows: Row[], timestamped: Set<string>, minAgeMinutes: number) {
	if (minAgeMinutes <= 0) return
	for (const [k, ctids] of groupByTable(rows)) {
		if (!timestamped.has(k)) continue // sem `created_at` não há o que checar
		const [schema, table] = k.split(".") as [string, string]
		const [row] = await tx.unsafe<{ n: number }[]>(
			`select count(*)::int as n from ${qualified(schema, table)}
			 where ctid = any($1::tid[]) and "created_at" >= now() - interval '${minAgeMinutes} minutes'`,
			[ctids]
		)
		if (row && row.n > 0) {
			throw new FreshData(`${row.n} linha(s) em ${k} têm menos de ${minAgeMinutes} min — provável suíte de integração em execução; nada foi apagado.`)
		}
	}
}

/** Raízes em tabela sem `created_at`: só saem com `--force`, e com a suíte parada. */
function reportDeferred(deferred: Row[]) {
	if (deferred.length === 0) return
	console.log(`\n⏸️  ${deferred.length} linha(s) de fixture em tabela sem created_at — adiadas (podem ser de uma execução em andamento):`)
	for (const [table, ctids] of groupByTable(deferred)) {
		console.log(`  ${table.padEnd(40)} ${ctids.length}`)
	}
	console.log("   Com a suíte de integração parada, rode com --force.")
}

function groupByTable(rows: Row[]): Map<string, string[]> {
	const groups = new Map<string, string[]>()
	for (const r of rows) {
		const k = `${r.schema}.${r.table}`
		groups.set(k, [...(groups.get(k) ?? []), r.ctid])
	}
	return groups
}

function report(rows: Row[]) {
	if (rows.length === 0) {
		console.log("Nenhuma linha de fixture encontrada.")
		return
	}
	console.log("Linhas de fixture encontradas:")
	for (const [table, ctids] of [...groupByTable(rows)].sort((a, b) => b[1].length - a[1].length)) {
		console.log(`  ${table.padEnd(40)} ${ctids.length}`)
	}
}

/** Marcador sem token e fora do fecho: pode ser dado real batizado de "[TEST] ...". Relata, não apaga. */
function reportUnclaimedSuspects(suspects: Row[], collected: Map<string, Row>, force: boolean) {
	if (force) return
	const unclaimed = suspects.filter((s) => !collected.has(key(s)))
	if (unclaimed.length === 0) return
	console.log(`\n⚠️  ${unclaimed.length} linha(s) com marcador [TEST] mas SEM token de execução e fora do fecho por FK — não removidas:`)
	for (const [table, ctids] of groupByTable(unclaimed)) {
		console.log(`  ${table.padEnd(40)} ${ctids.length}`)
	}
	console.log("   Confira à mão; se for mesmo lixo de teste, rode com --force.")
}

/**
 * Apaga em múltiplos passes com savepoint: uma tabela que ainda tem filho pendente falha, é
 * reagendada e passa na volta. Ordenar por profundidade de descoberta não bastaria — pai e filho
 * podem ser AMBOS raízes (`units` + `kitchen`, `folder` + `ingredient`) e cair no mesmo nível.
 * FK NO ACTION é checada no fim do statement, então um único DELETE por tabela resolve
 * auto-referência (`recipes.base_recipe_id`) de graça.
 */
async function deleteAll(tx: postgres.TransactionSql, rows: Row[]) {
	let pending = [...groupByTable(rows)]
	let lastErr: unknown = null
	while (pending.length > 0) {
		const stillFailing: [string, string[]][] = []
		for (const [k, ctids] of pending) {
			const [schema, table] = k.split(".") as [string, string]
			try {
				// Savepoint: um DELETE que viola FK aborta só o savepoint, não a transação externa.
				await tx.savepoint((sp) => sp.unsafe(`delete from ${qualified(schema, table)} where ctid = any($1::tid[])`, [ctids]))
			} catch (e) {
				lastErr = e
				stillFailing.push([k, ctids])
			}
		}
		if (stillFailing.length === pending.length) {
			throw new Error(`não consegui apagar ${stillFailing.map(([k]) => k).join(", ")} — o fecho por FK não cobriu algum filho. Último erro: ${(lastErr as Error)?.message ?? lastErr}`)
		}
		pending = stillFailing
	}
}

await main()
