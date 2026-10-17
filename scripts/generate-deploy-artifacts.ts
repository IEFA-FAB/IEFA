#!/usr/bin/env bun
/**
 * Gera Dockerfile, docker-bake.hcl e .github/paths-filter.yml a partir de
 * `apps.manifest.json` + o grafo de dependências de workspace lido dos
 * package.json. O deploy.yml não é gerado: ele lê o manifesto em tempo de execução
 * (`scripts/release-plan.ts` e `scripts/release-verify.ts`).
 *
 * Motivo: adicionar um app (ou um package compartilhado) exigia editar as mesmas
 * listas à mão em três arquivos. Elas divergiam em silêncio e o modo de falha era
 * ruim dos dois lados — package faltando no COPY quebra o build da imagem; package
 * faltando no paths-filter faz o app NÃO redeployar quando o código dele muda.
 *
 * `bun run generate:deploy` reescreve; `bun run check:deploy` confere no CI.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..")
const GENERATED_BANNER = "GERADO por scripts/generate-deploy-artifacts.ts a partir de apps.manifest.json — não editar à mão."

type App = {
	key: string
	filterKey?: string
	title?: string
	workspace?: string
	path: string
	/**
	 * `dockerfile`: imagem de terceiro empacotada por um Dockerfile próprio em
	 * `<path>/Dockerfile`, fora do monorepo Bun (sem workspace, sem estágio `deps`).
	 * Não entra no Dockerfile raiz e o paths-filter só olha a própria pasta.
	 */
	kind?: "nitro" | "bun-bundle" | "dockerfile"
	port?: number
	entry?: string
	buildArgs: string[]
	buildArgDefaults?: Record<string, string>
	buildArgComments?: Record<string, string>
	/**
	 * Segredos de build: entram como secret do BuildKit (`RUN --mount=type=secret`) no
	 * passo de build, expostos como variável de ambiente só durante aquele RUN. Nunca
	 * como ARG: ARG fica no histórico da imagem, na chave de cache e na proveniência.
	 * O id do secret é o nome da variável; o bake o lê da variável de ambiente homônima.
	 */
	buildSecrets?: string[]
	buildSecretComments?: Record<string, string>
	runtimeEnv?: Record<string, string>
	/** bun-bundle: o app tem `public/` versionado, que vai para a imagem ao lado do `dist/`. */
	copyPublic?: boolean
	runtimeFrom?: "base"
	outputAt?: string
	aliasOf?: string
	notes?: string
	/** GitHub Variable com a URL do smoke test depois do rollout no ECS. Ausente → sem smoke test. */
	healthUrlVar?: string
	/**
	 * Tarefas de turbo (`<workspace>#<tarefa>`) que liberam o deploy do app no push da `main`.
	 * Padrão: lint, typecheck e test do próprio workspace; app de kind `dockerfile` não tem nenhuma.
	 */
	check?: string[]
	/** `static-site`: publicado como site estático (jobs `docs-*` do deploy.yml), fora da matriz do ECS. */
	release?: "ecs" | "static-site"
	buildTimeoutMinutes?: number
	bakeAttemptTimeoutMinutes?: number
	/** Build arg → GitHub Variable de onde ele sai, quando o nome difere (o rumaer usa as vars do sisub). */
	buildArgFrom?: Record<string, string>
	/** Build args que podem sair vazios (o Faro desligado vira no-op); os outros falham o build. */
	optionalBuildArgs?: string[]
}

export type { App }

type Manifest = {
	/** Imagem dos estágios de build e do runtime dos apps Nitro. */
	bunImage: string
	/**
	 * Runtime dos serviços `bun-bundle`: distroless, sem shell nem gerenciador de pacotes. Tem de
	 * estar na mesma versão do Bun que `bunImage`, que é quem gera o bundle.
	 */
	bunRuntimeImage: string
	registryDefaults: { registry: string; repositoryPrefix: string }
	apps: App[]
}

export const manifest: Manifest = JSON.parse(readFileSync(join(ROOT, "apps.manifest.json"), "utf8"))

