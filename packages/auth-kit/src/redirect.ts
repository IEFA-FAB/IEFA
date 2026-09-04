/**
 * Guard de open redirect para o `?redirect=` das telas de auth.
 *
 * Vive aqui, e não em cada app, porque a versão que faltava era sempre a de outro
 * app: o `assignment-selection` tinha o guard e testes; sisub e portal passavam o
 * search param cru para o `redirect`/`navigate`, e o portal ainda carregava uma
 * terceira cópia com semântica própria dentro da tela de login.
 *
 * Um caminho é interno quando começa com "/" e não abre autoridade: "//evil.com" é
 * protocol-relative (o browser lê como host) e "/\evil.com" é a mesma coisa para
 * alguns parsers. A checagem roda no valor cru E no decodificado — "/%2Fevil.com"
 * é inofensivo enquanto ninguém decodifica, e a garantia de que ninguém decodifica
 * não é nossa para dar (SSR devolve `Location`, o cliente navega pelo router).
 * Barrar os dois custa nada: caminho legítimo com barra codificada no MEIO
 * ("/recipes/a%2Fb") continua passando — só o começo é que importa.
 */
function looksInternal(value: string): boolean {
	return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
}

/** `true` só para caminho interno — no valor cru e no decodificado. */
export function isInternalPath(value: unknown): value is string {
	if (typeof value !== "string" || !looksInternal(value)) return false
	let decoded: string
	try {
		decoded = decodeURIComponent(value)
	} catch {
		// Percent-encoding malformado: não dá para afirmar o que o browser fará.
		return false
	}
	return looksInternal(decoded)
}

/**
 * Normaliza o `redirect` da query num caminho interno, ou `undefined`.
 *
 * Recebe `unknown` de propósito: o TanStack Router coage search param numérico
 * (`?redirect=5` chega como number), e um `z.string()` no `validateSearch` derruba
 * a rota inteira em vez de simplesmente ignorar o valor.
 */
export function safeRedirect(value: unknown): string | undefined {
	return isInternalPath(value) ? value : undefined
}
