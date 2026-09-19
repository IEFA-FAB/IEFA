import { describe, expect, test } from "bun:test"
import { Glob } from "bun"
import { LEGAL_MIGRATIONS_ROOT, readCurrentLegalSeedText } from "./seed-fixture.ts"
import type { LegalLocale } from "./types.ts"

/**
 * Guard do inventário da Política de Cookies.
 *
 * A regra que este PR escreveu no CLAUDE.md — "cookie novo ou destinatário novo de
 * dado entra no inventário ANTES de entrar em uso" — não se aplica sozinha. Foi
 * exatamente por não existir esse guard que o `fab_remember_email`, que guarda o
 * e-mail institucional do usuário no navegador de cinco apps, ficou fora de um
 * documento que afirmava listar tudo.
 *
 * O teste varre as chaves de armazenamento declaradas nos apps e nos packages e exige
 * que cada uma esteja no texto publicado ou em `EXEMPT`, com motivo. Chave nova sem
 * classificação quebra o build — que é o único momento em que alguém ainda lembra o que
 * ela guarda.
 *
 * Exigir só que a chave APAREÇA no texto não bastou: o Contrate foi ao ar gravando
 * `theme` e `fab_remember_email`, chaves que já constavam do inventário, e o guard
 * ficou verde com um sistema inteiro fora do documento. Por isso a chave gravada por um
 * app precisa estar numa linha que NOMEIA esse app.
 */

const ROOT = LEGAL_MIGRATIONS_ROOT
const SEED = await readCurrentLegalSeedText()

/** `const NOME_KEY = "literal"` — a forma como a maioria das chaves do repo é escrita. */
const DECLARATION = /\b(?:const|let)\s+([A-Za-z_][A-Za-z0-9_]*(?:STORAGE_KEY|LS_KEY|COOKIE_NAME|REMEMBER_KEY|_KEY|PERSIST_KEY)[A-Za-z0-9_]*)\s*=\s*"([^"]+)"/g
/** Nomes de constante que não servem a outra coisa senão chave de armazenamento. */
const STORAGE_ONLY_NAME = /^(?:LS_[A-Z0-9_]*|[A-Z0-9_]*(?:STORAGE_KEY|COOKIE_NAME|PERSIST_KEY|REMEMBER_KEY|REMEMBER_EMAIL))$/
/** Literal usado direto numa chamada de armazenamento, sem passar por constante. */
const INLINE = /(?:localStorage|sessionStorage)\.(?:get|set|remove)Item\(\s*"([^"]+)"/g
/** Literal passado ao wrapper de persistência do sisub: `usePersistentState("sisub:…", …)`. */
const PERSISTENT_STATE = /usePersistentState(?:<[^(]*?>)?\(\s*"([^"]+)"/g
/**
 * Chave montada em template, com prefixo fixo — `sisub:recipes:${cozinha}`,
 * `rada_session_id:${conta}`. Foram essas que escaparam da primeira versão do guard: a
 * parte variável impede comparar a chave inteira, mas o prefixo é o que o inventário
 * declara (`sisub:recipes:*`, `rada_session_id:<conta>`). Três formas: constante ou
 * função-flecha com nome de chave, função `…Key()` que devolve o template, e o template
 * direto na chamada de armazenamento ou do wrapper.
 */
