/**
 * Destino de navegação de página inteira (`window.location.assign`) restrito à PRÓPRIA origem.
 *
 * O `redirect` da URL já passa pelo guard compartilhado (`safeRedirect` do `@iefa/auth-kit`)
 * na validação da busca. Isto é a segunda trava, no sumidouro: `location.assign` aceita
 * `https://outro`, `//outro` e `javascript:`, e uma regressão no guard de cima — ou uma rota
 * nova que leia `redirect` sem ele — viraria open redirect logo depois do login, com a
 * sessão recém-elevada.
 *
 * Resolve contra a origem atual e só devolve o caminho (path + query + hash) quando a origem
 * resultante é a mesma; qualquer outra coisa cai no `fallback`.
 */
export function sameOriginDestination(destination: string | null | undefined, origin: string, fallback = "/hub"): string {
	if (!destination) return fallback
	let resolved: URL
	try {
		resolved = new URL(destination, origin)
	} catch {
		return fallback
	}
	if (resolved.origin !== new URL(origin).origin) return fallback
	return `${resolved.pathname}${resolved.search}${resolved.hash}`
}
