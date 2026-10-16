import { describe, expect, test } from "bun:test"
import { collectStorageKeys, type PackageManifest, type SourceTree } from "./cookie-inventory-scan.ts"

/**
 * A atribuição de chave de package a app, contra uma árvore montada à mão: a árvore real
 * só exercita as formas de import que o repo usa hoje, e o guard precisa continuar certo
 * quando alguém escrever a forma seguinte.
 */

const KIT: PackageManifest = { name: "@iefa/kit", dir: "packages/kit", exports: { ".": "./src/index.ts", "./react": "./src/react.ts" } }

const PACKAGE_FILES: Array<[string, string]> = [
	[
		"packages/kit/src/limiter.ts",
		[
			'const STORAGE_KEY = "kit_limit"',
			"function load() {",
			"\treturn sessionStorage.getItem(STORAGE_KEY)",
			"}",
			"export type LimitState = { n: number }",
			"export function remaining(): number {",
			"\treturn Number(load())",
			"}",
			"export function unrelated(): number {",
			"\treturn 1",
			"}",
		].join("\n"),
	],
	["packages/kit/src/redirect.ts", "export function safeRedirect(to: string) {\n\treturn to\n}"],
	["packages/kit/src/index.ts", 'export { type LimitState, remaining, unrelated } from "./limiter.ts"\nexport { safeRedirect } from "./redirect.ts"'],
	[
		"packages/kit/src/react.ts",
		'import { remaining } from "./limiter.ts"\nexport function useLimiter() {\n\treturn remaining()\n}\nexport function useOther() {\n\treturn 0\n}',
	],
]

function writersOf(appFiles: Array<[string, string]>): string[] {
	const tree: SourceTree = new Map([...PACKAGE_FILES, ...appFiles])
	return [...(collectStorageKeys(tree, [KIT]).get("kit_limit") ?? [])].filter((file) => file.startsWith("apps/")).sort()
}

describe("chave de package atribuída ao app que a usa", () => {
	test("hook do subpath que chega à chave atribui o app", () => {
		expect(writersOf([["apps/a/src/Login.tsx", 'import { useLimiter } from "@iefa/kit/react"']])).toEqual(["apps/a/src/Login.tsx"])
	})

	test("export reexportado no entry principal também atribui, inclusive com alias", () => {
		expect(writersOf([["apps/a/src/x.ts", 'import { remaining as left } from "@iefa/kit"']])).toEqual(["apps/a/src/x.ts"])
	})

	test("outro export do mesmo entry não atribui", () => {
		// É o caso real: todo app importa `safeRedirect` do auth-kit, e só quem tem tela
		// de login usa o limitador.
		expect(
			writersOf([
				["apps/a/src/route.tsx", 'import { safeRedirect } from "@iefa/kit"'],
				["apps/b/src/other.tsx", 'import { useOther } from "@iefa/kit/react"'],
				["apps/c/src/u.ts", 'import { unrelated } from "@iefa/kit"'],
			])
		).toEqual([])
	})

	test("import só de tipo não atribui", () => {
		expect(
			writersOf([
				["apps/a/src/t.ts", 'import type { LimitState } from "@iefa/kit"'],
				["apps/b/src/t.ts", 'import { type LimitState, safeRedirect } from "@iefa/kit"'],
				["apps/c/src/t.ts", 'import type { remaining } from "@iefa/kit"'],
			])
		).toEqual([])
	})

	test("import de namespace e import dinâmico atribuem", () => {
		expect(
			writersOf([
				["apps/a/src/ns.ts", 'import * as kit from "@iefa/kit/react"'],
				["apps/b/src/lazy.ts", 'const mod = await import("@iefa/kit")'],
			])
		).toEqual(["apps/a/src/ns.ts", "apps/b/src/lazy.ts"])
	})

	test("arquivo de teste do app não atribui", () => {
		expect(writersOf([["apps/a/src/Login.test.tsx", 'import { useLimiter } from "@iefa/kit/react"']])).toEqual([])
	})
})

