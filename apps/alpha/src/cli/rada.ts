#!/usr/bin/env bun
/**
 * RADA-e: coleta na intranet do COMAER e conversão para o corpus do α.
 *
 * ─── Por que é um CLI, e local ────────────────────────────────────────────────
 * A intranet do COMAER não é alcançável de fora. Não existe versão disto que rode
 * no ECS, em Actions ou em cron: só na máquina de quem está conectado à rede. Daí
 * ser script sob demanda, que se recusa a rodar em CI — lá ele só poderia falhar,
 * ou passar por engano contra outra coisa.
 *
 * ─── Dois modos, porque o acesso é intermitente ───────────────────────────────
 *   bun run rada:fetch    exige intranet. Lê o índice da DIREF, compara com o que
 *                         já está no acervo e baixa o que mudou.
 *   bun run rada:build    NÃO usa rede. Converte o acervo local em `knowledge/*.md`
 *                         para `bun run ingest:all`. É o que permite continuar o
 *                         trabalho depois de sair da rede.
 *
 * ─── O que não entra no git ───────────────────────────────────────────────────
 * Este repositório é PÚBLICO. O acervo é conteúdo interno da FAB e mora FORA da
 * árvore do repo (`RADA_ARCHIVE_DIR`, por padrão `~/rada-e`); o `knowledge/` gerado
 * é ignorado pelo git. O endereço do índice também não entra no código: vem de
 * `RADA_INDEX_URL`.
 */
import { createHash } from "node:crypto"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { pdfToSubmissionText } from "../extraction/to-text.ts"
import { parseRadaIndex, requireCompleteIndex } from "../ingest/rada-index.ts"

const ARCHIVE = process.env.RADA_ARCHIVE_DIR ?? join(homedir(), "rada-e")
const KNOWLEDGE = new URL("../../knowledge/", import.meta.url).pathname
const REQUEST_TIMEOUT_MS = 120_000

/** Uma entrada do acervo: o PDF no disco e de onde ele veio. */
interface CatalogEntry {
	letter: string
	title: string
	url: string
	kind: "portaria" | "module" | "submodule"
}

/** O que já foi convertido, para não gastar conversão em arquivo inalterado. */
interface BuildRecord {
	sha256: string
	file: string
	builtAt: string
}

function fail(message: string): never {
	console.error(`\n✖ ${message}\n`)
	process.exit(1)
}

function slug(value: string): string {
	return value
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 70)
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
	try {
		return JSON.parse(await readFile(path, "utf8")) as T
	} catch {
		return fallback
	}
}

/**
 * Markdown com o frontmatter que `markdown-ingest.ts` lê.
 *
 * `source` é o rótulo do documento, NÃO a URL: o valor vai para `metadata` de todo
 * chunk, que sai em resposta de API — endereço de intranet não é para sair dali.
 */
function toMarkdown(entry: CatalogEntry, text: string, sha256: string): string {
	const source = entry.kind === "submodule" ? `RADA-e Módulo ${entry.letter} — ${entry.title}` : `RADA-e Módulo ${entry.letter}`
	return [
		"---",
		`source: ${source}`,
		"document_type: RADA",
		`title: ${entry.title}`,
		`year: ${new Date().getUTCFullYear()}`,
		"---",
		"",
		`# ${source}`,
		"",
		`<!-- origem: acervo local do RADA-e, sha256 ${sha256.slice(0, 16)} -->`,
		"",
		text,
		"",
	].join("\n")
}

