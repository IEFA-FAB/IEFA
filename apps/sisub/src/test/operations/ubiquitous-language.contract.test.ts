/**
 * Contrato da linguagem ubíqua no banco VIVO (change `sisub-ubiquitous-language`, D8).
 *
 * O opengrep (`.opengrep/rules/ubiquitous-language*.yaml`) barra o nome descartado no código e
 * nas migrations novas; este teste barra o que já está no banco: relação, coluna, constraint,
 * índice, função, corpo de função, definição de view e comentário com nome que o glossário
 * descartou. É ele que pega a migration que alguém aplicou à mão, ou o expand que esqueceu um
 * objeto.
 *
 * ## Compatibilidade de expand
 *
 * Um expand deixa, de propósito, os nomes antigos que o código da `main` em produção ainda usa
 * (views de compatibilidade, colunas espelhadas). Eles entram em `EXPAND_ALLOWLIST`, que é
 * DATADA: o PR do contract que os derruba esvazia a lista. O lote 2 (anexo quantitativo) já passou
 * pelo contract 20260927050000, e o lote 4 (finanças) pelo 20260927090000.
 *
 * A lista de termos cresce por lote, como a do opengrep.
 */

import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { describeSupabaseIntegration, getSisubDatabaseUrl } from "../supabase"

const url = getSisubDatabaseUrl()
const describeIf = url ? describeSupabaseIntegration : describe.skip

/** Schemas do sisub. Espelho de terceiro (`compras_gov_integration`) fica de fora: o nome é o dele. */
const SCHEMAS = ["core", "kitchen", "procurement", "finance", "inventory", "access_control", "siafi_integration", "sisub", "analytics"]

/**
 * Nome descartado num identificador do banco. `numero_ata`, `ano_ata` e `status_ata` são a ARP de
 * fato (espelho do Compras.gov.br) e não casam: só `ata_id`, `ata_item_id` e `ata_draft` saem.
 * Lote 4: a UG executora não tem dotação (`received_credit`), o saldo do SIAFI é o crédito
 * disponível (`available_credit_siafi`) e a UG emitente é `issuer_ug`.
 */
const DISCARDED_IDENTIFIER =
	/procurement_list|kitchen_ata_draft|(^|_)list_id($|_)|list_kitchen_id|max_margin|margin_justification|(^|_)total_quantity($|_)|(^|_)ata_(id|item_id|draft)($|_)|(^|_)dotacao($|_)|saldo_siafi|ug_emitente/

/** Nome descartado citado em texto (corpo de função, definição de view, comentário), em regex do Postgres. */
const DISCARDED_TEXT = String.raw`\mprocurement_list\w*|\mkitchen_ata_draft\w*|\mlist_id\M|\mlist_kitchen_id\M|\mmax_margin_percent\M|\mmargin_justification\M|\mdotacao\M|\msaldo_siafi\M|\mug_emitente\M`

/**
 * Compatibilidade de um expand em andamento, até o contract dele. Vazia: o contract
 * 20260927050000 derrubou a do lote 2 (anexo quantitativo) e o 20260927090000 a do lote 4
 * (finanças). Chave: `tipo:schema.objeto[.coluna]`.
 */
const EXPAND_ALLOWLIST = new Set<string>([])

/** Views de compatibilidade: as colunas delas e a definição saem com elas. */
const allowedRelation = (schema: string, name: string) => EXPAND_ALLOWLIST.has(`relation:${schema}.${name}`)

function offending(keys: string[]): string[] {
	return keys.filter((k) => !EXPAND_ALLOWLIST.has(k))
}

