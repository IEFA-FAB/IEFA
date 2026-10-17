import { Glob } from "bun"
// TypeScript 5 só pela API do compilador (o 7 nativo não a expõe), como no `compras-api-codegen`.
// O scanner roda só em teste: é devDependency, não chega a app nenhum.
import ts from "typescript-5"

/**
 * Varredura das chaves de armazenamento do navegador, para o guard da Política de Cookies
 * (`cookie-inventory.test.ts`). Fica fora do arquivo de teste para poder ser exercitada
 * contra uma árvore de fontes montada à mão (`cookie-inventory-scan.test.ts`).
 *
 * Devolve chave → arquivos que a gravam. Chave declarada em PACKAGE é atribuída também a
 * todo arquivo de app que importa, como valor, o export que chega até ela — é o app que
 * grava no navegador do usuário, e é ele que a linha do inventário precisa nomear. Sem
 * isso, um app novo que adotasse o `useLoginRateLimiter` passaria verde sem aparecer na
 * linha do `auth_rate_limit`, do mesmo jeito que o Contrate passou com o `theme`.
 */

/** Caminho relativo à raiz do repositório (`apps/x/src/a.ts`) → fonte. */
export type SourceTree = Map<string, string>

/** O que importa do `package.json` de um workspace de `packages/`. */
export type PackageManifest = {
	/** `@iefa/auth-kit` */
	name: string
	/** `packages/auth-kit` */
	dir: string
	/** Campo `exports`: subpath (`.`, `./react`) → arquivo (`./src/react.ts`). */
	exports: Record<string, string>
}

/** Constante com nome de chave (`…_KEY`, `…STORAGE_KEY`) atribuída a string — a forma mais comum no repo. */
const DECLARATION = /\b(?:const|let)\s+([A-Za-z_][A-Za-z0-9_]*(?:STORAGE_KEY|LS_KEY|COOKIE_NAME|REMEMBER_KEY|_KEY|PERSIST_KEY)[A-Za-z0-9_]*)\s*=\s*"([^"]+)"/g
/** Nomes de constante que não servem a outra coisa senão chave de armazenamento. */
const STORAGE_ONLY_NAME = /^(?:LS_[A-Z0-9_]*|[A-Z0-9_]*(?:STORAGE_KEY|COOKIE_NAME|PERSIST_KEY|REMEMBER_KEY|REMEMBER_EMAIL))$/
/**
 * Propriedade de configuração com nome de chave de armazenamento (a `rememberEmailKey` do
 * `AuthScreenConfig`; sem exemplo literal aqui, este arquivo também é varrido): é
 * como o app entrega a chave a um hook de package que a grava por variável, sem literal.
 */
const STORAGE_ONLY_PROPERTY = /\b[a-z][A-Za-z0-9]*(?:StorageKey|EmailKey|PersistKey|CookieName)\s*:\s*"([^"]+)"/g
/** Literal usado direto numa chamada de armazenamento, sem passar por constante. */
const INLINE = /(?:localStorage|sessionStorage)\.(?:get|set|remove)Item\(\s*"([^"]+)"/g
/**
 * Literal passado como primeiro argumento ao wrapper de persistência do sisub
 * (`usePersistentState`). Sem exemplo literal aqui: este arquivo também é varrido.
 */
const PERSISTENT_STATE = /usePersistentState(?:<[^(]*?>)?\(\s*"([^"]+)"/g
/**
 * Chave montada em template, com prefixo fixo — `sisub:recipes:${cozinha}`,
 * `rada_session_id:${conta}`. A parte variável impede comparar a chave inteira, mas o
 * prefixo é o que o inventário declara (`sisub:recipes:*`, `rada_session_id:<conta>`).
 * Três formas: constante ou função-flecha com nome de chave, função `…Key()` que devolve o
 * template, e o template direto na chamada de armazenamento ou do wrapper.
 */
