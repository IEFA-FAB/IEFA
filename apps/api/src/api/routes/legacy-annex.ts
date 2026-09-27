// ─── Caminho antigo do anexo quantitativo (alias depreciado) ─────────────────
//
// O anexo quantitativo do TR é `quantity_estimate` (Lei 14.133/2021, art. 18, § 1º, IV); na lei só
// a Ata de Registro de Preços é ata (art. 6º, XLVI). O caminho e as chaves antigos ficam UM ciclo
// para um chamador externo desconhecido (no repositório não há nenhum) e saem no PR do contract
// 20260927050000 (design D7 de `sisub-ubiquitous-language`).

export const LEGACY_ANNEX_PREFIX = "/ata"
const LEGACY_ANNEX_KEYS: Readonly<Record<string, string>> = { quantityEstimateId: "ataId", quantityEstimateItemId: "ataItemId" }

/** Renomeia, recursivamente, as chaves novas do corpo para as do contrato antigo. */
export function toLegacyAnnexKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(toLegacyAnnexKeys)
	if (value === null || typeof value !== "object") return value
	return Object.fromEntries(Object.entries(value).map(([key, v]) => [LEGACY_ANNEX_KEYS[key] ?? key, toLegacyAnnexKeys(v)]))
}

/** Cabeçalhos de depreciação: `Deprecation` (RFC 9745) e `Link` para o sucessor (RFC 8288). */
export function deprecationHeaders(successor: string): Record<string, string> {
	return { Deprecation: "true", Link: `<${successor}>; rel="successor-version"` }
}

/** A resposta do handler novo com as chaves antigas e os cabeçalhos de depreciação. */
export async function toLegacyAnnexResponse(res: Response, successor: string): Promise<Response> {
	const body = await res.json().catch(() => null)
	return new Response(JSON.stringify(toLegacyAnnexKeys(body)), {
		status: res.status,
		headers: { "content-type": "application/json", ...deprecationHeaders(successor) },
	})
}

export function logDeprecatedAnnexRoute(method: string, path: string, id: string): void {
	console.warn(`[price-research] rota depreciada ${method} ${path} usada (anexo ${id}); use /quantity-estimates/:quantityEstimateId`)
}
