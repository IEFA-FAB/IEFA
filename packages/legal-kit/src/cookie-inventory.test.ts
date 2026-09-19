import { describe, expect, test } from "bun:test"
import { collectStorageKeys, loadSourceTree } from "./cookie-inventory-scan.ts"
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
 * O teste varre as chaves de armazenamento declaradas nos apps e nos packages
 * (`cookie-inventory-scan.ts`) e exige que cada uma esteja no texto publicado ou em
 * `EXEMPT`, com motivo. Chave nova sem classificação quebra o build — que é o único
 * momento em que alguém ainda lembra o que ela guarda.
 *
 * Exigir só que a chave APAREÇA no texto não bastou: o Contrate foi ao ar gravando
 * `theme` e `fab_remember_email`, chaves que já constavam do inventário, e o guard
 * ficou verde com um sistema inteiro fora do documento. Por isso a chave gravada por um
 * app precisa estar numa linha que NOMEIA esse app — inclusive quando quem a declara é
 * um package: a varredura atribui a chave a todo app que importa o export que a grava.
 */

const SEED = await readCurrentLegalSeedText()

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

const { tree, packages } = await loadSourceTree(LEGAL_MIGRATIONS_ROOT)
const storageKeys = collectStorageKeys(tree, packages)

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

	test("a chave de package é atribuída aos apps que importam o export que a grava", () => {
		// `auth_rate_limit` mora em `@iefa/auth-kit` e chega aos apps pelo
		// `useLoginRateLimiter`. Se a propagação quebrar, a linha dele deixa de ser
		// cobrada por app e um app novo com tela de login passaria verde.
		const apps = new Set([...(storageKeys.get("auth_rate_limit") ?? [])].map(appOf).filter(Boolean))
		for (const app of ["sisub", "portal", "rumaer", "forms", "sucont", "contrate"]) expect(apps.has(app), `auth_rate_limit não atribuído a ${app}`).toBe(true)
		// O telão só importa `safeRedirect` do mesmo package — não grava a chave.
		expect(apps.has("assignment-selection")).toBe(false)
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