const TEMPLATE_DECLARATION = /\b(?:const|let)\s+((?=[A-Za-z0-9_]*(?:KEY|[Kk]ey|LS_))[A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:\([^)]*\)\s*=>\s*)?`([^`$]*)\$\{/g
const TEMPLATE_FUNCTION = /\bfunction\s+[A-Za-z0-9_]*[Kk]ey[A-Za-z0-9_]*\s*\([^)]*\)[^{]*\{\s*return\s*`([^`$]*)\$\{/g
const TEMPLATE_INLINE = /(?:usePersistentState(?:<[^(]*?>)?|(?:localStorage|sessionStorage)\.(?:get|set|remove)Item)\(\s*`([^`$]*)\$\{/g

// Inclui os wrappers de persistência do sisub: `PreparationsTreeManager` grava em
// sessionStorage via `usePersistentState`, sem citar a API — sem eles a varredura
// perderia exatamente as chaves que passam por abstração.
const STORAGE_API = /localStorage|sessionStorage|document\.cookie|usePersistentState|useScrollRestoration|getStoredScrollOffset/

/** `import [type] [Padrão,] [{ a, type b, c as d } | * as ns] from "x"`. */
const IMPORT = /\bimport\s+(type\s+)?(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\}|\*\s*as\s+([A-Za-z_$][\w$]*))?\s*from\s*["']([^"']+)["']/g
/** `export [type] { a, type b, c as d } from "x"` e `export * [as ns] from "x"`. */
const REEXPORT = /\bexport\s+(type\s+)?(?:\{([^}]*)\}|\*(?:\s+as\s+([A-Za-z_$][\w$]*))?)\s*from\s*["']([^"']+)["']/g
/** `export { a, c as d }` sem `from` — exporta nomes locais. */
const LOCAL_EXPORT_LIST = /\bexport\s+(type\s+)?\{([^}]*)\}(?!\s*from)/g
/** `import("x")` — sem lista de nomes, então vale como tudo o que o módulo exporta. */
const DYNAMIC_IMPORT = /\bimport\(\s*["']([^"']+)["']\s*\)/g

type KeyHit = { key: string; file: string; index: number }

function isTestFile(file: string): boolean {
	return /\.test\.tsx?$/.test(file)
}

function isAppFile(file: string): boolean {
	return file.startsWith("apps/")
}

/** Todas as chaves de um arquivo, com a posição — a posição é o que liga a chave à função que a usa. */
function findKeys(file: string, source: string): KeyHit[] {
	const hits: KeyHit[] = []
	const add = (key: string | undefined, index: number) => {
		// Template que começa pela parte variável (`${persistKey}:scroll`) não tem prefixo
		// a conferir; a raiz dele é outra constante, que a varredura pega por conta própria.
		if (key) hits.push({ key, file, index })
	}

	for (const match of source.matchAll(INLINE)) add(match[1], match.index)
	// Nome que só existe para chave de armazenamento vale em qualquer arquivo: o
	// `LS_TABLE_SETTINGS_KEY` do pregoeiro mora num arquivo de tipos, longe da chamada.
	for (const match of source.matchAll(DECLARATION)) if (STORAGE_ONLY_NAME.test(match[1] as string)) add(match[2], match.index)
	for (const match of source.matchAll(STORAGE_ONLY_PROPERTY)) add(match[1], match.index)

	// Só declarações em arquivo que de fato fala com o navegador: sem esse filtro,
	// toda constante terminada em `_KEY` (chave de query, id de coluna) entraria.
	if (!STORAGE_API.test(source)) return hits
	for (const match of source.matchAll(DECLARATION)) add(match[2], match.index)
	for (const match of source.matchAll(PERSISTENT_STATE)) add(match[1], match.index)
	for (const match of source.matchAll(TEMPLATE_DECLARATION)) add(match[2], match.index)
	for (const match of source.matchAll(TEMPLATE_FUNCTION)) add(match[1], match.index)
	for (const match of source.matchAll(TEMPLATE_INLINE)) add(match[1], match.index)
	return hits
}

