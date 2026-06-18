/**
 * OpenTelemetry — SDK de tracing Node, SERVER-ONLY.
 *
 * Captura exceptions inesperadas do servidor (SSR + server fns que dão rethrow)
 * como spans de erro exportados via OTLP/HTTP para o Grafana Cloud (Tempo).
 *
 * Custo-benefício: SEM auto-instrumentation (require-in-the-middle é instável
 * sob Bun) — usamos spans MANUAIS. O exporter OTLP/HTTP é fetch-based e roda no
 * Bun normalmente.
 *
 * Opcional em runtime: sem `OTEL_EXPORTER_OTLP_ENDPOINT` → no-op silencioso, não
 * registra provider, não quebra o boot (mesmo princípio de capabilities.server.ts).
 */
import { SpanStatusCode, trace } from "@opentelemetry/api"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { resourceFromAttributes } from "@opentelemetry/resources"
import { BatchSpanProcessor, NodeTracerProvider } from "@opentelemetry/sdk-trace-node"
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions"

const TRACER_NAME = "sisub-server"

let provider: NodeTracerProvider | null = null

/**
 * Registra o NodeTracerProvider + exporter OTLP. Idempotente; só age quando há
 * `OTEL_EXPORTER_OTLP_ENDPOINT` no ambiente.
 *
 * O exporter lê `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_HEADERS` do
 * env automaticamente — não precisamos passar config explícita.
 */
export function initServerOtel(): void {
	if (provider) return // idempotente
	if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return // no-op sem config

	const exporter = new OTLPTraceExporter()

	provider = new NodeTracerProvider({
		resource: resourceFromAttributes({
			[ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || "sisub",
		}),
		spanProcessors: [new BatchSpanProcessor(exporter)],
	})

	provider.register()
}

type SpanAttrValue = string | number | boolean | undefined

/**
 * Abre um span curto, grava a exception e fecha. No-op se o provider não foi
 * registrado (sem env OTLP).
 */
export function recordServerException(error: unknown, attrs?: Record<string, SpanAttrValue>): void {
	if (!provider) return

	const span = trace.getTracer(TRACER_NAME).startSpan("server.exception")

	if (attrs) {
		for (const [key, value] of Object.entries(attrs)) {
			if (value !== undefined) span.setAttribute(key, value)
		}
	}

	const err = error instanceof Error ? error : new Error(String(error))
	span.recordException(err)
	span.setStatus({ code: SpanStatusCode.ERROR, message: err.message })
	span.end()
}
