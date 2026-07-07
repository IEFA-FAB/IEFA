/**
 * Grafana Faro — inicialização do Web SDK (BROWSER-ONLY).
 *
 * Importado como PRIMEIRO import em client.tsx para capturar erros desde o
 * boot. `getWebInstrumentations()` instala automaticamente os handlers de
 * `window.onerror`, `unhandledrejection`, console e Web Vitals — cobre "todo
 * erro JS" sem wiring adicional.
 *
 * Custo-benefício: SEM `TracingInstrumentation` (faro-web-tracing) — traces
 * distribuídos são alto-volume e ficam para depois. Só erros + Web Vitals.
 *
 * Opcional em runtime: sem `VITE_FARO_COLLECTOR_URL` → no-op silencioso, não
 * quebra o boot (mesmo princípio de capabilities.server.ts).
 */
import { getWebInstrumentations, initializeFaro } from "@grafana/faro-web-sdk"

const collectorUrl = import.meta.env.VITE_FARO_COLLECTOR_URL

/**
 * Colapsa corpos de erro HTML de proxy (nginx/ALB — "502 Bad Gateway", "504
 * Gateway Time-out", "503 Service Unavailable") em uma mensagem compacta.
 *
 * Quando uma server function recebe um 5xx do gateway (deploy/cold start), o
 * fetcher do TanStack Start lança um `Error` cujo `message` é a PÁGINA HTML
 * inteira. Qualquer logger downstream (console instrumentation do Faro, boundary
 * do React, defaultOnCatch) empurra esse HTML como um evento gigante e ruidoso.
 * Normalizar aqui, no `beforeSend`, cobre TODA server fn de uma vez —
 * independentemente de quem logou. Idempotente e barato.
 */
function sanitizeProxyHtml(text: string): string {
	if (!text.trimStart().startsWith("<") && !/(?:Bad Gateway|Gateway Time-?out|Service Unavailable)/i.test(text)) {
		return text
	}
	const status = text.match(/\b5\d{2}\b/)?.[0] ?? "5xx"
	return `HTTP proxy error (${status})`
}

// Só inicializa no browser e com collector configurado. client.tsx é o entry de
// hidratação (browser-only), mas guardamos por segurança.
if (typeof window !== "undefined" && collectorUrl) {
	initializeFaro({
		url: collectorUrl,
		app: {
			name: import.meta.env.VITE_FARO_APP_NAME || "sisub",
			// Default = MODE (dev=development, build=production). Override via env porque o
			// Frontend Observability filtra environment=production por padrão e não dá pra
			// trocar na UI — setar VITE_FARO_ENVIRONMENT=production torna o dev visível.
			environment: import.meta.env.VITE_FARO_ENVIRONMENT || import.meta.env.MODE,
		},
		instrumentations: [...getWebInstrumentations()],
		// Sanitiza eventos antes do envio: colapsa corpos HTML de erro de proxy (502/503/504)
		// para não inflar o Faro com a página inteira a cada 5xx transitório do gateway.
		beforeSend: (item) => {
			const payload = item.payload as { value?: unknown; message?: unknown }
			if (typeof payload?.value === "string") payload.value = sanitizeProxyHtml(payload.value)
			if (typeof payload?.message === "string") payload.message = sanitizeProxyHtml(payload.message)
			return item
		},
		// Ruído universal do browser — nunca são erros reais da aplicação.
		ignoreErrors: [
			/^ResizeObserver loop limit exceeded$/,
			/^ResizeObserver loop completed with undelivered notifications$/,
			/^Script error\.$/,
			/chrome-extension:\/\//,
			/moz-extension:\/\//,
		],
	})
}