/** `a, type B, c as d` → pares [nome importado, nome local], SEM os que são só tipo. */
function parseSpecifiers(list: string): Array<[string, string]> {
	const pairs: Array<[string, string]> = []
	for (const raw of list.split(",")) {
		const spec = raw.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "").trim()
		if (!spec || /^type\s/.test(spec)) continue
		const [imported, local] = spec.split(/\s+as\s+/).map((part) => part.trim())
		if (imported) pairs.push([imported, local ?? imported])
	}
	return pairs
}

function normalizePath(path: string): string {
	const out: string[] = []
	for (const part of path.split("/")) {
		if (part === "" || part === ".") continue
		if (part === "..") out.pop()
		else out.push(part)
	}
	return out.join("/")
}

/**
 * Unidade de topo do módulo que pode levar a chave até um export: declaração de função, classe,
 * enum ou namespace, cada declarador de `const`/`let`/`var`, e o `export default <expressão>`.
 * `locals` são os nomes que o resto do módulo cita; `exportsAs`, os que quem importa enxerga
 * (`default` em `export default function f`, que não exporta `f`).
 *
 * Os limites vêm do AST do TypeScript, não de regex de coluna 0: com regex, a unidade ia até a
 * próxima declaração reconhecida e engolia o que viesse no meio (`export { … }`, `interface`,
 * chamada solta), "citando" nomes que não usa e exportando a mais.
 */
type TopLevelUnit = { locals: string[]; exportsAs: string[]; start: number; end: number }

/** arquivo → unidades de topo. A fonte não muda durante a varredura: cada arquivo é lido uma vez. */
type UnitReader = (file: string) => TopLevelUnit[]

function bindingNames(name: ts.BindingName): string[] {
	if (ts.isIdentifier(name)) return [name.text]
	return name.elements.flatMap((element) => (ts.isOmittedExpression(element) ? [] : bindingNames(element.name)))
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
	return ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false)
}

function parseUnits(file: string, source: string): TopLevelUnit[] {
	const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
	const units: TopLevelUnit[] = []
	for (const statement of sourceFile.statements) {
		const isExported = hasModifier(statement, ts.SyntaxKind.ExportKeyword)
		if (ts.isVariableStatement(statement)) {
			// O primeiro declarador começa no `const`: é onde a varredura de chave aponta o achado.
			statement.declarationList.declarations.forEach((declaration, index) => {
				const names = bindingNames(declaration.name)
				const start = index === 0 ? statement.getStart(sourceFile) : declaration.getStart(sourceFile)
				units.push({ locals: names, exportsAs: isExported ? names : [], start, end: declaration.end })
			})
			continue
		}
		const start = statement.getStart(sourceFile)
		if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement) || ts.isModuleDeclaration(statement)) {
			// `export default function () {}` e `export default class {}` não têm nome local.
			const name = statement.name && ts.isIdentifier(statement.name) ? statement.name.text : undefined
			const exportedAs = hasModifier(statement, ts.SyntaxKind.DefaultKeyword) ? "default" : name
			units.push({ locals: name ? [name] : [], exportsAs: isExported && exportedAs ? [exportedAs] : [], start, end: statement.end })
		} else if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
			// `export default memo(X)`, `export default () => …`, `export default load satisfies T`.
			units.push({ locals: [], exportsAs: ["default"], start, end: statement.end })
		}
		// `import`, `export { … }`, `export * from`, `interface`, `type` e código solto não são
		// unidades: não carregam a chave (os imports e reexports são lidos à parte), mas o AST
		// os mantém fora do trecho da unidade anterior.
	}
	return units
}

