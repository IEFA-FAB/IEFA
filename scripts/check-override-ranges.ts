#!/usr/bin/env bun
/**
 * Gate: nenhum `override` da raiz pode CAPAR a faixa que o consumidor declara.
 *
 * `overrides` do bun troca a spec inteira e não avisa. Um `^` numa faixa que o consumidor
 * abre mais que isso prende o pacote na versão velha calado: install verde, typecheck verde
 * (transitiva não tem tipo), e a quebra só aparece em runtime. Foi assim que
 * `@hono/node-server: "^1.19.15"` capou o `^1.19.9 || ^2.0.5` do SDK do MCP e
 * `langsmith: "^0.8.11"` capou o `>=0.5.0 <1.0.0` do `@langchain/core` — caret em 0.x
 * tranca o minor.
 *
 * Falha quando existe versão publicada V tal que:
 *   V > resolvida  ∧  algum consumidor aceita V  ∧  o override rejeita V.
 *
 * Override que joga o pacote FORA da faixa do consumidor é outra coisa: é forçar correção de
 * segurança por cima de um pin velho, é intencional, e mora em FORCED com motivo e condição
 * de saída. O gate cobra que esteja listado — não que não exista.
 */

type LockPkg = [string, ...unknown[]]

/** Override que sai da faixa do consumidor de propósito. Cada entrada é dívida com saída. */
const FORCED: Record<string, string> = {
	tmp: "external-editor@3.1.0 pin `^0.0.33`, sem release na linha 0.0.x que corrija GHSA-ph9p-34f9-6g65 (path traversal). Cadeia é só dev (commitizen → inquirer). Sai quando inquirer trocar o external-editor.",
	"ip-address":
		"express-rate-limit pin exato `10.1.0`, sem correção nessa versão para GHSA-mwp4-54f8-5fhr (SSRF). Cadeia é o SDK do MCP. Sai quando express-rate-limit subir o pin.",
	"js-yaml": "@redocly/openapi-core pin `4.1.1`; a correção de GHSA-5p4m-2wfm-xmqj não foi backportada para <=4.1.1. Sai quando o redocly subir.",
	lodash:
		"cópia aninhada do commitizen pin `4.17.21`, vulnerável a GHSA-r5fr-rjxr-66jc (code injection via _.template). Cadeia é só dev. Sai quando o commitizen subir.",
}

const ROOT = new URL("..", import.meta.url).pathname

function parseLock(text: string): {
	workspaces: Record<string, Record<string, Record<string, string>>>
	packages: Record<string, LockPkg>
} {
	// bun.lock é JSONC. Tirar a vírgula sobrando por regex cega corromperia hash e faixa de
	// versão que contenham `,` — daí varrer ciente de string.
	let out = ""
	let inString = false
	for (let i = 0; i < text.length; i++) {
		const ch = text[i] as string
		if (inString) {
			out += ch
			if (ch === "\\") out += text[++i] ?? ""
			else if (ch === '"') inString = false
			continue
		}
		if (ch === '"') {
			inString = true
			out += ch
			continue
		}
		if (ch === ",") {
			// Vírgula seguida (só de espaço) por fechamento é sobra: descarta.
			let j = i + 1
			while (j < text.length && /\s/.test(text[j] as string)) j++
			if (text[j] === "}" || text[j] === "]") continue
		}
		out += ch
	}
	return JSON.parse(out)
}

const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]

/** Todo consumidor que declara `name`, com a faixa que ele pede. */
function consumersOf(name: string, lock: ReturnType<typeof parseLock>): Array<{ by: string; range: string }> {
	const out: Array<{ by: string; range: string }> = []

	for (const [path, ws] of Object.entries(lock.workspaces)) {
		for (const field of DEP_FIELDS) {
			const range = ws[field]?.[name]
			if (range) out.push({ by: `workspace ${path || "(raiz)"}`, range })
		}
	}

	for (const [key, entry] of Object.entries(lock.packages)) {
		const meta = entry[2]
		if (!meta || typeof meta !== "object") continue
		for (const field of DEP_FIELDS) {
			const range = (meta as Record<string, Record<string, string>>)[field]?.[name]
			if (range) out.push({ by: entry[0] ?? key, range })
		}
	}

	return out
}

