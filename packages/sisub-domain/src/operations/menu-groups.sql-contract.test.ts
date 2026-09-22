/**
 * Contrato entre o seed dos conjuntos de grupos (migration 20260922150000) e
 * `DEFAULT_MENU_GROUP_SETS` (@iefa/sisub-domain).
 *
 * A constante do domínio não é decoração: é o que a interface usa como último
 * recurso quando a busca no banco não devolve conjunto nenhum, e é por ela que o
 * editor sabe qual é o conjunto padrão. Divergir do seed é silencioso — a tela
 * abre com colunas que não existem no banco, o item vai para uma chave que
 * nenhum conjunto reconhece, e ele reaparece em "Fora do conjunto" sem ninguém
 * ter feito nada errado.
 *
 * O outro lado do contrato é negativo e igualmente importante: o CHECK de
 * `item_group` foi REMOVIDO. Ressuscitá-lo numa migration futura recusaria
 * `salada` no almoço — e o erro chegaria ao usuário como "violates check
 * constraint", sem dizer qual valor caiu.
 */

import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { DEFAULT_MENU_GROUP_SETS } from "../schemas/menu-groups.ts"

const MIGRATIONS = join(import.meta.dir, "..", "..", "..", "database", "supabase", "migrations")
const SEED_FILE = "20260922150000_menu_group_set.sql"

function readMigration(file: string): string {
	return readFileSync(join(MIGRATIONS, file), "utf8")
}

/** Só o SQL executável — comentário explica decisão, e explicar não é declarar. */
function stripSqlComments(sql: string): string {
	return sql.replace(/--[^\n]*/g, "")
}

describe("seed dos conjuntos de grupos", () => {
	const sql = stripSqlComments(readMigration(SEED_FILE))

	test("os conjuntos semeados são os do domínio, com o mesmo nome e descrição", () => {
		const block = sql.slice(sql.indexOf("insert into kitchen.menu_group_set"))
		const rows = [...block.slice(0, block.indexOf(";")).matchAll(/\('([^']*)',\s*'([^']*)',\s*'([^']*)',\s*(\d+)\)/g)]

		expect(rows.map((r) => ({ name: r[1], description: r[2], slug: r[3] }))).toEqual(
			DEFAULT_MENU_GROUP_SETS.map((s) => ({ name: s.name, description: s.description, slug: s.slug }))
		)
	})

	test("cada conjunto tem exatamente os grupos do domínio, na mesma ordem", () => {
		const block = sql.slice(sql.indexOf("insert into kitchen.menu_group ("))
		const rows = [...block.slice(0, block.indexOf(";")).matchAll(/\('([a-z_]+)',\s*'([a-z_]+)',\s*'([^']*)',\s*(\d+)\)/g)].map((m) => ({
			set: m[1],
			key: m[2],
			label: m[3],
			sortOrder: Number(m[4]),
		}))

		// Guarda contra regex que deixa de casar e passa verde com lista vazia.
		expect(rows.length).toBe(DEFAULT_MENU_GROUP_SETS.reduce((n, s) => n + s.groups.length, 0))

		for (const set of DEFAULT_MENU_GROUP_SETS) {
			const seeded = rows.filter((r) => r.set === set.slug).sort((a, b) => a.sortOrder - b.sortOrder)
			expect(
				seeded.map((r) => ({ key: r.key, label: r.label })),
				`grupos do conjunto ${set.slug}`
			).toEqual(set.groups.map((g) => ({ key: g.key, label: g.label })))
		}
	})

	test("o CHECK de item_group cai nas DUAS tabelas de item", () => {
		// menu_items é onde o valor chega ao usuário: derrubar só o do template
		// deixaria o cardápio publicado recusando os grupos novos.
		expect(sql).toContain("alter table kitchen.menu_template_items drop constraint if exists menu_template_items_item_group_check")
		expect(sql).toContain("alter table kitchen.menu_items          drop constraint if exists menu_items_item_group_check")
	})
})

test("nenhuma migration posterior recria um CHECK de item_group", () => {
	const later = readdirSync(MIGRATIONS)
		.filter((f) => f.endsWith(".sql") && f > SEED_FILE)
		.filter((f) => /add\s+constraint[^;]*item_group_check/is.test(stripSqlComments(readMigration(f))))

	expect(later, `o vocabulário de item_group é do conjunto da refeição, não de um CHECK: ${later.join(", ")}`).toEqual([])
})