/** Varre uma árvore de package montada para o caso (substitui o `PACKAGE_FILES`). */
function writersWith(packageFiles: Array<[string, string]>, appFiles: Array<[string, string]>, key = "kit_limit"): string[] {
	const tree: SourceTree = new Map([...packageFiles, ...appFiles])
	return [...(collectStorageKeys(tree, [KIT]).get(key) ?? [])].filter((file) => file.startsWith("apps/")).sort()
}

const LIMITER = PACKAGE_FILES[0] as [string, string]

describe("formas de export e import no package", () => {
	test("export * from reexporta só o que chega à chave", () => {
		const files: Array<[string, string]> = [LIMITER, ["packages/kit/src/index.ts", 'export * from "./limiter.ts"']]
		expect(
			writersWith(files, [
				["apps/a/src/x.ts", 'import { remaining } from "@iefa/kit"'],
				["apps/b/src/y.ts", 'import { unrelated } from "@iefa/kit"'],
			])
		).toEqual(["apps/a/src/x.ts"])
	})

	test("export * as ns from atribui quem importa o namespace", () => {
		const files: Array<[string, string]> = [LIMITER, ["packages/kit/src/index.ts", 'export * as limiter from "./limiter.ts"\nexport const OTHER = 1']]
		expect(
			writersWith(files, [
				["apps/a/src/x.ts", 'import { limiter } from "@iefa/kit"'],
				["apps/b/src/y.ts", 'import { OTHER } from "@iefa/kit"'],
			])
		).toEqual(["apps/a/src/x.ts"])
	})

	test("export { a as b } from atribui pelo nome novo, não pelo antigo", () => {
		const files: Array<[string, string]> = [LIMITER, ["packages/kit/src/index.ts", 'export { remaining as left, unrelated } from "./limiter.ts"']]
		expect(
			writersWith(files, [
				["apps/a/src/x.ts", 'import { left } from "@iefa/kit"'],
				["apps/b/src/y.ts", 'import { remaining } from "@iefa/kit"'],
				["apps/c/src/z.ts", 'import { unrelated } from "@iefa/kit"'],
			])
		).toEqual(["apps/a/src/x.ts"])
	})

	test("export type { } from não propaga", () => {
		const files: Array<[string, string]> = [LIMITER, ["packages/kit/src/index.ts", 'export type { remaining } from "./limiter.ts"']]
		expect(writersWith(files, [["apps/a/src/x.ts", 'import { remaining } from "@iefa/kit"']])).toEqual([])
	})

	test("export { x } local, com e sem alias", () => {
		const files: Array<[string, string]> = [
			[
				"packages/kit/src/index.ts",
				[
					'const STORAGE_KEY = "kit_limit"',
					"function load() {",
					"\treturn localStorage.getItem(STORAGE_KEY)",
					"}",
					"function other() {",
					"\treturn 1",
					"}",
					"export { load, other }",
					"export { load as read }",
					"export type { load as LoadType }",
				].join("\n"),
			],
		]
		expect(
			writersWith(files, [
				["apps/a/src/x.ts", 'import { load } from "@iefa/kit"'],
				["apps/b/src/y.ts", 'import { read } from "@iefa/kit"'],
				["apps/c/src/z.ts", 'import { other } from "@iefa/kit"'],
				["apps/d/src/w.ts", 'import { LoadType } from "@iefa/kit"'],
			])
		).toEqual(["apps/a/src/x.ts", "apps/b/src/y.ts"])
	})

	test("a lista `export { … }` não entra no trecho da declaração anterior", () => {
		// A última declaração do módulo ia até o fim do arquivo e "citava" `load` na lista de
		// exports; com uma declaração depois da lista, a lista ficava no trecho de `other`.
		const files: Array<[string, string]> = [
			[
				"packages/kit/src/index.ts",
				[
					'const STORAGE_KEY = "kit_limit"',
					"function load() {",
					"\treturn localStorage.getItem(STORAGE_KEY)",
					"}",
					"export function other() {",
					"\treturn 1",
					"}",
					"export { load }",
					"export function last() {",
					"\treturn 2",
					"}",
					'export * from "./redirect.ts"',
				].join("\n"),
			],
			["packages/kit/src/redirect.ts", "export function safeRedirect(to: string) {\n\treturn to\n}"],
		]
		expect(
			writersWith(files, [
				["apps/a/src/x.ts", 'import { load } from "@iefa/kit"'],
				["apps/b/src/y.ts", 'import { other } from "@iefa/kit"'],
				["apps/c/src/z.ts", 'import { last } from "@iefa/kit"'],
				["apps/d/src/w.ts", 'import { safeRedirect } from "@iefa/kit"'],
			])
		).toEqual(["apps/a/src/x.ts"])
	})

	test("import default de módulo do package propaga quando `default` chega à chave", () => {
		const files: Array<[string, string]> = [
			LIMITER,
			["packages/kit/src/def.ts", 'import { remaining } from "./limiter.ts"\nfunction run() {\n\treturn remaining()\n}\nexport { run as default }'],
			["packages/kit/src/index.ts", 'import run from "./def.ts"\nexport function useRun() {\n\treturn run()\n}\nexport { default } from "./def.ts"'],
		]
		expect(
			writersWith(files, [
				["apps/a/src/x.ts", 'import { useRun } from "@iefa/kit"'],
				["apps/b/src/y.ts", 'import kit from "@iefa/kit"'],
				["apps/c/src/z.ts", 'import kit, { remaining } from "@iefa/kit"'],
			])
		).toEqual(["apps/a/src/x.ts", "apps/b/src/y.ts", "apps/c/src/z.ts"])
	})

	test("export default function entra como `default`, não com o nome da função", () => {
		// O nome da função é só local: `import { useRun }` não existe nesse módulo.
		const files: Array<[string, string]> = [
			LIMITER,
			["packages/kit/src/index.ts", 'import { remaining } from "./limiter.ts"\nexport default function useRun() {\n\treturn remaining()\n}'],
		]
		expect(
			writersWith(files, [
				["apps/a/src/x.ts", 'import kit from "@iefa/kit"'],
				["apps/b/src/y.ts", 'import { useRun } from "@iefa/kit"'],
			])
		).toEqual(["apps/a/src/x.ts"])
	})

	test("export default de um local já declarado entra como `default`", () => {
		const files: Array<[string, string]> = [
			LIMITER,
			["packages/kit/src/index.ts", 'import { remaining } from "./limiter.ts"\nfunction useRun() {\n\treturn remaining()\n}\nexport default useRun'],
		]
		expect(
			writersWith(files, [
				["apps/a/src/x.ts", 'import kit from "@iefa/kit"'],
				["apps/b/src/y.ts", 'import { useRun } from "@iefa/kit"'],
			])
		).toEqual(["apps/a/src/x.ts"])
	})

	test("import default de módulo sem `default` contaminado não propaga", () => {
		const files: Array<[string, string]> = [
			LIMITER,
			["packages/kit/src/index.ts", 'import limiter from "./limiter.ts"\nexport function useRun() {\n\treturn limiter()\n}'],
		]
		expect(writersWith(files, [["apps/a/src/x.ts", 'import { useRun } from "@iefa/kit"']])).toEqual([])
	})

	test("namespace dentro do package propaga para quem o usa", () => {
		const files: Array<[string, string]> = [
			LIMITER,
			[
				"packages/kit/src/index.ts",
				'import * as lim from "./limiter.ts"\nexport function useRun() {\n\treturn lim.remaining()\n}\nexport function idle() {\n\treturn 0\n}',
			],
		]
		expect(
			writersWith(files, [
				["apps/a/src/x.ts", 'import { useRun } from "@iefa/kit"'],
				["apps/b/src/y.ts", 'import { idle } from "@iefa/kit"'],
			])
		).toEqual(["apps/a/src/x.ts"])
	})

	test("import type dentro do package não propaga", () => {
		const files: Array<[string, string]> = [
			LIMITER,
			["packages/kit/src/index.ts", 'import type { remaining } from "./limiter.ts"\nexport function useRun() {\n\treturn remaining\n}'],
		]
		expect(writersWith(files, [["apps/a/src/x.ts", 'import { useRun } from "@iefa/kit"']])).toEqual([])
	})

	test("resolve diretório com index e extensão .tsx", () => {
		const files: Array<[string, string]> = [
			["packages/kit/src/lim/index.tsx", LIMITER[1]],
			["packages/kit/src/index.ts", 'export { remaining } from "./lim"'],
		]
		expect(writersWith(files, [["apps/a/src/x.ts", 'import { remaining } from "@iefa/kit"']])).toEqual(["apps/a/src/x.ts"])
	})

	test("import dinâmico de entry sem nada contaminado não atribui", () => {
		expect(
			writersWith(PACKAGE_FILES, [
				["apps/a/src/x.ts", 'const m = await import("@iefa/kit/react")'],
				["apps/b/src/y.ts", 'const m = await import("@iefa/nada")'],
			])
		).toEqual(["apps/a/src/x.ts"])
	})
})