/**
 * Nome do filtro do app no paths-filter (`sisub-mcp` é `mcp`, por histórico). Uma função só para
 * o gerador e o `release-plan.ts`: se divergirem, o plano não reconhece o filtro e o app para
 * de deployar em silêncio.
 */
export function filterKeyOf(app: App): string {
	return app.filterKey ?? app.key.replaceAll("-", "_")
}

/** O app de onde vem o build (o próprio, ou o `aliasOf`): é dele o `kind`. */
export function buildSourceOf(app: App): App {
	if (!app.aliasOf) return app
	const source = manifest.apps.find((a) => a.key === app.aliasOf)
	if (!source) throw new Error(`aliasOf inválido em ${app.key}`)
	return source
}

/**
 * Segredos que o target do bake tem de declarar: os do próprio app e, num alias, os do
 * estágio que ele reusa (o `--mount=type=secret` está no RUN desse estágio). Sem o
 * segundo, o alias buildaria sem o segredo em silêncio.
 */
export function bakeSecretsOf(app: App): string[] {
	const stage = app.aliasOf ? manifest.apps.find((a) => a.key === app.aliasOf) : undefined
	return [...new Set([...(stage?.buildSecrets ?? []), ...(app.buildSecrets ?? [])])]
}

/** Versão do Bun na tag (`oven/bun:1.4.0-alpine@sha256:…` → `1.4.0`). Confere a tag, não o digest. */
function parseBunVersion(image: string): string | undefined {
	return /^oven\/bun:(\d+\.\d+\.\d+)-/.exec(image)?.[1]
}

const buildBunVersion = parseBunVersion(manifest.bunImage)
if (buildBunVersion === undefined || buildBunVersion !== parseBunVersion(manifest.bunRuntimeImage)) {
	throw new Error("bunImage e bunRuntimeImage têm de estar na mesma versão do Bun: o bundle sai de uma e roda na outra")
}

/**
 * `packageManager` do package.json raiz é a fonte da versão do Bun: os workflows a leem por
 * `bun-version-file: package.json` no `setup-bun`, e as imagens do manifesto têm de estar na
 * mesma versão, senão o CI testa num Bun e a imagem roda noutro. Devolve um erro por imagem
 * divergente; vazio quando tudo bate.
 */
export function bunImageMismatches(packageManager: string | undefined, images: Record<string, string>): string[] {
	const expected = /^bun@(\d+\.\d+\.\d+)$/.exec(packageManager ?? "")?.[1]
	if (!expected) return [`packageManager do package.json raiz não é \`bun@<x.y.z>\`: ${packageManager ?? "(ausente)"}`]
	return Object.entries(images)
		.filter(([, image]) => parseBunVersion(image) !== expected)
		.map(([field, image]) => `${field} (${image}) não está no Bun ${expected} do packageManager do package.json`)
}

function rootPackageManager(): string | undefined {
	return JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).packageManager
}

for (const app of manifest.apps) {
	if (!app.aliasOf && app.kind !== "nitro" && app.kind !== "bun-bundle" && app.kind !== "dockerfile") {
		throw new Error(`${app.key}: kind obrigatório (nitro, bun-bundle ou dockerfile)`)
	}
	if (app.kind === "bun-bundle" && app.entry !== `${app.path}/dist/index.js`) {
		throw new Error(`${app.key}: entry de bun-bundle é ${app.path}/dist/index.js (saída do \`bun run build\`)`)
	}
	if (!app.buildSecrets?.length) continue
	// O secret é montado no RUN de build do estágio do próprio app: Dockerfile próprio
	// (kind dockerfile) e alias (reusa outro estágio) não têm onde montá-lo.
	if (app.aliasOf || (app.kind !== "nitro" && app.kind !== "bun-bundle")) {
		throw new Error(`${app.key}: buildSecrets só vale para app kind nitro/bun-bundle sem aliasOf (é montado no RUN de build)`)
	}
}

// ---------------------------------------------------------------------------
// Grafo de workspaces
// ---------------------------------------------------------------------------

type Workspace = { name: string; dir: string; deps: string[] }

