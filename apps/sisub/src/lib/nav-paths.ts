/**
 * Caminhos de navegação — um lugar só para as duas regras que sidebar, breadcrumb e busca
 * aplicam. Cópias delas divergiam: a sidebar trocava o prefixo do escopo de um jeito e a
 * trilha de outro.
 */

/** Tira as barras finais para comparar rotas: "/messhall/7/" e "/messhall/7" são a mesma página. */
export function normalizePath(path: string): string {
	return path.replace(/\/+$/, "") || "/"
}

/**
 * Põe o id do escopo na URL base da sidebar: `/storage/receiving` → `/storage/7/receiving`,
 * `/messhall/` → `/messhall/7/` (rota index). URL fora do módulo volta intacta.
 */
export function scopeUrl(url: string, moduleId: string, scopeId: number | string): string {
	const prefix = `/${moduleId}/`
	return url.startsWith(prefix) ? `/${moduleId}/${scopeId}/${url.slice(prefix.length)}` : url
}

/**
 * Caminho que o shell (sidebar, breadcrumb, título) deve descrever. O `useLocation` troca no
 * clique; os `matches` — e o `scopeContext` que sai deles — só quando a rota nova termina de
 * carregar. Durante essa espera vale a página MONTADA (`mounted`, o pathname do último match),
 * senão a sidebar do módulo novo sai com o escopo do antigo.
 *
 * Exceção: URL pedida DENTRO da página montada é a própria página, não uma navegação
 * pendente — é o caso da URL sem rota, em que o último match é o layout pai
 * (`/unit/7/nao-existe` casa até `/unit/7`). Aí a URL pedida é a verdade.
 */
export function presentedPath(requested: string, mounted: string | undefined): string {
	if (mounted === undefined) return requested
	const base = normalizePath(mounted)
	const path = normalizePath(requested)
	const isWithinMounted = path === base || (base !== "/" && path.startsWith(`${base}/`))
	return isWithinMounted ? requested : mounted
}

/**
 * O escopo aberto só vale para uma URL que o contém na posição de escopo (`/<módulo>/<id>/…`).
 * Escopo lido dos `matches` sem essa checagem vazava para o módulo vizinho: id de cozinha
 * aplicado aos itens de Gestão Unidade (`/unit/<id da cozinha>/…`).
 */
export function isScopeInPath(path: string, scopeId: number | string): boolean {
	return path.split("/").filter(Boolean)[1] === String(scopeId)
}
