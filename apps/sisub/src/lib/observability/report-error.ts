/**
 * `reportError` — helper seguro sobre a instância global do Faro.
 *
 * Wiring app-specific (não gerado pela base do Faro): os error boundaries e o
 * `defaultOnCatch` do router chamam isto para empurrar exceptions ao Grafana.
 *
 * - Seguro em SSR: boundaries renderizam no server, onde `faro.api` é undefined
 *   → no-op silencioso.
 * - Seguro pré-init: antes de `initializeFaro`, `faro.api` é undefined → no-op.
 * - Nunca lança: telemetria jamais pode quebrar a aplicação.
 */
import { faro } from "@grafana/faro-web-sdk"

type ErrorContext = Record<string, unknown>

/** Faro só aceita `Record<string, string>` no context — serializa os valores. */
function toStringContext(context: ErrorContext): Record<string, string> {
	const out: Record<string, string> = {}
	for (const [key, value] of Object.entries(context)) {
		if (value === undefined || value === null) continue
		out[key] = typeof value === "string" ? value : String(value)
	}
	return out
}

export function reportError(error: unknown, context?: ErrorContext): void {
	const err = error instanceof Error ? error : new Error(String(error))
	try {
		faro?.api?.pushError(err, context ? { context: toStringContext(context) } : undefined)
	} catch {
		// Telemetria nunca deve propagar erro para a aplicação.
	}
}