describeIf("linguagem ubíqua no banco vivo", () => {
	let sql: postgres.Sql

	beforeAll(() => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
	})

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	test("nenhuma relação, coluna, constraint ou função com nome descartado (fora da compatibilidade do expand)", async () => {
		const relations = await sql<{ schema: string; name: string }[]>`
			select n.nspname as schema, c.relname as name
			from pg_class c join pg_namespace n on n.oid = c.relnamespace
			where n.nspname = any(${SCHEMAS}) and c.relkind in ('r', 'p', 'v', 'm', 'f', 'i', 'I', 'S')`
		const columns = await sql<{ schema: string; relation: string; name: string }[]>`
			select table_schema as schema, table_name as relation, column_name as name
			from information_schema.columns where table_schema = any(${SCHEMAS})`
		const constraints = await sql<{ schema: string; name: string }[]>`
			select n.nspname as schema, con.conname as name
			from pg_constraint con join pg_namespace n on n.oid = con.connamespace
			where n.nspname = any(${SCHEMAS})`
		const functions = await sql<{ schema: string; name: string }[]>`
			select n.nspname as schema, p.proname as name
			from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			where n.nspname = any(${SCHEMAS})`

		// Guarda contra consulta vazia passar como verde.
		expect(relations.length).toBeGreaterThan(100)
		expect(columns.length).toBeGreaterThan(500)

		const hit = (name: string) => DISCARDED_IDENTIFIER.test(name)
		const found = [
			...relations.filter((r) => hit(r.name)).map((r) => `relation:${r.schema}.${r.name}`),
			...columns.filter((c) => !allowedRelation(c.schema, c.relation) && hit(c.name)).map((c) => `column:${c.schema}.${c.relation}.${c.name}`),
			...constraints.filter((c) => hit(c.name)).map((c) => `constraint:${c.schema}.${c.name}`),
			...functions.filter((f) => hit(f.name)).map((f) => `function:${f.schema}.${f.name}`),
		]
		expect(offending(found), "nome descartado pelo glossário no banco: veja `EXPAND_ALLOWLIST` e o spec `ubiquitous-language`").toEqual([])
	})

	test("nenhum corpo de função, view ou comentário cita nome descartado", async () => {
		const bodies = await sql<{ key: string }[]>`
			select 'function:' || n.nspname || '.' || p.proname as key
			from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			where n.nspname = any(${SCHEMAS})
				and (coalesce(p.prosrc, '') ~ ${DISCARDED_TEXT} or coalesce(pg_get_function_sqlbody(p.oid), '') ~ ${DISCARDED_TEXT})`
		const views = await sql<{ schema: string; name: string }[]>`
			select schemaname as schema, viewname as name from pg_views
			where schemaname = any(${SCHEMAS}) and definition ~ ${DISCARDED_TEXT}`
		const comments = await sql<{ key: string }[]>`
			select 'comment:' || n.nspname || '.' || c.relname || coalesce('.' || a.attname, '') as key
			from pg_description d
			join pg_class c on c.oid = d.objoid and d.classoid = 'pg_class'::regclass
			join pg_namespace n on n.oid = c.relnamespace
			left join pg_attribute a on a.attrelid = c.oid and a.attnum = d.objsubid and d.objsubid > 0
			where n.nspname = any(${SCHEMAS}) and d.description ~ ${DISCARDED_TEXT}`

		const found = [
			...bodies.map((b) => b.key),
			...views.filter((v) => !allowedRelation(v.schema, v.name)).map((v) => `view:${v.schema}.${v.name}`),
			...comments.map((c) => c.key),
		]
		expect(offending(found), "texto do banco cita nome descartado pelo glossário").toEqual([])
	})

	test("crédito recebido e crédito disponível voltam a ter o default 0 das colunas que substituíram", async () => {
		const columns = await sql<{ name: string; nullable: string; default: string | null }[]>`
			select column_name as name, is_nullable as nullable, column_default as default
			from information_schema.columns
			where table_schema = 'finance' and table_name = 'budget_credit' and column_name in ('received_credit', 'available_credit_siafi')
			order by 1`
		expect(columns).toEqual([
			{ name: "available_credit_siafi", nullable: "NO", default: "0" },
			{ name: "received_credit", nullable: "NO", default: "0" },
		])
	})

	test("o status do anexo só aceita o vocabulário do glossário", async () => {
		const [check] = await sql<{ def: string }[]>`
			select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'quantity_estimate_status_check'`
		expect(check?.def).toBeDefined()
		const values = [...(check?.def ?? "").matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]).sort()
		expect(values).toEqual(["archived", "completed", "draft"])
	})
})