function readWorkspaces(): Map<string, Workspace> {
	const out = new Map<string, Workspace>()
	for (const group of ["apps", "packages"]) {
		for (const entry of readdirSync(join(ROOT, group), { withFileTypes: true })) {
			if (!entry.isDirectory()) continue
			const dir = `${group}/${entry.name}`
			let pkg: { name?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
			try {
				pkg = JSON.parse(readFileSync(join(ROOT, dir, "package.json"), "utf8"))
			} catch {
				continue // diretório sem package.json não é workspace
			}
			if (!pkg.name) continue
			const deps = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })
				.filter(([, spec]) => String(spec).startsWith("workspace:"))
				.map(([name]) => name)
			out.set(pkg.name, { name: pkg.name, dir, deps })
		}
	}
	return out
}

const workspaces = readWorkspaces()
const byName = (name: string) => {
	const ws = workspaces.get(name)
	if (!ws) throw new Error(`workspace desconhecido: ${name}`)
	return ws
}

/** Packages de workspace que o app precisa, transitivamente, em ordem estável. */
function packageDepsOf(workspaceName: string): string[] {
	const seen = new Set<string>()
	const walk = (name: string) => {
		for (const dep of byName(name).deps) {
			if (seen.has(dep)) continue
			seen.add(dep)
			walk(dep)
		}
	}
	walk(workspaceName)
	return [...seen]
		.map((n) => byName(n).dir)
		.filter((dir) => dir.startsWith("packages/"))
		.sort()
}

const deployableApps = manifest.apps.filter((a) => !a.aliasOf)
/** Apps construídos a partir do Dockerfile raiz (o monorepo Bun). */
const monorepoApps = deployableApps.filter((a) => a.kind !== "dockerfile")

// ---------------------------------------------------------------------------
// Dockerfile
// ---------------------------------------------------------------------------

function assetCheck(appPath: string, serverEntry: string) {
	return `RUN grep -oE '"(/assets/[^"]+\\.(css|js))"' ${serverEntry} \\
    | tr -d '"' \\
    | sort -u \\
    | while read asset; do \\
        if [ ! -f "${appPath}/.output/public\${asset}" ]; then \\
          echo "❌ Asset referenced by server but missing from public: \${asset}"; exit 1; \\
        fi; \\
      done \\
    && echo "✅ All server-referenced assets present in public/"`
}

function buildArgLines(app: App) {
	const lines: string[] = []
	for (const arg of app.buildArgs) {
		const comment = app.buildArgComments?.[arg]
		if (comment) for (const line of comment.split("\n")) lines.push(`# ${line}`)
		lines.push(`ARG ${arg}`)
	}
	for (const [arg, value] of Object.entries(app.buildArgDefaults ?? {})) lines.push(`ARG ${arg}=${value}`)
	return lines
}

/** Prefixo `--mount=type=secret` do RUN de build, um por segredo; vazio sem segredo. */
function secretMounts(app: App) {
	return (app.buildSecrets ?? []).map((id) => `--mount=type=secret,id=${id},env=${id} `).join("")
}

function buildSecretCommentLines(app: App) {
	return (app.buildSecrets ?? []).flatMap((id) =>
		(app.buildSecretComments?.[id] ?? "")
			.split("\n")
			.filter(Boolean)
			.map((l) => `# ${l}`)
	)
}

function header(title: string, extra?: string) {
	const sep = "=".repeat(77)
	const notes = extra ? extra.split("\n").map((l) => `# ${l}`) : []
	return [`# ${sep}`, `# ${title}`, ...notes, `# ${sep}`].join("\n")
}

