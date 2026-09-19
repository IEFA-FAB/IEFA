/**
 * @module safe-url
 * Guardas de URL nos dois pontos em que o app entrega uma string ao navegador como
 * destino: a navegação dura depois do login e o `href` de link salvo pelo usuário.
 *
 * Puro de propósito (sem `window`): a origem entra por parâmetro, e o teste roda sem DOM.
 */

/**
 * Resolve `destination` contra `origin` e devolve só caminho + query + hash — ou
 * `fallback` se o destino sair da origem.
 *
 * O `?redirect=` já passa pelo `safeRedirect` do auth-kit na validação da rota, mas o
 * sink (`window.location.assign`) não pode depender de o guard de cima continuar
 * certo: foi assim que "/\t/evil.com" passava — o parser do navegador descarta o TAB
 * e o caminho vira protocol-relative. Aqui a última palavra é do próprio `URL`.
 */
export function resolveSameOriginDestination(destination: string, origin: string, fallback = "/"): string {
	try {
		const url = new URL(destination, origin)
		if (url.origin !== origin) return fallback
		return `${url.pathname}${url.search}${url.hash}`
	} catch {
		return fallback
	}
}

/**
 * `true` só para URL absoluta `http:`/`https:`.
 *
 * Link de relatório é gravado pelo editor e renderizado como `href` para a seção
 * inteira: sem isto, `javascript:...` salvo por um editor viraria script executado
 * no clique de qualquer colega.
 */
export function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value)
		return url.protocol === "http:" || url.protocol === "https:"
	} catch {
		return false
	}
}
