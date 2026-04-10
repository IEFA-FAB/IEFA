import type { ComprasPage } from "./types.ts"

const BASE_URL = "https://dadosabertos.compras.gov.br"
const REQUEST_TIMEOUT_MS = 30_000
const PAGE_SIZE = 500

// ── Configuração de retry ─────────────────────────────────────────────────────

/**
 * Delays base entre tentativas (ms). Aplicados com ±25% de jitter.
 * 5 delays → 6 tentativas no total (5 retries).
 */
const RETRY_BASE_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000]
const MAX_ATTEMPTS = RETRY_BASE_DELAYS_MS.length + 1

/**
 * Códigos HTTP tratados como erros transitórios — todos são retentados.
 *
 * 400 está incluído explicitamente: o ComprasGov emite HTTP 400 durante
 * sobrecarga de forma inconsistente (não indica requisição inválida nesses casos).
 */
const RETRYABLE_HTTP_CODES = new Set([400, 408, 429, 500, 502, 503, 504])

class NonRetryableError extends Error {
	readonly status: number
	constructor(status: number, message: string) {
		super(message)
		this.name = "NonRetryableError"
		this.status = status
	}
}

/** Adiciona ±25% de jitter ao delay para evitar thundering herd. */
function withJitter(ms: number): number {
	return Math.round(ms * (0.75 + Math.random() * 0.5))
}

function parseRetryAfterMs(retryAfter: string | null): number | null {
	if (!retryAfter) return null

	const seconds = Number(retryAfter)
	if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000)

	const retryAt = Date.parse(retryAfter)
	if (Number.isNaN(retryAt)) return null

	return Math.max(retryAt - Date.now(), 0)
}

function parseRateLimitBodyDelayMs(body: string): number | null {
	const match = body.match(/try again in\s+(\d+)\s+seconds/i)
	if (!match) return null

	const seconds = Number(match[1])
	return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null
}

// ── Fetch com retry ───────────────────────────────────────────────────────────

async function fetchWithRetry(url: string): Promise<Response> {
	let lastError: unknown

	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		try {
			const res = await fetch(url, {
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				headers: { accept: "*/*" },
			})

			if (res.ok) return res

			const body = await res.text().catch(() => "")
			const retryAfterMs = res.status === 429 ? (parseRetryAfterMs(res.headers.get("retry-after")) ?? parseRateLimitBodyDelayMs(body)) : null

			if (!RETRYABLE_HTTP_CODES.has(res.status)) {
				// Erro definitivo (401, 403, 404, 422…): não há sentido em retry
				throw new NonRetryableError(res.status, `HTTP ${res.status} ${res.statusText}: ${body.slice(0, 300)}`)
			}

			// Código retentável (400, 429, 5xx…): guarda o erro e tenta de novo
			const retryHint = retryAfterMs != null ? `retry_after_ms=${retryAfterMs}` : "retry_after_ms=unknown"
			lastError = new Error(`HTTP ${res.status} ${res.statusText}: ${body.slice(0, 200)} | ${retryHint}`)
		} catch (err) {
			if (err instanceof NonRetryableError) throw err
			lastError = err
		}

		if (attempt < RETRY_BASE_DELAYS_MS.length) {
			const rateLimitDelay = lastError instanceof Error ? Number(lastError.message.match(/retry_after_ms=(\d+)/)?.[1] ?? Number.NaN) : Number.NaN

			const delay = Number.isFinite(rateLimitDelay)
				? withJitter(Math.max(rateLimitDelay, RETRY_BASE_DELAYS_MS[attempt]))
				: withJitter(RETRY_BASE_DELAYS_MS[attempt])
			console.warn(
				`[compras-client] Tentativa ${attempt + 1}/${MAX_ATTEMPTS} falhou` +
					` — retry em ${delay}ms | ${url.split("?")[0]} | ${lastError instanceof Error ? lastError.message : lastError}`
			)
			await Bun.sleep(delay)
		}
	}

	throw lastError
}

// ── Busca de uma única página ─────────────────────────────────────────────────

export async function fetchPage<T>(endpoint: string, pageNumber: number, params: Record<string, string | number> = {}): Promise<ComprasPage<T>> {
	const qs = new URLSearchParams({
		...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
		pagina: String(pageNumber),
		tamanhoPagina: String(PAGE_SIZE),
	})
	const url = `${BASE_URL}/${endpoint}?${qs}`
	const res = await fetchWithRetry(url)
	return res.json() as Promise<ComprasPage<T>>
}

// ── Busca sequencial (endpoints pequenos) ─────────────────────────────────────

/**
 * AsyncGenerator que entrega uma página por vez com delay de cortesia entre
 * requisições. Ideal para endpoints com poucas páginas.
 *
 * Nota: alguns endpoints da API Compras (ex: material/pdm, material/natureza_despesa,
 * material/caracteristica) retornam `paginasRestantes=0` e `totalPaginas=0` em TODAS
 * as páginas, mesmo havendo mais registros — bug conhecido da API.
 * Por isso não dependemos de `paginasRestantes` para sinalizar o fim; em vez disso,
 * usamos o tamanho da página recebida: página parcial (< PAGE_SIZE) = última página.
 */