describe("propagação dentro do módulo", () => {
	test("chave solta depois de `export { … }` contamina também os exports da lista", () => {
		// O fallback "sem unidade → todos os exports" só olhava `export function/const`: `load`,
		// exportado por lista, ficava de fora.
		const files: Array<[string, string]> = [
			[
				"packages/kit/src/index.ts",
				["function load() {", "\treturn 1", "}", "function hidden() {", "\treturn 2", "}", "export { load }", 'localStorage.setItem("kit_loose", "1")'].join(
					"\n"
				),
			],
		]
		expect(
			writersWith(
				files,
				[
					["apps/a/src/x.ts", 'import { load } from "@iefa/kit"'],
					["apps/b/src/y.ts", 'import { hidden } from "@iefa/kit"'],
				],
				"kit_loose"
			)
		).toEqual(["apps/a/src/x.ts"])
	})

	test("chave solta contamina o default, seja ele declaração ou expressão", () => {
		for (const exportDefault of ["export default function () {\n\treturn 1\n}", "export default memo(View)", "const view = 1\nexport default view"]) {
			const files: Array<[string, string]> = [["packages/kit/src/index.ts", `${exportDefault}\nsessionStorage.removeItem("kit_loose")`]]
			expect(writersWith(files, [["apps/a/src/x.ts", 'import kit from "@iefa/kit"']], "kit_loose")).toEqual(["apps/a/src/x.ts"])
		}
	})

	test("export default de expressão marca `default` quando a chave está nele ou o alcança", () => {
		const defaults = [
			"export default memo(load)",
			"export default () => load()",
			"export default function () {\n\treturn load()\n}",
			"export default load satisfies () => string | null",
			"export default load // comentário",
		]
		for (const exportDefault of defaults) {
			const files: Array<[string, string]> = [
				[
					"packages/kit/src/index.ts",
					['const STORAGE_KEY = "kit_limit"', "function load() {", "\treturn localStorage.getItem(STORAGE_KEY)", "}", exportDefault].join("\n"),
				],
			]
			expect(writersWith(files, [["apps/a/src/x.ts", 'import kit from "@iefa/kit"']])).toEqual(["apps/a/src/x.ts"])
		}
		const inline: Array<[string, string]> = [["packages/kit/src/index.ts", 'export default () => localStorage.getItem("kit_inline_default")']]
		expect(writersWith(inline, [["apps/a/src/x.ts", 'import kit from "@iefa/kit"']], "kit_inline_default")).toEqual(["apps/a/src/x.ts"])
	})

	test("interface, type, enum, classe abstrata e chamada solta fecham o trecho da unidade anterior", () => {
		const files: Array<[string, string]> = [
			[
				"packages/kit/src/index.ts",
				[
					'const STORAGE_KEY = "kit_limit"',
					"function load() {",
					"\treturn localStorage.getItem(STORAGE_KEY)",
					"}",
					"export function a() {",
					"\treturn 1",
					"}",
					"interface Uses {",
					"\tf: typeof load",
					"}",
					"export function b() {",
					"\treturn 2",
					"}",
					"type AlsoUses = ReturnType<typeof load>",
					"export function c() {",
					"\treturn 3",
					"}",
					"register(load)",
					"export enum Mode {",
					"\tA = 1,",
					"}",
					"export abstract class Store {",
					"\tread() {",
					"\t\treturn load()",
					"\t}",
					"}",
				].join("\n"),
			],
		]
		expect(
			writersWith(files, [
				["apps/a/src/x.ts", 'import { a } from "@iefa/kit"'],
				["apps/b/src/y.ts", 'import { b } from "@iefa/kit"'],
				["apps/c/src/z.ts", 'import { c } from "@iefa/kit"'],
				["apps/d/src/w.ts", 'import { Mode } from "@iefa/kit"'],
				["apps/e/src/v.ts", 'import { Store } from "@iefa/kit"'],
			])
		).toEqual(["apps/e/src/v.ts"])
	})

	test("chave em código solto no topo do módulo contamina todos os exports", () => {
		const files: Array<[string, string]> = [
			[
				"packages/kit/src/index.ts",
				['sessionStorage.removeItem("kit_loose")', "export function a() {\n\treturn 1\n}", "function hidden() {\n\treturn 2\n}", "export const b = 3"].join(
					"\n"
				),
			],
		]
		expect(
			writersWith(
				files,
				[
					["apps/a/src/x.ts", 'import { a } from "@iefa/kit"'],
					["apps/b/src/y.ts", 'import { b } from "@iefa/kit"'],
					["apps/c/src/z.ts", 'import { hidden } from "@iefa/kit"'],
				],
				"kit_loose"
			)
		).toEqual(["apps/a/src/x.ts", "apps/b/src/y.ts"])
	})

	test("cadeia de dois níveis: export → meio → função que usa a chave", () => {
		const files: Array<[string, string]> = [
			[
				"packages/kit/src/index.ts",
				[
					"export function top() {\n\treturn middle()\n}",
					"function middle() {\n\treturn load()\n}",
					'const STORAGE_KEY = "kit_limit"',
					"function load() {\n\treturn sessionStorage.getItem(STORAGE_KEY)\n}",
					"export function viaProperty() {\n\treturn obj.load()\n}",
				].join("\n"),
			],
		]
		expect(
			writersWith(files, [
				["apps/a/src/x.ts", 'import { top } from "@iefa/kit"'],
				["apps/b/src/y.ts", 'import { viaProperty } from "@iefa/kit"'],
			])
		).toEqual(["apps/a/src/x.ts"])
	})

	test("cadeia que atravessa dois arquivos do package antes do entry", () => {
		const files: Array<[string, string]> = [
			LIMITER,
			["packages/kit/src/mid.ts", 'import { remaining } from "./limiter.ts"\nexport function mid() {\n\treturn remaining()\n}'],
			["packages/kit/src/index.ts", 'import { mid as m } from "./mid.ts"\nexport function top() {\n\treturn m()\n}\nexport function idle() {\n\treturn 0\n}'],
		]
		expect(
			writersWith(files, [
				["apps/a/src/x.ts", 'import { top } from "@iefa/kit"'],
				["apps/b/src/y.ts", 'import { idle } from "@iefa/kit"'],
			])
		).toEqual(["apps/a/src/x.ts"])
	})
})

describe("chave declarada no próprio app", () => {
	const keysOf = (source: string) => [...collectStorageKeys(new Map([["apps/a/src/AuthScreen.tsx", source]]), []).keys()]

	test("propriedade de configuração com nome de chave conta, mesmo sem API de armazenamento no arquivo", () => {
		// A tela entrega a chave ao hook do auth-kit, que a grava por variável: sem esta forma,
		// renomear a constante tirava a chave do inventário sem erro nenhum.
		expect(keysOf('const CONFIG = {\n\trememberEmailKey: "app_remember_email",\n}')).toEqual(["app_remember_email"])
	})

	test("propriedade comum terminada em key não conta", () => {
		expect(keysOf('const CONFIG = { queryKey: "lista", sortKey: "nome" }')).toEqual([])
	})
})
