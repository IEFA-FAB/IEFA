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
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join, resolve, sep } from "node:path"
import { pdfToSubmissionText } from "../extraction/to-text.ts"
import { OcrUnavailableError, ocrPdf } from "../ingest/pdf-ocr.ts"
import { stripPrintArtifacts } from "../ingest/print-artifacts.ts"
import { parseRadaIndex, requireCompleteIndex } from "../ingest/rada-index.ts"

/**
 * Expande `~` no início do caminho.
 *
 * O `.env.schema` documenta `~/rada-e`, e o shell não expande valor lido de arquivo: sem
 * isto, `RADA_ARCHIVE_DIR=~/rada-e` criava `apps/alpha/~/rada-e/` DENTRO da árvore do
 * repositório — que é público —, num caminho que nenhuma regra do `.gitignore` cobre. PDF
 * interno da FAB ficava a um `git add -A` de distância.
 */
export function expandHome(path: string): string {
	if (path === "~") return homedir()
	return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path
}

const ARCHIVE = expandHome(process.env.RADA_ARCHIVE_DIR ?? join(homedir(), "rada-e"))
const KNOWLEDGE = new URL("../../knowledge/", import.meta.url).pathname
const REQUEST_TIMEOUT_MS = 120_000

/**
 * Teto por arquivo. O maior módulo do RADA-e tem ~2 MB; 64 MB dá folga larga e ainda
 * impede que uma resposta inesperada — página de erro gigante, redirecionamento para um
 * arquivo alheio — encha o disco de quem coleta.
 */
const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024

/**
 * Versão do pipeline de conversão, gravada no registro de build ao lado do sha256.
 *
 * O sha256 é do PDF, e mudar o conversor não muda o PDF. Sem esta versão, um build
 * com regra de limpeza nova sairia "sem mudança" nos 92 arquivos e o corpus corrigido
 * nunca chegaria à base — a correção existiria no código e em lugar nenhum além dele.
 * Toda mudança que altere o markdown gerado incrementa aqui.
 *
 * 1 (implícito, sem o campo): extração crua, com cabeçalho e número de página.
 * 2: remoção de artefato de impressão (`ingest/print-artifacts.ts`).
 */
const PIPELINE_VERSION = 2

/** Um PDF começa por `%PDF-`. Servidor de intranet responde 200 com página de erro. */
function isPdf(bytes: Uint8Array): boolean {
	return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-"
}

/**
 * Corpo da resposta, recusando o que for grande demais.
 *
 * `Content-Length` é dica, não garantia: quem serve pode mentir ou omitir. Por isso o
 * tamanho é conferido depois de ler, contra o que realmente chegou.
 */
async function downloadBody(response: Response, label: string): Promise<Uint8Array> {
	const declared = Number(response.headers.get("content-length")) || 0
	if (declared > MAX_DOWNLOAD_BYTES) throw new Error(`${label}: ${declared} bytes declarados, acima do teto de ${MAX_DOWNLOAD_BYTES}`)

	const bytes = new Uint8Array(await response.arrayBuffer())
	if (bytes.byteLength > MAX_DOWNLOAD_BYTES) throw new Error(`${label}: ${bytes.byteLength} bytes recebidos, acima do teto`)
	return bytes
}

/** Uma entrada do acervo: o PDF no disco e de onde ele veio. */
interface CatalogEntry {
	letter: string
	title: string
	url: string
	kind: "portaria" | "module" | "submodule"
	/** Tamanho e data do último download, para o dry-run comparar sem baixar de novo. */
	bytes?: number
	lastModified?: string | null
}