/** Converte o acervo local em `knowledge/*.md`. Não toca a rede. */
async function build(): Promise<void> {
	const catalog = await readJson<Record<string, CatalogEntry>>(join(ARCHIVE, "meta/catalog.json"), {})
	if (Object.keys(catalog).length === 0)
		fail(`acervo vazio ou sem catálogo em ${ARCHIVE}/meta/catalog.json — rode 'bun run rada:fetch --apply' conectado à intranet.`)

	const built = await readJson<Record<string, BuildRecord>>(join(KNOWLEDGE, ".rada-build.json"), {})
	await mkdir(KNOWLEDGE, { recursive: true })

	const pdfs = (await readdir(join(ARCHIVE, "pdf"))).filter((f) => f.endsWith(".pdf")).sort()
	const created: string[] = []
	const unchanged: string[] = []
	const attention: string[] = []

	for (const name of pdfs) {
		const entry = catalog[name]
		if (!entry) {
			// Sem catálogo não há título nem origem, e frontmatter inventado vira norma
			// com procedência errada na base.
			attention.push(`${name} — fora do catálogo, sem título nem origem`)
			continue
		}

		const bytes = new Uint8Array(await readFile(join(ARCHIVE, "pdf", name)))
		const sha256 = createHash("sha256").update(bytes).digest("hex")
		if (built[name]?.sha256 === sha256) {
			unchanged.push(`${entry.letter} ${entry.title}`)
			continue
		}

		const { text } = await pdfToSubmissionText(bytes)
		if (text.trim().length === 0) {
			// PDF digitalizado sem camada de texto. Ingerir daria documento vazio na base,
			// que é pior do que não ter o documento: some do "sem base" e vira ruído.
			attention.push(`${entry.letter} ${entry.title} — PDF sem texto extraível (digitalizado?)`)
			continue
		}

		const file = `rada-${entry.letter.toLowerCase()}-${slug(entry.title)}.md`
		await writeFile(join(KNOWLEDGE, file), toMarkdown(entry, text, sha256), "utf8")
		built[name] = { sha256, file, builtAt: new Date().toISOString() }
		created.push(`${entry.letter} ${entry.title} (${text.length} caracteres)`)
	}

	await writeFile(join(KNOWLEDGE, ".rada-build.json"), `${JSON.stringify(built, null, 2)}\n`, "utf8")
	report({ "✔  Convertidos": created, "•  Sem mudança": unchanged, "⚠  Precisam de atenção": attention })
	console.log(`Acervo: ${ARCHIVE}\nPróximo passo: bun run ingest:all\n`)
}

