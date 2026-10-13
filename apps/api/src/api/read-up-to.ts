/**
 * Leitura PostgREST de até `limit` linhas, sem o corte calado do `max_rows`.
 *
 * O PostgREST do projeto devolve no máximo 1000 linhas por requisição (o `max_rows` do
 * Supabase, configurado no painel da API, não em `config.toml`) e NÃO avisa quando corta: o
 * `.limit(100000)` do factory voltava 1000 linhas com status 200. Aqui o `limit` vira páginas
 * de `pageSize` até completar o pedido ou a tabela acabar.
 *
 * Para na página VAZIA e avança pelo que veio, não pelo tamanho pedido: com `max_rows` menor
 * que `pageSize`, parar na "página menor que o pedido" cortaria na primeira. Mesmo critério de
 * `readAllPages` do sisub (`apps/sisub/src/lib/read-all-pages.ts`).
 *
 * Quem chama ORDENA por uma ordem total (ver `withUniqueTiebreak`): sem ela as páginas repetem e
 * pulam linhas. Erro em qualquer página devolve o erro, nunca a lista parcial.
 */

export const POSTGREST_PAGE_SIZE = 1000

type PageResult<T> = PromiseLike<{ data: T[] | null; error: unknown }>

export async function readUpTo<T>(
	limit: number,
	page: (from: number, to: number) => PageResult<T>,
	pageSize = POSTGREST_PAGE_SIZE
): Promise<{ rows: T[]; error: null } | { rows: null; error: unknown }> {
	const rows: T[] = []
	for (let from = 0; from < limit; ) {
		const to = Math.min(from + pageSize, limit) - 1
		const { data, error } = await page(from, to)
		if (error) return { rows: null, error }
		const batch = data ?? []
		if (batch.length === 0) break
		rows.push(...batch.slice(0, limit - rows.length))
		from += batch.length
	}
	return { rows, error: null }
}
