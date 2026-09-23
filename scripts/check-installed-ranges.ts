#!/usr/bin/env bun
/**
 * Gate: toda dependência e todo peer obrigatório que o linker INSTALOU cai dentro da faixa que
 * o pacote declara — de cada pacote da loja e de cada workspace.
 *
 * O `check-override-ranges` olha override contra consumidor e não lê peer. O #415 mostrou o que
 * escapa por essa fresta: `@tanstack/openai-base` 0.10.15 com peer `@tanstack/ai ^0.58.0` sobre
 * o core 0.54.0 — verde em install, typecheck, testes e build, quebrado só quando o Bedrock
 * falha e um provedor de reserva transmite.
 *
 * Lê o DISCO, não o `bun.lock`. O repo instala com o linker isolado (`node_modules/.bun`), que
 * resolve peer pela cadeia de quem depende e cria variantes por conjunto de peer que o lock não
 * registra. Um modelo que sobe pelas chaves do lock concordou com o disco em 3.196 de 3.199
 * arestas — e as três que errou eram peers, uma delas defeito real: `openapi-typescript` com
 * peer `typescript ^5` ligado ao TypeScript 7, que quebrava o codegen do `compras-api`. O disco
 * é o que roda; é ele que se confere.
 *
 * Por isso roda DEPOIS do `bun install --frozen-lockfile`, no mesmo job.
 *
 * Violação de um consumidor listado em FORCED (`scripts/lock-registry.ts`) para aquele pacote é
 * intencional e não falha. Consumidor listado que já não viola nada falha como entrada morta —
 * isenção sem uso é allowlist apodrecendo.
 *
 * Fora do escopo, de propósito:
 *   - `optionalDependencies` — binário de plataforma, que não existe em toda máquina;
 *   - peer opcional (`peerDependenciesMeta[x].optional`) e peer que nada instalou — quem cobra é
 *     peer PRESENTE fora da faixa, que é o que roda;
 *   - faixa que não é semver: `workspace:`, `npm:`, git, tarball, `owner/repo#tag`, dist-tag.
 */

import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs"
import { basename, dirname, join, sep } from "node:path"
import { FORCED, type Forced, parseLock } from "./lock-registry"

export interface Edge {
	/** Pacote que declara a dependência (nome do registry ou do workspace). */
	owner: string
	ownerVersion: string
	dep: string
	range: string
	kind: "dependência" | "peer"
	/** Versão instalada; ausente quando a dependência não foi instalada. */
	installed?: string
}

type PackageJson = {
	name?: string
	version?: string
	dependencies?: Record<string, string>
	devDependencies?: Record<string, string>
	peerDependencies?: Record<string, string>
	peerDependenciesMeta?: Record<string, { optional?: boolean }>
	optionalDependencies?: Record<string, string>
	overrides?: Record<string, string>
	workspaces?: string[] | { packages?: string[] }
}

function readPackageJson(dir: string): PackageJson | undefined {
	try {
		return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"))
	} catch {
		return undefined
	}
}

/**
 * Faixa que dá para testar com semver. Fora: prefixo de protocolo (`workspace:`, `npm:`, git,
 * `file:`), atalho de repositório (`owner/repo#tag`) e dist-tag (`latest`) — `Bun.semver`
 * responde `true` para `latest` e para `owner/repo#v1`, e contar isso como conferido seria mentir.
 */
const COMPARATOR = /^(?:\^|~|>=|<=|>|<|=)?v?(?:\d+|[xX*])(?:\.(?:\d+|[xX*])){0,2}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

export function isCheckableRange(range: string): boolean {
	const trimmed = range.trim()
	if (trimmed === "") return false
	// Cada alternativa (`||`) é uma sequência de comparadores; ` - ` é faixa por hífen. Token que
	// não é comparador — `ts5.0`, `next-15`, `canary-2`, protocolo, `owner/repo#tag` — derruba
	// a faixa inteira: tratar como conferida seria contar como checado o que ninguém checou.
	return trimmed.split("||").every((alternative) => {
		const tokens = alternative.trim().split(/\s+/).filter(Boolean)
		return tokens.length > 0 && tokens.every((token, i) => (token === "-" ? i > 0 && i < tokens.length - 1 : COMPARATOR.test(token)))
	})
}

/**
 * Os `node_modules` que o Node consulta a partir do diretório REAL de um pacote, na ordem: o
 * aninhado do próprio pacote (bundledDependencies), o da variante, o `.bun/node_modules` de
 * fallback da loja e o da raiz. Parar na variante acusava como "não instalada" a dependência
 * empacotada, e deixava passar o peer que o Node carrega de um ancestral.
 */
