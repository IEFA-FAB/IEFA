#!/usr/bin/env bun
/**
 * Gate: toda dependência e todo peer obrigatório de toda entrada do `bun.lock` resolve para
 * uma versão DENTRO da faixa que o pacote declara.
 *
 * O `check-override-ranges` olha override contra consumidor e não lê peer. O #415 mostrou o
 * que escapa por essa fresta: `@tanstack/openai-base` 0.10.15 declara peer
 * `@tanstack/ai ^0.58.0`, e a árvore tinha o core em 0.54.0. Install, typecheck, testes e
 * build de produção passaram — o código só roda quando o Bedrock falha e um provedor de
 * reserva transmite. O mesmo PR trazia `react-query` exigindo `query-core` exato 5.103.1 com
 * o espelho em 5.102.8, e um peer `@babel/core ^7` servido pelo 8.
 *
 * A resolução imita a do Node: a partir da chave da entrada (`a/b/@escopo/c`), procura o
 * pacote aninhado no próprio caminho e sobe um nível por vez até a raiz. Não confia no que o
 * `bun install` mantém: tirar uma entrada aninhada do lock à mão deixa o dependente sem
 * aresta, e o install NÃO a repõe — foi assim que `@babel/template` passou a resolver o
 * `@babel/types` 7 içado exigindo `^8`.
 *
 * Violação cujo pacote está em FORCED é intencional (override que joga o pacote fora da faixa
 * de propósito) e não falha. É o mesmo registro que o `check-override-ranges` cobra.
 *
 * Fora do escopo, de propósito:
 *   - `optionalDependencies` — binário de plataforma que não existe em toda máquina;
 *   - peer opcional (`optionalPeers`) e peer que nenhuma versão instalou — pacote que declara
 *     peer para integrar com o que o app talvez nem use. O que cobra é peer PRESENTE fora da
 *     faixa, que é o que roda.
 */

import { FORCED, type LockPkg, parseLock } from "./lock-registry"

export interface Violation {
	/** Chave da entrada que declara a dependência. */
	from: string
	dep: string
	range: string
	kind: "dependência" | "peer"
	/** Versão que a resolução encontrou; ausente quando nada resolve. */
	resolved?: string
	/** Chave onde a resolução parou. */
	at?: string
}

type Lock = { packages: Record<string, LockPkg> }

/** `a/@escopo/b/c` → `["a", "@escopo/b", "c"]`. */
function segmentsOf(key: string): string[] {
	const parts = key.split("/")
	const out: string[] = []
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i] as string
		out.push(part.startsWith("@") ? `${part}/${parts[++i]}` : part)
	}
	return out
}

function versionOf(spec: string): string {
	return spec.slice(spec.lastIndexOf("@") + 1)
}

/** Onde o Node acharia `dep` partindo de `fromKey`: aninhado no caminho, subindo até a raiz. */
export function resolveFrom(packages: Lock["packages"], fromKey: string, dep: string): string | undefined {
	const segments = segmentsOf(fromKey)
	for (let depth = segments.length; depth >= 0; depth--) {
		const key = [...segments.slice(0, depth), dep].join("/")
		if (packages[key]) return key
	}
	return undefined
}

/** Faixa que dá para testar com semver. `workspace:`, `npm:`, git e arquivo ficam de fora. */
function isSemverRange(range: string): boolean {
	return range !== "" && range !== "*" && !/^(workspace:|npm:|file:|link:|git|github:|https?:)/.test(range)
}

export function findViolations(lock: Lock): Violation[] {
	const found: Violation[] = []

	for (const [key, entry] of Object.entries(lock.packages)) {
		const meta = (entry[2] ?? {}) as {
			dependencies?: Record<string, string>
			peerDependencies?: Record<string, string>
			optionalPeers?: string[]
		}
		const optionalPeers = new Set(meta.optionalPeers ?? [])

		const checks: Array<["dependência" | "peer", Record<string, string> | undefined]> = [
			["dependência", meta.dependencies],
			["peer", meta.peerDependencies],
		]
		for (const [kind, deps] of checks) {
			for (const [dep, range] of Object.entries(deps ?? {})) {
				if (!isSemverRange(range)) continue
				if (kind === "peer" && optionalPeers.has(dep)) continue

				const at = resolveFrom(lock.packages, key, dep)
				if (!at) {
					// Dependência que não resolve é defeito; peer ausente é escolha de quem instala.
					if (kind === "dependência") found.push({ from: key, dep, range, kind })
					continue
				}

				const resolved = versionOf((lock.packages[at] as LockPkg)[0])
				if (!Bun.semver.satisfies(resolved, range)) found.push({ from: key, dep, range, kind, resolved, at })
			}
		}
	}

	return found.sort((a, b) => `${a.dep} ${a.from}`.localeCompare(`${b.dep} ${b.from}`))
}

/** Violação que o registro de overrides declara como intencional. */
export function isForced(violation: Violation, forced: Record<string, string> = FORCED): boolean {
	return violation.dep in forced
}

export function describe(v: Violation): string {
	if (v.resolved === undefined) return `  ${v.from} → ${v.dep}@${v.range} (${v.kind}): nada resolve`
	const where = v.at === v.dep ? "içado" : `em "${v.at}"`
	return `  ${v.from} → ${v.dep}@${v.range} (${v.kind}): resolve ${v.resolved}, ${where}`
}

if (import.meta.main) {
	const root = new URL("..", import.meta.url).pathname
	const lock = parseLock(await Bun.file(`${root}bun.lock`).text())
	const all = findViolations(lock)
	const unexpected = all.filter((v) => !isForced(v))
	const forcedCount = all.length - unexpected.length

	if (unexpected.length > 0) {
		console.error("\n❌ dependência ou peer resolvendo FORA da faixa que o pacote declara:\n")
		console.error(unexpected.map(describe).join("\n"))
		console.error(
			"\n  → peer fora da faixa: alinhe a versão do pacote com a do peer instalado, ou mova a família junta." +
				"\n  → dependência fora da faixa ou sem resolver: o lock perdeu uma aresta; regenere a partir do lock anterior." +
				"\n  → se é intencional (correção de segurança por cima de pin velho), o override vai em FORCED, em scripts/lock-registry.ts.\n"
		)
		process.exit(1)
	}

	console.log(
		`✅ ${Object.keys(lock.packages).length} entradas — toda dependência e peer obrigatório resolve dentro da faixa` +
			` (${forcedCount} fora de propósito, por override em FORCED)`
	)
}
