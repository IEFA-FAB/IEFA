#!/usr/bin/env bun
/**
 * `apps/<app>/.env` a partir do AWS Secrets Manager — a MESMA fonte que a produção lê.
 *
 * Por quê: cada worktree nova nascia sem `.env`, e o valor certo só existia nos secrets do
 * GitHub (ilegíveis) e no Secrets Manager (`/iefa/prod/<app>`, que o ECS injeta nas tasks).
 * Copiar `.env` à mão entre checkouts fazia dev e prod divergirem sem ninguém ver. Aqui o
 * `.env` local é derivado do secret de produção, e o que só existe em dev (conta do e2e,
 * cozinha sentinela) vem de uma sobreposição opcional em `/iefa/dev/<app>`.
 *
 *   bun run env:pull                  # todas as apps do manifesto
 *   bun run env:pull sisub forms      # só essas (chave do apps.manifest.json)
 *   bun run env:pull --if-missing     # só onde ainda não há .env (é o que o `prepare` roda)
 *   bun run env:pull --force          # sobrescreve .env escrito à mão (guarda cópia em .env.backup.local)
 *
 * Regras:
 *   - Só sobrescreve `.env` que ELE gerou (cabeçalho abaixo). Um `.env` escrito à mão fica
 *     intocado sem `--force`. Ajuste local vai em `.env.local`, que o Bun e o Vite leem por cima.
 *   - Chave vazia no secret é chave AUSENTE aqui: o secret guarda "" para opcional desligado
 *     (o ECS exige todas as chaves), e `KEY=` no `.env` não é a mesma coisa que não ter a chave.
 *   - Sem AWS CLI, sem credencial ou em CI, `--if-missing` sai 0 com uma linha de aviso: o
 *     `bun install` de quem não tem acesso à AWS não pode quebrar por isso.
 *   - Nenhum valor é impresso. O arquivo sai com permissão 600.
 *
 * ATENÇÃO: o resultado são credenciais de PRODUÇÃO no disco (banco, service role). As suítes
 * de teste já ignoram o `.env` sem a flag de cada uma (ver CLAUDE.md, "armadilha FECHADA").
 */

import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs"

/** Conteúdo atual do arquivo, ou `null` se não existe — uma leitura só, sem checar antes. */
function readIfPresent(path: string): string | null {
	try {
		return readFileSync(path, "utf8")
	} catch {
		return null
	}
}

import { join, resolve } from "node:path"

const ROOT = resolve(import.meta.dir, "..")
const HEADER = "# GERADO por `bun run env:pull`"
// biome-ignore lint/suspicious/noUndeclaredEnvVars: script avulso, fora do grafo de tarefas do turbo
const REGION = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "sa-east-1"

type ManifestApp = { key: string; path: string; aliasOf?: string }

const args = process.argv.slice(2)
const ifMissing = args.includes("--if-missing")
const force = args.includes("--force")
const quiet = args.includes("--quiet")
const only = new Set(args.filter((a) => !a.startsWith("--")))

function log(message: string) {
	if (!quiet) console.log(message)
}

/** Uma linha só, sempre visível: é o que diz ao dev por que o `.env` não apareceu. */
function hint(message: string) {
	console.warn(`[env:pull] ${message}`)
}

function apps(): ManifestApp[] {
	const manifest = JSON.parse(readFileSync(join(ROOT, "apps.manifest.json"), "utf8")) as { apps: ManifestApp[] }
	// Alias (ex.: `5s` → forms) é outro deploy do MESMO diretório: o `.env` local é o da app de origem.
	return manifest.apps.filter((a) => !a.aliasOf && (only.size === 0 || only.has(a.key)))
}

type SecretResult = { ok: true; values: Record<string, string> } | { ok: false; reason: "missing" | "denied" | "no-cli" | "error"; detail: string }

async function readSecret(id: string): Promise<SecretResult> {
	let proc: ReturnType<typeof Bun.spawn>
	try {
		proc = Bun.spawn(["aws", "secretsmanager", "get-secret-value", "--secret-id", id, "--region", REGION, "--query", "SecretString", "--output", "text"], {
			stdout: "pipe",
			stderr: "pipe",
			timeout: 20_000,
		})
	} catch (error) {
		return { ok: false, reason: "no-cli", detail: String(error) }
	}
	const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
	if (exitCode !== 0) {
		if (/ResourceNotFoundException/.test(stderr)) return { ok: false, reason: "missing", detail: stderr.trim() }
		if (/AccessDenied|ExpiredToken|Unable to locate credentials|UnrecognizedClient|InvalidClientTokenId|token has expired|aws login/i.test(stderr)) {
			return { ok: false, reason: "denied", detail: stderr.trim().split("\n")[0] ?? "" }
		}
		return { ok: false, reason: "error", detail: stderr.trim().split("\n")[0] ?? "" }
	}
	try {
		return { ok: true, values: JSON.parse(stdout) as Record<string, string> }
	} catch {
		return { ok: false, reason: "error", detail: `${id} não é JSON` }
	}
}