export function buildNodeSearchPath(realPackageDir: string, stopAt: string): string[] {
	const dirs: string[] = []
	let dir = realPackageDir
	for (;;) {
		dirs.push(basename(dir) === "node_modules" ? dir : join(dir, "node_modules"))
		if (dir === stopAt || dir === dirname(dir)) break
		dir = dirname(dir)
	}
	return [...new Set(dirs)]
}

/** Versão que o primeiro `node_modules` do caminho de busca instala para `dep`. */
function readInstalledVersion(searchDirs: readonly string[], dep: string): string | undefined {
	for (const dir of searchDirs) {
		const link = join(dir, dep)
		if (!existsSync(link)) continue
		return readPackageJson(realpathSync(link))?.version
	}
	return undefined
}

function collectDeclared(pkg: PackageJson, includeDev: boolean): Array<Pick<Edge, "dep" | "range" | "kind">> {
	const optionalPeers = new Set(
		Object.entries(pkg.peerDependenciesMeta ?? {})
			.filter(([, meta]) => meta?.optional)
			.map(([name]) => name)
	)
	const out: Array<Pick<Edge, "dep" | "range" | "kind">> = []
	// Pela regra do npm, o nome que também está em `optionalDependencies` é opcional — e o linker
	// pode nem instalá-lo nesta plataforma.
	const optional = new Set(Object.keys(pkg.optionalDependencies ?? {}))
	const deps = { ...pkg.dependencies, ...(includeDev ? pkg.devDependencies : {}) }
	for (const [dep, range] of Object.entries(deps)) if (!optional.has(dep)) out.push({ dep, range, kind: "dependência" })
	for (const [dep, range] of Object.entries(pkg.peerDependencies ?? {})) {
		if (!optionalPeers.has(dep)) out.push({ dep, range, kind: "peer" })
	}
	return out.filter((e) => isCheckableRange(e.range))
}

/** Diretórios de workspace relativos à raiz — `""` é a própria raiz — com `package.json` nomeado. */
function listWorkspaceDirs(root: string): string[] {
	const rootPkg = readPackageJson(root)
	const patterns = Array.isArray(rootPkg?.workspaces) ? rootPkg.workspaces : (rootPkg?.workspaces?.packages ?? [])
	// A raiz também declara dependências (turbo, biome, knip…) e também pode sair da faixa.
	const dirs = patterns.flatMap((pattern) => [...new Bun.Glob(pattern).scanSync({ cwd: root, onlyFiles: false })])
	return ["", ...dirs].filter((dir) => readPackageJson(join(root, dir))?.name)
}

/** Nomes das entradas de um `node_modules`, com o escopo contando como UM nome (`@a/b`). */
function listModuleNames(nodeModules: string): string[] {
	return readdirSync(nodeModules).flatMap((entry) =>
		entry.startsWith("@") ? readdirSync(join(nodeModules, entry)).map((name) => `${entry}/${name}`) : entry.startsWith(".") ? [] : [entry]
	)
}

/** `node_modules` que contém o pacote em `packageDir` — um nível acima, dois se tiver escopo. */
function findContainingNodeModules(packageDir: string, name: string): string {
	return name.startsWith("@") ? join(packageDir, "../..") : join(packageDir, "..")
}

/**
 * Diretórios reais de pacote ALCANÇÁVEIS a partir da raiz e dos workspaces, seguindo os symlinks
 * de dependência — o que o Node de fato carregaria.
 *
 * Existe porque o `bun install` não poda a loja: tirar um pacote do lock deixa a variante velha
 * em `node_modules/.bun`, órfã. Julgar a loja inteira acusava na máquina de quem roda o gate um
 * pacote que já nem está no lock — e gate que dá falso positivo local é gate que se aprende a
 * ignorar. No CI a instalação é limpa; isto é para ele valer igual fora dele.
 */
export function collectReachable(entryNodeModules: readonly string[], store: string): Set<string> {
	const reachable = new Set<string>()
	const queue: Array<[string, string]> = []
	// Só pacote DA LOJA é atravessado. Workspace ligado na raiz (`@iefa/x` → `packages/x`) já é
	// ponto de entrada pelo próprio node_modules; subir a partir dele listaria a raiz do repo como
	// se fosse pasta de módulos.
	const insideStore = (real: string) => real.startsWith(store + sep)
	const enqueueFrom = (nodeModules: string) => {
		if (!existsSync(nodeModules)) return
		for (const name of listModuleNames(nodeModules)) {
			let real: string
			try {
				real = realpathSync(join(nodeModules, name))
			} catch {
				continue
			}
			if (reachable.has(real)) continue
			reachable.add(real)
			if (insideStore(real)) queue.push([real, name])
		}
	}
	for (const nm of entryNodeModules) enqueueFrom(nm)
	for (let i = 0; i < queue.length; i++) {
		const [real, name] = queue[i] as [string, string]
		enqueueFrom(findContainingNodeModules(real, name))
	}
	return reachable
}