function createUnitReader(tree: SourceTree): UnitReader {
	const cache = new Map<string, TopLevelUnit[]>()
	return (file) => {
		let units = cache.get(file)
		if (!units) {
			units = parseUnits(file, tree.get(file) as string)
			cache.set(file, units)
		}
		return units
	}
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** O trecho cita algum dos nomes (fora de acesso a propriedade: `obj.load` não é `load`). */
function mentionsAny(text: string, names: Set<string>): boolean {
	if (names.size === 0) return false
	return new RegExp(`(?<![\\w$.])(?:${[...names].map(escapeRegExp).join("|")})(?![\\w$])`).test(text)
}

type Resolver = (from: string, specifier: string) => string | undefined
/** arquivo → nomes exportados que chegam à chave. */
type TaintedExports = Map<string, Set<string>>

/** Especificador público (`@iefa/kit`, `@iefa/kit/react`) → arquivo de entrada do `exports`. */
function mapEntriesBySpecifier(packages: PackageManifest[]): Map<string, string> {
	const entryBySpecifier = new Map<string, string>()
	for (const pkg of packages) {
		for (const [subpath, target] of Object.entries(pkg.exports)) {
			const specifier = subpath === "." ? pkg.name : `${pkg.name}${subpath.slice(1)}`
			entryBySpecifier.set(specifier, normalizePath(`${pkg.dir}/${target}`))
		}
	}
	return entryBySpecifier
}

/** Resolve o especificador de um import: entry de package, ou caminho relativo que existe na árvore. */
function createResolver(entryBySpecifier: Map<string, string>, tree: SourceTree): Resolver {
	return (from, specifier) => {
		if (entryBySpecifier.has(specifier)) return entryBySpecifier.get(specifier)
		if (!specifier.startsWith(".")) return undefined
		const base = normalizePath(`${from.slice(0, from.lastIndexOf("/"))}/${specifier}`)
		for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
			if (tree.has(candidate)) return candidate
		}
		return undefined
	}
}

/** Exports do alvo que chegam à chave; `undefined` quando o alvo não resolve ou nenhum chega. */
function findReachingExports(target: string | undefined, taintedExports: TaintedExports): Set<string> | undefined {
	const exported = target ? taintedExports.get(target) : undefined
	if (!exported || exported.size === 0) return undefined
	return exported
}

/** Unidades contaminadas e os nomes locais que elas declaram. */
type Taint = { units: Set<TopLevelUnit>; locals: Set<string> }

function taintUnit(taint: Taint, unit: TopLevelUnit): void {
	taint.units.add(unit)
	for (const name of unit.locals) taint.locals.add(name)
}

/** Nomes locais listados num `export { a, c as d }` sem `from`. */
function locallyListedExports(source: string): string[] {
	const names: string[] = []
	for (const match of source.matchAll(LOCAL_EXPORT_LIST)) if (!match[1]) for (const [local] of parseSpecifiers(match[2] ?? "")) names.push(local)
	return names
}

/** No arquivo da chave, o ponto de partida: a unidade que a contém. */
function seedHit(hit: KeyHit, source: string, units: TopLevelUnit[], taint: Taint): void {
	const holder = units.find((unit) => hit.index >= unit.start && hit.index < unit.end)
	if (holder) {
		taintUnit(taint, holder)
		return
	}
	// Chave usada fora de qualquer unidade (código solto no topo do módulo): não há como saber
	// qual export a alcança, então todos alcançam — os declarados com `export`, o default e os
	// listados em `export { … }`.
	for (const unit of units) if (unit.exportsAs.length > 0) taintUnit(taint, unit)
	for (const name of locallyListedExports(source)) taint.locals.add(name)
}

/** Nomes locais que um import de VALOR traz de um módulo cujos exports chegam à chave. */
function addImportedLocals(file: string, source: string, locals: Set<string>, resolve: Resolver, taintedExports: TaintedExports): void {
	for (const match of source.matchAll(IMPORT)) {
		if (match[1]) continue
		const exported = findReachingExports(resolve(file, match[5] as string), taintedExports)
		if (!exported) continue
		if (match[2] && exported.has("default")) locals.add(match[2])
		if (match[4]) locals.add(match[4])
		for (const [imported, local] of parseSpecifiers(match[3] ?? "")) if (exported.has(imported)) locals.add(local)
	}
}

