/**
 * Contrato da linguagem ubíqua no banco VIVO (change `sisub-ubiquitous-language`, D8).
 *
 * O opengrep (`.opengrep/rules/ubiquitous-language*.yaml`) barra o nome descartado no código e
 * nas migrations novas; este teste barra o que já está no banco: relação, coluna, constraint,
 * índice, função, corpo de função, definição de view e comentário com nome que o glossário
 * descartou. É ele que pega a migration que alguém aplicou à mão, ou o expand que esqueceu um
 * objeto.
 *
 * ## Lote 2: anexo quantitativo (`procurement.quantity_estimate*`)
 *
 * O expand 20260927040000 deixa, de propósito, os nomes antigos que o código da `main` em
 * produção ainda usa: as views `procurement_list*`, as colunas espelhadas e as constraints e os
 * índices delas, e o rótulo textual de `core.v_measure_unit_review`. Eles estão em
 * `EXPAND_ALLOWLIST`, que é DATADA: o contract 20260927050000 derruba tudo e o PR dele esvazia a
 * lista. Entrada nova na lista exige o mesmo: um expand em andamento e o contract que a remove.
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
 */
const DISCARDED_IDENTIFIER =
	/procurement_list|kitchen_ata_draft|(^|_)list_id($|_)|list_kitchen_id|max_margin|margin_justification|(^|_)total_quantity($|_)|(^|_)ata_(id|item_id|draft)($|_)/

/** Nome descartado citado em texto (corpo de função, definição de view, comentário), em regex do Postgres. */
const DISCARDED_TEXT = String.raw`\mprocurement_list\w*|\mkitchen_ata_draft\w*|\mlist_id\M|\mlist_kitchen_id\M|\mmax_margin_percent\M|\mmargin_justification\M`

/**
 * Compatibilidade do expand 20260927040000 (anexo quantitativo), até o contract 20260927050000.
 * Chave: `tipo:schema.objeto[.coluna]`.
 */
const EXPAND_ALLOWLIST = new Set<string>([
	// Views de compatibilidade (e as colunas delas, por alias).
	...[
		"procurement_list",
		"procurement_list_item",
		"procurement_list_kitchen",
		"procurement_list_selection",
		"procurement_list_snapshot_component",
		"procurement_list_snapshot_selection",
	].map((v) => `relation:procurement.${v}`),
	// Colunas espelhadas nas tabelas que ficam com o nome.
	"column:procurement.procurement_arp.procurement_list_id",
	"column:procurement.procurement_arp_item.procurement_list_item_id",
	"column:procurement.procurement_pesquisa_preco.procurement_list_id",
	"column:procurement.procurement_pesquisa_preco_item.procurement_list_item_id",
	"column:procurement.price_research_emission.list_id",
	"column:procurement.kitchen_demand_forecast_import.list_id",
	// FKs, unique e índices das colunas espelhadas (caem com elas).
	"constraint:procurement.procurement_arp_procurement_list_id_fkey",
	"constraint:procurement.procurement_arp_item_procurement_list_item_id_fkey",
	"constraint:procurement.procurement_pesquisa_preco_procurement_list_id_fkey",
	"constraint:procurement.procurement_pesquisa_preco_item_procurement_list_item_id_fkey",
	"constraint:procurement.price_research_emission_list_id_fkey",
	"constraint:procurement.price_research_emission_list_id_sequence_key",
	"constraint:procurement.kitchen_demand_forecast_import_list_id_fkey",
	"relation:procurement.idx_procurement_arp_procurement_list",
	"relation:procurement.idx_arp_item_procurement_list_item",
	"relation:procurement.idx_pesquisa_preco_procurement_list",
	"relation:procurement.idx_pesquisa_preco_pending_procurement_list_id",
	"relation:procurement.idx_pesquisa_preco_item_procurement_list_item",
	"relation:procurement.kitchen_demand_forecast_import_list_idx",
	"relation:procurement.price_research_emission_list_id_sequence_key",
	// As funções de espelho citam a coluna antiga no corpo.
	"function:procurement.mirror_quantity_estimate_id",
	"function:procurement.mirror_quantity_estimate_item_id",
	"function:procurement.mirror_quantity_estimate_id_from_list_id",
	// O rótulo `'procurement.procurement_list_item'` da fila de revisão troca no contract, junto com
	// o leitor (`global/review-queues.tsx`).
	"view:core.v_measure_unit_review",
	// Os comentários das colunas espelhadas dizem que elas são obsoletas.
	"comment:procurement.procurement_arp.procurement_list_id",
	"comment:procurement.procurement_arp_item.procurement_list_item_id",
	"comment:procurement.procurement_pesquisa_preco.procurement_list_id",
	"comment:procurement.procurement_pesquisa_preco_item.procurement_list_item_id",
	"comment:procurement.price_research_emission.list_id",
	"comment:procurement.kitchen_demand_forecast_import.list_id",
])

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
			// Comentário da própria view de compatibilidade sai com ela.
			...comments.map((c) => c.key).filter((k) => !/^comment:procurement\.procurement_list[a-z_]*$/.test(k)),
		]
		expect(offending(found), "texto do banco cita nome descartado pelo glossário").toEqual([])
	})

	test("o status do anexo só aceita o vocabulário do glossário (e `published` até o contract)", async () => {
		const [check] = await sql<{ def: string }[]>`
			select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'quantity_estimate_status_check'`
		expect(check?.def).toBeDefined()
		const values = [...(check?.def ?? "").matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]).sort()
		// TODO(contract 20260927050000): sem `published`.
		expect(values).toEqual(["archived", "completed", "draft", "published"])
	})
})