function dockerStage(app: App) {
	const copies = packageDepsOf(app.workspace as string).map((dir) => `COPY ${dir} ./${dir}`)
	const out: string[] = [header(app.title ?? app.key, app.notes), `FROM deps AS ${app.key}-build`]
	out.push(...buildArgLines(app))
	out.push(...copies, `COPY ${app.path} ./${app.path}`)

	if (app.kind === "nitro") {
		const serverEntry = `${app.path}/.output/server/index.mjs`
		out.push(
			`RUN rm -rf ${app.path}/.vite ${app.path}/.tanstack ${app.path}/node_modules/.vite`,
			...buildSecretCommentLines(app),
			`RUN ${secretMounts(app)}bun --filter='${app.workspace}' run build`,
			`RUN test -f ${serverEntry} || \\\n    (echo "❌ Build failed: output missing" && exit 1)`,
			"",
			"# Confere que todo asset CSS/JS citado pelo bundle do servidor existe em public/.",
			"# Pega divergência de hash entre o build SSR e o do cliente ANTES da imagem subir.",
			assetCheck(app.path, serverEntry)
		)
		const outputAt = app.outputAt ?? ".output"
		// biome-ignore lint/suspicious/noTemplateCurlyInString: `${BUN_IMAGE}` é interpolação de ARG do Dockerfile gerado, não template literal de JS
		const runtimeFrom = app.runtimeFrom === "base" ? "base" : "${BUN_IMAGE}"
		out.push("", `FROM ${runtimeFrom} AS ${app.key}`, "ENV NODE_ENV=production")
		for (const [k, v] of Object.entries(app.runtimeEnv ?? {})) out.push(`ENV ${k}=${v}`)
		if (app.runtimeFrom !== "base") out.push("WORKDIR /app")
		out.push(
			`COPY --from=${app.key}-build /app/${app.path}/.output ./${outputAt}`,
			"COPY docker/bun-serve-idle-timeout.ts ./docker/bun-serve-idle-timeout.ts",
			"USER bun",
			`EXPOSE ${app.port}`,
			// `--no-install`: o `.output` traz o próprio node_modules; o que faltar nele é bug do
			// build, não pacote para baixar do npm em produção.
			`CMD ["bun", "--no-install", "--preload", "./docker/bun-serve-idle-timeout.ts", "${outputAt.replace(/^\.\//, "")}/server/index.mjs"]`
		)
		return out.join("\n")
	}

	// bun-bundle: `bun build --target bun` inlina as dependências, então o runtime leva só o
	// `dist/` (e o `public/`, com `copyPublic`) numa imagem distroless: sem shell, sem apk e sem
	// node_modules. Os `.map` do `dist/` trazem o código-fonte (o repo é público) e dão o stack
	// trace em `.ts`; não há rota que sirva o `dist/`. `--no-install`: sem node_modules, o Bun liga o
	// auto-install, e um import de pacote ausente baixaria código do npm em produção.
	out.push(
		...buildSecretCommentLines(app),
		`RUN ${secretMounts(app)}bun --filter='${app.workspace}' run build`,
		`RUN test -f ${app.entry} || \\\n    (echo "❌ Build failed: output missing" && exit 1)`,
		"",
		`FROM \${BUN_RUNTIME_IMAGE} AS ${app.key}`,
		"ENV NODE_ENV=production"
	)
	for (const [k, v] of Object.entries(app.runtimeEnv ?? {})) out.push(`ENV ${k}=${v}`)
	out.push("WORKDIR /app", `COPY --from=${app.key}-build /app/${app.path}/dist ./${app.path}/dist`)
	if (app.copyPublic) out.push(`COPY --from=${app.key}-build /app/${app.path}/public ./${app.path}/public`)
	out.push("USER nonroot", `EXPOSE ${app.port}`, 'ENTRYPOINT ["/usr/local/bin/bun", "--no-install"]', `CMD ["${app.entry}"]`)
	return out.join("\n")
}

function renderDockerfile() {
	const workspaceDirs = [...workspaces.values()].map((w) => w.dir).sort()
	const parts = [
		header(
			"BASE - Alpine com Bun",
			`${GENERATED_BANNER}\nDigest centralizado no manifesto. Bump do Bun: packageManager do package.json + bunImage/bunRuntimeImage (o check:deploy confere).`
		),
		`ARG BUN_IMAGE=${manifest.bunImage}`,
		`ARG BUN_RUNTIME_IMAGE=${manifest.bunRuntimeImage}`,
		// biome-ignore lint/suspicious/noTemplateCurlyInString: `${BUN_IMAGE}` é interpolação de ARG do Dockerfile gerado, não template literal de JS
		"FROM ${BUN_IMAGE} AS base",
		"RUN apk add --no-cache libc6-compat",
		"WORKDIR /app",
		"",
		header("DEPS - Instala dependências uma vez para todo o monorepo"),
		"FROM base AS deps",
		"# Todos os workspaces declarados no bun.lock precisam estar presentes para",
		"# `--frozen-lockfile` validar a árvore sem regenerar o lockfile.",
		"COPY package.json bun.lock ./",
		...workspaceDirs.map((dir) => `COPY ${dir}/package.json ./${dir}/`),
		"RUN bun install --frozen-lockfile",
		"",
		...monorepoApps.flatMap((app) => [dockerStage(app), ""]),
	]
	return `${parts.join("\n").trimEnd()}\n`
}