export async function* fetchAllPages<T>(
	endpoint: string,
	params: Record<string, string | number> = {}
): AsyncGenerator<{ page: ComprasPage<T>; pageNumber: number }> {
	let pagina = 1
	while (true) {
		const page = await fetchPage<T>(endpoint, pagina, params)
		// Página vazia → fim definitivo (edge case: última página era exatamente PAGE_SIZE)
		if (page.resultado.length === 0) break
		yield { page, pageNumber: pagina }
		// Página parcial → última página
		if (page.resultado.length < PAGE_SIZE) break
		pagina++
		await Bun.sleep(150) // cortesia à API pública
	}
}

// ── Concorrência dinâmica baseada em RAM disponível ───────────────────────────

/**
 * Mesma constante do health check em src/index.ts (460 MB = 90% de 512 MB).
 * Mantida aqui para não criar dependência circular com o módulo HTTP.
 */
const MEMORY_LIMIT_BYTES = 460 * 1024 * 1024

/**
 * Margem de segurança que nunca é consumida por workers.
 * 100 MB: espaço para GC, buffers internos do Bun e o resto da app.
 */
const MEMORY_SAFETY_MARGIN_BYTES = 100 * 1024 * 1024

/**
 * Estimativa conservadora de RAM por worker ativo.
 * Uma página de 500 itens em JSON cru ≈ 100 KB; dobramos para cobrir
 * overhead de parse, estruturas V8 e buffer de upsert do Supabase.
 */
const BYTES_PER_WORKER = 200 * 1024 // 200 KB

const MIN_CONCURRENCY = 2
const MAX_CONCURRENCY = 16 // teto de cortesia à API pública

/**
 * Calcula quantos workers simultâneos cabem no headroom de RAM disponível.
 *
 * Fórmula:
 *   headroom  = MEMORY_LIMIT − rss_atual
 *   disponível = headroom − SAFETY_MARGIN
 *   workers   = clamp(floor(disponível / BYTES_PER_WORKER), MIN, MAX)
 *
 * Se o headroom já for menor que a margem de segurança (memória apertada),
 * retorna MIN_CONCURRENCY para não pressionar ainda mais.
 */
export function calcConcurrency(): number {
	const rss = process.memoryUsage().rss
	const headroom = MEMORY_LIMIT_BYTES - rss
	const available = headroom - MEMORY_SAFETY_MARGIN_BYTES

	if (available <= 0) {
		console.warn(
			`[compras-client] Memória apertada (rss=${Math.round(rss / 1024 / 1024)}MB` +
				` / limite=${Math.round(MEMORY_LIMIT_BYTES / 1024 / 1024)}MB)` +
				` — usando concorrência mínima (${MIN_CONCURRENCY})`
		)
		return MIN_CONCURRENCY
	}

	const workers = Math.max(MIN_CONCURRENCY, Math.min(Math.floor(available / BYTES_PER_WORKER), MAX_CONCURRENCY))

	console.log(
		`[compras-client] RAM: rss=${Math.round(rss / 1024 / 1024)}MB` +
			` headroom=${Math.round(headroom / 1024 / 1024)}MB` +
			` disponível=${Math.round(available / 1024 / 1024)}MB` +
			` → ${workers} worker(s)`
	)

	return workers
}

// ── Busca paralela com work-stealing pool (endpoints grandes) ─────────────────

/**
 * Busca todas as páginas de um endpoint com paralelismo dinâmico.
 *
 * Algoritmo (work-stealing):
 * 1. Busca a página 1 → descobre `totalPaginas` → chama `onPage(page1, 1)`.
 * 2. Abre `concurrency` workers simultaneamente.
 * 3. Cada worker reserva atomicamente a próxima página da fila (`nextPage++`
 *    é seguro: JS é single-thread com event loop cooperativo).
 * 4. Quando um worker termina uma página, busca imediatamente a próxima —
 *    nenhum slot fica ocioso aguardando a página mais lenta.
 * 5. `onPage` pode ser chamado fora de ordem; o chamador deve ser idempotente.
 * 6. Qualquer erro (HTTP após todos os retries ou erro em `onPage`) cancela
 *    todos os workers e é relançado para o chamador.
 *
 * @param concurrency - Workers simultâneos (recomendado: 4–8)
 */
export async function fetchAllPagesParallel<T>(
	endpoint: string,
	params: Record<string, string | number> = {},
	concurrency: number,
	onPage: (page: ComprasPage<T>, pageNumber: number) => Promise<void>
): Promise<void> {
	// Página 1: ancora o total de páginas e inicia o pipeline
	const firstPage = await fetchPage<T>(endpoint, 1, params)
	await onPage(firstPage, 1)

	const totalPages = firstPage.totalPaginas
	if (totalPages <= 1) return

	let nextPage = 2 // compartilhado entre workers — seguro em JS single-thread
	let cancelled = false
	let firstError: unknown = null

	async function worker(): Promise<void> {
		while (!cancelled) {
			// Reserva atomicamente a próxima página (leitura + incremento são síncronos)
			const pageNumber = nextPage++
			if (pageNumber > totalPages) break

			try {
				const page = await fetchPage<T>(endpoint, pageNumber, params)
				if (cancelled) break // descarta resultado se outro worker falhou
				await onPage(page, pageNumber)
			} catch (err) {
				if (!firstError) firstError = err
				cancelled = true
				break
			}
		}
	}

	// Limita workers ao mínimo entre concurrency e páginas ainda disponíveis
	const workerCount = Math.min(concurrency, totalPages - 1)
	await Promise.all(Array.from({ length: workerCount }, () => worker()))

	if (firstError) throw firstError
}
