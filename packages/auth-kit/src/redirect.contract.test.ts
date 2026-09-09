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

/**
 * O outro lado do mesmo contrato: sanitizar o `?redirect=` não serve para nada se o
 * guard da rota não passar caminho nenhum. Foi o bug do PR #289 — seis `beforeLoad`
 * do portal lançavam `redirect({ to: "/auth" })` sem `search`, então quem clicava numa
 * ferramenta protegida deslogado logava e caía na home, não na ferramenta. Cinco outros
 * apps faziam certo, e nada no CI enxergava a diferença.
 *
 * A varredura é sobre TODO `src` dos apps: o guard vive na rota protegida, fora do
 * diretório de auth. Omitir o caminho de volta é legítimo em dois casos — sessão válida sem
 * concessão (devolver o caminho gera bounce) e guard de segunda linha atrás de um
 * layout que já passou `location.href` —, e nos dois o site declara o motivo com o
 * marcador abaixo. Anotar é ato deliberado que aparece no diff; esquecer, não.
 */
const NO_RETURN_PATH_MARKER = "auth-redirect-without-return-path:"

/** Texto da chamada `redirect(...)` a partir de cada ocorrência, com parênteses balanceados. */
function redirectCalls(source: string): { index: number; call: string }[] {
	const calls: { index: number; call: string }[] = []
	const needle = "redirect("
	for (let start = source.indexOf(needle); start >= 0; start = source.indexOf(needle, start + 1)) {
		// `safeRedirect(`/`unsafeRedirect(` não são a função do router.
		if (/[\w$]/.test(source[start - 1] ?? "")) continue
		let depth = 1
		let end = start + needle.length
		while (end < source.length && depth > 0) {
			const char = source[end]
			if (char === "(" || char === "[" || char === "{") depth++
			else if (char === ")" || char === "]" || char === "}") depth--
			end++
		}
		calls.push({ index: start, call: source.slice(start, end) })
	}
	return calls
}

async function appSources(): Promise<{ path: string; source: string }[]> {
	const glob = new Glob("*/src/**/*.{ts,tsx}")
	const files: { path: string; source: string }[] = []
	for await (const match of glob.scan({ cwd: APPS_DIR })) {
		if (match.includes(".test.")) continue
		const absolute = join(APPS_DIR, match)
		files.push({ path: relative(REPO_ROOT, absolute), source: await Bun.file(absolute).text() })
	}
	return files
}

/** Toda chamada de `redirect()` para `/auth`, com o veredito de caminho de volta. */
async function authBounces(): Promise<{ path: string; line: number; call: string; keepsReturnPath: boolean; optedOut: boolean }[]> {
	const bounces: { path: string; line: number; call: string; keepsReturnPath: boolean; optedOut: boolean }[] = []
	for (const { path, source } of await appSources()) {
		for (const { index, call } of redirectCalls(source)) {
			if (!/to:\s*"\/auth"/.test(call)) continue
			const before = source.slice(0, index)
			bounces.push({
				path,
				line: before.split("\n").length,
				call: call.replace(/\s+/g, " "),
				keepsReturnPath: /\bredirect:/.test(call),
				// O marcador vale para as linhas imediatamente acima da chamada.
				optedOut: before.split("\n").slice(-4).join("\n").includes(NO_RETURN_PATH_MARKER),
			})
		}
	}
	return bounces
}

describe("contrato: guard que manda para /auth não descarta o caminho de volta", () => {
	it("acha os guards de /auth dos apps (a varredura não é vazia)", async () => {
		expect((await authBounces()).length).toBeGreaterThan(10)
	})

	it("todo guard passa `search: { redirect: ... }`, ou declara por que não", async () => {
		const offenders = (await authBounces())
			.filter((bounce) => !bounce.keepsReturnPath && !bounce.optedOut)
			.map(({ path, line, call }) => `${path}:${line} — ${call}`)
		expect(offenders).toEqual([])
	})

	it("o marcador de exceção não é usado onde o caminho de volta já é passado", async () => {
		const redundant = (await authBounces()).filter((bounce) => bounce.keepsReturnPath && bounce.optedOut).map(({ path, line }) => `${path}:${line}`)
		expect(redundant).toEqual([])
	})
})