// ---------------------------------------------------------------------------
// docker-bake.hcl
// ---------------------------------------------------------------------------

function renderBake() {
	const allArgs = [...new Set(manifest.apps.flatMap((a) => a.buildArgs))].sort()
	const targets = manifest.apps.map((a) => a.key)

	const lines = [
		`# ${GENERATED_BANNER}`,
		"",
		'variable "REGISTRY" {',
		`  default = "${manifest.registryDefaults.registry}"`,
		"}",
		"",
		'variable "REPOSITORY_PREFIX" {',
		`  default = "${manifest.registryDefaults.repositoryPrefix}"`,
		"}",
		"",
		'variable "TAG" {',
		'  default = "latest"',
		"}",
		"",
	]
	for (const arg of allArgs) lines.push(`variable "${arg}" {`, '  default = ""', "}", "")

	lines.push(
		'group "default" {',
		`  targets = [${targets.map((t) => `"${t}"`).join(", ")}]`,
		"}",
		"",
		'target "base" {',
		'  dockerfile = "Dockerfile"',
		'  context = "."',
		"}",
		"",
		"# Estágio `deps` compartilhado: instala dependências do monorepo uma vez.",
		"# Buildado isoladamente (job warm-deps) para popular o scope `deps` do cache gha.",
		"# Todos os targets de app leem desse scope → o `bun install` não é refeito por app",
		"# em cache frio.",
		'target "deps" {',
		'  inherits = ["base"]',
		'  target = "deps"',
		'  cache-from = ["type=gha,scope=deps"]',
		'  cache-to = ["type=gha,scope=deps,mode=max"]',
		"}",
		""
	)

	for (const app of manifest.apps) {
		if (app.kind === "dockerfile") {
			lines.push(
				`target "${app.key}" {`,
				`  context = "${app.path}"`,
				'  dockerfile = "Dockerfile"',
				`  tags = ["\${REGISTRY}/\${REPOSITORY_PREFIX}/${app.key}:\${TAG}"]`,
				`  cache-from = ["type=gha,scope=${app.key}"]`,
				`  cache-to = ["type=gha,scope=${app.key},mode=max"]`,
				"}",
				""
			)
			continue
		}
		const stage = app.aliasOf ?? app.key
		const args = {
			...Object.fromEntries(app.buildArgs.map((a) => [a, a])),
			...Object.fromEntries(Object.entries(app.buildArgDefaults ?? {}).map(([k, v]) => [k, `"${v}"`])),
		}
		const names = Object.keys(args)
		const width = names.length ? Math.max(...names.map((n) => n.length)) : 0
		lines.push(
			`target "${app.key}" {`,
			'  inherits = ["base"]',
			`  target = "${stage}"`,
			`  tags = ["\${REGISTRY}/\${REPOSITORY_PREFIX}/${app.key}:\${TAG}"]`,
			`  cache-from = ["type=gha,scope=deps", "type=gha,scope=${app.key}"]`,
			`  cache-to = ["type=gha,scope=${app.key},mode=max"]`
		)
		if (names.length) {
			lines.push("  args = {")
			for (const n of names) lines.push(`    ${n.padEnd(width)} = ${args[n]}`)
			lines.push("  }")
		}
		// Lido da variável de ambiente do processo do bake (o _release.yml a define a
		// partir do secret do GitHub). Ausente → o secret não é montado e o build segue.
		const secrets = bakeSecretsOf(app)
		if (secrets.length) {
			lines.push(`  secret = [${secrets.map((id) => `"id=${id},env=${id}"`).join(", ")}]`)
		}
		lines.push("}", "")
	}
	return `${lines.join("\n").trimEnd()}\n`
}