/**
 * Versões que o `bun.lock` registra para cada nome. Entrada que não é de registry (tarball, git)
 * vale para qualquer versão daquele nome — o spec dela é URL, não versão.
 */
export function readLockedVersions(lockText: string): Map<string, Set<string>> {
	const locked = new Map<string, Set<string>>()
	for (const entry of Object.values(parseLock(lockText).packages)) {
		const spec = entry[0]
		// O separador é o PRIMEIRO `@` depois do início (o do escopo é o índice 0). `lastIndexOf`
		// cortava `pkg@git+ssh://git@github.com/...` no `@` da URL.
		const at = spec.indexOf("@", 1)
		if (at <= 0) continue
		const name = spec.slice(0, at)
		const version = spec.slice(at + 1)
		const versions = locked.get(name) ?? new Set<string>()
		versions.add(Bun.semver.satisfies(version, "*") || /^\d/.test(version) ? version : "*")
		locked.set(name, versions)
	}
	return locked
}

function isLocked(locked: Map<string, Set<string>>, name: string, version: string): boolean {
	const versions = locked.get(name)
	return versions !== undefined && (versions.has("*") || versions.has(version))
}

/**
 * Toda aresta instalada. Na loja do linker isolado, cada `node_modules/.bun/<variante>` guarda o
 * pacote dono como diretório real e as dependências dele como symlink — o dono é a única entrada
 * que não é link.
 */
export function collectInstalledEdges(root: string, locked?: Map<string, Set<string>>): { edges: Edge[]; stale: string[] } {
	const edges: Edge[] = []
	const stale: string[] = []
	const realRoot = realpathSync(root)
	const store = join(root, "node_modules/.bun")
	const workspaceDirs = listWorkspaceDirs(root)
	const reachable = collectReachable(
		workspaceDirs.map((dir) => join(root, dir, "node_modules")),
		existsSync(store) ? realpathSync(store) : store
	)

	if (existsSync(store)) {
		for (const variant of readdirSync(store)) {
			const nodeModules = join(store, variant, "node_modules")
			if (!existsSync(nodeModules)) continue
			const owner = listModuleNames(nodeModules).find((name) => !lstatSync(join(nodeModules, name)).isSymbolicLink())
			if (!owner || !reachable.has(realpathSync(join(nodeModules, owner)))) continue
			const pkg = readPackageJson(join(nodeModules, owner))
			if (!pkg) continue
			// Instalado mas ausente do lock: sobra de install incremental, que não poda loja nem
			// link de workspace. Não existe numa instalação limpa, então não se julga — avisa-se.
			if (locked && !isLocked(locked, owner, pkg.version ?? "")) {
				stale.push(`${owner}@${pkg.version}`)
				continue
			}
			const searchPath = buildNodeSearchPath(realpathSync(join(nodeModules, owner)), realRoot)
			for (const declared of collectDeclared(pkg, false)) {
				edges.push({ owner, ownerVersion: pkg.version ?? "?", ...declared, installed: readInstalledVersion(searchPath, declared.dep) })
			}
		}
	}

	// Workspaces (a raiz inclusive): o Node sobe do diretório deles até a raiz.
	for (const dir of workspaceDirs) {
		const pkg = readPackageJson(join(root, dir))
		if (!pkg?.name) continue
		const searchDirs = buildNodeSearchPath(join(realRoot, dir), realRoot)
		for (const declared of collectDeclared(pkg, true)) {
			edges.push({ owner: pkg.name, ownerVersion: "workspace", ...declared, installed: readInstalledVersion(searchDirs, declared.dep) })
		}
	}

	return { edges, stale: [...new Set(stale)].sort() }
}

export interface Verdict {
	violations: Edge[]
	/** Violações que FORCED declara intencionais. */
	forced: Edge[]
	/** `pacote ← consumidor` listado em FORCED que não viola mais nada. */
	deadConsumers: string[]
}

function buildEdgeKey(e: Edge): string {
	return `${e.owner}@${e.ownerVersion}|${e.dep}|${e.range}|${e.kind}|${e.installed ?? ""}`
}

/**
 * `overrides` é o da raiz. Isenção de FORCED vale só enquanto o instalado é o que o override
 * força: se o lock regredir para a faixa vulnerável que o override existe para evitar (o
 * `esbuild ~0.18` do GHSA-67mh), a aresta continua fora da faixa do consumidor mas deixa de ser
 * a exceção declarada — e falha.
 */
