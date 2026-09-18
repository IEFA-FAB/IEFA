/**
 * Guard de schema das seleções PostgREST das server functions.
 *
 * ## O defeito que este teste existe para pegar
 *
 * As tabelas novas de `inventory` entram nas server fns por um cliente `any`
 * (`LooseClient`), porque ainda não estão nos tipos gerados. Isso significa que
 * **o typecheck não enxerga nome de coluna**. E o modo de falhar é o pior
 * possível:
 *
 *     coluna errada → erro do PostgREST → erro descartado → lista VAZIA → tela calma
 *
 * Uma tela que mente calada é pior que uma que quebra, porque ninguém
 * investiga. Já aconteceu três vezes neste repo, e nenhuma foi pega por teste:
 *
 *  - `computeSuggestion` pedia `menu_items.meal_type_id`, que mora em
 *    `daily_menu`. A sugestão do dia voltava sempre vazia e o recurso inteiro
 *    de variação, justificativa e fechamento nasceu inerte em produção;
 *  - o painel "A caminho" pediu `empenho.valor_empenhado` e
 *    `goods_receipt_item.refusal_reason`, nenhuma das duas existente;
 *  - e filtrou `nfe_document.status = 'review'`, valor que não está no CHECK —
 *    filtro que não casa nada não dá erro nenhum, só devolve vazio.
 *
 * Revisão humana pegou as três. Revisão humana não escala para todas as fns.
 *
 * ## Como ele funciona
 *
 * Varre, em vez de listar à mão: lista escrita à mão envelhece, varredura não.
 * De cada `*.fn.ts` extrai o schema de cada cliente, casa `.from("t").select(…)`
 * com esse schema e confere cada coluna contra o `information_schema` do banco
 * real.
 *
 * ## O que ele NÃO cobre — e é importante saber, para não confiar demais
 *
 *  - `select` montado por template string ou variável: não há literal para ler;
 *  - embed aninhado (`select("a, outra(b)")`): a coluna do relacionamento não é
 *    do mesmo `from`, e resolver isso exigiria ler as FKs;
 *  - `.rpc(...)`: argumento de função, não coluna;
 *  - `.eq("col", …)` e amigos: só a lista do `select` é conferida;
 *  - valores de `.in("status", [...])` são conferidos só onde o teste de
 *    `incoming` os declara — generalizar isso exigiria saber qual coluna tem
 *    CHECK de lista.
 */

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import postgres from "postgres"
import { afterAll, beforeAll, expect, test } from "vitest"
import { describeSupabaseIntegration, getSisubDatabaseUrl } from "../supabase"

const url = getSisubDatabaseUrl()
const describeIf = url ? describeSupabaseIntegration : describeSupabaseIntegration.skip

const SERVER_DIR = join(import.meta.dirname, "..", "..", "server")

