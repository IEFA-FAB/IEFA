import { describe, expect, it } from "bun:test"
import { dirname, join, relative, resolve } from "node:path"
import { Glob } from "bun"

/**
 * O guard só vale se TODA rota de auth passar por ele. A revisão do PR #268 achou seis
 * cópias locais em cinco apps, cada uma com uma regra própria — e a que estava de fato
 * explorável era justamente a do app esquecido na consolidação (`forms`, o único que
 * alimenta `redirect({ href })`, emitido verbatim no header `Location`).
 *
 * Este contrato varre as rotas de auth de todos os apps e falha em dois padrões:
 * `redirect: z.string()` no `validateSearch` (aceita o valor cru) e função `safeRedirect`
 * local (a cópia que diverge sem ninguém notar). Um app novo entra no escopo sozinho.
 */
const REPO_ROOT = resolve(dirname(Bun.fileURLToPath(import.meta.url)), "../../..")
const APPS_DIR = join(REPO_ROOT, "apps")

async function authRouteSources(): Promise<{ path: string; source: string }[]> {
	const glob = new Glob("*/src/**/auth*/**/*.{ts,tsx}")
	const files: { path: string; source: string }[] = []
	for await (const match of glob.scan({ cwd: APPS_DIR })) {
		const absolute = join(APPS_DIR, match)
		files.push({ path: relative(REPO_ROOT, absolute), source: await Bun.file(absolute).text() })
	}
	return files
}

describe("contrato: nenhum app reimplementa nem escapa do guard de redirect", () => {
	it("acha os arquivos de auth dos apps (a varredura não é vazia)", async () => {
		const files = await authRouteSources()
		expect(files.length).toBeGreaterThan(5)
	})

	it("nenhum validateSearch aceita `redirect` como string crua", async () => {
		const offenders = (await authRouteSources()).filter(({ source }) => /redirect:\s*z\.string\(\)/.test(source)).map(({ path }) => path)
		expect(offenders).toEqual([])
	})

	it("nenhum app declara a própria função safeRedirect", async () => {
		const offenders = (await authRouteSources()).filter(({ source }) => /function\s+safeRedirect\b/.test(source)).map(({ path }) => path)
		expect(offenders).toEqual([])
	})
})