export function judgeEdges(edges: readonly Edge[], forced: Record<string, Forced> = FORCED, overrides: Record<string, string> = {}): Verdict {
	const violations: Edge[] = []
	const forcedHits: Edge[] = []
	const seen = new Set<string>()
	const usedExemptions = new Set<string>()

	for (const edge of edges) {
		// Variantes do mesmo pacote (uma por conjunto de peer) repetem a mesma aresta.
		const key = buildEdgeKey(edge)
		if (seen.has(key)) continue
		seen.add(key)

		const outOfRange = edge.installed === undefined ? edge.kind === "dependência" : !Bun.semver.satisfies(edge.installed, edge.range)
		if (!outOfRange) continue

		const exemption = Object.hasOwn(forced, edge.dep) ? forced[edge.dep] : undefined
		const overrideSpec = Object.hasOwn(overrides, edge.dep) ? overrides[edge.dep] : undefined
		const isOverrideTarget = overrideSpec === undefined || (edge.installed !== undefined && Bun.semver.satisfies(edge.installed, overrideSpec))
		if (exemption?.consumers.includes(edge.owner) && isOverrideTarget) {
			forcedHits.push(edge)
			usedExemptions.add(`${edge.dep} ← ${edge.owner}`)
		} else {
			violations.push(edge)
		}
	}

	const deadConsumers = Object.entries(forced)
		.flatMap(([dep, entry]) => entry.consumers.map((consumer) => `${dep} ← ${consumer}`))
		.filter((pair) => !usedExemptions.has(pair))

	const byName = (a: Edge, b: Edge) => `${a.dep} ${a.owner}`.localeCompare(`${b.dep} ${b.owner}`)
	return { violations: violations.sort(byName), forced: forcedHits.sort(byName), deadConsumers: deadConsumers.sort() }
}

export function formatEdge(e: Edge): string {
	const owner = e.ownerVersion === "workspace" ? `workspace ${e.owner}` : `${e.owner}@${e.ownerVersion}`
	const found = e.installed === undefined ? "não instalada" : `instalada ${e.installed}`
	return `  ${owner} → ${e.dep}@${e.range} (${e.kind}): ${found}`
}

if (import.meta.main) {
	const root = new URL("..", import.meta.url).pathname
	if (!existsSync(join(root, "node_modules"))) {
		console.error("❌ sem node_modules — este gate lê o que foi instalado; rode `bun install --frozen-lockfile` antes.")
		process.exit(1)
	}

	const locked = readLockedVersions(await Bun.file(join(root, "bun.lock")).text())
	const { edges, stale } = collectInstalledEdges(root, locked)
	const rootOverrides = readPackageJson(root)?.overrides ?? {}
	const { violations, forced, deadConsumers } = judgeEdges(edges, FORCED, rootOverrides)
	// No CI a instalação é sempre limpa: sobra fora do lock ali não é resto de install, é erro de
	// leitura — um pacote inteiro saindo do julgamento em silêncio.
	const staleIsFatal = process.env.CI === "true"

	if (stale.length > 0 && staleIsFatal) {
		console.error(
			`\n❌ ${stale.length} pacote(s) instalado(s) que o bun.lock não tem, numa instalação limpa — ficariam sem julgamento:\n` +
				stale.map((p) => `    ${p}`).join("\n") +
				"\n    Se é git/tarball, o parse do spec do lock errou o nome; corrija readLockedVersions.\n"
		)
	} else if (stale.length > 0) {
		console.warn(
			`⚠️  ${stale.length} pacote(s) instalado(s) que o bun.lock não tem — sobra de install incremental, fora do julgamento:` +
				`\n${stale.map((p) => `    ${p}`).join("\n")}` +
				"\n    Para o resultado local bater com o do CI: rm -rf node_modules && bun install --frozen-lockfile\n"
		)
	}

	if (violations.length > 0) {
		console.error("\n❌ dependência ou peer instalado FORA da faixa que o pacote declara:\n")
		console.error(violations.map(formatEdge).join("\n"))
		console.error(
			"\n  → peer fora da faixa: alinhe a versão do pacote com a do peer instalado, ou mova a família junta." +
				"\n  → dependência não instalada ou fora da faixa: o lock perdeu uma aresta; regenere a partir do lock anterior." +
				"\n  → se é intencional (override de segurança por cima de pin velho), o consumidor entra em FORCED," +
				"\n    em scripts/lock-registry.ts, com motivo e condição de saída.\n"
		)
	}

	if (deadConsumers.length > 0) {
		console.error("\n❌ consumidor em FORCED que já não viola nada — a isenção não serve mais, apague:\n")
		console.error(deadConsumers.map((pair) => `  ${pair}`).join("\n"))
		console.error("")
	}

	if (violations.length > 0 || deadConsumers.length > 0 || (staleIsFatal && stale.length > 0)) process.exit(1)

	console.log(
		`✅ ${new Set(edges.map(buildEdgeKey)).size} arestas instaladas — toda dependência e peer obrigatório dentro da faixa` +
			` (${forced.length} fora de propósito, por consumidor em FORCED)`
	)
}
