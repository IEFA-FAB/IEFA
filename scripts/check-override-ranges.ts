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
	esbuild:
		"o alvo é a cópia de @esbuild-kit/core-utils@3.3.2, que pin `~0.18.20` — a faixa que carrega GHSA-67mh-4wv8-2f99 (dev server responde a qualquer origem). drizzle-kit@0.31.10 já pin `^0.25.4`, corrigido, e só é arrastado junto porque override do bun é plano. 0.31.10 é a última do drizzle-kit e ainda depende do @esbuild-kit/esm-loader, deprecado, então não há release para esperar. Cadeia é só dev. Verificado que o drizzle-kit ainda carrega e avalia o drizzle.config.ts sob 0.28.2, que é justamente o caminho do loader. Sai quando o drizzle-kit largar o @esbuild-kit, ou quando o repo largar o drizzle-kit.",
	undici:
		"o piso `>=8.9.0` existe por @grafana/faro-bundlers-shared@0.12.0, que pin `^8.5.0` — abaixo do 8.9.0 que corrige GHSA-4cwx-7wf7-3272 (high) e mais quatro medium da mesma leva. get-it@9.5.2 (via @sanity/client 8) pin `^7.29.0`, que JÁ é a linha 7 corrigida: ele não ganha nada e só atravessa o major porque override do bun é plano. Nenhuma versão publicada do get-it aceita undici 8, e o @sanity/client 8.4.0 pin `get-it@^9.5.0`. O get-it importa só `Agent`, `EnvHttpProxyAgent`, `ProxyAgent` e `fetch`, os quatro presentes no undici 8.10.0. Sai quando o get-it subir a faixa, ou quando o bun passar a aceitar override escopado por consumidor.",
}

/**
 * Override que ESPELHA o pin exato de outro pacote — não é piso, e alargar quebraria.
 *
 * O dono fixa a dependência em versão EXATA. O override existe só para o lockfile não resolver
 * as duas lado a lado; uma faixa deixaria a espelhada flutuar à frente do dono e parear com uma
 * versão contra a qual ele nunca foi publicado.
 *
 * Espelho não entra no check de "capa a faixa do consumidor": esse check pergunta se saiu versão
 * mais nova no registro, e para espelho a resposta é sempre sim no dia seguinte a cada release do
 * dono — ruído permanente, não achado. O que vale checar é o INVARIANTE: a spec do override tem
 * que ser exatamente o que o dono fixa NESTA árvore. Isso só muda quando alguém mexe no lock de
 * propósito, e aí o gate cobra mover os dois juntos.
 */
