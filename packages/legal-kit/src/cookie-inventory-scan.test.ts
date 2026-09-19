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