const TEMPLATE_DECLARATION = /\b(?:const|let)\s+((?=[A-Za-z0-9_]*(?:KEY|[Kk]ey|LS_))[A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:\([^)]*\)\s*=>\s*)?`([^`$]*)\$\{/g
const TEMPLATE_FUNCTION = /\bfunction\s+[A-Za-z0-9_]*[Kk]ey[A-Za-z0-9_]*\s*\([^)]*\)[^{]*\{\s*return\s*`([^`$]*)\$\{/g
const TEMPLATE_INLINE = /(?:usePersistentState(?:<[^(]*?>)?|(?:localStorage|sessionStorage)\.(?:get|set|remove)Item)\(\s*`([^`$]*)\$\{/g

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

/** Nome com que cada app aparece na coluna "Sistemas" do inventário, por locale. */
const APP_NAMES: Record<string, Record<LegalLocale, string>> = {
	sisub: { "pt-BR": "SISUB", "en-US": "SISUB" },
	portal: { "pt-BR": "Portal", "en-US": "Portal" },
	rumaer: { "pt-BR": "RUMAER", "en-US": "RUMAER" },
	forms: { "pt-BR": "Formulários", "en-US": "Forms" },
	sucont: { "pt-BR": "SUCONT-4", "en-US": "SUCONT-4" },
	contrate: { "pt-BR": "Contrate", "en-US": "Contrate" },
	"assignment-selection": { "pt-BR": "Escolha de Vagas", "en-US": "Assignment Selection" },
	docs: { "pt-BR": "Documentação", "en-US": "Documentation" },
}

/** chave (ou prefixo fixo de chave em template) → arquivos relativos que a declaram. */
async function collectStorageKeys(): Promise<Map<string, Set<string>>> {
	const found = new Map<string, Set<string>>()
	const add = (key: string | undefined, file: string) => {
		// Template que começa pela parte variável (`${persistKey}:scroll`) não tem prefixo
		// a conferir; a raiz dele é outra constante, que a varredura pega por conta própria.
		if (!key) return
		const files = found.get(key) ?? new Set<string>()
		files.add(file)
		found.set(key, files)
	}

	for (const pattern of ["apps/*/src/**/*.ts", "apps/*/src/**/*.tsx", "packages/*/src/**/*.ts", "packages/*/src/**/*.tsx"]) {
		for await (const file of new Glob(pattern).scan({ cwd: ROOT, absolute: true })) {
			if (file.includes("routeTree.gen.ts")) continue
			// Teste não grava nada no navegador de ninguém — e este arquivo, que cita as
			// formas de chave nos próprios comentários, se acusaria.
			if (/\.test\.tsx?$/.test(file)) continue
			const source = await Bun.file(file).text()
			const relative = file.slice(ROOT.length)

			for (const match of source.matchAll(INLINE)) add(match[1], relative)
			// Nome que só existe para chave de armazenamento vale em qualquer arquivo: o
			// `LS_TABLE_SETTINGS_KEY` do pregoeiro mora num arquivo de tipos, longe da chamada.
			for (const match of source.matchAll(DECLARATION)) if (STORAGE_ONLY_NAME.test(match[1] as string)) add(match[2], relative)

			// Só declarações em arquivo que de fato fala com o navegador: sem esse filtro,
			// toda constante terminada em `_KEY` (chave de query, id de coluna) entraria.
			if (!STORAGE_API.test(source)) continue
			for (const match of source.matchAll(DECLARATION)) add(match[2], relative)
			for (const match of source.matchAll(PERSISTENT_STATE)) add(match[1], relative)
			for (const match of source.matchAll(TEMPLATE_DECLARATION)) add(match[2], relative)
			for (const match of source.matchAll(TEMPLATE_FUNCTION)) add(match[1], relative)
			for (const match of source.matchAll(TEMPLATE_INLINE)) add(match[1], relative)
		}
	}

	return found
}

/** Conteúdo publicado da Política de Cookies em cada locale, lido da migration vigente. */
function cookiePolicyText(locale: LegalLocale): string {
	const block = new RegExp(`'cookie_policy',\\s*'[^']+',\\s*'${locale}',\\s*\\$doc\\$([\\s\\S]*?)\\$doc\\$`).exec(SEED)
	if (!block?.[1]) throw new Error(`Política de Cookies ${locale} não encontrada na migration vigente`)
	return block[1]
}

const POLICY: Record<LegalLocale, string> = { "pt-BR": cookiePolicyText("pt-BR"), "en-US": cookiePolicyText("en-US") }
const INVENTORY_ROWS: Record<LegalLocale, string[]> = {
	"pt-BR": POLICY["pt-BR"].split("\n").filter((line) => line.startsWith("| `")),
	"en-US": POLICY["en-US"].split("\n").filter((line) => line.startsWith("| `")),
}

/** Famílias declaradas com curinga no inventário: "`sisub:recipes:*`" → "sisub:recipes:". */
const FAMILIES = [...SEED.matchAll(/`([^`*\s]+)\*`/g)].map((match) => match[1] as string)

/** A linha declara a chave pelo nome exato, pelo prefixo do template ou por uma família com curinga. */
function rowCovers(row: string, key: string): boolean {
	if (row.includes(key)) return true
	return [...row.matchAll(/`([^`*\s]+)\*`/g)].some((match) => key.startsWith(match[1] as string))
}

function isDeclared(key: string): boolean {
	return SEED.includes(key) || FAMILIES.some((family) => key.startsWith(family))
}

/** App dono do arquivo; `undefined` para package, que é consumido por vários apps. */
function appOf(file: string): string | undefined {
	return /^apps\/([^/]+)\//.exec(file)?.[1]
}

const storageKeys = await collectStorageKeys()

describe("inventário da Política de Cookies", () => {
	test("a varredura encontra chaves (proteção contra um teste que passa vazio)", () => {
		expect(storageKeys.size).toBeGreaterThan(5)
		// As três formas que a primeira versão do guard não enxergava: chave de package,
		// chave em template e chave passada ao wrapper do sisub. Se uma regex quebrar em
		// silêncio, a chave correspondente some daqui antes de sumir do inventário.
		expect(storageKeys.has("auth_rate_limit"), "a varredura parou de ler packages/").toBe(true)
		expect(storageKeys.has("rada_session_id:"), "a varredura parou de ler chave em template").toBe(true)
		expect(storageKeys.has("sisub:cardapio-print-header:"), "a varredura parou de ler função …Key() com template").toBe(true)
		expect(storageKeys.has("sisub:menu:demand-type"), "a varredura parou de ler usePersistentState").toBe(true)
	})

	test("toda chave de armazenamento está no inventário publicado ou isenta com motivo", () => {
		const undeclared = [...storageKeys.entries()]
			.filter(([key]) => !(key in EXEMPT))
			.filter(([key]) => !isDeclared(key))
			.map(([key, files]) => `${key} (${[...files].join(", ")})`)
			.sort()

		expect(
			undeclared,
			"chave de armazenamento fora da Política de Cookies. Acrescente a linha ao inventário (seções 3 do pt-BR e do en-US) ou, se não for armazenamento, registre em EXEMPT com o motivo."
		).toEqual([])
	})

	test("a linha de cada chave nomeia todo app que a grava, nos dois idiomas", () => {
		const missing: string[] = []
		for (const [key, files] of storageKeys) {
			if (key in EXEMPT) continue
			for (const app of new Set([...files].map(appOf))) {
				if (!app) continue
				const names = APP_NAMES[app]
				if (!names) {
					missing.push(`${key}: app "${app}" sem nome em APP_NAMES`)
					continue
				}
				for (const locale of ["pt-BR", "en-US"] as const) {
					const rows = INVENTORY_ROWS[locale].filter((row) => rowCovers(row, key))
					if (!rows.some((row) => row.includes(names[locale]))) missing.push(`${key} → ${names[locale]} (${locale})`)
				}
			}
		}
		expect(missing.sort(), "a chave está no inventário, mas a linha não cita o sistema que a grava — acrescente-o na coluna Sistemas").toEqual([])
	})

	test("as chaves que guardam e-mail estão declaradas como dado pessoal", () => {
		// São as do inventário que guardam o e-mail no dispositivo. Se a marcação sumir, o
		// documento volta a listar a chave sem dizer o que ela é.
		for (const key of ["fab_remember_email", "sucont_remember_email"]) {
			expect(storageKeys.has(key), `${key} sumiu do código — remova-a do inventário`).toBe(true)
			expect(SEED).toContain(`\`${key}\` | armazenamento local`)
			expect(SEED).toContain(`\`${key}\` | local storage`)
		}
		expect(SEED).toContain("guarda o seu e-mail institucional")
		expect(SEED).toContain("stores your institutional e-mail")
	})

	test("o cabeçalho do cardápio impresso está declarado como dado pessoal", () => {
		// Guarda o nome de quem assina o cardápio — mesma natureza do e-mail de "lembrar".
		expect(SEED).toContain("inclusive o nome de quem assina")
		expect(SEED).toContain("including the names of the signers")
	})

	test("o tema está declarado como cookie, não como armazenamento local", () => {
		// O `theme` virou cookie de verdade quando o servidor passou a renderizar o
		// tema no <html> — vai em toda requisição, com validade de um ano. O guard
		// acima só exige que a chave apareça no texto: sem esta asserção, a política
		// continuaria dizendo "armazenamento local, até ser limpo pelo usuário" com
		// o CI verde, que é exatamente o tipo de mentira que o inventário existe
		// para impedir. (A Documentação é a exceção declarada em linha própria: o
		// Fumadocs grava o tema em `localStorage`, fora do código varrido aqui.)
		expect(SEED).toContain("| `theme` | cookie |")
		expect(SEED).not.toContain("| `theme` | armazenamento local |")
		expect(SEED).not.toContain("| `theme` | local storage |")
	})

	test("o Contrate não aparece na linha da barra lateral enquanto não a persistir", () => {
		// A barra do Contrate foi deliberadamente deixada sem cookie (ver
		// `apps/contrate/src/components/ui/sidebar.tsx`). Se o cookie voltar, o teste de
		// atribuição acima exige o Contrate na linha; este impede o caminho inverso — a
		// política declarar um cookie que o app não grava.
		const contrateWritesSidebar = [...(storageKeys.get("sidebar_state") ?? [])].some((file) => appOf(file) === "contrate")
		for (const locale of ["pt-BR", "en-US"] as const) {
			const row = INVENTORY_ROWS[locale].find((line) => line.startsWith("| `sidebar_state` |"))
			expect(row, `linha de sidebar_state ausente (${locale})`).toBeDefined()
			expect(row?.includes("Contrate")).toBe(contrateWritesSidebar)
		}
	})

	test("EXEMPT não tem entrada obsoleta", () => {
		const stale = Object.keys(EXEMPT).filter((key) => !storageKeys.has(key))
		expect(stale, "entradas de EXEMPT que não correspondem mais a nenhuma constante — remova-as").toEqual([])
	})
})
