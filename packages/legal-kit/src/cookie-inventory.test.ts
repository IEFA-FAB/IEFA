import { describe, expect, test } from "bun:test"
import { Glob } from "bun"

/**
 * Guard do inventário da Política de Cookies.
 *
 * A regra que este PR escreveu no CLAUDE.md — "cookie novo ou destinatário novo de
 * dado entra no inventário ANTES de entrar em uso" — não se aplica sozinha. Foi
 * exatamente por não existir esse guard que o `fab_remember_email`, que guarda o
 * e-mail institucional do usuário no navegador de cinco apps, ficou fora de um
 * documento que afirmava listar tudo.
 *
 * O teste varre as chaves de armazenamento declaradas nos apps e exige que cada uma
 * esteja no texto publicado ou em `EXEMPT`, com motivo. Chave nova sem classificação
 * quebra o build — que é o único momento em que alguém ainda lembra o que ela guarda.
 */

const ROOT = new URL("../../../", import.meta.url).pathname
const SEED = await Bun.file(`${ROOT}packages/database/supabase/migrations/20260816120000_legal_documents_v2.sql`).text()

/** `const NOME_KEY = "literal"` — a forma como todas as chaves do repo são escritas. */
const DECLARATION = /\b(?:const|let)\s+([A-Za-z_][A-Za-z0-9_]*(?:STORAGE_KEY|LS_KEY|COOKIE_NAME|REMEMBER_KEY|_KEY|PERSIST_KEY)[A-Za-z0-9_]*)\s*=\s*"([^"]+)"/g
/** Literal usado direto numa chamada de armazenamento, sem passar por constante. */
const INLINE = /(?:localStorage|sessionStorage)\.(?:get|set|remove)Item\(\s*"([^"]+)"/g

// Inclui os wrappers de persistência do sisub: `PreparationsTreeManager` grava em
// sessionStorage via `usePersistentState`, sem citar a API — sem eles a varredura
// perderia exatamente as chaves que passam por abstração.
const STORAGE_API = /localStorage|sessionStorage|document\.cookie|usePersistentState|useScrollRestoration|getStoredScrollOffset/

/**
 * Constantes que casam com o padrão de nome mas NÃO são chave de armazenamento.
 * Cada entrada precisa de motivo — sem isso a isenção vira lixeira e o guard morre.
 */
const EXEMPT: Record<string, string> = {
	b: "SIDEBAR_KEYBOARD_SHORTCUT — atalho de teclado (Ctrl+B), não é chave de armazenamento",
}

async function collectStorageKeys(): Promise<Map<string, string>> {
	const found = new Map<string, string>()

	for (const pattern of ["apps/*/src/**/*.ts", "apps/*/src/**/*.tsx"]) {
		for await (const file of new Glob(pattern).scan({ cwd: ROOT, absolute: true })) {
			if (file.includes("routeTree.gen.ts")) continue
			const source = await Bun.file(file).text()
			const relative = file.slice(ROOT.length)

			for (const match of source.matchAll(INLINE)) found.set(match[1] as string, relative)

			// Só declarações em arquivo que de fato fala com o navegador: sem esse filtro,
			// toda constante terminada em `_KEY` (chave de query, id de coluna) entraria.
			if (!STORAGE_API.test(source)) continue
			for (const match of source.matchAll(DECLARATION)) found.set(match[2] as string, relative)
		}
	}

	return found
}

const storageKeys = await collectStorageKeys()

describe("inventário da Política de Cookies", () => {
	test("a varredura encontra chaves (proteção contra um teste que passa vazio)", () => {
		expect(storageKeys.size).toBeGreaterThan(5)
	})

	test("toda chave de armazenamento está no inventário publicado ou isenta com motivo", () => {
		const undeclared = [...storageKeys.entries()]
			.filter(([key]) => !(key in EXEMPT))
			.filter(([key]) => !SEED.includes(key))
			.map(([key, file]) => `${key} (${file})`)
			.sort()

		expect(
			undeclared,
			"chave de armazenamento fora da Política de Cookies. Acrescente a linha ao inventário (seções 3 do pt-BR e do en-US) ou, se não for armazenamento, registre em EXEMPT com o motivo."
		).toEqual([])
	})

	test("as duas chaves que guardam e-mail estão declaradas como dado pessoal", () => {
		// São as únicas do inventário que guardam dado pessoal no dispositivo. Se a
		// marcação sumir, o documento volta a listar a chave sem dizer o que ela é.
		for (const key of ["fab_remember_email", "sucont_remember_email"]) {
			expect(storageKeys.has(key), `${key} sumiu do código — remova-a do inventário`).toBe(true)
			expect(SEED).toContain(`\`${key}\` | armazenamento local`)
			expect(SEED).toContain(`\`${key}\` | local storage`)
		}
		expect(SEED).toContain("guarda o seu e-mail institucional")
		expect(SEED).toContain("stores your institutional e-mail")
	})

	test("EXEMPT não tem entrada obsoleta", () => {
		const stale = Object.keys(EXEMPT).filter((key) => !storageKeys.has(key))
		expect(stale, "entradas de EXEMPT que não correspondem mais a nenhuma constante — remova-as").toEqual([])
	})
})