/**
 * Valor para `.env` que volta IGUAL no `process.env`. Medido no Bun: ele expande `$VAR` até
 * entre aspas simples e não desfaz `\"` — aspas duplas com escape trocavam a senha de um
 * `SISUB_DATABASE_URL` com `$` por outra, e o login falhava sem causa aparente. Aspas simples
 * com `$` escapado (`\$`) preservam tudo; o Vite (dotenv-expand) lê `\$` do mesmo jeito.
 *
 * A barra invertida NÃO é escapada de propósito: o Bun não desfaz `\\` entre aspas simples, e
 * escapá-la dobraria a barra no valor lido (medido). Sem forma segura, e por isso `null` (a
 * chave é pulada com aviso): valor com aspa simples, ou terminado em barra invertida — ela
 * escaparia a aspa de fechamento.
 */
function formatValue(value: string): string | null {
	if (/^[\w@%+=:,./~-]*$/.test(value)) return value
	if (value.includes("'") || value.endsWith("\\")) return null
	return `'${value.split("$").join("\\$")}'`
}

function render(app: ManifestApp, values: Record<string, string>, sources: string[]): string {
	const lines = [
		`${HEADER} a partir do AWS Secrets Manager (${sources.join(" + ")}).`,
		"# Não edite: a próxima execução sobrescreve. Ajuste só desta máquina vai em .env.local.",
		`# App: ${app.key} · gerado em ${new Date().toISOString()}`,
		"",
	]
	for (const key of Object.keys(values).toSorted()) {
		const value = values[key]
		if (value == null || value === "") continue
		const formatted = formatValue(String(value))
		if (formatted == null) {
			hint(`${app.key}: ${key} tem aspa simples e não tem forma segura no .env — pulada; defina-a em .env.local`)
			continue
		}
		lines.push(`${key}=${formatted}`)
	}
	return `${lines.join("\n")}\n`
}

async function main(): Promise<number> {
	// CI e build de imagem (sem .git no contexto) não têm o que puxar: o env deles vem do runner/ECS.
	if (ifMissing && (process.env.CI || !existsSync(join(ROOT, ".git")))) return 0

	const targets = apps()
	if (only.size > 0) {
		const unknown = [...only].filter((k) => !targets.some((a) => a.key === k))
		if (unknown.length > 0) {
			hint(`app desconhecida no apps.manifest.json: ${unknown.join(", ")}`)
			return 1
		}
	}

	// As leituras vão em paralelo (duas por app, ~1s cada pela CLI); a escrita segue em ordem.
	const pending = targets.filter((app) => {
		const envPath = join(ROOT, app.path, ".env")
		return !(ifMissing && existsSync(envPath))
	})
	const fetched = new Map(
		await Promise.all(
			pending.map(async (app) => [app.key, await Promise.all([readSecret(`/iefa/prod/${app.key}`), readSecret(`/iefa/dev/${app.key}`)])] as const)
		)
	)

	let written = 0
	let failed = 0
	for (const app of pending) {
		const envPath = join(ROOT, app.path, ".env")
		const current = readIfPresent(envPath)
		const exists = current != null
		if (ifMissing && exists) continue
		const managed = current?.startsWith(HEADER) ?? false
		if (exists && !managed && !force) {
			log(`• ${app.key}: .env escrito à mão — mantido (use --force para trocar pelo do Secrets Manager)`)
			continue
		}

		const [prod, dev] = fetched.get(app.key) ?? []
		if (!prod || !dev) continue
		if (!prod.ok) {
			if (prod.reason === "missing") {
				log(`• ${app.key}: sem secret /iefa/prod/${app.key} — nada a gerar`)
				continue
			}
			const why =
				prod.reason === "no-cli"
					? "AWS CLI não encontrado (instale o awscli2)"
					: prod.reason === "denied"
						? `sem credencial AWS válida (rode \`aws login\`): ${prod.detail}`
						: prod.detail
			hint(`${app.key}: ${why}`)
			// Sem acesso à AWS nenhuma app vai dar certo: um aviso basta.
			if (prod.reason !== "error") return ifMissing ? 0 : 1
			failed++
			continue
		}

		// Sobreposição dev que EXISTE mas não foi lida: gravar só com o de prod deixaria um .env
		// "gerado" sem as chaves de dev, e o `--if-missing` nunca voltaria a ele.
		if (!dev.ok && dev.reason !== "missing") {
			hint(`${app.key}: /iefa/dev/${app.key} não pôde ser lido (${dev.detail}) — .env não gravado`)
			failed++
			continue
		}

		const sources = [`/iefa/prod/${app.key}`]
		let values = prod.values
		if (dev.ok) {
			values = { ...values, ...dev.values }
			sources.push(`/iefa/dev/${app.key}`)
		}

		// `.env.backup.local` casa com `.env.*.local` do .gitignore: a cópia nunca vai para o git.
		if (exists && !managed) renameSync(envPath, join(ROOT, app.path, ".env.backup.local"))
		writeFileSync(envPath, render(app, values, sources), { mode: 0o600 })
		chmodSync(envPath, 0o600)
		written++
		log(`✓ ${app.key}: ${app.path}/.env (${sources.join(" + ")})`)
	}

	if (written > 0 || failed > 0) log(`env:pull — ${written} gerado(s), ${failed} com erro`)
	return failed > 0 && !ifMissing ? 1 : 0
}

process.exit(await main())