// ---------------------------------------------------------------------------
// .github/paths-filter.yml
// ---------------------------------------------------------------------------

/**
 * Arquivos de orquestração do deploy: mudam o pipeline de qualquer app, inclusive
 * os de kind `dockerfile`.
 */
const PIPELINE_TRIGGERS = [
	"docker-bake.hcl",
	"apps.manifest.json",
	".github/paths-filter.yml",
	".github/workflows/deploy.yml",
	".github/workflows/_release.yml",
	"scripts/generate-deploy-artifacts.ts",
	"scripts/release-plan.ts",
	"scripts/release-verify.ts",
	"scripts/release-build-env.ts",
]

/** Arquivos que reconstroem qualquer imagem do monorepo, então disparam todos os apps dele.
 * `bun.lock` entra porque patch transitivo (Dependabot de segurança) muda só ele: sem o
 * gatilho, a correção não chegava a produção até outro deploy do app. */
const GLOBAL_TRIGGERS = ["Dockerfile", ...PIPELINE_TRIGGERS, "package.json", "bun.lock", "turbo.json"]

function renderPathsFilter() {
	const lines = [
		`# ${GENERATED_BANNER}`,
		"#",
		"# Consumido por dorny/paths-filter no deploy.yml. As entradas de packages saem",
		"# do grafo de workspace de cada app, transitivamente — não precisa mexer aqui",
		"# quando um app passa a depender de um package novo.",
		"",
	]
	for (const app of manifest.apps) {
		const source = buildSourceOf(app)
		// Um app de kind `dockerfile` não usa o Dockerfile raiz, o bun.lock nem o turbo:
		// redeployar a cada mudança neles reconstruiria a imagem à toa.
		const paths =
			source.kind === "dockerfile"
				? [`${source.path}/**`, ...PIPELINE_TRIGGERS]
				: [`${source.path}/**`, ...packageDepsOf(source.workspace as string).map((d) => `${d}/**`), ...GLOBAL_TRIGGERS]
		// `filterKey` é o nome do filtro (sisub-mcp é `mcp`, por histórico); o release-plan.ts o
		// traduz de volta para a chave do app.
		lines.push(`${filterKeyOf(app)}:`)
		for (const p of paths) lines.push(`  - '${p}'`)
		lines.push("")
	}
	return `${lines.join("\n").trimEnd()}\n`
}

// ---------------------------------------------------------------------------

/** Sob demanda: o plan e o verify do deploy importam este módulo só pelo manifesto. */
export function renderArtifacts(): Array<[string, string]> {
	return [
		["Dockerfile", renderDockerfile()],
		["docker-bake.hcl", renderBake()],
		[".github/paths-filter.yml", renderPathsFilter()],
	]
}

if (import.meta.main) {
	const check = process.argv.includes("--check")
	let drift = false

	// Não há o que regenerar aqui: a imagem (tag + digest) se escolhe à mão. Falha nos dois modos.
	const bunMismatches = bunImageMismatches(rootPackageManager(), {
		bunImage: manifest.bunImage,
		bunRuntimeImage: manifest.bunRuntimeImage,
	})
	for (const message of bunMismatches) console.error(`❌ apps.manifest.json: ${message}`)
	if (bunMismatches.length) process.exit(1)

	for (const [file, content] of renderArtifacts()) {
		const path = join(ROOT, file)
		const current = (() => {
			try {
				return readFileSync(path, "utf8")
			} catch {
				return null
			}
		})()
		if (current === content) continue
		if (check) {
			console.error(`❌ ${file} está fora de sincronia com apps.manifest.json — rode \`bun run generate:deploy\``)
			drift = true
		} else {
			writeFileSync(path, content)
			console.log(`✅ ${file}`)
		}
	}

	if (check && drift) process.exit(1)
	if (check) console.log("✅ artefatos de deploy em sincronia com apps.manifest.json")
}
