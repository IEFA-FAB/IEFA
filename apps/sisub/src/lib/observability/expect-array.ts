/**
 * `expectArray` — coage um payload de server function a um array, logando no Faro
 * quando o valor NÃO é um array.
 *
 * Contexto: o client RPC do TanStack Start pode RESOLVER uma server fn com um valor
 * que não é o array esperado — notavelmente um objeto `Response` cru, quando a resposta
 * é `2xx` mas não-JSON (ex.: em dev, um erro de transform/HMR faz o Nitro devolver
 * `200 + HTML`). Um `.map`/`.find` direto nesse valor lança "x.map is not a function"
 * e derruba a rota inteira (ver memória `project_sisub_serverfn_thrown_response_resolves_as_data`).
 *
 * Em vez de quebrar, devolvemos `[]` (UI degrada — lista vazia / redirect de "não encontrado")
 * e registramos a anomalia no Grafana Faro para observabilidade. No SSR `reportError` é
 * no-op (faro client-only); a captura cobre a navegação client-side, onde o crash aparecia.
 */
import { reportError } from "@/lib/observability/report-error"

function describeValue(value: unknown): string {
	if (value === null) return "null"
	if (value instanceof Response) return `Response(${value.status})`
	if (typeof value === "object") return (value as { constructor?: { name?: string } }).constructor?.name ?? "object"
	return typeof value
}

/**
 * @param value   Payload retornado por uma server function.
 * @param context Metadados p/ o log do Faro (ex.: `{ source: "fetchKitchensFn", route: "kitchen/$kitchenId" }`).
 * @returns `value` se for array; senão `[]` (e loga a anomalia).
 */
export function expectArray<T>(value: unknown, context: Record<string, unknown>): T[] {
	if (Array.isArray(value)) return value as T[]

	reportError(new Error(`Expected an array from a server function, received ${describeValue(value)}`), {
		...context,
		anomaly: "non_array_serverfn_payload",
		receivedType: describeValue(value),
	})
	return []
}
