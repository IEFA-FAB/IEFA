/**
 * Recuperação de chunk obsoleto pós-deploy.
 *
 * O app é code-split por rota: cada rota vira um chunk com hash
 * (`/assets/[name]-[hash].js`) servido `immutable`. O HTML é `no-cache`, então
 * um load novo sempre pega o manifest atual — mas uma aba antiga não.
 *
 * iOS Safari mantém abas/PWA vivas por dias. Uma aba aberta antes de um deploy
 * segura um router que referencia hashes que sumiram no deploy seguinte. Quando
 * o `defaultPreload: "intent"` dispara `import()` do chunk da rota-alvo (toque
 * num link), o arquivo é 404 → WebKit lança "Importing a module script failed".
 * Esse erro só loga no Faro e deixa o usuário travado, sem recuperação.
 *
 * Estratégia: ao detectar falha de import dinâmico, dar um hard-reload para
 * buscar HTML + manifest novos. Para não entrar em loop quando a falha NÃO é de
 * deploy (CDN/rede caída de verdade), limitamos a `MAX_RELOADS` recargas dentro
 * de uma janela curta — esgotado o orçamento, paramos e deixamos o erro normal
 * aparecer. Os timestamps decaem sozinhos após a janela, então um stale-chunk
 * legítimo (resolve em 1 reload) se rearma para o próximo deploy sem ação extra.
 */
import { reportError } from "@/lib/observability/report-error"

const STORAGE_KEY = "sisub:stale-chunk-reloads"
const MAX_RELOADS = 2
const WINDOW_MS = 15_000

/** Mensagens de falha de import dinâmico nos diferentes engines. */
const DYNAMIC_IMPORT_FAILURE = /Importing a module script failed|error loading dynamically imported module|Failed to fetch dynamically imported module/i

// Fallback em memória para contextos onde sessionStorage lança (Safari em modo
// privado / storage bloqueado). Não sobrevive ao reload, mas garante que a
// leitura/escrita do guard nunca quebra a recuperação.
let memoryState: number[] = []

function readReloadTimestamps(): number[] {
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY)
		if (!raw) return []
		const parsed = JSON.parse(raw)
		return Array.isArray(parsed) ? parsed.filter((t): t is number => typeof t === "number") : []
	} catch {
		return memoryState
	}
}

function writeReloadTimestamps(timestamps: number[]): void {
	memoryState = timestamps
	try {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(timestamps))
	} catch {
		// storage indisponível — memoryState já guardou o estado possível.
	}
}

/**
 * Tenta recuperar dando um hard-reload. Retorna `true` se de fato recarregou,
 * `false` se o orçamento de reloads da janela já se esgotou (falha provavelmente
 * persistente → deixa o erro original aparecer em vez de recarregar em loop).
 */
function attemptRecovery(reason: string): boolean {
	const now = Date.now()
	const recent = readReloadTimestamps().filter((t) => now - t < WINDOW_MS)
	if (recent.length >= MAX_RELOADS) return false

	writeReloadTimestamps([...recent, now])
	reportError(new Error("Stale chunk recovery: hard reload"), {
		source: "stale-chunk",
		reason,
		attempt: String(recent.length + 1),
	})
	window.location.reload()
	return true
}

/**
 * Registra os listeners de recuperação. Chamar uma vez no boot do client,
 * antes da hidratação.
 */
export function installStaleChunkRecovery(): void {
	if (typeof window === "undefined") return

	// Evento canônico do Vite para falha de módulo pré-carregado. Só suprime o
	// erro padrão (preventDefault) quando de fato vamos recarregar — caso
	// contrário deixa o Vite propagar o erro normalmente.
	window.addEventListener("vite:preloadError", (event) => {
		if (attemptRecovery("vite:preloadError")) event.preventDefault()
	})

	// Fallback: o Safari nem sempre emite vite:preloadError — pega pela mensagem.
	window.addEventListener("error", (event) => {
		if (typeof event.message === "string" && DYNAMIC_IMPORT_FAILURE.test(event.message)) {
			attemptRecovery("window.error")
		}
	})

	// import() rejeitado que não vira ErrorEvent cai aqui como rejection.
	window.addEventListener("unhandledrejection", (event) => {
		const message = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "")
		if (DYNAMIC_IMPORT_FAILURE.test(message)) {
			attemptRecovery("unhandledrejection")
		}
	})
}
