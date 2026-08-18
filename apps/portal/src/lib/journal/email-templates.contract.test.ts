import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Contrato entre o mailer do journal e `journal.email_templates`.
 *
 * Existe porque as duas pontas erravam em silêncio. `sendJournalEmail` busca o template
 * por nome com `maybeSingle()` e retorna `false` quando não acha; `render()` troca
 * `{{chave}}` por string vazia quando a variável não vem. Nenhum dos dois loga nada, e a
 * função nunca lança de propósito — então um nome de template inexistente e uma variável
 * com nome errado produzem exatamente o mesmo sintoma que "não há provider configurado":
 * nada. Foi assim que o convite de revisão saiu sem link e o e-mail de decisão nunca saiu.
 */

const MIGRATION = join(import.meta.dirname, "../../../../../packages/database/supabase/migrations/20241215_create_journal_schema.sql")
const CALLER = join(import.meta.dirname, "../../server/journal-data.fn.ts")
const MAILER = join(import.meta.dirname, "./email.server.ts")

/** Nome do template -> variáveis que o seed declara em `variables`. */
function seededTemplates(): Map<string, Set<string>> {
	const sql = readFileSync(MIGRATION, "utf8")
	// Recorta só o INSERT: `check (role in ('author', ...))` lá em cima casa com o mesmo
	// formato de tupla e engolia o primeiro template semeado.
	const start = sql.indexOf("insert into journal.email_templates")
	expect(start).toBeGreaterThan(-1)
	const end = sql.indexOf(";", sql.lastIndexOf("array[", sql.indexOf("create ", start)))
	const block = sql.slice(start, end > start ? end : undefined)
	const out = new Map<string, Set<string>>()
	// Cada tupla do insert começa com o nome e termina no array de variáveis.
	const tuple = /\(\s*'([a-z_]+)',\s*'[^']*',[\s\S]*?array\[([^\]]*)\]\s*\)/g
	for (const m of block.matchAll(tuple)) {
		const vars = [...m[2].matchAll(/'([a-z_]+)'/g)].map((v) => v[1])
		out.set(m[1], new Set(vars))
	}
	return out
}

describe("contrato dos templates de e-mail do journal", () => {
	const seeded = seededTemplates()

	it("a varredura encontra os templates semeados (proteção contra teste vazio)", () => {
		expect(seeded.size).toBeGreaterThanOrEqual(5)
		expect(seeded.has("review_invitation")).toBe(true)
	})

	it("todo nome do type TemplateName existe como template semeado", () => {
		const union = readFileSync(MAILER, "utf8").match(/export type TemplateName =([^\n]*)/)?.[1] ?? ""
		const names = [...union.matchAll(/"([a-z_]+)"/g)].map((m) => m[1])
		expect(names.length).toBeGreaterThan(0)
		for (const name of names) {
			expect(`${name} semeado? ${seeded.has(name)}`).toBe(`${name} semeado? true`)
		}
	})

	it("toda variável passada num sendJournalEmail é declarada pelo template que ele usa", () => {
		const src = readFileSync(CALLER, "utf8")
		const calls = [...src.matchAll(/sendJournalEmail\(\{[\s\S]*?template:\s*([^\n,]+),[\s\S]*?vars:\s*\{([\s\S]*?)\n\t*\},/g)]
		expect(calls.length).toBeGreaterThan(0)

		for (const [, templateExpr, varsBlock] of calls) {
			// `DECISION_TEMPLATES[data.decision]` cobre as três decisões de uma vez.
			const decisionBlock = src.match(/const DECISION_TEMPLATES = \{([\s\S]*?)\}/)?.[1] ?? ""
			const targets = templateExpr.includes("DECISION_TEMPLATES")
				? [...decisionBlock.matchAll(/:\s*"([a-z_]+)"/g)].map((m) => m[1])
				: [templateExpr.trim().replace(/"/g, "")]

			const passed = [...varsBlock.matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1])
			expect(passed.length).toBeGreaterThan(0)

			for (const target of targets) {
				const declared = seeded.get(target)
				expect(`${target} existe? ${declared !== undefined}`).toBe(`${target} existe? true`)
				// Toda variável que o template declara precisa ser passada — o inverso
				// (passar a mais) é inofensivo: `render` só substitui o que está no corpo.
				for (const need of declared ?? []) {
					expect(`${target} recebe ${need}? ${passed.includes(need)}`).toBe(`${target} recebe ${need}? true`)
				}
			}
		}
	})
})