/** `const x = () => getServerClient("schema")` e `const x = getServerClient("schema")`. */
const CLIENT_DECLARATION = /\b(?:const|let)\s+(\w+)\s*=\s*(?:\(\)\s*=>\s*)?getServerClient\(\s*"(\w+)"/g
/** `const inv = inventory()` — o apelido local do factory. */
const LOCAL_ALIAS = /\b(?:const|let)\s+(\w+)\s*=\s*(\w+)\(\)/g
/** `<recebedor>.from("tabela")`, com o encadeamento quebrado em linhas. */
const FROM_CALL = /\b(\w+)(?:\(\))?\s*\.from\(\s*"(\w+)"\s*\)/g

interface Selection {
	file: string
	schema: string
	table: string
	columns: string[]
	line: number
}

/** Seleções que o teste declara não conseguir ler, com o motivo. */
const UNREADABLE: string[] = []

function collectSelections(): Selection[] {
	const selections: Selection[] = []

	for (const name of readdirSync(SERVER_DIR)) {
		if (!name.endsWith(".fn.ts")) continue
		const source = readFileSync(join(SERVER_DIR, name), "utf8")

		// schema por identificador: factory e apelido local
		const schemaByName = new Map<string, string>()
		for (const match of source.matchAll(CLIENT_DECLARATION)) schemaByName.set(match[1] as string, match[2] as string)
		// duas passadas: `const inv = inventory()` pode vir antes ou depois
		for (let pass = 0; pass < 2; pass += 1) {
			for (const match of source.matchAll(LOCAL_ALIAS)) {
				const schema = schemaByName.get(match[2] as string)
				if (schema) schemaByName.set(match[1] as string, schema)
			}
		}

		for (const match of source.matchAll(FROM_CALL)) {
			const receiver = match[1] as string
			const table = match[2] as string
			const schema = schemaByName.get(receiver)
			if (!schema) continue // recebedor que não é cliente de schema conhecido

			// o `.select(...)` do mesmo encadeamento: a primeira ocorrência depois
			// do `.from`, antes do próximo `.from`
			const after = source.slice(match.index + match[0].length)
			const nextFrom = after.search(/\.from\(\s*"/)
			const chain = nextFrom === -1 ? after : after.slice(0, nextFrom)
			const select = chain.match(/\.select\(\s*("([^"]*)"|`|\w)/)
			if (!select) continue

			const line = source.slice(0, match.index).split("\n").length
			const where = `${name}:${line}`

			if (select[2] == null) {
				// template string ou variável — não há literal para conferir
				UNREADABLE.push(`${where} ${schema}.${table}: select não literal`)
				continue
			}
			const raw = select[2]
			// `*` seleciona tudo; `"*, coluna"` é o idioma do PostgREST para "tudo
			// mais esta", e a segunda parte não é coluna a conferir — é o mesmo
			// tudo. Tratar o `*` como nome de coluna gerava falso positivo.
			const columns = raw
				.split(",")
				.map((column) => column.trim())
				.filter((column) => column !== "" && column !== "*")
			if (columns.length === 0) continue
			if (raw.includes("(")) {
				UNREADABLE.push(`${where} ${schema}.${table}: select com embed aninhado`)
				continue
			}

			selections.push({
				file: where,
				schema,
				table,
				columns,
				line,
			})
		}
	}

	return selections
}

const selections = collectSelections()

describeIf("seleções PostgREST × schema real", () => {
	let sql: postgres.Sql

	beforeAll(() => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
	})

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	test("a varredura encontra seleções (proteção contra um teste que passa vazio)", () => {
		// Sem esta guarda, uma mudança de formatação que quebre a regex faz a
		// varredura achar zero e o teste passa verde sem testar nada — foi o
		// defeito que quase nos pegou em outro guard deste repo.
		expect(selections.length, "a varredura não achou nenhuma seleção: a regex provavelmente parou de casar").toBeGreaterThan(50)
		expect(new Set(selections.map((s) => s.schema)).size, "a varredura achou um schema só: o mapeamento de cliente quebrou").toBeGreaterThan(2)
	})

	test("toda coluna selecionada existe na tabela do schema certo", async () => {
		const rows = (await sql`
			select table_schema, table_name, column_name
			  from information_schema.columns
			 where table_schema not in ('pg_catalog', 'information_schema')`) as unknown as Array<{
			table_schema: string
			table_name: string
			column_name: string
		}>
		expect(rows.length, "information_schema veio vazio").toBeGreaterThan(100)

		const columnsByTable = new Map<string, Set<string>>()
		for (const row of rows) {
			const key = `${row.table_schema}.${row.table_name}`
			const set = columnsByTable.get(key) ?? new Set<string>()
			set.add(row.column_name)
			columnsByTable.set(key, set)
		}

		const problems: string[] = []
		for (const selection of selections) {
			const key = `${selection.schema}.${selection.table}`
			const existing = columnsByTable.get(key)
			if (!existing) {
				problems.push(`${selection.file} — relação inexistente: ${key}`)
				continue
			}
			const missing = selection.columns.filter((column) => !existing.has(column))
			if (missing.length > 0) problems.push(`${selection.file} — ${key} não tem: ${missing.join(", ")}`)
		}

		expect(
			problems,
			"seleção PostgREST apontando para coluna que não existe. O erro é DESCARTADO em runtime e a tela mostra lista vazia sem avisar — confira o nome no banco."
		).toEqual([])
	})

	test("o que a varredura não consegue ler fica visível, e não escondido", () => {
		// Não é falha: é a fronteira da rede, dita em voz alta. Sem isto, o
		// próximo leitor confia demais no guard.
		expect(Array.isArray(UNREADABLE)).toBe(true)
		if (UNREADABLE.length > 0) {
			// biome-ignore lint/suspicious/noConsole: a lista é o valor deste caso
			console.info(`[schema guard] ${UNREADABLE.length} seleções fora do alcance da varredura:\n  ${UNREADABLE.join("\n  ")}`)
		}
	})
})