const MIRRORS: Record<string, { owner: string; reason: string }> = {
	"@tanstack/query-core": {
		owner: "@tanstack/react-query",
		reason: "react-query fixa query-core em versão exata (PR #202, #237). Sai se o react-query passar a declarar faixa.",
	},
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

/**
 * Todo pin distinto que `owner` declara para `name` nesta árvore.
 *
 * Conjunto, não o primeiro: com duas cópias do dono no lock, "o primeiro" deixa a ordem das
 * chaves do bun.lock decidir o invariante em silêncio — e o gate passaria a exigir que o override
 * espelhasse um pin aninhado velho.
 */
function pinnedByOwner(owner: string, name: string, lock: ReturnType<typeof parseLock>): string[] {
	const pins = new Set<string>()
	for (const entry of Object.values(lock.packages)) {
		const id = entry[0]
		if (typeof id !== "string") continue
		const at = id.lastIndexOf("@")
		if (at <= 0 || id.slice(0, at) !== owner) continue
		const meta = entry[2]
		if (!meta || typeof meta !== "object") continue
		for (const field of DEP_FIELDS) {
			const range = (meta as Record<string, Record<string, string>>)[field]?.[name]
			if (range) pins.add(range)
		}
	}
	return [...pins]
}

async function publishedVersions(name: string): Promise<string[]> {
	// `replace` com string troca só a primeira ocorrência. Nome de pacote válido tem no máximo
	// uma `/`, mas escapar pela metade é o tipo de coisa que só falha no dia em que deixa de ser
	// verdade — daí `replaceAll`.
	const res = await fetch(`https://registry.npmjs.org/${name.replaceAll("/", "%2f")}`, {
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
const brokenMirrors: string[] = []
/** Espelho que realmente existe nesta árvore. O resto é entrada morta, igual FORCED. */
const liveMirrors = new Set<string>()
/** FORCED que realmente forçou algo nesta árvore. O resto é entrada morta. */
const stillForcing = new Set<string>()

for (const [name, spec] of Object.entries(overrides)) {
	const consumers = consumersOf(name, lock)
	if (consumers.length === 0) continue

	const resolved = resolvedVersions(name, lock)
	if (resolved.length === 0) continue
	// Pior caso: a maior resolvida. Se nem ela alcança o que o consumidor quer, é cap.
	const top = resolved.sort(Bun.semver.order).at(-1) as string

	// ANTES do bloco de forcedOn: quando o dono anda e o override fica, o espelho passa a forçar
	// por cima do próprio dono, e o caminho de FORCED capturaria o caso — mandando registrar em
	// FORCED e apagar a entrada de MIRRORS, exatamente o oposto do certo. Espelho decide por si.
	const mirror = MIRRORS[name]
	if (mirror) {
		// Invariante do espelho: a spec TEM que ser o pin exato do dono nesta árvore.
		const pins = pinnedByOwner(mirror.owner, name, lock)
		if (pins.length === 0) {
			brokenMirrors.push(`  ${name}: espelha ${mirror.owner}, que não declara ${name} no lock — espelho sem dono, apague de MIRRORS.`)
		} else if (pins.length > 1) {
			// Duas cópias do dono na árvore: qual manda viraria a ordem das chaves do lock
			// decidindo em silêncio. Melhor falar do que eleger uma.
			brokenMirrors.push(
				`  ${name}: ${mirror.owner} aparece na árvore fixando ${pins.map((v) => `"${v}"`).join(" e ")} — ` +
					"espelho não sabe qual seguir. Deduplique o dono antes."
			)
		} else if (pins[0] !== spec) {
			brokenMirrors.push(
				`  ${name}: override "${spec}", mas ${mirror.owner} fixa "${pins[0]}" nesta árvore\n` +
					`    → mova os DOIS juntos: alinhe o override em "${pins[0]}", ou suba ${mirror.owner}.`
			)
		} else {
			liveMirrors.add(name)
		}
		// Sem check de frescor: ver o comentário de MIRRORS.
		continue
	}

	const forcedOn = consumers.filter((c) => !Bun.semver.satisfies(top, c.range))
	if (forcedOn.length > 0) {
		// Forçar por cima do consumidor É capar, de propósito. Documentado em FORCED, os dois
		// checks saem: cobrar cap aqui só produziria ruído permanente.
		stillForcing.add(name)
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

if (brokenMirrors.length > 0) {
	console.error("\n❌ espelho fora de sincronia com o pin do dono:\n")
	console.error(brokenMirrors.join("\n\n"))
}

const staleMirrors = Object.keys(MIRRORS).filter((name) => !overrides[name])
if (staleMirrors.length > 0) {
	console.error("\n❌ entrada morta em MIRRORS — não há override com esse nome, apague:\n")
	for (const name of staleMirrors) console.error(`  ${name}`)
}

// FORCED é dívida com saída. Entrada que não força mais nada já cumpriu a condição de saída —
// deixar apodrecer é exatamente como um allowlist "temporário" vira permanente.
const stale = Object.keys(FORCED).filter((name) => !stillForcing.has(name))
if (stale.length > 0) {
	console.error("\n❌ entrada morta em FORCED — a condição de saída já bateu, apague:\n")
	for (const name of stale) {
		console.error(`  ${name}: ${overrides[name] ? "não força mais nenhum consumidor" : "nem override tem mais"}`)
	}
}

if (caps.length > 0 || undocumented.length > 0 || stale.length > 0 || brokenMirrors.length > 0 || staleMirrors.length > 0) {
	console.error("")
	process.exit(1)
}

console.log(
	`✅ ${Object.keys(overrides).length} overrides — nenhum capa a faixa do consumidor ` +
		`(${stillForcing.size} forçados em FORCED, ${liveMirrors.size} espelhado${liveMirrors.size === 1 ? "" : "s"} em sincronia)`
)