/** Baixa do índice da DIREF o que mudou. Exige intranet. */
async function fetchFromIntranet(apply: boolean, insecureTls: boolean): Promise<void> {
	const indexUrl = process.env.RADA_INDEX_URL
	if (!indexUrl) fail("defina RADA_INDEX_URL com o endereço do índice do RADA-e (ver .env.schema).")

	const request = (url: string, init: RequestInit = {}) =>
		fetch(url, { ...init, ...(insecureTls ? { tls: { rejectUnauthorized: false } } : {}), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })

	let html: string
	try {
		const response = await request(indexUrl, { redirect: "follow" })
		if (!response.ok) fail(`índice respondeu HTTP ${response.status}. Conectado à intranet?`)
		html = await response.text()
	} catch (error) {
		fail(`não foi possível ler o índice: ${error instanceof Error ? error.message : String(error)}. Conectado à intranet?`)
	}

	const modules = requireCompleteIndex(parseRadaIndex(html, indexUrl))
	const catalog = await readJson<Record<string, CatalogEntry>>(join(ARCHIVE, "meta/catalog.json"), {})
	const known = new Map(Object.entries(catalog).map(([file, entry]) => [entry.url, file]))

	await mkdir(join(ARCHIVE, "pdf"), { recursive: true })
	await mkdir(join(ARCHIVE, "meta"), { recursive: true })

	const changed: string[] = []
	const unchanged: string[] = []
	const attention: string[] = []

	for (const module of modules) {
		let head: Response
		try {
			head = await request(module.url, { method: "HEAD", redirect: "follow" })
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error)
			// Quatro hosts do RADA-e servem certificado autoassinado, dois deles vencidos.
			// Sem --insecure-tls esses módulos são REPORTADOS, nunca omitidos em silêncio.
			attention.push(`${module.letter} — ${/certificate|tls|ssl/i.test(reason) ? `certificado não confiável: ${reason}` : reason}`)
			continue
		}

		if (!head.ok) {
			attention.push(`${module.letter} — HTTP ${head.status}`)
			continue
		}
		if (!(head.headers.get("content-type") ?? "").includes("pdf")) {
			// Cinco módulos não são arquivo: são a página de outro sistema (SISCONTAER,
			// DIRAD, SISPNR, SISHT, SISTRAN), cada uma com dezenas de PDFs e um layout
			// próprio. O segundo salto é trabalho por sistema, não um genérico.
			attention.push(`${module.letter} — página de outro sistema, segundo salto manual: ${module.url}`)
			continue
		}

		const file = known.get(module.url) ?? `${module.letter}-${slug(module.title)}.pdf`
		if (!apply) {
			changed.push(`${module.letter} ${module.title} → ${file}`)
			continue
		}

		const response = await request(module.url, { redirect: "follow" })
		if (!response.ok) {
			attention.push(`${module.letter} — download HTTP ${response.status}`)
			continue
		}

		const bytes = new Uint8Array(await response.arrayBuffer())
		const sha256 = createHash("sha256").update(bytes).digest("hex")
		const current = await readFile(join(ARCHIVE, "pdf", file)).catch(() => null)
		if (current && createHash("sha256").update(current).digest("hex") === sha256) {
			unchanged.push(`${module.letter} ${module.title}`)
			continue
		}

		await writeFile(join(ARCHIVE, "pdf", file), bytes)
		catalog[file] = { letter: module.letter, title: module.title, url: module.url, kind: "module" }
		changed.push(`${module.letter} ${module.title} (${(bytes.byteLength / 1048576).toFixed(1)} MB)`)
	}

	if (apply) await writeFile(join(ARCHIVE, "meta/catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`, "utf8")
	report({ [apply ? "⬇  Baixados" : "⬇  Mudaram (baixaria)"]: changed, "•  Sem mudança": unchanged, "⚠  Precisam de atenção": attention })
	console.log(apply ? "Próximo passo: bun run rada:build\n" : "Nada foi escrito. Rode com --apply.\n")
}

/**
 * Baixa o que ficou faltando numa coleta anterior.
 *
 * O acesso à intranet é intermitente — cair no meio de uma coleta é o caso normal, não a
 * exceção. `meta/pendencias.tsv` registra o que faltou (uma linha por item: tipo, origem,
 * rótulo, URL), e este modo o consome. Item baixado sai da lista; o que falhar de novo
 * permanece, para a próxima sessão.
 */
async function fetchPending(insecureTls: boolean): Promise<void> {
	const listPath = join(ARCHIVE, "meta/pendencias.tsv")
	const raw = await readFile(listPath, "utf8").catch(() => null)
	if (!raw) fail(`sem lista de pendências em ${listPath} — nada a recuperar.`)

	const rows = raw
		.split("\n")
		.map((line) => line.split("\t"))
		.filter((cols): cols is [string, string, string, string] => cols.length === 4 && cols[3].startsWith("http"))

	const done: string[] = []
	const stillPending: string[][] = []

	for (const [kind, origin, label, url] of rows) {
		const dir = kind === "zip" ? "zip" : "pdf"
		const file = `${origin}-${slug(label)}.${kind === "zip" ? "zip" : "pdf"}`
		try {
			const response = await fetch(url, {
				redirect: "follow",
				...(insecureTls ? { tls: { rejectUnauthorized: false } } : {}),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			})
			if (!response.ok) throw new Error(`HTTP ${response.status}`)

			const bytes = new Uint8Array(await response.arrayBuffer())
			// Servidor de intranet responde 200 com página de erro. Um PDF começa por
			// `%PDF-`; sem esta conferência a pendência sairia da lista sem ter sido baixada.
			if (dir === "pdf" && new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("resposta não é PDF")

			await mkdir(join(ARCHIVE, dir), { recursive: true })
			await writeFile(join(ARCHIVE, dir, file), bytes)
			done.push(`${origin} ${label} (${(bytes.byteLength / 1048576).toFixed(1)} MB)`)
		} catch (error) {
			stillPending.push([kind, origin, label, url])
			console.error(`   ✖ ${origin} ${label}: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	await writeFile(listPath, stillPending.map((cols) => cols.join("\t")).join("\n") + (stillPending.length ? "\n" : ""), "utf8")
	report({ "⬇  Recuperados": done, "⚠  Ainda pendentes": stillPending.map(([, origin, label]) => `${origin} ${label}`) })
}

function report(sections: Record<string, string[]>): void {
	console.log("")
	for (const [label, lines] of Object.entries(sections)) {
		if (lines.length === 0) continue
		console.log(`${label} (${lines.length})`)
		for (const line of lines) console.log(`   ${line}`)
		console.log("")
	}
}

async function main(): Promise<void> {
	if (process.env.CI) fail("coletor local por construção: a intranet do COMAER não é alcançável de CI.")

	const [command, ...rest] = process.argv.slice(2)
	const flags = new Set(rest)

	if (command === "build") return await build()
	if (command === "fetch") {
		if (flags.has("--pending")) return await fetchPending(flags.has("--insecure-tls"))
		return await fetchFromIntranet(flags.has("--apply"), flags.has("--insecure-tls"))
	}
	fail("uso: rada.ts build | fetch [--apply | --pending] [--insecure-tls]")
}

await main()