/** O que já foi convertido, para não gastar conversão em arquivo inalterado. */
interface BuildRecord {
	sha256: string
	file: string
	builtAt: string
	/** Ausente nos registros da primeira geração — e é o que os invalida. */
	pipeline?: number
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

/**
 * Caminho de escrita DENTRO do acervo, ou erro.
 *
 * Todo nome de arquivo aqui nasce de dado que veio da rede — título de módulo, rótulo de
 * pendência, entrada de catálogo gravada numa execução anterior. Sem esta checagem, um
 * `catalog.json` ou `pendencias.tsv` adulterado (ou só corrompido) escreveria fora do
 * acervo: `..%2F..%2F` num rótulo basta. `slug()` cobre o que passa por ele, mas nem tudo
 * passa — e uma verificação no ponto de escrita cobre todos os caminhos de uma vez.
 */
function archivePath(subdir: string, fileName: string): string {
	const target = resolve(ARCHIVE, subdir, fileName)
	const root = resolve(ARCHIVE, subdir)
	if (target !== root && !target.startsWith(`${root}${sep}`)) {
		throw new Error(`recusando escrever fora do acervo: ${fileName}`)
	}
	return target
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
function toMarkdown(entry: CatalogEntry, text: string, sha256: string, viaOcr: boolean): string {
	// A marca de OCR entra no `source`, que é o que viaja no `metadata` de cada chunk e
	// aparece na citação. Texto reconhecido não é transcrição fiel — número trocado é o
	// erro típico — e quem lê a resposta precisa poder saber disso sem abrir o acervo.
	const base = entry.kind === "submodule" ? `RADA-e Módulo ${entry.letter} — ${entry.title}` : `RADA-e Módulo ${entry.letter}`
	const source = viaOcr ? `${base} (texto obtido por OCR)` : base
	return [
		"---",
		`source: ${source}`,
		"document_type: RADA",
		`title: ${entry.title}`,
		`year: ${new Date().getUTCFullYear()}`,
		// Procedência no FRONTMATTER, não no corpo: o corpo é o que vai para o embedding e
		// volta citado na resposta. Um `sha256` no meio do texto normativo é ruído que
		// disputa espaço no chunk e aparece para quem lê a citação.
		`sha256: ${sha256}`,
		`ocr: ${viaOcr}`,
		"---",
		"",
		`# ${source}`,
		"",
		text,
		"",
	].join("\n")
}

/**
 * OCR com cache por sha256 do PDF — guardando as PÁGINAS, não o documento concatenado.
 *
 * O cache guarda o reconhecimento CRU, antes da limpeza: mudar a regra de artefato não
 * pode custar de novo os 3 s por página. O formato antigo (`<sha>.txt`, documento
 * inteiro numa string) NÃO é lido: dele não se recupera a fronteira de página, e
 * aproveitá-lo devolveria texto sujo em silêncio — que é o defeito que a limpeza existe
 * para fechar. O `.txt` que sobrar no acervo é lixo e pode ser apagado.
 */
async function ocrPages(bytes: Uint8Array, sha256: string, tessdataDir: string | undefined, label: string): Promise<string[]> {
	const cachePath = join(ARCHIVE, "ocr", `${sha256}.json`)
	const cached = await readJson<{ pages?: string[] } | null>(cachePath, null)
	if (cached?.pages?.length) return cached.pages

	// Caro: são segundos por página.
	process.stdout.write(`   … OCR de ${label}\n`)
	const { pages } = await ocrPdf(bytes, tessdataDir)
	await mkdir(join(ARCHIVE, "ocr"), { recursive: true })
	await writeFile(cachePath, `${JSON.stringify({ pages })}\n`, "utf8")
	return pages
}

/** Converte o acervo local em `knowledge/*.md`. Não toca a rede. */
async function build(noOcr: boolean): Promise<void> {
	// Só sobrescreve o diretório de modelos do tesseract se ele existir de verdade:
	// apontar `TESSDATA_PREFIX` para um caminho inexistente ESCONDE o modelo que a
	// distribuição instalou, e o `por` do sistema passava a ser reportado como ausente.
	const configured = expandHome(process.env.RADA_TESSDATA_DIR ?? join(ARCHIVE, "tessdata"))
	const tessdataDir = (await stat(configured).catch(() => null))?.isDirectory() ? configured : undefined
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
		// O sha256 diz que o PDF não mudou; ele NÃO diz que a saída continua lá. Apagar
		// `knowledge/*.md` deixa para trás o `.rada-build.json` (é dotfile), e sem esta
		// conferência o build virava no-op silencioso e o `ingest:all` saía 0 sobre nada.
		const priorBuild = built[name]
		const outputExists = priorBuild
			? await stat(join(KNOWLEDGE, priorBuild.file)).then(
					() => true,
					() => false
				)
			: false
		if (priorBuild?.sha256 === sha256 && priorBuild.pipeline === PIPELINE_VERSION && outputExists) {
			unchanged.push(`${entry.letter} ${entry.title}`)
			continue
		}

		const extracted = await pdfToSubmissionText(bytes)
		let pages = extracted.pages
		let viaOcr = false

		if (extracted.text.trim().length === 0) {
			// Sem camada de texto. Ingerir assim daria documento vazio na base, que é pior
			// do que não ter o documento: some do caminho honesto do "sem base" e vira ruído.
			if (noOcr) {
				attention.push(`${entry.letter} ${entry.title} — sem texto extraível, e --no-ocr foi pedido`)
				continue
			}
			try {
				pages = await ocrPages(bytes, sha256, tessdataDir, `${entry.letter} ${entry.title}`)
				viaOcr = true
			} catch (error) {
				const detail = error instanceof OcrUnavailableError ? error.message : error instanceof Error ? error.message : String(error)
				attention.push(`${entry.letter} ${entry.title} — sem texto extraível e OCR indisponível: ${detail}`)
				continue
			}
		}

		// Cabeçalho, rodapé e número de página saem AQUI, com a fronteira de página ainda
		// em mãos. Depois de concatenar não há mais como distinguir a borda do miolo — e
		// era assim que o título do módulo entrava em metade dos chunks daquele módulo.
		const cleaned = stripPrintArtifacts(pages)
		const text = cleaned.text

		if (text.trim().length === 0) {
			attention.push(`${entry.letter} ${entry.title} — nem extração nem OCR produziram texto`)
			continue
		}

		const file = `rada-${entry.letter.toLowerCase()}-${slug(entry.title)}.md`
		await writeFile(join(KNOWLEDGE, file), toMarkdown(entry, text, sha256, viaOcr), "utf8")
		built[name] = { sha256, file, builtAt: new Date().toISOString(), pipeline: PIPELINE_VERSION }
		const removed = cleaned.removedLines > 0 ? `, −${cleaned.removedLines} linhas de impressão` : ""
		created.push(`${entry.letter} ${entry.title} (${text.length} caracteres${viaOcr ? ", por OCR" : ""}${removed})`)
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
	/** Linhas de `pendencias.tsv`: tipo, origem, rótulo, URL. */
	const pendingRows: string[][] = []

	for (const module of modules) {
		let head: Response
		try {
			head = await request(module.url, { method: "HEAD", redirect: "follow" })
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error)
			// Quatro hosts do RADA-e servem certificado autoassinado, dois deles vencidos.
			// Sem --insecure-tls esses módulos são REPORTADOS, nunca omitidos em silêncio.
			attention.push(`${module.letter} — ${/certificate|tls|ssl/i.test(reason) ? `certificado não confiável: ${reason}` : reason}`)
			pendingRows.push(["pdf", module.letter, module.title, module.url])
			continue
		}

		if (!head.ok) {
			attention.push(`${module.letter} — HTTP ${head.status}`)
			pendingRows.push(["pdf", module.letter, module.title, module.url])
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
		const recorded = catalog[file]
		const remoteBytes = Number(head.headers.get("content-length")) || undefined
		const remoteModified = head.headers.get("last-modified")

		if (!apply) {
			// O `HEAD` já está em mãos: comparar com o que o catálogo registrou é o que
			// torna a prévia útil. Sem isso todo módulo aparecia como "baixaria", e o
			// dry-run não distinguia mudança real de nenhuma.
			const same = recorded && recorded.bytes === remoteBytes && recorded.lastModified === remoteModified
			if (same) unchanged.push(`${module.letter} ${module.title}`)
			else changed.push(`${module.letter} ${module.title} → ${file}${recorded ? "" : " (novo)"}`)
			continue
		}

		const response = await request(module.url, { redirect: "follow" })
		if (!response.ok) {
			attention.push(`${module.letter} — download HTTP ${response.status}`)
			pendingRows.push(["pdf", module.letter, module.title, module.url])
			continue
		}

		const bytes = await downloadBody(response, `${module.letter} ${module.title}`)
		if (!isPdf(bytes)) {
			// HEAD disse `application/pdf` e o GET trouxe outra coisa: página de erro,
			// login, redirecionamento. Gravar isso corromperia o acervo em silêncio.
			attention.push(`${module.letter} — resposta não é PDF apesar do content-type`)
			pendingRows.push(["pdf", module.letter, module.title, module.url])
			continue
		}
		const sha256 = createHash("sha256").update(bytes).digest("hex")
		const current = await readFile(archivePath("pdf", file)).catch(() => null)
		if (current && createHash("sha256").update(current).digest("hex") === sha256) {
			unchanged.push(`${module.letter} ${module.title}`)
			continue
		}

		await writeFile(archivePath("pdf", file), bytes)
		catalog[file] = {
			letter: module.letter,
			title: module.title,
			url: module.url,
			kind: "module",
			bytes: bytes.byteLength,
			lastModified: remoteModified,
		}
		changed.push(`${module.letter} ${module.title} (${(bytes.byteLength / 1048576).toFixed(1)} MB)`)
	}

	if (apply) {
		await writeFile(join(ARCHIVE, "meta/catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`, "utf8")
		// Sem gravar isto, `--pending` só funcionava com a lista escrita à mão. O que não
		// veio agora é exatamente o que a próxima sessão na intranet precisa tentar.
		await writeFile(join(ARCHIVE, "meta/pendencias.tsv"), pendingRows.map((row) => row.join("\t")).join("\n") + (pendingRows.length ? "\n" : ""), "utf8")
	}
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

	const catalogPath = join(ARCHIVE, "meta/catalog.json")
	const catalog = await readJson<Record<string, CatalogEntry>>(catalogPath, {})
	let catalogChanged = false

	const done: string[] = []
	const stillPending: string[][] = []

	for (const [kind, origin, label, url] of rows) {
		const dir = kind === "zip" ? "zip" : "pdf"
		const file = `${slug(origin)}-${slug(label)}.${kind === "zip" ? "zip" : "pdf"}`
		try {
			const response = await fetch(url, {
				redirect: "follow",
				...(insecureTls ? { tls: { rejectUnauthorized: false } } : {}),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			})
			if (!response.ok) throw new Error(`HTTP ${response.status}`)

			const bytes = await downloadBody(response, `${origin} ${label}`)
			// Sem esta conferência a pendência sairia da lista sem ter sido baixada.
			if (dir === "pdf" && !isPdf(bytes)) throw new Error("resposta não é PDF")

			await mkdir(join(ARCHIVE, dir), { recursive: true })
			await writeFile(archivePath(dir, file), bytes)

			// Sem entrada no catálogo o `build` descarta o arquivo por falta de título e
			// origem — tudo que o `--pending` recuperava ficava inconversível.
			if (dir === "pdf") {
				catalog[file] = { letter: origin, title: label, url, kind: "submodule", bytes: bytes.byteLength, lastModified: null }
				catalogChanged = true
			}
			done.push(`${origin} ${label} (${(bytes.byteLength / 1048576).toFixed(1)} MB)`)
		} catch (error) {
			stillPending.push([kind, origin, label, url])
			console.error(`   ✖ ${origin} ${label}: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	if (catalogChanged) await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8")
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

	if (command === "build") return await build(flags.has("--no-ocr"))
	if (command === "fetch") {
		if (flags.has("--pending")) return await fetchPending(flags.has("--insecure-tls"))
		return await fetchFromIntranet(flags.has("--apply"), flags.has("--insecure-tls"))
	}
	fail("uso: rada.ts build [--no-ocr] | fetch [--apply | --pending] [--insecure-tls]")
}

// Só executa quando chamado como programa. Sem isto, importar qualquer coisa deste
// arquivo — num teste, por exemplo — dispararia a coleta.
if (import.meta.main) await main()