/** Ponto fixo dentro do módulo: `load` usa a chave, `getRemainingSeconds` usa `load`. */
function growTaintToFixpoint(source: string, units: TopLevelUnit[], taint: Taint): void {
	let grew = true
	while (grew) {
		grew = false
		for (const unit of units) {
			if (taint.units.has(unit)) continue
			if (mentionsAny(source.slice(unit.start, unit.end), taint.locals)) {
				taintUnit(taint, unit)
				grew = true
			}
		}
	}
}

/** `export { a, c as d }` sem `from`: o nome exportado de cada local que chega à chave. */
function addLocalExportList(source: string, locals: Set<string>, mine: Set<string>): void {
	for (const match of source.matchAll(LOCAL_EXPORT_LIST)) {
		if (match[1]) continue
		for (const [local, exported] of parseSpecifiers(match[2] ?? "")) if (locals.has(local)) mine.add(exported)
	}
}

/** `export { a as b } from`, `export * as ns from` e `export * from` de módulo que chega à chave. */
function addReexports(file: string, source: string, mine: Set<string>, resolve: Resolver, taintedExports: TaintedExports): void {
	for (const match of source.matchAll(REEXPORT)) {
		if (match[1]) continue
		const exported = findReachingExports(resolve(file, match[4] as string), taintedExports)
		if (!exported) continue
		if (match[2] !== undefined) {
			for (const [imported, name] of parseSpecifiers(match[2])) if (exported.has(imported)) mine.add(name)
		} else if (match[3]) mine.add(match[3])
		else for (const name of exported) mine.add(name)
	}
}

/** Uma passada sobre um arquivo de package; devolve se o conjunto de exports dele cresceu. */
function propagateFile(file: string, hit: KeyHit, tree: SourceTree, readUnits: UnitReader, resolve: Resolver, taintedExports: TaintedExports): boolean {
	const source = tree.get(file) as string
	const units = readUnits(file)
	const taint: Taint = { units: new Set(), locals: new Set() }

	if (file === hit.file) seedHit(hit, source, units, taint)
	addImportedLocals(file, source, taint.locals, resolve, taintedExports)
	growTaintToFixpoint(source, units, taint)

	const mine = taintedExports.get(file) as Set<string>
	const before = mine.size
	for (const unit of taint.units) for (const name of unit.exportsAs) mine.add(name)
	addLocalExportList(source, taint.locals, mine)
	addReexports(file, source, mine, resolve, taintedExports)
	return mine.size !== before
}

/**
 * Ponto fixo entre os arquivos dos packages: repete as passadas até nenhum conjunto crescer.
 * Cada passada visita todos os arquivos, na ordem da árvore, e já enxerga o que os anteriores
 * da mesma passada acrescentaram.
 */
function propagateTaintedExports(hit: KeyHit, tree: SourceTree, readUnits: UnitReader, resolve: Resolver): TaintedExports {
	const packageFiles = [...tree.keys()].filter((file) => file.startsWith("packages/") && !isTestFile(file))
	const taintedExports: TaintedExports = new Map(packageFiles.map((file) => [file, new Set<string>()]))

	let changed = true
	while (changed) {
		changed = false
		for (const file of packageFiles) if (propagateFile(file, hit, tree, readUnits, resolve, taintedExports)) changed = true
	}
	return taintedExports
}

/** O arquivo de app importa, como valor, algum export de entry que chega à chave. */
function isAppWriter(source: string, entryBySpecifier: Map<string, string>, taintedExports: TaintedExports): boolean {
	let writes = false
	for (const match of source.matchAll(IMPORT)) {
		if (match[1]) continue
		const exported = findReachingExports(entryBySpecifier.get(match[5] as string), taintedExports)
		if (!exported) continue
		const names = parseSpecifiers(match[3] ?? "").map(([imported]) => imported)
		if (match[2]) names.push("default")
		if (match[4] || names.some((name) => exported.has(name))) writes = true
	}
	for (const match of source.matchAll(DYNAMIC_IMPORT)) {
		if (findReachingExports(entryBySpecifier.get(match[1] as string), taintedExports)) writes = true
	}
	return writes
}

