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
