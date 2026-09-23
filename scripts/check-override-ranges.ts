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

import { FORCED, MIRRORS, parseLock } from "./lock-registry"

const ROOT = new URL("..", import.meta.url).pathname

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
		if (!Object.hasOwn(FORCED, name)) {
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
