/**
 * @module pncp-pca-sync/client
 * Cliente do CSV do Plano de Contratações Anual do PNCP.
 *
 * A API é PÚBLICA — nenhum header de autenticação deve ser enviado.
 *
 * Três comportamentos da origem, todos medidos, que este cliente existe para tolerar:
 *
 *  - **Status antes do corpo, sempre.** Foram observados `429` com corpo **HTML**, `500` com
 *    `content-type: application/json` e corpo de TEXTO puro (`"Erro na comunicação com o banco
 *    de dados."`), e `204` com corpo vazio. Desserializar antes de checar o status transforma
 *    erro retentável em falha de parse — e o sintoma na tela vira "sem dados", indistinguível
 *    do estado vazio legítimo.
 *  - **Latência imprevisível.** O mesmo arquivo de 8 MB levou 2 s numa coleta e 35 s na outra,
 *    byte a byte idêntico. O timeout é generoso de propósito.
 *  - **Sem validadores de cache.** A origem responde `no-store` e não envia `ETag` nem
 *    `Last-Modified`; requisição condicional é impossível e não deve ser tentada. A
 *    invalidação é por hash de conteúdo, do lado de cá.
 */

const BASE_URL = "https://pncp.gov.br/api/pncp/v1"

/** 8 MB a 35 s no pior caso medido; a margem cobre a cauda. */
const REQUEST_TIMEOUT_MS = 180_000

/** Delays base entre tentativas (ms), com ±25% de jitter. 3 delays → 4 tentativas. */
const RETRY_BASE_DELAYS_MS = [3_000, 10_000, 30_000]

/**
 * Status tratados como transitórios. `429` entra porque a origem o devolve sob carga; `500`
 * entra porque foi medido com corpo "Erro na comunicação com o banco de dados" — falha do
 * banco da origem, não requisição inválida nossa.
 */
const RETRYABLE_HTTP_CODES = new Set([408, 429, 500, 502, 503, 504])

export class PncpUnavailableError extends Error {
	readonly status: number | null
	constructor(status: number | null, message: string) {
		super(message)
		this.name = "PncpUnavailableError"
		this.status = status
	}
}

function withJitter(ms: number): number {
	return Math.round(ms * (0.75 + Math.random() * 0.5))
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface FetchPcaOptions {
	/** Backoffs entre tentativas. Só o teste sobrescreve, para não esperar 43 s de verdade. */
	retryDelaysMs?: readonly number[]
}

export interface PcaCsvResponse {
	/** `null` quando a origem respondeu 204: o órgão não tem plano naquele ano. */
	content: string | null
	byteSize: number
	elapsedMs: number
}

/**
 * Baixa o CSV do PCA de um par órgão/ano. Uma requisição, sem paginação — este é o único
 * endpoint de lote do PNCP.
 *
 * @throws {PncpUnavailableError} depois de esgotar as tentativas, ou em status não retentável.
 */
export async function fetchPcaCsv(cnpj: string, ano: number, opts: FetchPcaOptions = {}): Promise<PcaCsvResponse> {
	const delays = opts.retryDelaysMs ?? RETRY_BASE_DELAYS_MS
	const maxAttempts = delays.length + 1
	const url = `${BASE_URL}/orgaos/${cnpj}/pca/${ano}/csv`
	let lastError: PncpUnavailableError | null = null

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		if (attempt > 0) await sleep(withJitter(delays[attempt - 1]))

		const startedAt = Date.now()
		let res: Response
		try {
			res = await fetch(url, {
				// Sem `Accept-Encoding`: a origem ignora compressão (medido). Sem auth: API aberta.
				headers: { accept: "*/*" },
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			})
		} catch (err) {
			lastError = new PncpUnavailableError(null, `Falha de rede ao buscar PCA ${cnpj}/${ano}: ${String(err)}`)
			continue
		}

		// ── STATUS ANTES DO CORPO ──────────────────────────────────────────────
		// 204 = órgão sem plano publicado naquele ano. É ausência, não erro — e `res.json()`
		// aqui estouraria. Foi exatamente a resposta da UASG 120133 (DIRAD) na listagem de atas.
		if (res.status === 204) {
			return { content: null, byteSize: 0, elapsedMs: Date.now() - startedAt }
		}

		if (!res.ok) {
			// O corpo pode ser HTML (429) ou texto puro com content-type JSON (500). Só é lido
			// para a mensagem de erro, nunca desserializado.
			const snippet = await res.text().catch(() => "")
			const message = `PNCP HTTP ${res.status} em PCA ${cnpj}/${ano}: ${snippet.slice(0, 160).replace(/\s+/g, " ").trim()}`

			if (!RETRYABLE_HTTP_CODES.has(res.status)) {
				throw new PncpUnavailableError(res.status, message)
			}
			lastError = new PncpUnavailableError(res.status, message)
			continue
		}

		const buffer = await res.arrayBuffer()
		const content = new TextDecoder("utf-8").decode(buffer)

		return { content, byteSize: buffer.byteLength, elapsedMs: Date.now() - startedAt }
	}

	throw lastError ?? new PncpUnavailableError(null, `PCA ${cnpj}/${ano} indisponível após ${maxAttempts} tentativas`)
}
