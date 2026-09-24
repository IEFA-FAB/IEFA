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