/** Arquivos de app (fora de teste) que importam um export contaminado. */
function collectWriters(tree: SourceTree, entryBySpecifier: Map<string, string>, taintedExports: TaintedExports): Set<string> {
	const writers = new Set<string>()
	for (const [file, source] of tree) {
		if (!isAppFile(file) || isTestFile(file)) continue
		if (isAppWriter(source, entryBySpecifier, taintedExports)) writers.add(file)
	}
	return writers
}

/**
 * Resolve chave de package → apps que a gravam.
 *
 * Propaga, pelo grafo de import dos packages, quais EXPORTS chegam à declaração que usa a
 * chave: a função que contém a chave, as funções do mesmo módulo que a chamam, os módulos
 * que importam essas funções e as reexportam, até os pontos de entrada do `exports` do
 * `package.json`. Depois conta só os arquivos de app que importam um desses exports como
 * VALOR — `import type`, `type X` dentro das chaves e os demais exports do mesmo
 * entry (`safeRedirect` ao lado do `useLoginRateLimiter`) não contam.
 */
function resolvePackageKey(hit: KeyHit, tree: SourceTree, packages: PackageManifest[], readUnits: UnitReader): Set<string> {
	const entryBySpecifier = mapEntriesBySpecifier(packages)
	const taintedExports = propagateTaintedExports(hit, tree, readUnits, createResolver(entryBySpecifier, tree))
	return collectWriters(tree, entryBySpecifier, taintedExports)
}

/** Chave (ou prefixo fixo de chave em template) → arquivos que a gravam. */
export function collectStorageKeys(tree: SourceTree, packages: PackageManifest[]): Map<string, Set<string>> {
	const found = new Map<string, Set<string>>()
	const add = (key: string, file: string) => {
		const files = found.get(key) ?? new Set<string>()
		files.add(file)
		found.set(key, files)
	}
	const readUnits = createUnitReader(tree)

	for (const [file, source] of tree) {
		if (file.includes("routeTree.gen.ts")) continue
		// Teste não grava nada no navegador de ninguém — e o próprio guard, que cita as
		// formas de chave nos comentários, se acusaria.
		if (isTestFile(file)) continue
		for (const hit of findKeys(file, source)) {
			add(hit.key, hit.file)
			if (!isAppFile(file)) for (const writer of resolvePackageKey(hit, tree, packages, readUnits)) add(hit.key, writer)
		}
	}
	return found
}

/** Lê do disco a árvore que o guard varre: `apps/*\/src` e `packages/*\/src`. */
export async function loadSourceTree(root: string): Promise<{ tree: SourceTree; packages: PackageManifest[] }> {
	const tree: SourceTree = new Map()
	for (const pattern of ["apps/*/src/**/*.ts", "apps/*/src/**/*.tsx", "packages/*/src/**/*.ts", "packages/*/src/**/*.tsx"]) {
		for await (const file of new Glob(pattern).scan({ cwd: root })) tree.set(file, await Bun.file(`${root}/${file}`).text())
	}

	const packages: PackageManifest[] = []
	for await (const manifest of new Glob("packages/*/package.json").scan({ cwd: root })) {
		const json = (await Bun.file(`${root}/${manifest}`).json()) as { name?: string; exports?: Record<string, unknown> }
		if (!json.name || !json.exports) continue
		const exports: Record<string, string> = {}
		for (const [subpath, target] of Object.entries(json.exports)) {
			const file = typeof target === "string" ? target : ((target as Record<string, unknown>)?.import ?? (target as Record<string, unknown>)?.default)
			if (typeof file === "string") exports[subpath] = file
		}
		packages.push({ name: json.name, dir: manifest.slice(0, manifest.lastIndexOf("/")), exports })
	}
	return { tree, packages }
}
