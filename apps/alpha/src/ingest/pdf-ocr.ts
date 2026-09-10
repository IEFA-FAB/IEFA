/**
 * @module pdf-ocr
 * OCR local de PDF sem camada de texto, por `pdftoppm` + `tesseract`.
 *
 * ─── Por que local ────────────────────────────────────────────────────────────
 * O material é interno da FAB. Mandar página de norma para serviço de OCR de
 * terceiro publicaria o documento — então o OCR roda na máquina, com binários do
 * sistema, e nada sai dela.
 *
 * ─── Por que dois binários e não uma lib ──────────────────────────────────────
 * `tesseract` não lê PDF: lê imagem. `pdftoppm` (poppler) rasteriza. A alternativa
 * em JS (`tesseract.js`) traria um WASM de dezenas de MB para o `node_modules` de
 * um app que roda em produção, por uma função que só existe no fluxo local de
 * coleta — o custo cai no lugar errado.
 *
 * ─── O que isto NÃO resolve ───────────────────────────────────────────────────
 * OCR é leitura, não transcrição fiel: número trocado é o erro típico, e numa
 * norma isso importa. Por isso o texto sai marcado como obtido por OCR até a
 * citação, e não se mistura com texto extraído de verdade.
 */
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

/** Resolução da rasterização. 300 dpi é o piso recomendado do tesseract para 10pt. */
const RASTER_DPI = 300

/** Idioma do modelo. O corpus é normativo brasileiro; `eng` erra acento e palavra comum. */
const OCR_LANGUAGE = "por"

export class OcrUnavailableError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "OcrUnavailableError"
	}
}

async function run(command: string[], env?: Record<string, string>): Promise<{ ok: boolean; stdout: string; stderr: string }> {
	try {
		const proc = Bun.spawn(command, { stdout: "pipe", stderr: "pipe", env: { ...process.env, ...env } })
		const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
		return { ok: (await proc.exited) === 0, stdout, stderr }
	} catch (error) {
		// Binário ausente faz o `Bun.spawn` LANÇAR, não devolver código de saída. Sem este
		// catch, a mensagem "instale o poppler-utils" era ramo morto e o usuário recebia um
		// ENOENT cru.
		return { ok: false, stdout: "", stderr: error instanceof Error ? error.message : String(error) }
	}
}

/**
 * Ordena os PNGs pelo número de página que o `pdftoppm` põe no nome.
 *
 * Puro e exportado porque é o ponto onde um erro seria silencioso: ordenação
 * lexicográfica põe a página 10 antes da 2, e o documento sai embaralhado sem
 * nenhum sinal de falha.
 */
export function sortPageFiles(files: string[]): string[] {
	const pageOf = (name: string) => Number(/-(\d+)\.png$/.exec(name)?.[1] ?? 0)
	return files.filter((f) => f.endsWith(".png")).sort((a, b) => pageOf(a) - pageOf(b))
}

/**
 * Confere se o OCR pode rodar nesta máquina.
 *
 * @param tessdataDir - Diretório com `por.traineddata`, quando não está no do sistema
 * @returns `null` se está tudo disponível, ou a mensagem do que falta e como resolver
 */
export async function ocrUnavailableReason(tessdataDir?: string): Promise<string | null> {
	const [poppler, tess] = await Promise.all([run(["pdftoppm", "-v"]), run(["tesseract", "--version"])])
	// `pdftoppm -v` sai com código != 0 e escreve a versão no stderr; o que distingue
	// "instalado" de "ausente" é a versão aparecer, não o código de saída.
	if (!/pdftoppm/i.test(poppler.stdout + poppler.stderr)) return "`pdftoppm` não encontrado — instale o poppler-utils."
	if (!/tesseract/i.test(tess.stdout + tess.stderr)) return "`tesseract` não encontrado — instale o tesseract-ocr."

	const langs = await run(["tesseract", "--list-langs"], tessdataDir ? { TESSDATA_PREFIX: tessdataDir } : undefined)
	if (!new RegExp(`^${OCR_LANGUAGE}$`, "m").test(langs.stdout + langs.stderr)) {
		return (
			`modelo de idioma '${OCR_LANGUAGE}' ausente${tessdataDir ? ` em ${tessdataDir}` : ""}. ` +
			`Baixe 'https://github.com/tesseract-ocr/tessdata_fast/raw/main/${OCR_LANGUAGE}.traineddata' ` +
			"para o diretório tessdata do acervo (ver RADA-E.md) — não precisa de sudo."
		)
	}
	return null
}

export interface OcrResult {
	/**
	 * Texto de cada página, na ordem.
	 *
	 * Página, e não documento concatenado: o material reconhecido carrega os MESMOS
	 * cabeçalhos e rodapés do PDF de texto — no único documento do acervo que passa
	 * por aqui, o cabeçalho da SEFA aparece em 18 das 21 páginas. Concatenar antes de
	 * devolver destruiria a fronteira de que `print-artifacts.ts` depende.
	 */
	pages: string[]
}

/**
 * Rasteriza o PDF e passa cada página pelo tesseract.
 *
 * @param bytes - PDF inteiro
 * @param tessdataDir - Diretório de modelos, quando não é o do sistema
 * @throws {OcrUnavailableError} quando falta binário ou o modelo de idioma
 */
export async function ocrPdf(bytes: Uint8Array, tessdataDir?: string): Promise<OcrResult> {
	const missing = await ocrUnavailableReason(tessdataDir)
	if (missing) throw new OcrUnavailableError(missing)

	const workDir = await mkdtemp(join(tmpdir(), "rada-ocr-"))
	try {
		const pdfPath = join(workDir, "input.pdf")
		await Bun.write(pdfPath, bytes)

		// Escala de cinza: o tesseract binariza de qualquer forma, e cor triplica o
		// tamanho do PNG sem melhorar o reconhecimento.
		const raster = await run(["pdftoppm", "-r", String(RASTER_DPI), "-gray", "-png", pdfPath, join(workDir, "page")])
		if (!raster.ok) throw new Error(`rasterização falhou: ${raster.stderr.trim() || "sem detalhe"}`)

		const pages = sortPageFiles(await readdir(workDir))
		if (pages.length === 0) throw new Error("rasterização não produziu página alguma")

		const texts: string[] = []
		for (const page of pages) {
			const base = join(workDir, `${page}.out`)
			// `--psm 1` deixa o tesseract segmentar a página sozinho, com detecção de
			// orientação: o corpus tem tabela e coluna, e forçar bloco único as embaralha.
			const ocr = await run(
				["tesseract", join(workDir, page), base, "-l", OCR_LANGUAGE, "--psm", "1"],
				tessdataDir ? { TESSDATA_PREFIX: tessdataDir } : undefined
			)
			if (!ocr.ok) throw new Error(`OCR falhou em ${page}: ${ocr.stderr.trim() || "sem detalhe"}`)
			texts.push((await readFile(`${base}.txt`, "utf8")).trim())
		}

		return { pages: texts }
	} finally {
		await rm(workDir, { recursive: true, force: true })
	}
}
