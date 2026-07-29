/**
 * `idCompra` chega da API Compras.gov.br como inteiro de 17 dígitos — acima de
 * Number.MAX_SAFE_INTEGER (9.007.199.254.740.991), então `JSON.parse` corrompe os
 * últimos dígitos: 98776905900162026 vira 98776905900162030.
 *
 * Esse id é a chave da trilha de auditoria da pesquisa de preços (Lei 14.133/2021)
 * e do dedup de `sisub.compras_amostra`, então o literal numérico é promovido a
 * string ANTES do parse. Idempotente: quando a API devolve o campo entre aspas
 * (contrato antigo), a regex não casa e o valor passa intacto.
 */
export function parseComprasJson<T>(raw: string): T {
	return JSON.parse(raw.replace(/"idCompra"\s*:\s*(-?\d+)/g, '"idCompra":"$1"')) as T
}