/** Versões resolvidas de `name` no lockfile. */
function resolvedVersions(name: string, lock: ReturnType<typeof parseLock>): string[] {
	const found = new Set<string>()
	for (const entry of Object.values(lock.packages)) {
		const id = entry[0]
		if (typeof id !== "string") continue
		const at = id.lastIndexOf("@")
		if (at <= 0) continue
		if (id.slice(0, at) === name) found.add(id.slice(at + 1))
	}
	return [...found]
}

async function publishedVersions(name: string): Promise<string[]> {
	const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}`, {
		headers: { accept: "application/vnd.npm.install-v1+json" },
	})
	if (!res.ok) throw new Error(`registro devolveu ${res.status} para ${name}`)
	const body = (await res.json()) as { versions?: Record<string, unknown> }
	// Pré-lançamento não conta: ninguém resolve para eles sem pedir explicitamente.
	return Object.keys(body.versions ?? {}).filter((v) => !v.includes("-"))
}

const pkg = await Bun.file(`${ROOT}/package.json`).json()
const lock = parseLock(await Bun.file(`${ROOT}/bun.lock`).text())
const overrides: Record<string, string> = pkg.overrides ?? {}

const caps: string[] = []
const undocumented: string[] = []

for (const [name, spec] of Object.entries(overrides)) {
	const consumers = consumersOf(name, lock)
	if (consumers.length === 0) continue

	const resolved = resolvedVersions(name, lock)
	if (resolved.length === 0) continue
	// Pior caso: a maior resolvida. Se nem ela alcança o que o consumidor quer, é cap.
	const top = resolved.sort(Bun.semver.order).at(-1) as string

	const forcedOn = consumers.filter((c) => !Bun.semver.satisfies(top, c.range))
	if (forcedOn.length > 0) {
		// Forçar por cima do consumidor É capar, de propósito. Documentado em FORCED, os dois
		// checks saem: cobrar cap aqui só produziria ruído permanente.
		if (!FORCED[name]) {
			undocumented.push(
				`  ${name}: "${spec}" resolve ${top}, fora da faixa de ${forcedOn.map((c) => `${c.by} (${c.range})`).join(", ")}\n` +
					"    → se é intencional, registre em FORCED com motivo e condição de saída."
			)
		}
		continue
	}

	let available: string[]
	try {
		available = await publishedVersions(name)
	} catch (err) {
		console.error(`aviso: não deu para consultar ${name} no registro — ${err}`)
		continue
	}

	// Versão que o consumidor aceita, é mais nova que a resolvida, e o override barra.
	const blocked = available.filter(
		(v) => Bun.semver.order(v, top) > 0 && !Bun.semver.satisfies(v, spec) && consumers.some((c) => Bun.semver.satisfies(v, c.range))
	)

	if (blocked.length > 0) {
		const best = blocked.sort(Bun.semver.order).at(-1) as string
		const wants = consumers.filter((c) => Bun.semver.satisfies(best, c.range))
		caps.push(
			`  ${name}: override "${spec}" prende em ${top}, mas ${best} está publicada e ` +
				`${wants.map((c) => `${c.by} (${c.range})`).join(", ")} aceita\n` +
				`    → alargue a spec (ex.: ">=${top}") em vez de usar caret.`
		)
	}
}

if (undocumented.length > 0) {
	console.error("\n❌ override fora da faixa do consumidor e sem justificativa:\n")
	console.error(undocumented.join("\n\n"))
}

if (caps.length > 0) {
	console.error("\n❌ override capando a faixa que o consumidor declara:\n")
	console.error(caps.join("\n\n"))
}

if (caps.length > 0 || undocumented.length > 0) {
	console.error("")
	process.exit(1)
}

console.log(`✅ ${Object.keys(overrides).length} overrides — nenhum capa a faixa do consumidor`)
