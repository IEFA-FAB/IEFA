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
 * Estratégia: ao detectar falha de import dinâmico, dar UM hard-reload para
 * buscar HTML + manifest novos. Uma flag em `sessionStorage` evita loop caso a
 * falha não seja de chunk obsoleto (ex.: rede caída de verdade) — nesse caso
 * recarregar uma vez é inócuo e o erro real volta a aparecer normalmente.
 */
import { reportError } from "@/lib/observability/report-error"

const RELOAD_FLAG = "sisub:stale-chunk-reload"

/** Mensagens de falha de import dinâmico nos diferentes engines. */
const DYNAMIC_IMPORT_FAILURE = /Importing a module script failed|error loading dynamically imported module|Failed to fetch dynamically imported module/i

function reloadOnce(reason: string): void {
	// Já recarregamos neste ciclo de navegação → não entra em loop. A flag é
	// limpa por markBootSuccess() num boot bem-sucedido, rearmando para o
	// próximo deploy.
	if (sessionStorage.getItem(RELOAD_FLAG)) return
	sessionStorage.setItem(RELOAD_FLAG, "1")
	reportError(new Error("Stale chunk recovery: hard reload"), { source: "stale-chunk", reason })
	window.location.reload()
}

/**
 * Registra os listeners de recuperação. Chamar uma vez no boot do client,
 * antes da hidratação.
 */
export function installStaleChunkRecovery(): void {
	if (typeof window === "undefined") return

	// Evento canônico do Vite para falha de módulo pré-carregado.
	window.addEventListener("vite:preloadError", (event) => {
		event.preventDefault()
		reloadOnce("vite:preloadError")
	})

	// Fallback: o Safari nem sempre emite vite:preloadError — pega pela mensagem.
	window.addEventListener("error", (event) => {
		if (typeof event.message === "string" && DYNAMIC_IMPORT_FAILURE.test(event.message)) {
			reloadOnce("window.error")
		}
	})

	// import() rejeitado que não vira ErrorEvent cai aqui como rejection.
	window.addEventListener("unhandledrejection", (event) => {
		const message = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "")
		if (DYNAMIC_IMPORT_FAILURE.test(message)) {
			reloadOnce("unhandledrejection")
		}
	})
}

/**
 * Limpa a flag de reload após um boot bem-sucedido, rearmando a recuperação
 * para o próximo deploy. Chamar depois da hidratação.
 */
export function markBootSuccess(): void {
	if (typeof window === "undefined") return
	sessionStorage.removeItem(RELOAD_FLAG)
}
